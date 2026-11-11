import { randomUUID } from 'node:crypto';

export class TodoError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

export const emptyTodos = () => ({ schemaVersion: 1, revision: 0, activeOrder: [], items: [] });
export const todoEtag = (revision) => `"todos-${revision}"`;
export const validId = (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const validTime = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function normalizeText(text) {
  if (typeof text !== 'string' || /[\r\n\u2028\u2029\u0000-\u001f\u007f]/u.test(text)) throw new TodoError('invalid_text');
  const value = text.trim();
  if (!value || Array.from(value).length > 300) throw new TodoError('invalid_text');
  return value;
}

export function parseTodos(raw) {
  try {
    const doc = JSON.parse(raw);
    if (!exactKeys(doc, ['schemaVersion', 'revision', 'activeOrder', 'items']) || doc.schemaVersion !== 1 || !Number.isSafeInteger(doc.revision) || doc.revision < 0 || !Array.isArray(doc.items) || !Array.isArray(doc.activeOrder)) throw new Error();
    const ids = new Set();
    for (const item of doc.items) {
      if (!exactKeys(item, ['id', 'text', 'createdAt', 'done', 'completedAt']) || !validId(item.id) || ids.has(item.id) || normalizeText(item.text) !== item.text || !validTime(item.createdAt) || typeof item.done !== 'boolean' || (item.done ? !validTime(item.completedAt) : item.completedAt !== null)) throw new Error();
      ids.add(item.id);
    }
    const active = new Set(doc.items.filter((item) => !item.done).map((item) => item.id));
    if (doc.activeOrder.length !== active.size || new Set(doc.activeOrder).size !== active.size || doc.activeOrder.some((id) => !active.has(id))) throw new Error();
    return doc;
  } catch { throw new TodoError('todo_storage_invalid', 503); }
}

export function listTodos(doc, status = 'active') {
  if (!['active', 'done', 'all'].includes(status)) throw new TodoError('invalid_status');
  const byId = new Map(doc.items.map((item) => [item.id, item]));
  const active = doc.activeOrder.map((id) => byId.get(id));
  const archive = doc.items.filter((item) => item.done).sort((a, b) => b.completedAt.localeCompare(a.completedAt) || a.id.localeCompare(b.id));
  return { revision: doc.revision, items: status === 'active' ? active : status === 'done' ? archive : [...active, ...archive] };
}

export function applyTodoChange(doc, operation, { now = new Date().toISOString(), id = randomUUID() } = {}) {
  const next = structuredClone(doc);
  let result;
  if (operation.type === 'add') {
    if (!exactKeys(operation.body, ['text'])) throw new TodoError('invalid_item');
    const item = { id, text: normalizeText(operation.body.text), createdAt: now, done: false, completedAt: null };
    next.items.push(item);
    next.activeOrder.push(id);
    result = { item };
  } else if (operation.type === 'order') {
    if (!operation.ifMatch) throw new TodoError('revision_required', 428);
    if (operation.ifMatch !== todoEtag(doc.revision)) throw new TodoError('revision_conflict', 412);
    if (!exactKeys(operation.body, ['ids']) || !Array.isArray(operation.body.ids)) throw new TodoError('invalid_order');
    const ids = operation.body.ids;
    if (ids.length !== next.activeOrder.length || new Set(ids).size !== ids.length || ids.some((value) => !next.activeOrder.includes(value))) throw new TodoError('invalid_order');
    if (ids.every((value, index) => value === next.activeOrder[index])) return { document: doc, result: { revision: doc.revision, ids } };
    next.activeOrder = [...ids];
    result = { ids: next.activeOrder };
  } else {
    if (!validId(operation.id)) throw new TodoError('invalid_id');
    const item = next.items.find((value) => value.id === operation.id);
    if (operation.type === 'delete') {
      if (!item) return { document: doc, result: { revision: doc.revision, deletedId: operation.id } };
      next.items = next.items.filter((value) => value.id !== operation.id);
      next.activeOrder = next.activeOrder.filter((value) => value !== operation.id);
      result = { deletedId: operation.id };
    } else if (operation.type === 'done') {
      if (!exactKeys(operation.body, ['done']) || typeof operation.body.done !== 'boolean') throw new TodoError('invalid_completion');
      if (!item) throw new TodoError('item_not_found', 404);
      if (item.done === operation.body.done) return { document: doc, result: { revision: doc.revision, item } };
      item.done = operation.body.done;
      item.completedAt = item.done ? now : null;
      next.activeOrder = next.activeOrder.filter((value) => value !== item.id);
      if (!item.done) next.activeOrder.push(item.id);
      result = { item };
    } else throw new TodoError('invalid_operation');
  }
  if (next.revision >= Number.MAX_SAFE_INTEGER) throw new TodoError('revision_exhausted', 503);
  next.revision++;
  return { document: next, result: { revision: next.revision, ...result } };
}
