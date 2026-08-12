# BeSmart

The BeSmart app is a Node.js/TypeScript productivity app at the repo root, containerized via Docker Compose at `/data/apps/besmart/docker-compose.yml`. Old flask micro-apps are archived in `deprecated/`.

## Key Concepts

### Deployment
Two Docker services run together:
- `besmart` — Node.js/TypeScript app, port **5090** (container port 3001). Data persisted at `./data/besmart`.
- `besmart-https` — Nginx reverse proxy, port **5443** (HTTPS). Config at `config/nginx/besmart.conf`. Proxies to besmart on port 3001.

**HTTPS URL (for phone/PWA):** `https://192.168.255.6:5443`  
**HTTP URL (LAN):** `http://192.168.1.8:5090`

**Rebuild and redeploy after any code change:**
```
docker compose build besmart && docker compose up -d besmart besmart-https
```

**Fast frontend-only iteration** (skip the image rebuild): `npm run build` locally, then replace `dist/` inside the running container and restart:
```
docker exec besmart-besmart-1 rm -rf /app/dist && docker cp /data/apps/besmart/dist besmart-besmart-1:/app/dist && docker compose restart besmart
```
The `rm -rf` first is required — `docker cp dist/. container:/app/dist/` alone only overlays and leaves stale hashed asset files behind, which can mismatch `index.html`. This path replaces the *entire* `dist/` (client + server + shared) — always run the full `npm run build`, not `npm run build:client` alone, or the copied tree will be missing `dist/server` and the container will crash-loop on restart.

### App Structure
- `src/client/` — React frontend
  - `src/client/pages/` — page components (Dashboard, Todos, Plans, CheckIn, Review, ReviewContent, …)
  - `src/client/components/` — shared UI components (`Layout.tsx`, `WeChatLoginModal.tsx`, `ui/`)
    - `ui/DatePicker.tsx` — calendar-dropdown date picker (value/onChange as `'YYYY-MM-DD'` strings), replaces native `<input type="date">` for consistent mobile/desktop UX; used in Plans/PlanDetail forms
  - `src/client/contexts/` — React contexts, e.g. `ThemeContext.tsx` (see Theming below)
  - `src/client/hooks/` — `api.ts` (cache), `useInfiniteScroll.ts`
  - `src/client/store/` — Zustand auth store
- `src/server/` — Express backend with SQLite
  - `src/server/routes/` — `auth.ts`, `todos.ts`, `reviews.ts`, `checkins.ts`, `studyplans.ts`, `dashboard.ts`, `notifications.ts`, `music.ts`
  - `src/server/middleware/auth.ts` — JWT middleware
  - `src/server/scheduler.ts` — recurring task generation (daily/weekly/monthly/seasonal/yearly check-in tasks), run on startup and hourly via `setInterval`. Each block must check for an existing task before inserting — the seasonal/yearly blocks were missing this check (unlike weekly/monthly) until 2026-07-28, so every hourly tick on a matching day inserted another duplicate `checkin_tasks` row. Also contains a legacy job that regenerates "next" `review_records` independently of the SM-2 logic in `reviews.ts` (see Review Module)
  - `src/server/vaultWatcher.ts` — chokidar watcher; syncs Obsidian vault changes to review courses
  - `src/server/push.ts` — web-push init (`initWebPush()`) and `sendDailyReviewPush()` (called by scheduler)
  - `src/server/musicLibrary.ts` — reads/writes the user's active track selection (see Music Player below)
  - `src/server/database.ts`, `src/server/date.ts`, `src/server/types.ts`
- `src/shared/types.ts` — shared TypeScript types
- `src/shared/musicCatalog.json` — full catalog of downloadable tracks (see Music Player below)

### Auth
JWT-based multi-user auth (7d TTL, `Authorization: Bearer <token>`). All `/api/*` routes except `/api/auth/*` require a token. Each data table has a `user_id` column. OAuth supported: Google, GitHub, WeChat (configured via env vars in docker-compose.yml).

