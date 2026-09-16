import { randomBytes } from 'node:crypto';
import { authenticated, configured, secureHeaders } from '../../../lib/display-auth.mjs';
import { displayPage } from '../../../lib/display-page.mjs';
import { hourSlot, weather } from '../../../lib/display-data.mjs';
import artworks from '../../../lib/art.json';
export default async function handler(req, res) {
  secureHeaders(res);
  if (req.method !== 'GET') return res.status(405).end();
  const nonce = randomBytes(16).toString('base64');
  res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'self'; style-src 'nonce-${nonce}' 'unsafe-inline'; img-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const signedIn = authenticated(req);
  let initial = null;
  if (signedIn) {
    let forecast = null;
    try { forecast = await weather(); } catch { /* Art still renders; HTML refresh retries weather. */ }
    const now = Date.now();
    initial = { art: artworks[hourSlot(now) % artworks.length], weather: forecast, serverTime: now };
  }
  res.send(displayPage(signedIn, req.query.error === '1', configured(), nonce, initial));
}
