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
docker compose up -d --build besmart-https
```

Data is persisted at `./data/besmart/`.

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
