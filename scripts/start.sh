#!/usr/bin/env bash
# Hermes Native — Start Script
set -euo pipefail

HOST="${HERMES_NATIVE_HOST:-127.0.0.1}"
PORT="${HERMES_NATIVE_PORT:-8789}"
FE_PORT="${HERMES_NATIVE_FE_PORT:-8788}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_PID=""

cleanup() {
  echo ""
  echo "[hermes-native] shutting down..."
  if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null && wait "$BACKEND_PID" 2>/dev/null || true
  fi
  echo "[hermes-native] done."
}
trap cleanup INT TERM EXIT

# Ensure state dir
mkdir -p "$(eval echo ~${SUDO_USER:-$USER})/.hermes-native/state"

# Backend
echo "[hermes-native] starting backend daemon on ${HOST}:${PORT}..."
cd "$REPO_ROOT"
python3 backend/src/daemon.py &
BACKEND_PID=$!

sleep 1
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo "[hermes-native] backend failed to start. check deps: pip install aiohttp"
  exit 1
fi

# Frontend
echo "[hermes-native] starting frontend dev server on port ${FE_PORT}..."
cd "$REPO_ROOT/frontend"
if [ ! -d node_modules ]; then
  echo "[hermes-native] installing frontend deps..."
  npm install
fi
npx vite --port "$FE_PORT" --host "$HOST"
