import { randomBytes } from 'node:crypto';
import { authenticated, configured, secureHeaders } from '../../../lib/display-auth.mjs';
import { displayPage } from '../../../lib/display-page';
export default function handler(req, res) {
  secureHeaders(res);
  if (req.method !== 'GET') return res.status(405).end();
  const nonce = randomBytes(16).toString('base64');
  res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}' 'unsafe-inline'; img-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(displayPage(authenticated(req), req.query.error === '1', configured(), nonce));
}
