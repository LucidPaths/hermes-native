#!/usr/bin/env bash
# Hermes Native — LocalTunnel wrapper for public access
# Usage: ./scripts/tunnel.sh [start|stop|status]

PORT=8789
PID_FILE="${HOME}/.hermes-native/state/tunnel.pid"
URL_FILE="${HOME}/.hermes-native/state/tunnel.url"

start_tunnel() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Tunnel already running: $(cat "$URL_FILE" 2>/dev/null || echo unknown)"
    exit 0
  fi
  echo "Starting localtunnel on port ${PORT}..."
  rm -f "$URL_FILE"
  # Use nohup so it survives shell exit; capture URL from stderr
  nohup npx localtunnel --port "$PORT" > "${HOME}/.hermes-native/state/tunnel.log" 2>&1 &
  PID=$!
  echo $PID > "$PID_FILE"
  # Wait up to 10s for URL
  for i in $(seq 1 10); do
    sleep 1
    URL=$(grep -oP 'https://[a-zA-Z0-9\-]+\.loca\.lt' "${HOME}/.hermes-native/state/tunnel.log" 2>/dev/null | tail -n1)
    if [ -n "$URL" ]; then
      echo "$URL" > "$URL_FILE"
      echo "Tunnel active: $URL"
      exit 0
    fi
  done
  echo "Tunnel started but URL not yet available. Check logs."
}

stop_tunnel() {
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
      kill "$PID"
      echo "Tunnel stopped."
    else
      echo "Tunnel not running."
    fi
    rm -f "$PID_FILE" "$URL_FILE"
  else
    echo "No tunnel PID file found."
  fi
}

status_tunnel() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "running"
    cat "$URL_FILE" 2>/dev/null || echo "URL unknown"
  else
    echo "stopped"
  fi
}

case "${1:-start}" in
  start) start_tunnel ;;
  stop) stop_tunnel ;;
  status) status_tunnel ;;
  *) echo "Usage: $0 [start|stop|status]"
esac
