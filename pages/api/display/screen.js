import { randomBytes } from 'node:crypto';
import { authenticated, configured, secureHeaders } from '../../../lib/display-auth.mjs';
import { displayPage } from '../../../lib/display-page.mjs';
import { weather } from '../../../lib/display-data.mjs';
import { calendar } from '../../../lib/display-calendar.mjs';
import { createHabitStore, emptyHabitSnapshot, loadHabitSnapshot } from '../../../lib/display-habits.mjs';
export default async function handler(req, res) {
  secureHeaders(res);
  if (req.method !== 'GET') return res.status(405).end();
  const nonce = randomBytes(16).toString('base64');
  res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'self'; style-src 'nonce-${nonce}' 'unsafe-inline'; img-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const signedIn = authenticated(req);
  let initial = null;
  if (signedIn) {
    const now = Date.now();
    const habitStore = createHabitStore();
    const [forecast, agenda, habits] = await Promise.all([
      weather(now).catch(() => null),
      calendar(now).catch(() => null),
      habitStore ? loadHabitSnapshot(habitStore, now).catch(() => emptyHabitSnapshot(now)) : emptyHabitSnapshot(now),
    ]);
    initial = { calendar: agenda, weather: forecast, habits, serverTime: now };
  }
  res.send(displayPage(signedIn, req.query.error === '1', configured(), nonce, initial));
}
