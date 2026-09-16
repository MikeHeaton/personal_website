import { requireAuth } from '../../../lib/display-auth.mjs';
import { hourSlot, nextHour, weather } from '../../../lib/display-data.mjs';
import artworks from '../../../lib/art.json';
export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();
  const now = Date.now();
  const art = artworks[hourSlot(now) % artworks.length];
  let forecast = null;
  try { forecast = await weather(now); } catch { /* Client preserves last successful forecast and retries. */ }
  res.json({ art, weather: forecast, serverTime: Date.now(), nextUpdate: nextHour(now) });
}
