import { useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { drawPlant, type Season } from '../lib/gardenArt';
import { SPECIES } from '../../shared/gardenSpecies';

// A single species drawn full-grown, for lists and pop-ups.
export default function PlantIcon({ species, size = 36, locked = false, season = 'summer' }: {
  species: string;
  size?: number;
  locked?: boolean;
  season?: Season;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const c = ref.current;
    const sp = SPECIES[species];
    if (!c || !sp) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    drawPlant(ctx, sp, size / 2, size * 0.9, size * 0.82, { seed: 7, dark: resolvedTheme === 'dark', season });
  }, [species, size, resolvedTheme, season]);
  return <canvas ref={ref} style={{ width: size, height: size }} className={locked ? 'opacity-30 grayscale' : ''} />;
}
