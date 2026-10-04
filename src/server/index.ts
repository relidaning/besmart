import './types.js';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { initializeDatabase } from './database.js';
import { studyPlanRoutes } from './routes/studyplans.js';
import { checkinRoutes } from './routes/checkins.js';
import { reviewRoutes, syncVaultForAllConfiguredUsers } from './routes/reviews.js';
import { startVaultWatchers } from './vaultWatcher.js';
import { todoRoutes } from './routes/todos.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { authRoutes } from './routes/auth.js';
import { requireAuth } from './middleware/auth.js';
import { scheduleJob } from './scheduler.js';
import { notificationRoutes } from './routes/notifications.js';
import { musicRoutes } from './routes/music.js';
import { gardenRoutes } from './routes/garden.js';
import { initGarden } from './garden.js';
import { MUSIC_DIR } from './musicLibrary.js';
import { initWebPush, sendDailyReviewReminders } from './push.js';
import { localDate } from './date.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = parseInt(process.env.PORT || '3001');

app.use(cors());
app.use(express.json());

initializeDatabase();
initGarden();
syncVaultForAllConfiguredUsers();
startVaultWatchers();
initWebPush();

scheduleJob();
// Run on the hour rather than every 60 min from startup: this job creates the new day's
// check-in tasks, so a tick at xx:19 left the day empty for its first 19 minutes.
function scheduleHourlyJob() {
  const now = new Date();
  const next = new Date(now);
  // One second past the hour, so a timer that fires a hair early still sees the new day.
  next.setHours(now.getHours() + 1, 0, 1, 0);
  setTimeout(() => {
    scheduleJob();
    scheduleHourlyJob();
  }, next.getTime() - now.getTime());
}
scheduleHourlyJob();

// Daily push notification at configured time (default 10:30 local time)
const [PUSH_HOUR, PUSH_MINUTE] = (process.env.PUSH_NOTIFY_TIME ?? '10:30').split(':').map(Number);
let lastPushDate = '';
// Sleep until the next push time instead of waking every minute to check the clock.
function schedulePush() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(PUSH_HOUR, PUSH_MINUTE, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  setTimeout(async () => {
    // Guards against a double send if the timer fires a hair before the wall-clock minute.
    const today = localDate(new Date());
    try {
      if (today !== lastPushDate) {
        lastPushDate = today;
        await sendDailyReviewReminders();
      }
    } catch (err) {
      // An unhandled rejection here would crash the whole server.
      console.error('Daily push failed:', err);
    }
    schedulePush();
  }, next.getTime() - now.getTime());
}
schedulePush();

// Serve root CA cert over plain HTTP so phones can install it before trusting HTTPS
const CA_CERT_PATH = process.env.CA_CERT_PATH;
if (CA_CERT_PATH && fs.existsSync(CA_CERT_PATH)) {
  // .mobileconfig is the reliable iOS way to install a CA cert
  app.get('/rootCA.mobileconfig', (_req, res) => {
    const pem = fs.readFileSync(CA_CERT_PATH, 'utf8');
    const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>PayloadContent</key><array><dict>
    <key>PayloadCertificateFileName</key><string>BeSmart CA</string>
    <key>PayloadContent</key><data>${b64}</data>
    <key>PayloadDescription</key><string>BeSmart local development CA</string>
    <key>PayloadDisplayName</key><string>BeSmart CA</string>
    <key>PayloadIdentifier</key><string>com.besmart.ca.cert</string>
    <key>PayloadType</key><string>com.apple.security.root</string>
    <key>PayloadUUID</key><string>A1B2C3D4-E5F6-7890-ABCD-EF1234567890</string>
    <key>PayloadVersion</key><integer>1</integer>
  </dict></array>
  <key>PayloadDescription</key><string>Installs the BeSmart local CA so HTTPS works on your network</string>
  <key>PayloadDisplayName</key><string>BeSmart CA</string>
  <key>PayloadIdentifier</key><string>com.besmart.ca.profile</string>
  <key>PayloadRemovalDisallowed</key><false/>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadUUID</key><string>B2C3D4E5-F6A7-8901-BCDE-F12345678901</string>
  <key>PayloadVersion</key><integer>1</integer>
</dict></plist>`;
    res.setHeader('Content-Type', 'application/x-apple-aspen-config');
    res.setHeader('Content-Disposition', 'attachment; filename="BeSmart-CA.mobileconfig"');
    res.send(xml);
  });
}

// Public auth routes
app.use('/api/auth', authRoutes);
app.use('/api/notifications', notificationRoutes);

// Protected API routes
app.use('/api/plans', requireAuth, studyPlanRoutes);
app.use('/api/checkins', requireAuth, checkinRoutes);
app.use('/api/reviews', requireAuth, reviewRoutes);
app.use('/api/todos', requireAuth, todoRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api/music', requireAuth, musicRoutes);
app.use('/api/garden', requireAuth, gardenRoutes);

// Locally-downloaded public-domain music (see scripts/download-music.mjs) served straight
// from disk. The .library.json state file lives alongside the mp3s but express.static
// ignores dotfiles by default, so it isn't exposed here.
app.use('/media/music', express.static(MUSIC_DIR, { maxAge: '30d', immutable: true }));

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..');
  // Vite's hashed bundles never change under the same name — cache them for a year.
  app.use('/assets', express.static(path.join(clientDist, 'assets'), { maxAge: '1y', immutable: true }));
  app.use(express.static(clientDist, {
    // index.html and sw.js must always revalidate so a new deploy is picked up.
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
    },
  }));
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const server = app.listen(PORT, () => {
  console.log(`BeSmart server running on http://localhost:${PORT}`);
});

// In the container Node is PID 1, where SIGTERM has no default action: without a
// handler `docker stop`/`restart` waits out its 10 s grace period and then SIGKILLs.
// Closing the DB also checkpoints the WAL into besmart.db, so a plain file copy of
// it taken while the app is stopped is complete.
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  const finish = () => {
    try {
      db.close();
    } catch (err) {
      console.error('Error closing database:', err);
    }
    process.exit(0);
  };
  // Let in-flight requests finish, but don't wait on one that hangs.
  server.close(finish);
  server.closeIdleConnections();
  setTimeout(finish, 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
