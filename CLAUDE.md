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
The build's `npm rebuild better-sqlite3` step downloads Node headers via node-gyp. Without the host proxy it times out, which is why this build has seemed "flaky" (it only succeeds when that layer is cached). Build with `docker build --network host --build-arg http_proxy=$http_proxy --build-arg https_proxy=$https_proxy …`, or give compose `build.network: host` and proxy `args`.

**Fast frontend-only iteration** (skip the image rebuild): `npm run build` locally, then replace `dist/` inside the running container and restart:
```
docker exec besmart-besmart-1 rm -rf /app/dist && docker cp /data/apps/besmart/dist besmart-besmart-1:/app/dist && docker compose restart besmart
```
The `rm -rf` first is required — `docker cp dist/. container:/app/dist/` alone only overlays and leaves stale hashed asset files behind, which can mismatch `index.html`. This path replaces the *entire* `dist/` (client + server + shared) — always run the full `npm run build`, not `npm run build:client` alone, or the copied tree will be missing `dist/server` and the container will crash-loop on restart.

### App Structure
- `src/client/` — React frontend
  - `src/client/pages/` — page components (Dashboard, Todos, Plans, CheckIn, Review, ReviewContent, …)
  - `src/client/components/` — shared UI components (`Layout.tsx`, `WeChatLoginModal.tsx`, `ui/`)
    - `PageKit.tsx` (branch `growth-garden`) — `PageHeader`, `StatTiles`, `XpChip`, `EmptyState`. These give every page the Growth Garden look, and their `hidden`/`show` variants join each page's stagger animation
    - `ui/DatePicker.tsx` — calendar-dropdown date picker (value/onChange as `'YYYY-MM-DD'` strings), replaces native `<input type="date">` for consistent mobile/desktop UX; used in Plans/PlanDetail forms
  - `src/client/contexts/` — React contexts, e.g. `ThemeContext.tsx` (see Theming below)
  - `src/client/hooks/` — `api.ts` (cache), `useInfiniteScroll.ts`
  - `src/client/store/` — Zustand auth store
- `src/server/` — Express backend with SQLite
  - `src/server/routes/` — `auth.ts`, `todos.ts`, `reviews.ts`, `checkins.ts`, `studyplans.ts`, `dashboard.ts`, `notifications.ts`, `music.ts`
  - `src/server/middleware/auth.ts` — JWT middleware
  - `src/server/scheduler.ts` — recurring task generation (daily/weekly/monthly/seasonal/yearly check-in tasks), run on startup and hourly via `setInterval`. Each block must check for an existing task before inserting — the seasonal/yearly blocks were missing this check (unlike weekly/monthly) until 2026-07-28, so every hourly tick on a matching day inserted another duplicate `checkin_tasks` row. Also holds a safety net that schedules review courses left with no pending record (see Review Module)
  - `src/server/vaultWatcher.ts` — chokidar watcher; syncs Obsidian vault changes to review courses
  - `src/server/push.ts` — web-push init (`initWebPush()`) and `sendDailyReviewPush()` (called by scheduler)
  - `src/server/musicLibrary.ts` — reads/writes the user's active track selection (see Music Player below)
  - `src/server/garden.ts` — Growth Garden XP engine (see Growth Garden below)
  - `src/server/database.ts`, `src/server/date.ts`, `src/server/types.ts`
- `src/shared/types.ts` — shared TypeScript types
- `src/shared/musicCatalog.json` — full catalog of downloadable tracks (see Music Player below)

### Auth
JWT-based multi-user auth (7d TTL, `Authorization: Bearer <token>`). All `/api/*` routes except `/api/auth/*` require a token. Each data table has a `user_id` column. OAuth supported: Google, GitHub, WeChat (configured via env vars in docker-compose.yml).

Pre-auth data was migrated to `admin@besmart.local` (user id=1). Current main account: `453882101@qq.com`.

