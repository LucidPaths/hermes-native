#!/usr/bin/env bash
# Setup systemd user service for hermes-native
# Run: bash scripts/setup-systemd.sh

set -e

SERVICE_NAME="hermes-native"
SERVICE_FILE="$HOME/.config/systemd/user/${SERVICE_NAME}.service"
REPO_DIR="/home/lucid/workspace/hermes-native"

echo "[setup] Creating systemd user service..."
mkdir -p "$HOME/.config/systemd/user"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Hermes Native — Aiohttp daemon
After=network.target

[Service]
Type=simple
ExecStart=/home/lucid/.hermes/hermes-agent/venv/bin/python3 ${REPO_DIR}/backend/src/daemon.py
WorkingDirectory=${REPO_DIR}
Restart=always
RestartSec=10
Environment=HERMES_NATIVE_HOST=0.0.0.0
Environment=HERMES_NATIVE_PORT=8789
Environment=PATH=/home/lucid/.hermes/hermes-agent/venv/bin:/home/lucid/.local/bin:/usr/local/bin:/usr/bin:/bin
Environment=HOME=/home/lucid
Environment=VIRTUAL_ENV=/home/lucid/.hermes/hermes-agent/venv

[Install]
WantedBy=default.target
EOF

echo "[setup] Enabling and starting ${SERVICE_NAME}..."
systemctl --user daemon-reload
systemctl --user enable "${SERVICE_NAME}"
systemctl --user start "${SERVICE_NAME}"

sleep 1
if systemctl --user is-active --quiet "${SERVICE_NAME}"; then
  echo "[setup] ✅ ${SERVICE_NAME} is running on http://127.0.0.1:8789"
else
  echo "[setup] ⚠️ Service failed to start. Check: systemctl --user status ${SERVICE_NAME}"
fi

echo ""
echo "Commands:"
echo "  systemctl --user status ${SERVICE_NAME}"
echo "  systemctl --user stop ${SERVICE_NAME}"
echo "  systemctl --user restart ${SERVICE_NAME}"
echo "  journalctl --user -u ${SERVICE_NAME} -f"
