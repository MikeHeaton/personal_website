import { requireAuth } from '../../../lib/display-auth.mjs';
import { clientScript } from '../../../lib/display-client.mjs';
export default function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') { res.status(405).end(); return; }
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.send(clientScript);
}
