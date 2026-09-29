import { Router } from 'express';
import { gardenSummary } from '../garden.js';

export const gardenRoutes = Router();

gardenRoutes.get('/summary', (req, res) => {
  res.json({ data: gardenSummary(req.user!.id) });
});