Pre-auth data was migrated to `admin@besmart.local` (user id=1). Current main account: `453882101@qq.com`.

Required env vars: `JWT_SECRET`, `APP_URL`. Optional: `GOOGLE_*`, `GITHUB_*`, `WECHAT_*`, `SMTP_*`.

### Review Module (SM-2 Spaced Repetition)
Reviews use a simplified SM-2 algorithm. Ratings: **Hard** (interval×0.5, ef−0.2) / **OK** (interval×ef×0.85) / **Easy** (interval×ef, ef+0.15). Ease factor clamped to [1.3, 3.5].

Obsidian vault at `/data/nextcloud_client/obsidian/lidaning` is mounted as `/vault` in Docker. Vault notes can be imported as review courses. When the due list is empty, the UI auto-suggests unscheduled vault notes. `vaultWatcher.ts` watches the vault at runtime and syncs add/rename/delete events.

Vault directory structure: `0_dev/` (AI, Algorithm, Architecture, CS, java, python, databases, softwares, web, os), `0_lidaning/` (Career, Diaries, Records, Lidaning), `1_English/` (words/), `1_Math/`, `attachs/`, `obsidian-rag/`.

Nextcloud server at `192.168.255.6:8080` is the sync source for the vault — version history and trash recovery live there. The `myall_backup_2026-06-24.tar.gz` backup contains **only DB files**, not vault content.

Key files: `src/server/routes/reviews.ts` (SM-2 logic in `sm2()`), DB migration 3 adds `vault_path`, `ease_factor`, `interval_days`. DB migration 6 adds `push_subscriptions` table.

