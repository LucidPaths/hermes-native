# Hermes Native — Status

**Version:** v0.7.2
**Repo:** `github.com/LucidPaths/hermes-native`
**Local:** `/home/lucid/workspace/hermes-native`

## Running Services

| Port | Service | URL |
|------|---------|-----|
| `8789` | Daemon (backend + frontend dist) | `http://127.0.0.1:8789` |
| `8788` | Vite dev server | `http://localhost:8788` |

**On your phone (same LAN):** `http://172.21.170.236:8789` (daemon port)

**To start from anywhere:**
```bash
cd /home/lucid/workspace/hermes-native
./scripts/start.sh
# Or directly:
python3 backend/src/daemon.py
```

## What Works

### v0.7.2 (current)
- **Markdown rendering in chat** — `marked` library, code blocks, links, bold, italic, lists
- **Mobile responsive timeline** — 65vh heights, compact styling
- **Systemd user service** — `hermes-native.service` with venv Python, auto-restart on crash

### v0.7.1
- **Model Switching in UI** — SettingsPanel with model/provider selectors
- **Markdown Export** — `/api/export/chat` creates `~/.hermes-native/exports/*.md`
- **Mood in StatusPanel** — label, color, murmur displayed
- **Mood-colored PulseOrb** — orb color shifts based on mood state
- **State PATCH filtering** — allowlist for safe runtime config changes

### v0.7.0
- **Mood Engine** — dawn/idle/working/dusk/night/error states
- **Murmurs** — random philosophical fragments per mood
- **Mood API** — `GET /api/mood` returns full mood object
- **Mood cache** — refreshed every 60s

### v0.6.2
- **Frontend SPA serving** — root `/` serves built frontend dist

### v0.6.0
- **WebSocket streaming chat** — line-by-line streaming via /ws/chat
- **Plugin System** — auto-discovery from ~/.hermes-native/plugins/*.py
- **Mood Engine v1**

### v0.5.0
- **Task auto-archive** — done/error tasks persisted in SQLite
- **Monotonic task IDs** — task_counter prevents ID collisions
- **Task history in UI** — TaskStream loads DB + merges with live SSE
- **Live chat broadcast** — chat pushed to SSE for timeline updates

### v0.4.0
- **Memory Layer** — SQLite: messages, tasks, pulses tables
- **Persistent chat history** — survives reload via `/api/chat/history`
- **Unified timeline** — `/api/timeline` interleaves chronologically
- **MemoryTimeline.tsx** frontend component
- Tabbed UI: Chat | Tasks | Timeline

### v0.3.2
- Vite proxy forwards `/api`, `/events`, `/ws` to daemon
- SSE live updates working
- Task results display inline

### v0.3.0
- **Async task invoker** — enqueue → spawn hermes → running → done
- **Mobile responsive CSS** — @media queries, stacked panels
- **Running animation** — yellow pulsing tag
- **Result display** — inline truncated, full on hover

### v0.2.0
- **Chat panel** — live chat with hermes agent
- **TaskStream frontend** — enqueue with realtime updates
- **Hermes agent bridge** — `hermes chat -q "..."` as subprocess

### v0.1.0
- Aiohttp daemon with state keeper
- REST API: `/health`, `/api/state`, `/api/pulse`, `/api/tasks`, `/api/tasks/complete`, `/api/chat`
- SSE: `/events`
- React + Vite + TypeScript frontend
- PulseOrb, StatusPanel components
- Dark void aesthetic CSS

## Tested Interactions

1. **Chat:** type "what is 2+2, answer with just the number" → 🜹 button → response "4" in ~2s
2. **Task:** type "what is the capital of France?" → Enqueue → status `running` → `done` → shows "Paris"
3. **Status panel:** shows model, pulses, queue depth, last pulse time, mood, murmur
4. **Settings:** go to ⚙ tab → select model/provider → Apply → state persists
5. **Export:** go to ⚙ tab → "Export Chat to Markdown" → file saved to `~/.hermes-native/exports/`

## Architecture

```
Browser (localhost:8789)
  └── aiohttp daemon (:8789)
        ├── Frontend dist served on /
        ├── REST API on /api/*
        ├── SSE stream on /events
        ├── WebSocket on /ws/chat
        └── Hermes agent subprocess
```

## Heartbeat

- Cron job: `hermes-native-heartbeat` — every 15m
- Job ID: `b7e594c34aaf`
- Directive: "What was I about to do?"
- State: `/home/lucid/.hermes-native/state/`

## What's Not Built (future sprints)

- [ ] Ngrok/Tailscale tunnel for remote access from outside LAN
- [ ] Systemd service for auto-start on boot
- [ ] Desktop packaging (electron/tauri when rust available)
- [ ] Phone hamburger menu for mobile nav
- [ ] Markdown rendering in chat messages ✅ DONE v0.7.2
- [ ] Token count display in status panel
- [ ] Export chat/session to markdown file ✅ DONE v0.7.1
- [ ] Model switching in UI ✅ DONE v0.7.1
- [ ] Systemd service for auto-start on boot ✅ DONE v0.7.2

## Skill Created

`session-interrupt-recovery` — prevents the 6-hour death spiral from ever happening again. Trigger: any session where I was mid-build before interrupt. Protocol: trust git, use `git status`, classify state, do NOT audit with `execute_code`.
