import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyTodos, applyTodoChange, listTodos, normalizeText, parseTodos, todoEtag } from '../lib/todos.mjs';
import { createTodoStore, COMMIT_SCRIPT, digest } from '../lib/todo-store.mjs';
import { createTodoHandler } from '../lib/todo-api.mjs';
import { validTodoBearer } from '../lib/todo-auth.mjs';
import { createSession, passwordHash } from '../lib/display-auth.mjs';
import login from '../pages/api/display/login.js';
import { displayMode, nextDisplayRefresh, todoLines, todoPages, todosPanel } from '../lib/display/todos.mjs';
import { layout, renderScene } from '../lib/display/scene.mjs';

const first = 'be4b6329-4c74-4a5d-b3bc-fbeadf8da4c8';
const second = 'ab3558b5-8741-4aaa-a421-f8ba1ab05f31';
const now = '2026-11-10T18:00:00.000Z';
const token = 'test-only-todo-token-32-characters-long';
process.env.TODO_API_TOKEN_SHA256 = digest(token);
process.env.DISPLAY_PASSWORD_HASH = passwordHash('test-password');
process.env.DISPLAY_SESSION_SECRET = 'test-session-secret'.repeat(3);
const add = (doc, text, id) => applyTodoChange(doc, { type: 'add', body: { text } }, { id, now }).document;
const fixture = () => add(add(emptyTodos(), 'Buy milk', first), 'Call the dentist', second);

test('to-do text is one nonempty line and stored documents reject corrupt identity, order and timestamps', () => {
  assert.equal(normalizeText('  Buy milk  '), 'Buy milk');
  for (const value of ['', ' ', 'a\nb', 'a\rb', 'a\u2028b', 'a\t b', 'a'.repeat(301), null]) assert.throws(() => normalizeText(value));
  const good = fixture();
  assert.deepEqual(parseTodos(JSON.stringify(good)), good);
  for (const bad of [{ ...good, activeOrder: [first, first] }, { ...good, activeOrder: [first] }, { ...good, items: [good.items[0], good.items[0]] }, { ...good, revision: -1 }, { ...good, extra: true }, { ...good, items: good.items.map((item) => ({ ...item, completedAt: now })) }]) assert.throws(() => parseTodos(JSON.stringify(bad)), /todo_storage_invalid/);
  assert.throws(() => parseTodos('{'), /todo_storage_invalid/);
});

test('ordering, completion, archive, undo and deletion preserve the shared model', () => {
  let doc = fixture();
  doc = applyTodoChange(doc, { type: 'order', body: { ids: [second, first] }, ifMatch: todoEtag(doc.revision) }).document;
  assert.deepEqual(listTodos(doc).items.map((item) => item.id), [second, first]);
  const originalCreated = doc.items[0].createdAt;
  doc = applyTodoChange(doc, { type: 'done', id: first, body: { done: true } }, { now }).document;
  assert.deepEqual(doc.activeOrder, [second]);
  assert.equal(listTodos(doc, 'done').items[0].completedAt, now);
  assert.equal(listTodos(doc, 'done').items[0].createdAt, originalCreated);
  const again = applyTodoChange(doc, { type: 'done', id: first, body: { done: true } }, { now: '2026-11-11T18:00:00.000Z' });
  assert.equal(again.document, doc);
  assert.equal(again.result.item.completedAt, now);
  doc = applyTodoChange(doc, { type: 'done', id: first, body: { done: false } }).document;
  assert.deepEqual(doc.activeOrder, [second, first]);
  assert.equal(doc.items[0].completedAt, null);
  doc = applyTodoChange(doc, { type: 'delete', id: second }).document;
  assert.deepEqual(listTodos(doc).items.map((item) => item.id), [first]);
  assert.equal(applyTodoChange(doc, { type: 'delete', id: second }).document, doc);
});

