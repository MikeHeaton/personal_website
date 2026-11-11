import { createHash, randomUUID } from 'node:crypto';
import { applyTodoChange, emptyTodos, parseTodos, TodoError } from './todos.mjs';

// The compare and replacement happen at Redis, across every server instance.
// The optional receipt is committed in the same operation as the new item.
export const COMMIT_SCRIPT = `
if #KEYS == 2 then
  local receipt = redis.call('GET', KEYS[2])
  if receipt then return {'replay', receipt} end
end
local current = redis.call('GET', KEYS[1])
if not current or current ~= ARGV[1] then return {'conflict', ''} end
redis.call('SET', KEYS[1], ARGV[2])
if #KEYS == 2 then redis.call('SET', KEYS[2], ARGV[3], 'EX', 86400) end
return {'ok', ''}
`;
const RATE_SCRIPT = `local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 60) end; return n`;
export const digest = (value) => createHash('sha256').update(value).digest('hex');
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

export function createTodoStore(env = process.env, fetchImpl = globalThis.fetch) {
  const rawUrl = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  let url;
  try { url = new URL(rawUrl); } catch { return null; }
  if (url.protocol !== 'https:' || !token) return null;
  // A preview or local process must explicitly select its isolated namespace.
  const production = env.VERCEL_ENV === 'production';
  const key = env.TODO_REDIS_KEY || (production ? 'family:todos:v1' : null);
  if (!key || !/^family:todos:[a-zA-Z0-9:_-]{1,160}$/.test(key) || (!production && key === 'family:todos:v1')) return null;

  async function command(parts) {
    try {
      const response = await fetchImpl(url.toString().replace(/\/$/, ''), {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(parts), cache: 'no-store', signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error();
      const raw = await response.text();
      if (Buffer.byteLength(raw) > MAX_DOCUMENT_BYTES * 2 + 65536) throw new Error();
      const data = JSON.parse(raw);
      if (data.error) throw new Error();
      return data.result;
    } catch { throw new TodoError('todo_storage_unavailable', 503); }
  }

  async function readRaw() {
    const raw = await command(['GET', key]);
    if (raw === null) throw new TodoError('todo_storage_uninitialized', 503);
    if (typeof raw !== 'string') throw new TodoError('todo_storage_invalid', 503);
    return { raw, document: parseTodos(raw) };
  }

  function replay(raw, fingerprint) {
    const receipt = JSON.parse(raw);
    if (receipt.fingerprint !== fingerprint) throw new TodoError('idempotency_conflict', 409);
    return receipt.result;
  }

  return {
    key,
    async initialize() { return (await command(['SET', key, JSON.stringify(emptyTodos()), 'NX'])) === 'OK'; },
    async read() { return (await readRaw()).document; },
    async checkRate(identity) {
      const count = await command(['EVAL', RATE_SCRIPT, 1, `${key}:rate:${digest(identity)}`]);
      if (count > 120) throw new TodoError('rate_limited', 429);
    },
    async mutate(operation, idempotencyKey) {
      if (operation.type === 'add' && (typeof idempotencyKey !== 'string' || !/^[a-zA-Z0-9:_-]{8,128}$/.test(idempotencyKey))) throw new TodoError('idempotency_key_required');
      const receiptKey = operation.type === 'add' ? `${key}:request:${digest(idempotencyKey)}` : null;
      const fingerprint = digest(JSON.stringify(operation));
      const metadata = { now: new Date().toISOString(), id: randomUUID() };
      for (let attempt = 0; attempt < 8; attempt++) {
        if (receiptKey) {
          const receipt = await command(['GET', receiptKey]);
          if (receipt) return replay(receipt, fingerprint);
        }
        const { raw, document } = await readRaw();
        const changed = applyTodoChange(document, operation, metadata);
        if (changed.document === document) return changed.result;
        const next = JSON.stringify(changed.document);
        if (Buffer.byteLength(next) > MAX_DOCUMENT_BYTES) throw new TodoError('todo_storage_full', 507);
        const keys = receiptKey ? [key, receiptKey] : [key];
        const receipt = JSON.stringify({ fingerprint, result: changed.result });
        const outcome = await command(['EVAL', COMMIT_SCRIPT, keys.length, ...keys, raw, next, receipt]);
        if (outcome?.[0] === 'ok') return changed.result;
        if (outcome?.[0] === 'replay') return replay(outcome[1], fingerprint);
        if (outcome?.[0] !== 'conflict') throw new TodoError('todo_storage_unavailable', 503);
      }
      throw new TodoError('concurrent_update_retry', 409);
    },
  };
}
