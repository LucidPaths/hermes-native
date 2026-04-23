#!/usr/bin/env bash
set -euo pipefail

# Hermes Native — One-port production launcher
# Serves frontend static + API on the same port.

export HERMES_NATIVE_HOST="${HERMES_NATIVE_HOST:-0.0.0.0}"
export HERMES_NATIVE_PORT="${HERMES_NATIVE_PORT:-8789}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$REPO_ROOT"

# Ensure frontend is built
if [ ! -d "frontend/dist" ]; then
  echo "[hermes-native] building frontend..."
  cd frontend
  npm install
  npm run build
  cd "$REPO_ROOT"
fi

# Ensure backend deps
python3 -c "import aiohttp" 2>/dev/null || {
  echo "[hermes-native] installing backend deps..."
  pip install -r backend/requirements.txt
}

echo "[hermes-native] starting on http://$HERMES_NATIVE_HOST:$HERMES_NATIVE_PORT"
echo "[hermes-native] open:   http://$(hostname -I | awk '{print $1}'):$HERMES_NATIVE_PORT"
echo "[hermes-native] press Ctrl+C to stop"

exec python3 "$REPO_ROOT/backend/src/daemon.py"