**Async route handlers must forward errors.** On Express 4, a throw or rejection inside an `async` handler is an unhandled rejection, and it kills the Node process. For example, a non-string body field makes better-sqlite3 throw `RangeError`. Wrap async handlers (PR #4 adds `asyncHandler` in `auth.ts`) and type-check body fields before querying.

Required env vars: `JWT_SECRET`, `APP_URL`. Optional: `GOOGLE_*`, `GITHUB_*`, `WECHAT_*`, `SMTP_*`.

**Secrets live in `.env`** (untracked, mode 600; `.env.example` lists them): `JWT_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`. `docker-compose.yml` interpolates them and refuses to start without them, and `middleware/auth.ts` has no production fallback. Until 2026-10-01 the compose file committed the placeholder JWT secret (which production used) and the VAPID private key to the public repo; both were rotated then, so the old values in git history are dead. Rotating the JWT secret logs every session out; rotating VAPID invalidates push subscriptions, which the client now replaces on its own at startup (`Layout.tsx` compares the subscription's key with `/api/notifications/vapid-public-key`). Changing `.env` needs `docker compose up -d besmart` (a recreate), and a recreate runs the image, so rebuild the image first if `dist/` was swapped in by hand. Still committed: the MySQL root password for the legacy `mysql`/`nacos` services.

### Review Module (FSRS Spaced Repetition)
Reviews are scheduled with **FSRS-5** (`src/server/fsrs.ts`, default weights, desired retention 0.9, max interval 365 d, ±5% fuzz from 7 d up). Each course stores its memory state in `review_courses.fsrs_*` (stability, difficulty, last review, reps, lapses; migration 10 seeded it from the old SM-2 intervals and ease factors). Ratings are **Forgot** (`again`, next review tomorrow) / **Hard** / **Good** (`ok`) / **Easy**, and each button shows the gap it would give (`memory.preview` in `GET /records/:id/detail`). Rated Good every time, a note comes back after 3, 11, 35, 101 and 269 days, then yearly. Courses only come from the vault: there is no New Course button, and the Review form only edits. New notes get their first review the next day. A course is exactly one note (`vault_path`) and is named after the note's filename, never its H1/title; the old fuzzy name matching that merged several notes into one course (`vault_paths`, Re-match/Sync vault buttons) was removed 2026-09-30, and migration 14 linked or dropped those courses (`vault_paths` is now always NULL). The startup vault sync (`syncVaultForAllConfiguredUsers`) still detects moved/missing notes.

**Rendering notes (`ReviewContent.tsx`):** images (`![[img.png|300]]` and `![](file.png)`) load through `GET /reviews/vault/image?src=&note=`, which resolves a link the way Obsidian does (the note's folder, then the vault root, then any folder by file name). It needs the auth header, so the client fetches blob URLs, and it refuses paths outside the vault. Math is KaTeX (`remark-math`/`rehype-katex`), with Obsidian's inline rule: `$…$` is math only with no space just inside either `$` and no digit right after the closing one, so prices stay text. A closing `$$` must be on its own line, in Obsidian too.

**Diary:** Check In's Diary button (`POST /checkins/diary`) appends `- HH:MM text` under a `### YYYY-MM-DD` heading in the monthly note `0_lidaning/Diaries/YYYY/YYYY-MM.md` (`DIARY_DIR`), creating the file or heading when missing.

Obsidian vault at `/data/nextcloud_client/obsidian/lidaning` is mounted as `/vault` in Docker. Vault notes can be imported as review courses. When the due list is empty, the UI auto-suggests unscheduled vault notes. `vaultWatcher.ts` watches the vault at runtime and syncs add/rename/delete events. It auto-schedules new notes as review courses, except where `src/shared/vaultRules.ts` says a note is never a review source: notes directly in the vault root, and the top-level folders `0_lidaning` (diaries/records), `claude-maxer` (machine-written) and `attachs` (images, still shown inside notes). The same rule applies in `scanVault` (suggestions, sync), the watcher, `scheduleVaultNote`, `POST /vault/import` (which also rejects `..`/absolute paths) and the garden. Migration 13 removed the existing courses from those places. The watcher needs an `'error'` listener and guarded event handlers: without them, one unreadable vault directory crashes Node on every startup, which is a crash loop. PR #5 adds both; it is not merged yet.

Vault directory structure: `0_dev/` (AI, Algorithm, Architecture, CS, java, python, databases, softwares, web, os), `0_lidaning/` (Career, Diaries, Records, Lidaning), `1_English/` (words/), `1_Math/`, `attachs/`, `obsidian-rag/`.

Nextcloud server at `192.168.255.6:8080` is the sync source for the vault — version history and trash recovery live there. The `myall_backup_2026-06-24.tar.gz` backup contains **only DB files**, not vault content.

Key files: `src/server/fsrs.ts`, `src/server/routes/reviews.ts` (completion, `memoryOf()`), DB migration 3 adds `vault_path`, `ease_factor`, `interval_days`. DB migration 6 adds `push_subscriptions` table.

**Deleting a course deletes its note:** `DELETE /reviews/courses/:id` moves the course's exact `vault_path` file to the vault's `.trash/` folder (Obsidian's trash convention, restorable; the folder is chowned to the vault owner because the container runs as root). It adds a number to the name on collision, refuses paths outside the vault, and removes the note's garden plant. `?keepNote=1` skips the file. The watcher and suggestions ignore dot-folders, so `.trash` is never re-imported.

**Invariant: at most one pending (`is_reviewed=0`) `review_records` row per course.** Completion deletes any stray pending rows before inserting the next one. The legacy `scheduler.ts` job that re-derived reviews from a fixed 1/3/7/15/30/60/120/240-day ladder is gone. What remains is a safety net that schedules any course left with no pending record, using its FSRS state.

**Daily cap:** `DUE_DAILY_LIMIT = 20` in `reviews.ts`. `GET /reviews/due` runs a COUNT first (same WHERE clause), then fetches at most 20 oldest-due rows. Response shape: `{ data, total, limit }` — `total` is the real overdue count across all courses. Frontend shows "Showing 20 of N due" when `total > data.length`.

**Due order:** latest notes first (course `created_at` DESC, which is when the vault note was added), postponed courses last. Changed 2026-09-30 at the user's request; before that the list was AI-first, oldest-due first. `DUE_TOPIC_TIER` in `reviews.ts` (AI/ML/DL notes in `0_dev/0_AI/` or the old `0_dev/AI/`, then the rest of `0_dev/`, then everything else) now only breaks ties between notes added at the same moment.

Search on the due list is **server-side**: `GET /reviews/due?search=` filters by `c.name LIKE '%?%'`. The frontend uses the two-state debounce pattern (`query` + `debouncedQuery`, 400ms). The search input shows a clear (✕) button when non-empty.

### Study Plans Module (WBS)
Plans (`study_plans`) contain tasks (`plan_tasks`) arranged as a work-breakdown-structure tree, not a flat list. `plan_tasks` has `parent_task_id` (nullable, self-referencing) and `sort_order` (per-sibling-group) — added in DB migration 7, added directly to the fresh-install schema too. `src/server/routes/studyplans.ts`:
- `POST/GET/PUT /:planId/tasks[/:taskId]` accept/return `parent_task_id`; sort order auto-assigned as `max(siblings.sort_order) + 1`.
- `DELETE /:planId/tasks/:taskId` recursively deletes the task and all descendants via a `WITH RECURSIVE` CTE.
- `POST /:planId/tasks/:taskId/indent` — becomes the last child of its previous sibling. `/outdent` — becomes the next sibling of its parent. `/move` — reorder within the same parent.
- A task with children cannot be marked complete directly (`PUT` ignores `is_completed` when `hasChildren`); completion only applies to leaves, and parent progress is a rollup computed client-side from leaf state.
- `PlanDetail.tsx` renders the tree with computed WBS codes (`1`, `1.1`, `1.2.1`, …) derived from tree position, not stored.

### Todos Module
Todo interface: `id`, `title`, `description`, `priority` (low/medium/high), `due_date`, `completed`, `completed_at`, `plan_id`. Pagination: 20 per page via Intersection Observer infinite scroll (sentinel pattern).

Each todo card shows a colored priority pill before its title (red High / yellow Medium / green Low, from `priorityConfig`) and has ▲/▼ buttons to step `priority` through low→medium→high (disabled at the ends), using the existing `PUT /api/todos/:id` partial-update endpoint with optimistic updates and toast-on-failure rollback. The list is sorted server-side by priority tier then due date; `Todos.tsx` has a client-side `sortTodos()` mirroring that `ORDER BY` and re-sorts after every local mutation (create, edit, priority change) — otherwise items land in stale positions (e.g. new todos at the top) until a refetch. Empty due dates must be normalized to `null` client-side, as the server does, or they sort wrong.

**Suspected date bug (open):** `completed_at` is written as a UTC ISO string (`new Date().toISOString()`), but `/todos/stats/overview` compares `date(completed_at)` to `localDate()` (Asia/Shanghai). The "completed today" count, and the 5-a-day bonus check on complete, which also uses a UTC `today`, can therefore miss completions made between 00:00 and 08:00 local time. This was seen as "Done Today" staying at 0 but has not been confirmed.

Search uses a two-state debounce pattern: `search` (input value) + `debouncedSearch` (400ms delayed) — the API call uses only `debouncedSearch` to avoid per-keystroke requests. Tab-based filtering (active/completed) and priority filter work alongside search. The search input shows a clear (✕) button when non-empty.

### Growth Garden (XP gamification — branch `growth-garden`, not merged yet)
Completing an item earns XP in one of four attributes: `wisdom`, `health`, `capability`, `wealth`. Reviews give Wisdom (Hard 12 / OK 8 / Easy 6). Plan tasks give Wisdom 15, and a finished plan gives 50. Todos always give Capability (High 15 / Medium 10 / Low 5). A check-in's XP is its schedule's `score`, with a minimum of 5, and goes to the schedule's `category`.
- **Storage:** `xp_events` is append-only, with one row per source item (`UNIQUE(source_type, source_id)`). Totals are a plain `SUM`. `awardXp()` is idempotent, and un-completing an item calls `revokeXp()`, which deletes that row. Every complete endpoint in `checkins`/`todos`/`reviews`/`studyplans` returns `xp` (an `XpAward`, or `null`), and the client uses it to show toasts and confetti.
- **Rules:** level = `floor(sqrt(xp/50))`. 1 in 8 awards is a 2× crit. Review XP stops after 20 a day (`REVIEW_XP_DAILY_CAP`, which mirrors `DUE_DAILY_LIMIT`). The streak counts any day with XP, and every 7 active days banks a shield (at most 2) that covers a missed day.
- **Categories:** `checkin_schedules.category` is nullable. When it is NULL, `inferCategory()` guesses the attribute from the schedule name with a regex.
- **Backfill:** `initGarden()` runs once at startup and converts all history into XP, with no crits. The `garden_state` `'backfilled'` flag keeps it from running again, which matters because a rerun would re-award reviews that went over the cap.
- **API/UI:** `GET /api/garden/summary` returns attributes, streak, heatmap and achievements. The UI is the `/garden` page (`Garden.tsx`), a Dashboard card, `components/AttributeBar.tsx`, and `client/lib/garden.ts`.
- **Flowers are notes, trees are study plans (migrations 9/11/12: `garden_plants`, `garden_events`).**
  - **Note plants (flowers and shrubs):** a note that becomes a review course plants a sapling (`plantForCourse` from `scheduleVaultNote`, vault import, `POST /courses`). Notes older than the garden plant theirs at their first review, and `claude-maxer/` notes get none. The family follows the folder (`familyForNote`: `0_dev/0_AI` purple, other `0_dev` blue, `1_English` amber, the rest green), and the tier follows the Wisdom level; ladders top out at shrubs (`TIER_LEVELS` 0/3/6/9). Growth is the sum of the plant's events: reviews (`growFromReview`: 6/12/18/22) plus water, since every check-in or todo waters the 3 note plants that have gone longest without water (+2, once a plant a day, at most +20 per plant from water). Full size is 100, so a plant only matures through reviews. Migration 15 rescaled past events to these rules, which were slowed down after check-ins alone had matured a flower in a day.
  - **Trees:** a plan plants a tree when it's created (`plantTreeForPlan` in `POST /plans`, with the `tree` the user picked from `GET /garden/trees`); older plans plant one at their next finished task. A tree's growth is the plan's share of finished leaf tasks (computed in `gardenPlants`, not summed from events), and 100% once the plan is finished, when it bears fruit. `task` and `plan` events log it. Deleting a plan removes its tree.
  - **Tree species:** `STARTER_TREES` (6) plus species unlocked by achievements (`ACHIEVEMENT_TREES`, all-time) and by reaching Lv 5 in an attribute (`MILESTONE_SPECIES`). Seeds are gone (migration 12 deleted seed plants). `revokeXp` deletes the water/task/plan events of an undone item. `garden_events` is also the journal (`GET /api/garden/events?before=&plant=`).
- **Fresh start (2026-09-30):** the user didn't want history in the garden, so every plant was deleted once (flag `garden_fresh_start`). Never backfill plants again.
- **Growth and seasons (`client/lib/gardenArt.ts`):** `growthFor(growth, target)` keeps a plant a sapling below 10% of its target growth, then scales it up to full size. Trees also gain detail with growth (`pct`: canopy puffs, pine tiers, bamboo stalks, blossom), a finished plan's tree bears fruit (`fruit`), and tree height is capped at 36% of the canvas width. The season follows the calendar (northern hemisphere, `seasonOf`): spring buds, summer bloom, autumn colors (`Species.autumn`: maple red, ginkgo gold) with dry flowers, winter bare branches with herbs reduced to stubs, and `evergreen` species (pines, cypress, boxwood, olive, bamboo, jade) green under snow. The canvas paints the scene offscreen and animates particles on top: spring petals, autumn leaves falling from deciduous trees, winter snow. The Garden page has a season preview switch.
- **Garden page:** a canvas isometric island (All/Year/Month/Week/Today by planting day). Every plant keeps one tile, filled in planting order (`gardenLayout` in `Garden.tsx`); a period view shows only its plants and crops the island to their tiles, All shows the whole island. It zooms with pinch, ctrl/⌘-wheel, double-tap or the +/− buttons (view transform in `GardenCanvas`, max 6×; `touch-action` switches to `none` only while zoomed). Tapping a plant shows its note, a growth bar and its history. The page also has the journal, the seed pouch, the species ladder and rare trees. Tapping an achievement on Home opens an animated pop-up (`AchievementModal` in `GardenStats.tsx`). The same pop-up opens when one is earned: `AchievementWatcher` (lazy, in `Layout.tsx`) re-reads the summary on the `besmart:xp` event the API client fires after an XP-earning completion and compares it with the unlocked set in `localStorage` (`besmart-achievements-<userId>`); the first check on a device only records it. The stats (attributes, heatmap, achievements) are on Home via `components/GardenStats.tsx`.
- **Migration clash:** this adds migration 8, and open PR #2 (DB indexes) also adds migration 8. Renumber one of them before both merge.

### UI Patterns (shared across modules)
- **Two-state debounce**: raw state (immediate, drives input value) + debounced state (400ms delay, drives API call). Prevents per-keystroke requests.
- **`initialLoadDone` ref**: set to `true` after first successful fetch. Subsequent fetches (filter/search changes) skip the full loading spinner, avoiding jarring resets.

### Theming (Dark Mode)
Tailwind uses `darkMode: 'class'` (`tailwind.config.js`); the `dark` class is toggled on `<html>`. `src/client/contexts/ThemeContext.tsx` exposes `theme` (`'light' | 'dark' | 'system'`, persisted to `localStorage` under `besmart-theme`) and `resolvedTheme` (the actual applied value, following `prefers-color-scheme` when `theme === 'system'`). An inline script in `index.html` (runs before React hydrates) applies the class synchronously to avoid a flash of the wrong theme on load. `App.tsx` wraps the tree in `ThemeProvider`; the toggle lives in `Layout.tsx`'s header (next to the bell icon) and cycles System → Light → Dark. Every page and shared component (cards, buttons, inputs, badges, modals, `DatePicker`) carries `dark:` variants; `ReviewContent.tsx` additionally swaps the `react-syntax-highlighter` Prism theme based on `resolvedTheme`.

### API Client Cache
`src/client/hooks/api.ts` keeps an in-memory `_cache` Map with a 30s TTL. Repeated requests to the same URL (including `?search=` variants) are served from cache. Mutations bust cache entries by matching the resource URL prefix.

### Push Notifications (PWA)
The app is a PWA with a manifest (`/manifest.json`, `display: standalone`) and service worker (`/sw.js`). Push notifications use the Web Push API (VAPID keys) via the `web-push` npm package.

- **Server:** `src/server/push.ts` initializes VAPID on startup. Daily push fires at `PUSH_NOTIFY_TIME` (default `11:30`) — queries each subscribed user's due review count and sends a notification. Each push is attempted only once, so a single transient DNS error (`EAI_AGAIN web.push.apple.com`) loses that day's reminder. PR #5 (not merged yet) retries transient errors and 429/5xx responses after 5 s, 30 s and 120 s. 404/410 responses still delete the subscription.
- **Routes:** `GET /api/notifications/vapid-public-key`, `POST /api/notifications/subscribe`, `POST /api/notifications/unsubscribe`
- **Frontend:** Bell icon in Layout header — always visible, `BellOff` (grey) when unsubscribed, `Bell` (purple) when subscribed
- **iOS requirement:** Must add app to home screen (Share → Add to Home Screen) from Safari using the HTTPS URL. Push doesn't work from browser tabs.
- **VAPID keys** are set via env vars `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` in docker-compose.yml.
- **Icons:** in floatingsphere's style: a four-segment ring in the attribute colors around a glass disc with a mountain + amber summit flag, on `#0d0e13`. `scripts/make_icons.py` (cairo) renders `icon-180/192/512.png` and `favicon-32.png`; `public/icons/icon.svg` is hand-matched to it, so keep the two in step. iOS ignores SVG `apple-touch-icon`s and shows a black square, so it must point to the 180px PNG. iOS stores the icon when the app is added to the home screen, so users must remove and re-add the app to see a new icon.

### Load Performance / Caching
- **nginx** (`besmart.conf`): gzip, HTTP/2, TLS session cache.
- **Bundle:** only the Dashboard is eager; other pages are `React.lazy` in `App.tsx` (`Suspense` inside `Layout.tsx` keeps the header and nav on screen). `vite.config.ts` splits a separate vendor chunk. `ReviewContent.tsx` uses the light Prism build and registers only the languages used in the vault. Languages not on that list render without highlighting, so add any new vault language there.
- **HTTP caching** (`src/server/index.ts`): `/assets/*` is `immutable` for 1 year; `index.html` and `sw.js` are `no-cache`.
- **Service worker** (`public/sw.js`, cache `besmart-shell-vN`): `/assets/` and `/icons/` are cache-first, and navigations are network-first with the cached `/` as a fallback. Icon filenames aren't hashed, so **bump the `CACHE` version whenever an icon changes**, or installed clients keep the old one.
- **Auto-update** (`src/client/lib/autoUpdate.ts`): iOS resumes the home-screen app's old page from memory, so the page compares its entry bundle (`/assets/index-*.js`) with the one `index.html` names now and reloads within 5 s of returning to the foreground or on the next route change, never while a field is focused or a modal (`.fixed.inset-0`) is open. Deploys need no manual reopen. After more than 10 min in the background it reloads anyway, because the resumed page kept dead connections and a tap just hung; `api.ts` also aborts any request after 15 s. The home-screen *icon* is the exception: iOS stores it when the app is added, so a new icon still needs a remove and re-add.
- **Form fields are 16px on touch screens** (`index.css`, `pointer: coarse`): iOS zooms into smaller fields on focus, which lifted the page and left it pannable.

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
- **Sleep mode:** the player has Focus / Sleep tabs. Sleep plays catalog entries with `"kind": "sleep"` (4 CC0/public-domain archive.org rain recordings, 30–36 min, looped at 1x), served by `GET /api/music/sleep` and kept out of the managed library. The sleep timer (15/30/60/90 min) fades out over its last 20 s, but iOS ignores `audio.volume`, so there it simply stops. The timer is checked on `timeupdate` as well as a 1 s interval, because page timers may be throttled while the phone is locked.
- Frontend components: `src/client/components/MusicPlayer.tsx` (top-bar popup), `src/client/pages/MusicLibrary.tsx` (`/music` management page, with search, add/remove, per-track preview play, and pagination).

### Database
SQLite path defaults to `<project>/data/besmart.db` but can be overridden via `DB_PATH` env var (`database.ts`).

**Known issue — fresh-DB migration ordering:** `database.ts` migration 1 references the `scores` table before migration 2 creates it, so bootstrapping against a genuinely empty DB file fails at startup. Not hit in production (the DB always already exists), but blocks spinning up a fresh dev/demo instance — copy an existing `.db` file instead of starting from empty.

### Git Push (network)
Direct `git push` over SSH to `github.com` can fail with DNS resolution errors in this environment (no direct outbound DNS/SSH). A local SOCKS5 proxy is available at `127.0.0.1:10808` (also set as `http_proxy`/`https_proxy` env vars). Route a single push through it without touching git config: `GIT_SSH_COMMAND='ssh -o ProxyCommand="nc -X 5 -x 127.0.0.1:10808 %h %p"' git push origin master`.
