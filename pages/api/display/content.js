import { requireAuth } from '../../../lib/display-auth.mjs';
import { nextRefresh, weather } from '../../../lib/display-data.mjs';
import { calendar } from '../../../lib/display-calendar.mjs';
export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();
  const now = Date.now();
  const [forecast, agenda] = await Promise.all([
    weather(now).catch(() => null),
    calendar(now).catch(() => null),
  ]);
  res.json({ calendar: agenda, weather: forecast, serverTime: Date.now(), nextUpdate: nextRefresh(now) });
}
