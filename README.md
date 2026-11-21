# BeSmart

A personal productivity app built with Node.js, TypeScript, React, and SQLite. Runs on port **5090**.

## Features

- **Dashboard** — streak and overview
- **Todos** — task management with priority, due dates, and study plan links
- **Check-in** — daily schedule tracking
- **Study Plans** — structured learning plans
- **Review** — SM-2 spaced repetition, with Obsidian vault integration

## Structure

```
src/
  client/       React frontend (Vite + Tailwind)
  server/       Express backend (SQLite via better-sqlite3)
  shared/       Shared TypeScript types
Dockerfile
docker-compose.yml
```

## Development

```bash
npm install
npm run dev        # starts both client (Vite) and server (tsx watch) concurrently
```

## Deployment

Docker builds the client and server from source. Build the image and start BeSmart with its HTTPS proxy.

```bash
./scripts/compose up -d --build besmart-https
```

Data is persisted at `./data/besmart/`.

### SQLite database location

Set `BESMART_DB_PATH` in the project's `.env` to the full path of an existing
SQLite database on the Docker host. The database and its directory must be writable.

```dotenv
BESMART_DB_PATH=/absolute/path/to/besmart.db
```

The default is `./data/besmart/besmart.db`. To move an existing
database, stop BeSmart with `docker compose stop besmart` and use SQLite's
backup command to copy it to the new directory before starting BeSmart again
with `./scripts/compose up -d --build besmart`, then reload the HTTPS proxy
with `docker compose exec besmart-https nginx -s reload` if it is running.
Make sure the configured file exists before starting BeSmart, and verify that
your data appears in the app before deleting the old copy.

Use a local filesystem path for the live database. For Nextcloud storage,
sync a SQLite backup and use a dedicated local copy for BeSmart. The live
database uses WAL and needs its companion files and SQLite file locks.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | Yes | Secret for signing JWTs |
| `APP_URL` | Yes | Public base URL (e.g. `http://localhost:5090`) |
| `VAULT_PATH` | No | Path to Obsidian vault (mounted as `/vault` in Docker) |
| `VAULT_NAME` | No | Vault name shown in UI |
| `DAY_START_HOUR` | No | Hour at which the new day starts (default: 6) |
| `SMTP_*` | No | Email verification (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) |
| `GOOGLE_CLIENT_ID/SECRET` | No | Google OAuth |
| `GITHUB_CLIENT_ID/SECRET` | No | GitHub OAuth |
| `WECHAT_APP_ID/SECRET` | No | WeChat OAuth |
