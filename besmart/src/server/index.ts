import './types.js';
import express from 'express';
import cors from 'cors';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = parseInt(process.env.PORT || '3001');

app.use(cors());
app.use(express.json());

initializeDatabase();
syncVaultForAllConfiguredUsers();
startVaultWatchers();

scheduleJob();
setInterval(scheduleJob, 60 * 60 * 1000);

// Public auth routes
app.use('/api/auth', authRoutes);

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
