# Hermes Native — Status

**Version:** v0.3.2  
**Repo:** `github.com/LucidPaths/hermes-native`  
**Local:** `/home/lucid/workspace/hermes-native`
## Running Services

| Port | Service | URL |
|------|---------|-----|
| `8789` | Daemon (backend) | `http://127.0.0.1:8789` |
| `8788` | Vite dev server | `http://localhost:8788` |
| `8787` | Hermes WebUI (upstream) | `http://localhost:8787` |

**On your phone (same LAN):** `http://172.21.170.236:8788`

**To start from anywhere:**
```bash
cd /home/lucid/workspace/hermes-native
./scripts/start.sh
# Or directly:
python3 backend/src/daemon.py
```

## What Works

### v0.3.2 (current)
- `start.sh` — one-command production launcher, auto-builds frontend, installs deps
- Daemon defaults to `0.0.0.0:8789` — accessible from any device on LAN
- Serves both `/api/*` routes and frontend static from one port

### v0.3.1
- Vite proxy forwards both `/api` and `/events` to daemon
- SSE live updates working in TaskStream
- Task results display inline (Paris, Tokyo tested)

### v0.3.0
- **Async task invoker** — enqueue task → daemon spawns hermes in background → shows `running` → `done` with result
- **Mobile responsive CSS** — @media queries, orb shrinks, stacked panels on narrow screens
- **Running animation** — yellow pulsing tag on running tasks
- **Result display** — inline truncated result, full on hover

### v0.2.0
- **Chat panel** — live chat with hermes agent through `/api/chat`
- **TaskStream frontend** — enqueue tasks with realtime updates
- **Hermes agent bridge** — `hermes chat -q "..."` as subprocess

### v0.1.0
- Aiohttp daemon with state keeper
- Rest API: `/health`, `/api/state`, `/api/pulse`, `/api/tasks`, `/api/tasks/complete`, `/api/chat`
- Sse: `/events` (push-based state updates)
- React + vite + typescript frontend
- PulseOrb, StatusPanel components
- Dark void aesthetic CSS

## Tested Interactions

1. **Chat:** type "what is 2+2, answer with just the number" → 🜹 button → response "4" in ~2s
2. **Task:** type "what is the capital of France?" → Enqueue → status `running` → `done` → shows "Paris"
3. **Status panel:** shows model, pulses, queue depth, last pulse time

## Architecture

```
Browser (localhost:8788)
  └── Vite dev server (proxy)
        ├── /api/* → http://127.0.0.1:8789 (daemon)
        └── /events → http://127.0.0.1:8789 (daemon)
                    └── aiohttp daemon
                          ├── Frontend dist served on /
                          ├── REST API on /api/*
                          ├── SSE stream on /events
                          └── Hermes agent subprocess
```

## Heartbeat

- Cron job: `hermes-native-heartbeat` — every 15m
- Job ID: `b7e594c34aaf`
- Directive: "What was I about to do?"
- State: `/home/lucid/.hermes-native/state/`

## What's Not Built (future sprints)

- Persistent chat history (survives reload)
- Streaming tokens in chat (vs full-response)
- Ngrok/Tailscale tunnel for remote access from outside LAN
- Systemd service for auto-start on boot
- Desktop packaging (electron/tauri when rust available)
- Phone hamburger menu for mobile nav

## Skill Created

`session-interrupt-recovery` — prevents the 6-hour death spiral from ever happening again. Trigger: any session where I was mid-build before interrupt. Protocol: trust git, use `git status`, classify state, do NOT audit with `execute_code`.
