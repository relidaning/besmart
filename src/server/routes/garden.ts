import { Router } from 'express';
import { gardenSummary, gardenPlants, plantSeed, seedCount } from '../garden.js';

export const gardenRoutes = Router();

gardenRoutes.get('/summary', (req, res) => {
  res.json({ data: { ...gardenSummary(req.user!.id), seedsAvailable: seedCount(req.user!.id) } });
});

gardenRoutes.get('/plants', (req, res) => {
  res.json({ data: gardenPlants(req.user!.id) });
});

gardenRoutes.post('/seeds/:id/plant', (req, res) => {
  const seed = plantSeed(req.user!.id, Number(req.params.id));
  if (!seed) return res.status(400).json({ error: 'No such seed to plant' });
  res.json({ data: seed });
});
