import fs from 'fs';
import path from 'path';
import { DB_PATH } from './database.js';
import fullCatalog from '../shared/musicCatalog.json' with { type: 'json' };

// Sleep-mode rain recordings share the catalog file but not the managed library:
// the player's Sleep tab plays every downloaded one.
const catalog = fullCatalog.filter((t) => (t as { kind?: string }).kind !== 'sleep');
const sleepCatalog = fullCatalog.filter((t) => (t as { kind?: string }).kind === 'sleep');

export const MUSIC_DIR = path.join(path.dirname(DB_PATH), 'music');
const LIBRARY_FILE = path.join(MUSIC_DIR, '.library.json');

// Default rotation the first time the app runs (before the user manages anything).
const DEFAULT_ACTIVE_IDS = [
  'chopin-op9-no2',
  'chopin-op27-no2',
  'chopin-op48-no1',
  'chopin-op55-no1',
  'chopin-op32-no2',
  'chopin-b108',
];

export function isDownloaded(filename: string): boolean {
  return fs.existsSync(path.join(MUSIC_DIR, filename));
}

export function getCatalog() {
  return catalog.map((t) => ({ ...t, downloaded: isDownloaded(t.filename) }));
}

export function getSleepTracks() {
  return sleepCatalog.filter((t) => isDownloaded(t.filename));
}

export function getActiveIds(): string[] {
  if (!fs.existsSync(LIBRARY_FILE)) {
    const initial = DEFAULT_ACTIVE_IDS.filter((id) => catalog.some((t) => t.id === id && isDownloaded(t.filename)));
    fs.mkdirSync(MUSIC_DIR, { recursive: true });
    fs.writeFileSync(LIBRARY_FILE, JSON.stringify(initial));
    return initial;
  }
  try {
    const ids = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
    return Array.isArray(ids) ? ids.filter((id) => catalog.some((t) => t.id === id)) : [];
  } catch {
    return [];
  }
}

function setActiveIds(ids: string[]) {
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
  fs.writeFileSync(LIBRARY_FILE, JSON.stringify(ids));
}

export function getActiveTracks() {
  const ids = getActiveIds();
  return ids
    .map((id) => catalog.find((t) => t.id === id))
    .filter((t): t is (typeof catalog)[number] => !!t && isDownloaded(t.filename));
}

export function addToLibrary(id: string): { ok: true; tracks: ReturnType<typeof getActiveTracks> } | { ok: false; error: string } {
  const track = catalog.find((t) => t.id === id);
  if (!track) return { ok: false, error: 'Unknown track' };
  if (!isDownloaded(track.filename)) return { ok: false, error: 'Track not downloaded to local storage yet' };
  const ids = getActiveIds();
  if (!ids.includes(id)) {
    ids.push(id);
    setActiveIds(ids);
  }
  return { ok: true, tracks: getActiveTracks() };
}

export function removeFromLibrary(id: string): { ok: true; tracks: ReturnType<typeof getActiveTracks> } | { ok: false; error: string } {
  const ids = getActiveIds();
  if (ids.length <= 1 && ids.includes(id)) {
    return { ok: false, error: 'Keep at least one track active' };
  }
  setActiveIds(ids.filter((existing) => existing !== id));
  return { ok: true, tracks: getActiveTracks() };
}
