# BeSmart

The BeSmart app is a Node.js/TypeScript productivity app at the repo root, containerized via Docker Compose at `/data/apps/besmart/docker-compose.yml`. Old flask micro-apps are archived in `deprecated/`.

## Key Concepts

### Deployment
The active app is the `besmart` service (Node.js/TypeScript). It runs in Docker on port **5090** (maps to container port 3001). Data is persisted at `./data/besmart`.

**Note:** `docker-compose.yml` has `context: ./besmart` — update it to `context: .` after the repo restructure, otherwise the build will fail.

**Rebuild and redeploy after any code change:**
```
docker compose build besmart && docker compose up -d besmart
```

### App Structure
- `src/client/` — React frontend
  - `src/client/pages/` — page components (Dashboard, Todos, Plans, CheckIn, Review, ReviewContent, …)
  - `src/client/components/` — shared UI components (`Layout.tsx`, `WeChatLoginModal.tsx`, `ui/`)
  - `src/client/contexts/` — React contexts
  - `src/client/hooks/` — `api.ts` (cache), `useInfiniteScroll.ts`
  - `src/client/store/` — Zustand auth store
- `src/server/` — Express backend with SQLite
  - `src/server/routes/` — `auth.ts`, `todos.ts`, `reviews.ts`, `checkins.ts`, `studyplans.ts`, `dashboard.ts`
  - `src/server/middleware/auth.ts` — JWT middleware
  - `src/server/scheduler.ts` — recurring task generation (daily check-in tasks)
  - `src/server/vaultWatcher.ts` — chokidar watcher; syncs Obsidian vault changes to review courses
  - `src/server/database.ts`, `src/server/date.ts`, `src/server/types.ts`
- `src/shared/types.ts` — shared TypeScript types

### Auth
JWT-based multi-user auth (7d TTL, `Authorization: Bearer <token>`). All `/api/*` routes except `/api/auth/*` require a token. Each data table has a `user_id` column. OAuth supported: Google, GitHub, WeChat (configured via env vars in docker-compose.yml).

Pre-auth data was migrated to `admin@besmart.local` (user id=1). Current main account: `453882101@qq.com`.

Required env vars: `JWT_SECRET`, `APP_URL`. Optional: `GOOGLE_*`, `GITHUB_*`, `WECHAT_*`, `SMTP_*`.

### Review Module (SM-2 Spaced Repetition)
Reviews use a simplified SM-2 algorithm. Ratings: **Hard** (interval×0.5, ef−0.2) / **OK** (interval×ef×0.85) / **Easy** (interval×ef, ef+0.15). Ease factor clamped to [1.3, 3.5].

Obsidian vault at `/data/nextcloud_client/obsidian/lidaning` is mounted as `/vault` in Docker. Vault notes can be imported as review courses. When the due list is empty, the UI auto-suggests unscheduled vault notes. `vaultWatcher.ts` watches the vault at runtime and syncs add/rename/delete events.

Key files: `src/server/routes/reviews.ts` (SM-2 logic in `sm2()`), DB migration 3 adds `vault_path`, `ease_factor`, `interval_days`.

Search on the due list is **server-side**: `GET /reviews/due?search=` filters by `c.name LIKE '%?%'`. The frontend uses the two-state debounce pattern (`query` + `debouncedQuery`, 400ms). The search input shows a clear (✕) button when non-empty.

### Todos Module
Todo interface: `id`, `title`, `description`, `priority` (low/medium/high), `due_date`, `completed`, `completed_at`, `plan_id`. Pagination: 20 per page via Intersection Observer infinite scroll (sentinel pattern).

Search uses a two-state debounce pattern: `search` (input value) + `debouncedSearch` (400ms delayed) — the API call uses only `debouncedSearch` to avoid per-keystroke requests. Tab-based filtering (active/completed) and priority filter work alongside search. The search input shows a clear (✕) button when non-empty.

### UI Patterns (shared across modules)
- **Two-state debounce**: raw state (immediate, drives input value) + debounced state (400ms delay, drives API call). Prevents per-keystroke requests.
- **`initialLoadDone` ref**: set to `true` after first successful fetch. Subsequent fetches (filter/search changes) skip the full loading spinner, avoiding jarring resets.

### API Client Cache
`src/client/hooks/api.ts` keeps an in-memory `_cache` Map with a 30s TTL. Repeated requests to the same URL (including `?search=` variants) are served from cache. Mutations bust cache entries by matching the resource URL prefix.

### Database
SQLite path defaults to `<project>/data/besmart.db` but can be overridden via `DB_PATH` env var (`database.ts`).
