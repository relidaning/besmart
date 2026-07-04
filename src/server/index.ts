import './types.js';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase } from './database.js';
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
import { initWebPush, sendDailyReviewReminders } from './push.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = parseInt(process.env.PORT || '3001');

app.use(cors());
app.use(express.json());

initializeDatabase();
syncVaultForAllConfiguredUsers();
startVaultWatchers();
initWebPush();

scheduleJob();
setInterval(scheduleJob, 60 * 60 * 1000);

// Daily push notification at configured time (default 10:30 local time)
const [PUSH_HOUR, PUSH_MINUTE] = (process.env.PUSH_NOTIFY_TIME ?? '10:30').split(':').map(Number);
let lastPushDate = '';
setInterval(async () => {
  const now = new Date();
  if (now.getHours() === PUSH_HOUR && now.getMinutes() === PUSH_MINUTE) {
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (today !== lastPushDate) {
      lastPushDate = today;
      await sendDailyReviewReminders();
    }
  }
}, 60 * 1000);

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

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`BeSmart server running on http://localhost:${PORT}`);
});
