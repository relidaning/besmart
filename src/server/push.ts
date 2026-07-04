import webpush from 'web-push';
import db from './database.js';
import { localDate } from './date.js';

let initialized = false;

export function initWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL || 'admin@besmart.local';

  if (!publicKey || !privateKey) {
    console.log('VAPID keys not configured — push notifications disabled');
    return;
  }

  webpush.setVapidDetails(`mailto:${email}`, publicKey, privateKey);
  initialized = true;
  console.log('Web push initialized');
}

export function isPushEnabled() {
  return initialized;
}

export async function sendPushToUser(userId: number, title: string, body: string) {
  if (!initialized) return;

  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId) as any[];

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body })
      );
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
      } else {
        console.error('Push send error:', err.message);
      }
    }
  }
}

export async function sendDailyReviewReminders() {
  if (!initialized) return;

  const today = localDate(new Date());
  const users = db.prepare('SELECT DISTINCT user_id FROM push_subscriptions').all() as { user_id: number }[];

  for (const { user_id } of users) {
    const due = (db.prepare(`
      SELECT COUNT(*) as c FROM review_records rr
      JOIN review_courses rc ON rr.course_id = rc.id
      WHERE rc.user_id = ? AND rr.is_reviewed = 0 AND rr.planned_date <= ?
    `).get(user_id, today) as any).c;

    if (due > 0) {
      await sendPushToUser(user_id, 'BeSmart Review', `You have ${due} review${due !== 1 ? 's' : ''} due today!`);
    } else {
      await sendPushToUser(user_id, 'BeSmart', 'Good job — no reviews due today!');
    }
  }
}
