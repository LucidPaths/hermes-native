#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_PID=""

cleanup() {
  echo "[hermes-native] shutting down..."
  if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null && wait "$BACKEND_PID" 2>/dev/null || true
  fi
  echo "[hermes-native] done."
}
trap cleanup INT TERM EXIT

mkdir -p ~/.hermes-native/state

echo "[hermes-native] starting backend @ :8789..."
cd "$REPO_ROOT/backend/src"
python3 daemon.py &
BACKEND_PID=$!
sleep 2
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo "[hermes-native] backend failed. install deps: pip install -r backend/requirements.txt"
  exit 1
fi
echo "[hermes-native] backend ready. serving frontend @ http://127.0.0.1:8789/index.html"
echo "[hermes-native] press Ctrl+C to stop"
wait