test('stale or partial reorder fails without modifying the list', () => {
  const doc = fixture(), original = JSON.stringify(doc);
  assert.throws(() => applyTodoChange(doc, { type: 'order', body: { ids: [second, first] } }), (e) => e.status === 428);
  assert.throws(() => applyTodoChange(doc, { type: 'order', body: { ids: [second, first] }, ifMatch: '"todos-0"' }), (e) => e.status === 412);
  for (const ids of [[first], [first, first], [first, second, 'unknown']]) assert.throws(() => applyTodoChange(doc, { type: 'order', body: { ids }, ifMatch: todoEtag(doc.revision) }), /invalid_order/);
  assert.equal(JSON.stringify(doc), original);
});

// A shared Redis transport double exercises races between independent store instances.
// The real EVAL script is also checked against isolated Upstash storage during verification.
function redisDouble() {
  const values = new Map(), calls = [];
  const fetchImpl = async (url, options) => {
    const args = JSON.parse(options.body); calls.push({ url, options, args });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const [command, ...rest] = args;
    let result;
    if (command === 'GET') result = values.get(rest[0]) ?? null;
    else if (command === 'SET') {
      if (rest[2] === 'NX' && values.has(rest[0])) result = null;
      else { values.set(rest[0], rest[1]); result = 'OK'; }
    } else if (command === 'EVAL' && rest[0] === COMMIT_SCRIPT) {
      const count = rest[1], keys = rest.slice(2, 2 + count), [expected, next, receipt] = rest.slice(2 + count);
      if (keys[1] && values.has(keys[1])) result = ['replay', values.get(keys[1])];
      else if (values.get(keys[0]) !== expected) result = ['conflict', ''];
      else { values.set(keys[0], next); if (keys[1]) values.set(keys[1], receipt); result = ['ok', '']; }
    } else if (command === 'EVAL') { const key = rest[2]; result = Number(values.get(key) || 0) + 1; values.set(key, result); }
    else throw new Error('Unexpected Redis command');
    return new Response(JSON.stringify({ result }));
  };
  const env = { KV_REST_API_URL: 'https://redis.example.test', KV_REST_API_TOKEN: 'storage-secret', TODO_REDIS_KEY: 'family:todos:test:unit' };
  return { values, calls, env, store: () => createTodoStore(env, fetchImpl) };
}

test('missing storage fails closed; initialization never replaces existing or corrupt data', async () => {
  const redis = redisDouble(), store = redis.store();
  await assert.rejects(store.read(), /todo_storage_uninitialized/);
  assert.equal(await store.initialize(), true);
  await store.mutate({ type: 'add', body: { text: 'Keep me' } }, 'request-one');
  assert.equal(await store.initialize(), false);
  assert.equal((await redis.store().read()).items[0].text, 'Keep me');
  redis.values.set(store.key, 'corrupt');
  assert.equal(await store.initialize(), false);
  await assert.rejects(store.read(), /todo_storage_invalid/);
  await assert.rejects(store.mutate({ type: 'add', body: { text: 'No overwrite' } }, 'request-two'), /todo_storage_invalid/);
  assert.equal(redis.values.get(store.key), 'corrupt');
});

test('independent clients retain concurrent additions and deduplicate retries atomically', async () => {
  const redis = redisDouble(); await redis.store().initialize();
  await Promise.all(Array.from({ length: 5 }, (_, i) => redis.store().mutate({ type: 'add', body: { text: `Task ${i}` } }, `request-${i}`)));
  assert.equal((await redis.store().read()).items.length, 5);
  const operation = { type: 'add', body: { text: 'Once only' } };
  const [a, b] = await Promise.all([redis.store().mutate(operation, 'same-request'), redis.store().mutate(operation, 'same-request')]);
  assert.deepEqual(a, b);
  assert.equal((await redis.store().read()).items.filter((item) => item.text === 'Once only').length, 1);
  await assert.rejects(redis.store().mutate({ type: 'add', body: { text: 'Different' } }, 'same-request'), /idempotency_conflict/);
  assert.ok(redis.calls.every(({ url, options }) => !url.includes('storage-secret') && options.headers.Authorization === 'Bearer storage-secret' && options.cache === 'no-store'));
});

