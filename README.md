# Tarkov Quests

Quest tracker for Escape from Tarkov: scrapes quest data from the wiki, tracks per-character progress (level, completed quests), and automatically locks quests based on prerequisites (level, prior quests).

- **Backend**: Node.js / Express / TypeScript, Prisma + SQLite.
- **Frontend**: Angular 22 + NGXS + Tailwind CSS.
- **Deployment**: Docker Compose (backend + frontend served by Nginx).

## Running in dev

From `run/`, with live-reload on both backend and frontend:

```bash
docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml up --build
```

- Frontend: http://localhost:4200
- Backend: http://localhost:3000

The `backend/` and `frontend/` folders are mounted as volumes, so code changes are picked up on the fly. The dev SQLite database is persisted in `run/data/dev`.

## Running in prod

From `run/`:

```bash
docker compose -f run/docker-compose.yml up --build -d
```

- Frontend (served by Nginx): http://localhost:8080
- Backend: http://localhost:3000

The prod SQLite database is persisted in `run/data/prod`.
