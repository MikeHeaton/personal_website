import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export const COOKIE = 'display_session';
export const MAX_AGE = 180 * 24 * 60 * 60;
export function configured() { return !!process.env.DISPLAY_PASSWORD_HASH && (process.env.DISPLAY_SESSION_SECRET || '').length >= 32; }
export function passwordHash(password, salt = randomBytes(16).toString('hex')) { return salt + ':' + scryptSync(password, salt, 64).toString('hex'); }
export function verifyPassword(password) {
  if (!configured() || typeof password !== 'string' || password.length > 256) return false;
  const [salt, hash] = process.env.DISPLAY_PASSWORD_HASH.split(':');
  const expected = Buffer.from(hash || '', 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function signature(value) { return createHmac('sha256', process.env.DISPLAY_SESSION_SECRET).update(value + ':' + process.env.DISPLAY_PASSWORD_HASH).digest('hex'); }
export function createSession(now = Date.now()) {
  const value = Math.floor(now / 1000) + MAX_AGE + '.' + randomBytes(16).toString('hex');
  return value + '.' + signature(value);
}
export function validSession(token, now = Date.now()) {
  if (!configured() || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || Number(parts[0]) <= now / 1000) return false;
  const expected = Buffer.from(signature(parts[0] + '.' + parts[1]));
  const actual = Buffer.from(parts[2]);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function authenticated(req) { return validSession(req.cookies?.[COOKIE]); }
export function validBearer(authorization) {
  if (!configured() || typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(process.env.DISPLAY_SESSION_SECRET);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
export function authenticatedForWrite(req) {
  if (validBearer(req.headers?.authorization)) return 'bearer';
  if (authenticated(req)) return 'session';
  return null;
}
export function sameOrigin(req) {
  const origin = req.headers?.origin;
  if (req.headers?.['sec-fetch-site'] === 'cross-site') return false;
  if (!origin) return true;
  const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
  return origin === `${protocol}://${req.headers?.host}`;
}
export function cookie(token, secure = true, age = MAX_AGE) { return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`; }
export function secureHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
}
export function requireAuth(req, res) {
  secureHeaders(res);
  if (!authenticated(req)) { res.status(401).json({ error: 'Please sign in.' }); return false; }
  return true;
}
