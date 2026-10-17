#!/usr/bin/env bash
# Build a self-contained release bundle: compiled frontend + backend code + vendored Python packages.
# The server needs no npm, uv, or internet access to run it - just python3 and the bundle.
#
#   scripts/build_bundle.sh
#   VITE_API_URL=https://yourdomain.com scripts/build_bundle.sh   (default: https://synergyhubs.org)
#
# BUNDLE_PYTHON / BUNDLE_PLATFORM must match the server's python3 and CPU (defaults: Ubuntu 24.04, x86_64).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BUNDLE_PYTHON="${BUNDLE_PYTHON:-3.12}"
BUNDLE_PLATFORM="${BUNDLE_PLATFORM:-x86_64-manylinux_2_28}"
VERSION="$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD 2>/dev/null || echo nogit)"
NAME="group_app-$VERSION"
STAGE="$ROOT/build/$NAME"

# VITE_* values are compiled into the frontend, so the public URL must be known now.
env_value() { # from the environment, else from .env
  local value="${!1:-}"
  [ -n "$value" ] || value="$(grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d "\"'" || true)"
  printf '%s' "$value"
}
# The public site unless VITE_API_URL is given on the command line. .env is not consulted: its value
# is for local development (localhost). Exported so `vite build` uses it instead of reading .env itself.
DEFAULT_API_URL="https://synergyhubs.org"
api_url="${VITE_API_URL:-$DEFAULT_API_URL}"
export VITE_API_URL="$api_url"
echo "==> Frontend will call the API at: $api_url"
case "$api_url" in
  *localhost*|*127.0.0.1*) echo "    WARNING: that is a local address - browsers on other machines will not reach the API." >&2 ;;
esac

echo "==> Building frontend"
# --legacy-peer-deps: @tailwindcss/vite has not declared Vite 8 support yet
npm ci --ignore-scripts --legacy-peer-deps
npm run build

echo "==> Assembling $NAME (python $BUNDLE_PYTHON, $BUNDLE_PLATFORM)"
rm -rf "$STAGE"
mkdir -p "$STAGE/backend"
cp -r dist "$STAGE/dist"
cp -r backend/app "$STAGE/backend/app"
find "$STAGE/backend" -name __pycache__ -type d -prune -exec rm -rf {} +
cp schema.sql migration.sql "$STAGE/"
cp -r deploy "$STAGE/deploy"

# Exact, hash-checked versions from uv.lock; binary wheels only, so nothing is compiled or executed here
uv export --project backend --frozen --no-dev --no-emit-project --quiet -o "$STAGE/requirements.txt"
uv pip install --quiet --target "$STAGE/backend/vendor" \
  --python-version "$BUNDLE_PYTHON" --python-platform "$BUNDLE_PLATFORM" \
  --only-binary :all: --require-hashes -r "$STAGE/requirements.txt"

cat > "$STAGE/BUNDLE_INFO" <<INFO
version=$VERSION
python=$BUNDLE_PYTHON
platform=$BUNDLE_PLATFORM
api_url=$api_url
google_client_id=$(env_value VITE_GOOGLE_CLIENT_ID)
INFO

tar -czf "build/$NAME.tar.gz" -C build "$NAME"
rm -rf "$STAGE"

cat <<MSG

Bundle ready: build/$NAME.tar.gz ($(du -h "build/$NAME.tar.gz" | cut -f1))

Deploy it:
  scp build/$NAME.tar.gz user@server:
  ssh user@server "sudo group-app-deploy $NAME.tar.gz"
(first deployment: see DEPLOY.md)
MSG
