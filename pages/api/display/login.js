import { configured, verifyPassword, createSession, cookie, secureHeaders } from '../../../lib/display-auth.mjs';
export const config = { api: { bodyParser: { sizeLimit: '2kb' } } };
export default function handler(req, res) {
  secureHeaders(res);
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  const origin = req.headers.origin;
  if ((origin && origin !== `https://${req.headers.host}` && !(process.env.NODE_ENV === 'development' && origin === `http://${req.headers.host}`)) || req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).end();
  if (!configured()) return res.status(503).send('Display login has not been configured.');
  if (!verifyPassword(req.body?.password)) return res.redirect(303, '/display?error=1');
  res.setHeader('Set-Cookie', cookie(createSession(), process.env.NODE_ENV !== 'development'));
  return res.redirect(303, '/display');
}
