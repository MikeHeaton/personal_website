import { createTodoHandler } from '../../../lib/todo-api.mjs';
export const config = { api: { bodyParser: { sizeLimit: '4kb' } } };
export default createTodoHandler('item');
