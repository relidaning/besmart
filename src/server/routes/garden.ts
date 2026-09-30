import { Router } from 'express';
import { gardenSummary, gardenPlants, gardenEvents, unlockedTrees } from '../garden.js';

export const gardenRoutes = Router();

gardenRoutes.get('/summary', (req, res) => {
  res.json({ data: gardenSummary(req.user!.id) });
});

gardenRoutes.get('/plants', (req, res) => {
  res.json({ data: gardenPlants(req.user!.id) });
});

// The garden journal: newest first; ?before=<id> pages, ?plant=<id> filters to one plant.
gardenRoutes.get('/events', (req, res) => {
  const num = (v: unknown) => (typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : undefined);
  res.json({ data: gardenEvents(req.user!.id, { before: num(req.query.before), plantId: num(req.query.plant), limit: num(req.query.limit) }) });
});

// Tree species the user can plant for a new study plan.
gardenRoutes.get('/trees', (req, res) => {
  res.json({ data: unlockedTrees(req.user!.id) });
});
