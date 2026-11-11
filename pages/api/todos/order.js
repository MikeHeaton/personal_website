import { createTodoHandler } from '../../../lib/todo-api.mjs';
export const config = { api: { bodyParser: { sizeLimit: '256kb' } } };
export default createTodoHandler('order');
