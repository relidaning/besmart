#!/usr/bin/env node
// Downloads the full public-domain piano catalog (see src/shared/musicCatalog.json)
// into the app's persisted data dir, so playback and library management are served
// locally instead of hitting archive.org at request time (the container has no
// outbound internet access). Safe to re-run: skips files that already exist.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const tracks = JSON.parse(fs.readFileSync(path.join(root, 'src/shared/musicCatalog.json'), 'utf8'));

// Mirrors database.ts's default resolution as seen inside the container
// (dist/server/../../data/besmart.db == /app/data, volume-mounted from ./data/besmart on the host).
const DB_PATH = process.env.DB_PATH || path.join(root, 'data', 'besmart', 'besmart.db');
const musicDir = path.join(path.dirname(DB_PATH), 'music');
fs.mkdirSync(musicDir, { recursive: true });

function download(track) {
  const dest = path.join(musicDir, track.filename);
  if (fs.existsSync(dest)) {
    console.log(`skip (exists): ${track.filename}`);
    return;
  }
  console.log(`downloading: ${track.title} -> ${track.filename}`);
  const tmp = `${dest}.part`;
  // shell out to curl: respects http_proxy/https_proxy and handles redirects/retries better than node's fetch here
  const url = encodeURI(track.sourceUrl);
  execFileSync('curl', ['-sSL', '--fail', '--max-time', '120', '-o', tmp, url], { stdio: 'inherit' });
  fs.renameSync(tmp, dest);
  const size = fs.statSync(dest).size;
  console.log(`  saved ${(size / 1024 / 1024).toFixed(1)} MB`);
}

for (const track of tracks) {
  download(track);
}
console.log(`music library ready at ${musicDir}`);