test('preview and local configuration cannot silently use the production key', () => {
  const { env } = redisDouble();
  assert.equal(createTodoStore({ ...env, TODO_REDIS_KEY: undefined }), null);
  assert.equal(createTodoStore({ ...env, TODO_REDIS_KEY: 'family:todos:v1', VERCEL_ENV: 'preview' }), null);
  assert.equal(createTodoStore({ ...env, TODO_REDIS_KEY: undefined, VERCEL_ENV: 'production' }).key, 'family:todos:v1');
  assert.equal(createTodoStore({ ...env, KV_REST_API_URL: 'http://redis.example' }), null);
});

function response() { return { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, redirect(code, url) { this.statusCode = code; this.url = url; return this; }, end(value) { if (value) this.body = JSON.parse(value); return this; }, send(value) { this.body = value; return this; } }; }
const request = (overrides = {}) => ({ method: 'GET', headers: { host: 'example.test', authorization: `Bearer ${token}`, 'content-type': 'application/json' }, cookies: {}, query: {}, ...overrides });

test('API protects reads, writes and exports; rejects cross-origin and missing-origin cookie writes', async () => {
  const redis = redisDouble(); await redis.store().initialize();
  for (const route of ['collection', 'item', 'order', 'export']) {
    const res = response(); await createTodoHandler(route, redis.store)(request({ headers: {} }), res);
    assert.equal(res.statusCode, 401); assert.match(res.headers['Cache-Control'], /no-store/);
  }
  for (const origin of [undefined, 'https://attacker.test']) {
    const res = response(); await createTodoHandler('collection', redis.store)(request({ method: 'POST', cookies: { display_session: createSession() }, headers: { host: 'example.test', origin, 'content-type': 'application/json' }, body: { text: 'No' } }), res);
    assert.equal(res.statusCode, 403);
  }
  assert.equal(validTodoBearer(`Bearer ${process.env.DISPLAY_SESSION_SECRET}`), false);
  assert.equal(validTodoBearer(`Bearer ${token}`), true);
  assert.equal(validTodoBearer(`Bearer ${token}`, {}), false);
});

test('API executes add, active/archive reads, completion, undo, order and deletion', async () => {
  const redis = redisDouble(); await redis.store().initialize();
  async function call(route, req) { const res = response(); await createTodoHandler(route, redis.store)(req, res); return res; }
  const a = await call('collection', request({ method: 'POST', headers: { ...request().headers, 'idempotency-key': 'api-request-1' }, body: { text: 'One' } }));
  assert.equal(a.statusCode, 201); const id = a.body.item.id;
  let res = await call('collection', request()); assert.equal(res.body.items.length, 1); assert.equal(res.headers.ETag, '"todos-1"');
  res = await call('item', request({ method: 'PATCH', query: { id }, body: { done: true } })); assert.equal(res.body.item.done, true);
  res = await call('collection', request()); assert.equal(res.body.items.length, 0);
  res = await call('collection', request({ query: { status: 'done' } })); assert.equal(res.body.items[0].id, id);
  res = await call('item', request({ method: 'PATCH', query: { id }, body: { done: false } })); assert.equal(res.body.item.completedAt, null);
  res = await call('order', request({ method: 'PUT', body: { ids: [id] }, headers: { ...request().headers, 'if-match': '"todos-0"' } })); assert.equal(res.statusCode, 412);
  res = await call('export', request()); assert.equal(res.body.schemaVersion, 1); assert.match(res.headers['Content-Disposition'], /todos.json/);
  res = await call('item', request({ method: 'DELETE', query: { id } })); assert.equal(res.statusCode, 200);
  res = await call('collection', request({ query: { status: 'all' } })); assert.equal(res.body.items.length, 0);
});