**Invariant: at most one pending (`is_reviewed=0`) `review_records` row per course.** A legacy `scheduler.ts` job independently regenerates "next" records for any course whose latest generation is complete but has no successor — a second code path alongside the insert that `reviews.ts` does on completion. Historically this produced duplicate pending rows for the same course, which made a just-completed item immediately reappear in the due list (the due query's per-course logic just promoted the stray duplicate). `POST /records/:id/complete` now self-heals by deleting any other stray pending records for the same course before inserting the new one, which also makes the legacy scheduler harmless going forward.

**Daily cap:** `DUE_DAILY_LIMIT = 20` in `reviews.ts`. `GET /reviews/due` runs a COUNT first (same WHERE clause), then fetches at most 20 oldest-due rows. Response shape: `{ data, total, limit }` — `total` is the real overdue count across all courses. Frontend shows "Showing 20 of N due" when `total > data.length`.

Search on the due list is **server-side**: `GET /reviews/due?search=` filters by `c.name LIKE '%?%'`. The frontend uses the two-state debounce pattern (`query` + `debouncedQuery`, 400ms). The search input shows a clear (✕) button when non-empty.

### Todos Module
Todo interface: `id`, `title`, `description`, `priority` (low/medium/high), `due_date`, `completed`, `completed_at`, `plan_id`. Pagination: 20 per page via Intersection Observer infinite scroll (sentinel pattern).

Search uses a two-state debounce pattern: `search` (input value) + `debouncedSearch` (400ms delayed) — the API call uses only `debouncedSearch` to avoid per-keystroke requests. Tab-based filtering (active/completed) and priority filter work alongside search. The search input shows a clear (✕) button when non-empty.

### UI Patterns (shared across modules)
- **Two-state debounce**: raw state (immediate, drives input value) + debounced state (400ms delay, drives API call). Prevents per-keystroke requests.
- **`initialLoadDone` ref**: set to `true` after first successful fetch. Subsequent fetches (filter/search changes) skip the full loading spinner, avoiding jarring resets.

### Theming (Dark Mode)
Tailwind uses `darkMode: 'class'` (`tailwind.config.js`); the `dark` class is toggled on `<html>`. `src/client/contexts/ThemeContext.tsx` exposes `theme` (`'light' | 'dark' | 'system'`, persisted to `localStorage` under `besmart-theme`) and `resolvedTheme` (the actual applied value, following `prefers-color-scheme` when `theme === 'system'`). An inline script in `index.html` (runs before React hydrates) applies the class synchronously to avoid a flash of the wrong theme on load. `App.tsx` wraps the tree in `ThemeProvider`; the toggle lives in `Layout.tsx`'s header (next to the bell icon) and cycles System → Light → Dark. Every page and shared component (cards, buttons, inputs, badges, modals, `DatePicker`) carries `dark:` variants; `ReviewContent.tsx` additionally swaps the `react-syntax-highlighter` Prism theme based on `resolvedTheme`.

### API Client Cache
`src/client/hooks/api.ts` keeps an in-memory `_cache` Map with a 30s TTL. Repeated requests to the same URL (including `?search=` variants) are served from cache. Mutations bust cache entries by matching the resource URL prefix.

### Push Notifications (PWA)
The app is a PWA with a manifest (`/manifest.json`, `display: standalone`) and service worker (`/sw.js`). Push notifications use the Web Push API (VAPID keys) via the `web-push` npm package.

- **Server:** `src/server/push.ts` initializes VAPID on startup. Daily push fires at `PUSH_NOTIFY_TIME` (default `11:30`) — queries each subscribed user's due review count and sends a notification.
- **Routes:** `GET /api/notifications/vapid-public-key`, `POST /api/notifications/subscribe`, `POST /api/notifications/unsubscribe`
- **Frontend:** Bell icon in Layout header — always visible, `BellOff` (grey) when unsubscribed, `Bell` (purple) when subscribed
- **iOS requirement:** Must add app to home screen (Share → Add to Home Screen) from Safari using the HTTPS URL. Push doesn't work from browser tabs.
- **VAPID keys** are set via env vars `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` in docker-compose.yml.

### HTTPS Setup (mkcert + Nginx)
Service workers (required for push) only work over HTTPS. A local CA was created with mkcert v1.4.4 at `/data/apps/besmart/config/mkcert/`.

- **CA cert:** `config/mkcert/rootCA.pem` — served as `http://192.168.255.6:5090/rootCA.mobileconfig` for iOS installation
- **TLS cert/key:** `config/mkcert/cert.pem` / `key.pem` — covers `192.168.255.6`, `192.168.1.8`, `localhost`, `127.0.0.1`
- **Nginx config:** `config/nginx/besmart.conf` — listens on 443, proxies to besmart:3001, serves rootCA.pem at `/rootCA.pem`
- **iOS CA install flow:** Safari → `http://192.168.255.6:5090/rootCA.mobileconfig` → Allow → Settings → General → VPN & Device Management → Install → then Settings → General → About → Certificate Trust Settings → toggle on

### Music Player
A top-bar button opens a small focus-music player (play/pause, 1x–2x speed, volume, shuffle) playing public-domain classical piano recordings.

- **Catalog vs. library:** `src/shared/musicCatalog.json` is the full set of downloadable tracks (currently 20 CC0 Chopin recordings). `src/server/musicLibrary.ts` tracks which subset is the user's *active* library (defaults to 6); `GET/POST/DELETE /api/music/library` (`src/server/routes/music.ts`) reads/adds/removes from it. The player only plays the active library; the full catalog is browsed/managed at `/music` (`src/client/pages/MusicLibrary.tsx`), which replaced an earlier popup-modal version because the modal overflowed on mobile.
- **Files live on disk, not in git or the DB:** tracks are downloaded once via `scripts/download-music.mjs` (`npm run download-music`) into `data/besmart/music/`, served statically by Express at `/media/music/`.
- **The running container has no outbound internet access** — downloads only work from the host (which has proxy env vars set). Any future catalog changes must be downloaded on the host and deployed via the `dist/` swap or image rebuild, never attempted from inside the container.
- Frontend components: `src/client/components/MusicPlayer.tsx` (top-bar popup), `src/client/pages/MusicLibrary.tsx` (`/music` management page, with search, add/remove, per-track preview play, and pagination).

### Database
SQLite path defaults to `<project>/data/besmart.db` but can be overridden via `DB_PATH` env var (`database.ts`).
