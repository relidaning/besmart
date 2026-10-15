import fs from 'fs';
import os from 'os';
import path from 'path';
import { DB_PATH } from './database.js';

// Music lives in the user's own folders, not in the app: Focus plays every file in
// ~/Videos (the audio track only, through an <audio> element), plus any ~/Music track
// turned on at /music; Sleep plays the ~/Music/<MUSIC_SLEEP_FOLDER> folder, each looped.
// The container mounts both folders read-only (docker-compose.yml).
export const VIDEOS_DIR = process.env.MUSIC_VIDEOS_DIR || path.join(os.homedir(), 'Videos');
export const MUSIC_DIR = process.env.MUSIC_DIR || path.join(os.homedir(), 'Music');
const SLEEP_FOLDER = process.env.MUSIC_SLEEP_FOLDER || 'Rain';

// Only the on/off choices are app state: ~/Videos tracks are on unless removed, so new
// downloads join the rotation by themselves; ~/Music tracks are off unless added.
const LIBRARY_FILE = path.join(path.dirname(DB_PATH), 'music-library.json');

const PLAYABLE = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.flac', '.mp4', '.m4v', '.webm']);

export interface Track {
  id: string; // 'videos/<relative path>' or 'music/<relative path>'
  title: string;
  composer: string; // the folder it came from
  url: string;
}

type Source = 'videos' | 'music';

function walk(root: string, rel = ''): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const child = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) files.push(...walk(root, child));
    else if (e.isFile() && PLAYABLE.has(path.extname(e.name).toLowerCase())) files.push(child);
  }
  return files;
}

function toTrack(source: Source, rel: string): Track {
  const base = path.basename(rel, path.extname(rel));
  // yt-dlp names files "Title [videoId].ext"
  const title = base.replace(/\s*\[[\w-]{6,}\]$/, '').trim() || base;
  const folder = path.dirname(rel);
  return {
    id: `${source}/${rel}`,
    title,
    composer: folder === '.' ? (source === 'videos' ? 'Videos' : 'Music') : folder,
    url: `/media/${source}/${rel.split('/').map(encodeURIComponent).join('/')}`,
  };
}

const byTitle = (a: Track, b: Track) => a.title.localeCompare(b.title);

function videoTracks(): Track[] {
  return walk(VIDEOS_DIR).map((rel) => toTrack('videos', rel)).sort(byTitle);
}

function musicTracks(): Track[] {
  return walk(MUSIC_DIR)
    .filter((rel) => !rel.startsWith(`${SLEEP_FOLDER}/`))
    .map((rel) => toTrack('music', rel))
    .sort((a, b) => a.composer.localeCompare(b.composer) || byTitle(a, b));
}

export function getSleepTracks(): Track[] {
  return walk(path.join(MUSIC_DIR, SLEEP_FOLDER))
    .map((rel) => toTrack('music', `${SLEEP_FOLDER}/${rel}`))
    .sort(byTitle);
}

interface Choices {
  added: string[];
  removed: string[];
}

function readChoices(): Choices {
  try {
    const raw = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
    return {
      added: Array.isArray(raw.added) ? raw.added.filter((id: unknown) => typeof id === 'string') : [],
      removed: Array.isArray(raw.removed) ? raw.removed.filter((id: unknown) => typeof id === 'string') : [],
    };
  } catch {
    return { added: [], removed: [] };
  }
}

function writeChoices(c: Choices) {
  fs.writeFileSync(LIBRARY_FILE, JSON.stringify(c));
}

function isActive(t: Track, c: Choices) {
  return t.id.startsWith('videos/') ? !c.removed.includes(t.id) : c.added.includes(t.id);
}

/** Every track that can join the focus rotation, with whether it's in it now. */
export function getCatalog() {
  const c = readChoices();
  return [...videoTracks(), ...musicTracks()].map((t) => ({ ...t, active: isActive(t, c) }));
}

export function getActiveTracks(): Track[] {
  const c = readChoices();
  return [...videoTracks(), ...musicTracks()].filter((t) => isActive(t, c));
}

type Result = { ok: true; tracks: Track[] } | { ok: false; error: string };

export function addToLibrary(id: string): Result {
  if (!getCatalog().some((t) => t.id === id)) return { ok: false, error: 'Unknown track' };
  const c = readChoices();
  c.removed = c.removed.filter((x) => x !== id);
  if (id.startsWith('music/') && !c.added.includes(id)) c.added.push(id);
  writeChoices(c);
  return { ok: true, tracks: getActiveTracks() };
}

export function removeFromLibrary(id: string): Result {
  const active = getActiveTracks();
  if (active.length <= 1 && active[0]?.id === id) return { ok: false, error: 'Keep at least one track active' };
  const c = readChoices();
  c.added = c.added.filter((x) => x !== id);
  if (id.startsWith('videos/') && !c.removed.includes(id)) c.removed.push(id);
  writeChoices(c);
  return { ok: true, tracks: getActiveTracks() };
}
