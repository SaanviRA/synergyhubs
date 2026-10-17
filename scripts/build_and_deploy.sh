#!/usr/bin/env bash
# Build a release bundle, copy it to the server and deploy it there, in one step.
#
#   scripts/build_and_deploy.sh                 # to the "deploy_server" host from ~/.ssh/config
#   scripts/build_and_deploy.sh other_host      # any host ssh can reach (alias or user@hostname)
#   VITE_API_URL=https://yourdomain.com scripts/build_and_deploy.sh   (default: https://synergyhubs.org)
#
# The user, hostname and key come from your SSH configuration. The server must already have had its
# first deployment (DEPLOY.md, Steps 1-5), which installs the group-app-deploy command used here.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

HOST="${1:-${DEPLOY_HOST:-deploy_server}}"

echo "==> Checking $HOST"
# Build for the server's own python and CPU unless told otherwise, so the bundle is never rejected
read -r remote_python remote_arch remote_deploy < <(
  ssh "$HOST" 'printf "%s %s %s\n" \
    "$(python3 -c "import sys; print(\"%d.%d\" % sys.version_info[:2])" 2>/dev/null || echo none)" \
    "$(uname -m)" \
    "$(command -v group-app-deploy || echo none)"'
) || { echo "Could not connect to $HOST over ssh." >&2; exit 1; }

if [ "$remote_deploy" = none ]; then
  echo "$HOST has no group-app-deploy command yet. Do the first deployment by hand (DEPLOY.md, Steps 1-5)." >&2
  exit 1
fi
if [ "$remote_python" = none ]; then
  echo "$HOST has no python3." >&2
  exit 1
fi
case "$remote_arch" in
  x86_64 | aarch64) default_platform="$remote_arch-manylinux_2_28" ;;
  *) echo "Unsupported server CPU: $remote_arch" >&2; exit 1 ;;
esac
export BUNDLE_PYTHON="${BUNDLE_PYTHON:-$remote_python}"
export BUNDLE_PLATFORM="${BUNDLE_PLATFORM:-$default_platform}"
echo "    python $remote_python, $remote_arch"

# Find the bundle this build makes: the newest one created after this point
marker="$(mktemp)"
trap 'rm -f "$marker"' EXIT
scripts/build_bundle.sh
bundle="$(find build -maxdepth 1 -name 'group_app-*.tar.gz' -newer "$marker" -print | sort | tail -1)"
[ -n "$bundle" ] || { echo "The build did not produce a bundle." >&2; exit 1; }
name="$(basename "$bundle")"

echo "==> Copying $name to $HOST"
scp -q "$bundle" "$HOST:$name"

echo "==> Deploying on $HOST"
# -t so sudo can ask for a password when the ssh user is not root
ssh -t "$HOST" "
  set -e
  if [ \"\$(id -u)\" -eq 0 ]; then group-app-deploy '$name'; else sudo group-app-deploy '$name'; fi
  rm -f '$name'
"

echo
echo "Deployed $name to $HOST."
