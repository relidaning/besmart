import { Router } from 'express';
import { gardenSummary, gardenPlants, gardenEvents, plantSeed, seedCount } from '../garden.js';

export const gardenRoutes = Router();

gardenRoutes.get('/summary', (req, res) => {
  res.json({ data: { ...gardenSummary(req.user!.id), seedsAvailable: seedCount(req.user!.id) } });
});

gardenRoutes.get('/plants', (req, res) => {
  res.json({ data: gardenPlants(req.user!.id) });
});

// The garden journal: newest first; ?before=<id> pages, ?plant=<id> filters to one plant.
gardenRoutes.get('/events', (req, res) => {
  const num = (v: unknown) => (typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : undefined);
  res.json({ data: gardenEvents(req.user!.id, { before: num(req.query.before), plantId: num(req.query.plant), limit: num(req.query.limit) }) });
});

gardenRoutes.post('/seeds/:id/plant', (req, res) => {
  const seed = plantSeed(req.user!.id, Number(req.params.id));
  if (!seed) return res.status(400).json({ error: 'No such seed to plant' });
  res.json({ data: seed });
});
