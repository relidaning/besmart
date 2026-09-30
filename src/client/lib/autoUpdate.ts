// The home-screen app never reloads by itself: iOS resumes the old page from
// memory, so a deploy only showed up once the app was killed. Compare the entry
// bundle this page runs with the one index.html names now, and when they differ,
// reload at a safe moment (like floatingsphere's maybeReload): right after the app
// comes back to the foreground, or on a page change, and never while a field is
// focused or a dialog is open.

const ENTRY = /\/assets\/index-[\w-]+\.js/;
const RESUME_WINDOW_MS = 5_000;
const MIN_GAP_MS = 30_000;
// After a long time in the background the resumed page holds stale data and dead
// connections (a tap on a check-in just hung), so it reloads fresh instead.
const LONG_AWAY_MS = 10 * 60_000;

const running = document
  .querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')
  ?.src.match(ENTRY)?.[0];

let stale = false;
let lastFetch = 0;
let resumedAt = Date.now();
let hiddenAt = 0;

function busy(): boolean {
  const el = document.activeElement;
  if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return true;
  return document.querySelector('.fixed.inset-0') !== null; // an open modal
}

async function isStale(force: boolean): Promise<boolean> {
  if (stale || (!force && Date.now() - lastFetch < MIN_GAP_MS)) return stale;
  lastFetch = Date.now();
  try {
    const html = await fetch('/', { cache: 'no-store' }).then((r) => r.text());
    const latest = html.match(ENTRY)?.[0];
    stale = !!latest && latest !== running;
  } catch { /* offline: try again later */ }
  return stale;
}

export async function checkForUpdate(trigger: 'resume' | 'route' | 'poll') {
  if (!running || document.visibilityState !== 'visible') return;
  if (!(await isStale(trigger === 'resume')) || busy()) return;
  if (trigger === 'route' || Date.now() - resumedAt < RESUME_WINDOW_MS) location.reload();
}

export function startAutoUpdate() {
  if (!running) return; // dev server: the entry is /src/client/main.tsx, nothing to compare
  const onResume = () => {
    if (document.visibilityState !== 'visible') { hiddenAt = Date.now(); return; }
    resumedAt = Date.now();
    if (hiddenAt && resumedAt - hiddenAt > LONG_AWAY_MS && !busy()) { location.reload(); return; }
    hiddenAt = 0;
    navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {});
    checkForUpdate('resume');
  };
  document.addEventListener('visibilitychange', onResume);
  window.addEventListener('pageshow', onResume);
  window.addEventListener('pagehide', () => { hiddenAt = Date.now(); });
  // Learn about a deploy while the app stays open; the reload itself waits for a page change.
  setInterval(() => checkForUpdate('poll'), 5 * 60_000);
}
