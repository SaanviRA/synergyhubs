# Group App

A collaboration hub for class group projects: students track milestones, share resources and
workspaces, and post updates; teachers create classes and projects and follow each team's progress.

| Part | Technology | Location |
|---|---|---|
| Frontend | React 19 + Vite + Tailwind CSS | `src/` |
| Backend API | Python, FastAPI, asyncpg (raw SQL), run with [uv](https://docs.astral.sh/uv/) | `backend/` |
| Database | PostgreSQL 15 in Docker | `schema.sql`, `migration.sql`, `docker-compose.yml` |

## Quick start

Requirements: Docker, [uv](https://docs.astral.sh/uv/getting-started/installation/), and Node.js 20+ (frontend only).

```bash
./scripts/setup.sh
```

This starts the PostgreSQL container if it is not running (creating it on first use), installs the
backend's Python packages, adds a generated `JWT_SECRET` to `.env`, and applies `migration.sql`.
It is safe to run again at any time.

Then run the two halves in separate terminals:

```bash
# Terminal 1 - API on http://localhost:5001
cd backend
uv run uvicorn app.main:app --reload --port 5001

# Terminal 2 - frontend on http://localhost:5173
npm install --legacy-peer-deps
npm run dev
```

Open http://localhost:5173. The frontend calls the API at `VITE_API_URL` (default `http://localhost:5001`).
Interactive API docs are at http://localhost:5001/docs.

## Configuration

All settings live in `.env` at the repository root (see `.env.example`).

| Variable | Used by | Purpose |
|---|---|---|
| `JWT_SECRET` | backend | Signs login tokens. **Required**, at least 32 characters; the API will not start without it. |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | backend | PostgreSQL connection. Defaults match `docker-compose.yml`. |
| `CORS_ORIGINS` | backend | Comma-separated browser origins allowed to call the API. Defaults to the Vite dev server. |
| `VITE_GOOGLE_CLIENT_ID` | both | Google OAuth client ID. The backend only accepts Google tokens issued for it. |
| `VITE_GOOGLE_APP_ID`, `VITE_GOOGLE_API_KEY` | frontend | Google Drive Picker. |
| `VITE_API_URL` | frontend | Base URL of the API, compiled in at build time. |

`VITE_*` values are baked into the frontend when it is built; changing them requires a rebuild.

## Tests

```bash
cd backend
uv run pytest
```

The suite has pure unit tests (formatting, tokens, configuration) and API tests that run against a real
PostgreSQL database. It starts the Docker container if needed, rebuilds a separate `group_app_test`
database from `schema.sql` + `migration.sql`, and rolls every test back, so your development data is
never touched.

Lint and format: `uv run ruff check .` and `uv run ruff format .`

## Backend layout

```
backend/
  pyproject.toml, uv.lock   dependencies (managed with `uv add` / `uv sync`)
  app/
    main.py                 app factory, CORS, router registration
    config.py               settings from the environment / .env
    security.py             password hashing, JWT, the current-user dependency
    access.py               project membership checks
    errors.py               {"error": "..."} responses
    migrate.py              `uv run python -m app.migrate` applies migration.sql
    routers/                auth, users, classes, projects, team, milestones, resources, workspaces
  tests/
```

### Access rules

- Every endpoint except `/api/auth/*` and `/api/health` requires `Authorization: Bearer <token>`.
- Project endpoints require the caller to be a member of the project or of its class.
- Anyone can create a class; its creator owns it and is the only one who can add projects to it.
- Only teachers can view student history or read another user's work logs.
- Errors are always JSON of the form `{"error": "message"}`.

## Database changes

`schema.sql` creates a fresh database with demo data (it **drops existing tables** - never run it against
a database you want to keep). `migration.sql` upgrades an existing database in place and is safe to
re-run; apply it with `cd backend && uv run python -m app.migrate`.

## Deployment

`scripts/build_bundle.sh` produces a single tarball containing the compiled frontend, the backend, and
its Python packages. Deploying is: copy the tarball to the server and run one command, which swaps the
release and restarts the systemd service. See [DEPLOY.md](DEPLOY.md).
