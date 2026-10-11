#!/usr/bin/env bash
# Install a release bundle and restart the API. Run on the server as root:
#
#   sudo group-app-deploy group_app-<version>.tar.gz
#
# Each bundle is unpacked into $APP_DIR/releases/<version>; $APP_DIR/current points at the live one.
# If the new release fails its health check, the previous release is restored.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/group_app}"
ENV_FILE=/etc/group_app/group_app.env
SERVICE=group-app-api
KEEP_RELEASES=5

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo." >&2; exit 1; }
[ $# -eq 1 ] && [ -f "$1" ] || { echo "Usage: sudo $0 group_app-<version>.tar.gz" >&2; exit 1; }

bundle="$(readlink -f "$1")"
name="$(basename "$bundle" .tar.gz)"
release="$APP_DIR/releases/$name"

mkdir -p "$APP_DIR/releases"
rm -rf "$release"
tar -xzf "$bundle" -C "$APP_DIR/releases"
[ -f "$release/BUNDLE_INFO" ] || { echo "$bundle is not a group_app bundle." >&2; exit 1; }
chown -R root:root "$release"
chmod -R a+rX "$release"

# Vendored packages contain compiled code built for one Python version
wanted="$(grep '^python=' "$release/BUNDLE_INFO" | cut -d= -f2)"
found="$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
if [ "$wanted" != "$found" ]; then
  echo "Bundle was built for python $wanted but this server has python $found." >&2
  echo "Rebuild with: BUNDLE_PYTHON=$found scripts/build_bundle.sh" >&2
  rm -rf "$release"
  exit 1
fi

# First deployment: environment file, systemd unit, and this script on the PATH
if [ ! -f "$ENV_FILE" ]; then
  install -d -m 755 "$(dirname "$ENV_FILE")"
  google_client_id="$(grep '^google_client_id=' "$release/BUNDLE_INFO" | cut -d= -f2-)"
  sed -e "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" \
      -e "s|^GOOGLE_CLIENT_ID=.*|GOOGLE_CLIENT_ID=$google_client_id|" \
      "$release/deploy/group_app.env.example" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Created $ENV_FILE with a generated JWT_SECRET. Review the other values in it."
fi
install -m 644 "$release/deploy/$SERVICE.service" "/etc/systemd/system/$SERVICE.service"
install -m 755 "$release/deploy/deploy.sh" /usr/local/bin/group-app-deploy
systemctl daemon-reload
systemctl enable --quiet "$SERVICE"

echo "==> Applying database migrations"
(
  set -a; . "$ENV_FILE"; set +a
  cd "$release/backend"
  PYTHONPATH="$release/backend/vendor" PYTHONDONTWRITEBYTECODE=1 python3 -m app.migrate
) || {
  echo "Migration failed; the live release is unchanged." >&2
  echo "Check the database settings in $ENV_FILE and that PostgreSQL is running, then run this command again." >&2
  exit 1
}

previous="$(readlink -f "$APP_DIR/current" 2>/dev/null || true)"
ln -sfn "$release" "$APP_DIR/current"

healthy() {
  for _ in $(seq 1 20); do
    curl -fsS http://127.0.0.1:5001/api/health >/dev/null 2>&1 && return 0
    sleep 0.5
  done
  return 1
}

echo "==> Restarting $SERVICE"
systemctl restart "$SERVICE"
if ! healthy; then
  echo "New release failed its health check:" >&2
  journalctl -u "$SERVICE" -n 20 --no-pager >&2 || true
  if [ -n "$previous" ] && [ -d "$previous" ] && [ "$previous" != "$release" ]; then
    echo "Rolling back to $(basename "$previous")" >&2
    ln -sfn "$previous" "$APP_DIR/current"
    systemctl restart "$SERVICE"
  fi
  exit 1
fi

# Keep the newest releases for quick rollback
ls -1dt "$APP_DIR"/releases/*/ | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf

echo "Deployed $name. Frontend: $APP_DIR/current/dist  API: http://127.0.0.1:5001"
