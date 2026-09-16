import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { requireAuth } from '../../../lib/display-auth.mjs';
import art from '../../../lib/art.json';
export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();
  const item = art.find(a => String(a.id) === req.query.id);
  if (!item) return res.status(404).end();
  const image = await readFile(path.join(process.cwd(), 'private/art', item.id + '.jpg'));
  res.setHeader('Content-Type', 'image/jpeg');
  res.send(image);
}
