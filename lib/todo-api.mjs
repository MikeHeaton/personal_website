import { secureHeaders } from './display-auth.mjs';
import { todoAuthentication, validTodoOrigin } from './todo-auth.mjs';
import { createTodoStore } from './todo-store.mjs';
import { listTodos, todoEtag, TodoError } from './todos.mjs';

const METHODS = { collection: ['GET', 'POST'], item: ['PATCH', 'DELETE'], order: ['PUT'], export: ['GET'] };

function sendDocument(res, status, body) {
  res.setHeader('ETag', todoEtag(body.revision));
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // Pages Router res.json()/res.send() replace ETag with a response-body hash.
  // Keep our document revision intact across filtered reads and mutations.
  res.status(status).end(JSON.stringify(body));
}

export function createTodoHandler(route, storeFactory = createTodoStore) {
  return async (req, res) => {
    secureHeaders(res);
    const auth = todoAuthentication(req);
    if (!auth) return res.status(401).json({ error: 'unauthorized' });
    if (!METHODS[route].includes(req.method)) {
      res.setHeader('Allow', METHODS[route].join(', '));
      return res.status(405).json({ error: 'method_not_allowed' });
    }
    const writing = req.method !== 'GET';
    if (writing && auth === 'session' && !validTodoOrigin(req)) return res.status(403).json({ error: 'forbidden' });
    if (writing && req.method !== 'DELETE' && req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') return res.status(415).json({ error: 'json_required' });
    const store = storeFactory();
    if (!store) return res.status(503).json({ error: 'todo_storage_unconfigured' });
    try {
      if (!writing) {
        const document = await store.read();
        if (route === 'export') {
          res.setHeader('Content-Disposition', 'attachment; filename="todos.json"');
          return sendDocument(res, 200, document);
        }
        return sendDocument(res, 200, listTodos(document, req.query?.status ?? 'active'));
      }
      await store.checkRate(req.headers.authorization || req.cookies.display_session);
      const operation = route === 'order' ? { type: 'order', body: req.body, ifMatch: req.headers['if-match'] }
        : route === 'collection' ? { type: 'add', body: req.body }
        : { type: req.method === 'DELETE' ? 'delete' : 'done', id: req.query.id, ...(req.method === 'PATCH' ? { body: req.body } : {}) };
      const result = await store.mutate(operation, req.headers['idempotency-key']);
      return sendDocument(res, route === 'collection' ? 201 : 200, result);
    } catch (error) {
      const known = error instanceof TodoError;
      if (known && error.status === 429) res.setHeader('Retry-After', '60');
      return res.status(known ? error.status : 503).json({ error: known ? error.code : 'todo_storage_unavailable' });
    }
  };
}
