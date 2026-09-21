import { authenticatedForWrite, sameOrigin, secureHeaders } from '../../../lib/display-auth.mjs';
import { createHabitStore, validateHabitRecord } from '../../../lib/display-habits.mjs';

export const config = { api: { bodyParser: { sizeLimit: '4kb' } } };

export function createHandler(storeFactory = () => createHabitStore()) {
  return async function handler(req, res) {
    secureHeaders(res);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'method_not_allowed' });
    }
    const auth = authenticatedForWrite(req);
    if (!auth) return res.status(401).json({ error: 'unauthorized' });
    if (auth === 'session' && !sameOrigin(req)) return res.status(403).json({ error: 'forbidden' });
    const record = validateHabitRecord(req.body);
    if (!record) return res.status(400).json({ error: 'invalid_record' });
    const store = storeFactory();
    if (!store) return res.status(503).json({ error: 'habit_storage_unconfigured' });
    try {
      await store.write(record);
      return res.status(200).json({ ok: true, date: record.date, habits: record.habits });
    } catch {
      return res.status(503).json({ error: 'habit_storage_unavailable' });
    }
  };
}

export default createHandler();