test('API rejects unsupported methods, bodies, statuses and unavailable storage', async () => {
  const redis = redisDouble(); await redis.store().initialize();
  for (const [req, expected] of [[request({ method: 'PUT' }), 405], [request({ query: { status: 'other' } }), 400], [request({ method: 'POST', headers: { ...request().headers, 'content-type': 'text/plain' } }), 415], [request({ method: 'POST', body: { text: 'One' } }), 400]]) {
    const res = response(); await createTodoHandler('collection', redis.store)(req, res); assert.equal(res.statusCode, expected);
  }
  let res = response(); await createTodoHandler('collection', () => null)(request(), res); assert.equal(res.statusCode, 503);
  res = response(); await createTodoHandler('collection', () => ({ read: async () => { throw new Error('secret URL must not escape'); } }))(request(), res); assert.deepEqual(res.body, { error: 'todo_storage_unavailable' });
});

test('write rate limits use shared storage', async () => {
  const redis = redisDouble(), store = redis.store();
  for (let i = 0; i < 120; i++) await store.checkRate('identity');
  await assert.rejects(redis.store().checkRate('identity'), (e) => e.status === 429);
});

test('login returns to the phone app but rejects arbitrary return destinations', () => {
  for (const [returnTo, destination] of [['/todos', '/todos'], ['https://evil.test', '/display'], ['//evil.test', '/display']]) {
    const res = response(); login({ method: 'POST', headers: {}, body: { password: 'test-password', returnTo } }, res);
    assert.equal(res.statusCode, 303); assert.equal(res.url, destination);
  }
  const res = response(); login({ method: 'POST', headers: {}, body: { password: 'wrong', returnTo: '/todos' } }, res);
  assert.equal(res.url, '/todos?error=1');
});

test('display switches on every minute boundary and keeps other panels', () => {
  const start = Date.parse('2026-11-10T18:00:00Z');
  assert.equal(displayMode(start), 'weather'); assert.equal(displayMode(start + 60000), 'todos'); assert.equal(displayMode(start + 120000), 'weather');
  assert.equal(nextDisplayRefresh(start + 59999), start + 60000);
  const scene = renderScene({ serverTime: start + 60000, weather: null, calendar: null, todos: listTodos(fixture()) });
  assert.match(scene, /id="todos-panel"/); assert.match(scene, /Buy milk/); assert.match(scene, /id="calendar"/); assert.match(scene, /id="habits"/); assert.match(scene, /SAN FRANCISCO/);
  assert.doesNotMatch(scene, /<script|id="forecast"/);
  assert.doesNotMatch(renderScene({ serverTime: start, weather: null, calendar: null, todos: listTodos(fixture()) }), /id="todos-panel"/);
});

test('two-column overflow pages cover every item in order, fit the frame and escape text', () => {
  const items = Array.from({ length: 45 }, (_, index) => ({ id: String(index), text: index === 0 ? '<script>alert("x")</script>' : `Task ${index} ${'long '.repeat(20)}` }));
  const pages = todoPages(items);
  assert.ok(pages.length > 1);
  assert.deepEqual(pages.flat(2).map((item) => item.id), items.map((item) => item.id));
  for (const page of pages) for (const column of page) for (const item of column) assert.ok(66 + item.offset + (item.lines.length - 1) * 32 < layout.forecast.height);
  assert.ok(todoLines('w'.repeat(300)).every((line) => line.length <= 31));
  assert.ok(todoLines('W'.repeat(300)).every((line) => line.length <= 15));
  assert.deepEqual(todoPages(Array.from({ length: 4 }, (_, index) => ({ id: String(index), text: `Task ${index}` })))[0].map((column) => column.length), [2, 2]);
  assert.doesNotMatch(todosPanel({ items }, layout.forecast, 60000), /<script>/);
  assert.match(todosPanel({ items: [] }, layout.forecast, 60000), /All done/);
  assert.match(todosPanel(null, layout.forecast, 60000), /unavailable/);
});

test('home-screen manifest and PNG icons define a standalone app scoped to the list', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/todos/manifest.webmanifest', import.meta.url)));
  assert.equal(manifest.start_url, '/todos'); assert.equal(manifest.scope, '/todos'); assert.equal(manifest.display, 'standalone');
  for (const size of [180, 192, 512]) { const png = readFileSync(new URL(`../public/todos/icon-${size}.png`, import.meta.url)); assert.equal(png.readUInt32BE(16), size); assert.equal(png.readUInt32BE(20), size); }
});
