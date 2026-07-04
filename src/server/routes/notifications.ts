import { Router } from 'express';
import db from '../database.js';
import { requireAuth } from '../middleware/auth.js';

export const notificationRoutes = Router();

notificationRoutes.get('/vapid-public-key', (_req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    res.status(503).json({ error: 'Push notifications not configured' });
    return;
  }
  res.json({ publicKey: key });
});

notificationRoutes.post('/subscribe', requireAuth, (req, res) => {
  const userId = (req as any).user.id;
  const { endpoint, keys } = req.body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: 'Invalid subscription' });
    return;
  }

  db.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
  `).run(userId, endpoint, keys.p256dh, keys.auth);

  res.json({ ok: true });
});

notificationRoutes.delete('/unsubscribe', requireAuth, (req, res) => {
  const userId = (req as any).user.id;
  const { endpoint } = req.body ?? {};

  if (endpoint) {
    db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, endpoint);
  } else {
    db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(userId);
  }

  res.json({ ok: true });
});

notificationRoutes.get('/status', requireAuth, (req, res) => {
  const userId = (req as any).user.id;
  const count = (db.prepare('SELECT COUNT(*) as c FROM push_subscriptions WHERE user_id = ?').get(userId) as any).c;
  res.json({ subscribed: count > 0 });
});
