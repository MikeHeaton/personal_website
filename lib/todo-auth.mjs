import { createHash, timingSafeEqual } from 'node:crypto';
import { authenticated, sameOrigin } from './display-auth.mjs';

export function validTodoBearer(authorization, env = process.env) {
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ') || authorization.length > 512 || !/^[a-f0-9]{64}$/i.test(env.TODO_API_TOKEN_SHA256 || '')) return false;
  const actual = createHash('sha256').update(authorization.slice(7)).digest();
  return timingSafeEqual(actual, Buffer.from(env.TODO_API_TOKEN_SHA256, 'hex'));
}

export function todoAuthentication(req) {
  if (req.headers?.authorization) return validTodoBearer(req.headers.authorization) ? 'bearer' : null;
  return authenticated(req) ? 'session' : null;
}

export function validTodoOrigin(req) {
  return typeof req.headers?.origin === 'string' && sameOrigin(req);
}
