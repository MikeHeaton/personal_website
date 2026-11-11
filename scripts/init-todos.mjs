import { createTodoStore } from '../lib/todo-store.mjs';

const store = createTodoStore();
if (!store) throw new Error('Configure Redis and an explicit TODO_REDIS_KEY (local/preview must use an isolated key).');
try {
  const created = await store.initialize();
  const document = await store.read();
  console.log(`${created ? 'Initialized' : 'Preserved existing'} ${store.key}; revision ${document.revision}; ${document.items.length} items.`);
} catch (error) { console.error(error.code || 'Initialization failed.'); process.exitCode = 1; }
