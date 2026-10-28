import webpush from 'web-push';
import db from './database.js';

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

// Network blips (a DNS hiccup like EAI_AGAIN, a reset connection) and push-service 429/5xx
// responses are transient. A calendar reminder is sent once, so retry those a few times
// with backoff instead of silently losing it.
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000];
const TRANSIENT_CODES = new Set(['EAI_AGAIN', 'ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE']);

function isTransient(err: any): boolean {
  if (err.statusCode) return err.statusCode === 429 || err.statusCode >= 500;
  return TRANSIENT_CODES.has(err.code) || /timed? ?out/i.test(err.message ?? '');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// `url` is the page a tap on the notification opens (sw.js), Home by default.
export async function sendPushToUser(userId: number, title: string, body: string, url?: string) {
  if (!initialized) return;

  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId) as any[];

  for (const sub of subs) {
    for (let attempt = 0; ; attempt++) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body, url }),
          { timeout: 15_000 }
        );
        break;
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
          break;
        }
        // WebPushError has an empty message; the status and body say what went wrong.
        const detail = err.statusCode ? `HTTP ${err.statusCode} ${err.body ?? ''}`.trim() : `${err.code ?? ''} ${err.message}`.trim();
        if (attempt < RETRY_DELAYS_MS.length && isTransient(err)) {
          console.warn(`Push send failed (${detail}), retry ${attempt + 1}/${RETRY_DELAYS_MS.length} in ${RETRY_DELAYS_MS[attempt] / 1000}s`);
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        console.error(`Push send error (sub ${sub.id}): ${detail}`);
        break;
      }
    }
  }
}
