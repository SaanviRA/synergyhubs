#!/usr/bin/env bash
# One-time (and safe to repeat) local development setup:
# database container, backend dependencies, JWT secret, migrations.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v uv >/dev/null || { echo "uv is required: https://docs.astral.sh/uv/getting-started/installation/" >&2; exit 1; }

"$ROOT/scripts/ensure_db.sh"

[ -f .env ] || cp .env.example .env
if ! grep -qE '^JWT_SECRET=.+' .env; then
  echo "Adding a generated JWT_SECRET to .env"
  printf '\nJWT_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
fi

(cd backend && uv sync && uv run python -m app.migrate)

cat <<'MSG'

Setup complete. Start the app with two terminals:
  API:       cd backend && uv run uvicorn app.main:app --reload --port 5001
  Frontend:  npm install --legacy-peer-deps && npm run dev      (http://localhost:5173)
MSG
