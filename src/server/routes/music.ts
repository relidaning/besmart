import { Router } from 'express';
import { getCatalog, getActiveTracks, addToLibrary, removeFromLibrary } from '../musicLibrary.js';

export const musicRoutes = Router();

musicRoutes.get('/catalog', (_req, res) => {
  res.json({ data: getCatalog() });
});

musicRoutes.get('/library', (_req, res) => {
  res.json({ data: getActiveTracks() });
});

musicRoutes.post('/library', (req, res) => {
  const { id } = req.body ?? {};
  if (typeof id !== 'string') {
    res.status(400).json({ error: 'id is required' });
    return;
  }
  const result = addToLibrary(id);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ data: result.tracks });
});

musicRoutes.delete('/library/:id', (req, res) => {
  const result = removeFromLibrary(req.params.id);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ data: result.tracks });
});
