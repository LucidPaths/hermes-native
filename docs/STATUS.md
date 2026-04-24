# Status — Hermes Native

Current: v0.7.3

## What's Built ✅

### v0.7.3 (current)
- [x] **DB Stats endpoint** — `/api/stats` returns message/task/pulse counts from SQLite
- [x] **Chat clear** — "Clear" button (+ Ctrl+K shortcut) calls `/api/chat/clear`, purges DB messages
- [x] **Chat streaming fix** — chunks joined with `\n` instead of spaces, line-by-line readable
- [x] **SettingsPanel live stats** — dynamic version from `/api/state`, live counts from `/api/stats`
- [x] **Version pinning** — daemon.json version overwritten on load so UI never lies

### v0.7.2 (stable)
- [x] **Markdown rendering in chat** — `marked` library, code blocks with syntax highlighting, links, bold, italic, lists
- [x] **Mobile responsive timeline** — 65vh heights, compact styling
- [x] **SettingsPanel fixes** — saved indicator, no page reload, persistent state
- [x] **Systemd user service** — `hermes-native.service` with venv Python, auto-restart

### v0.7.1 (stable)
- [x] **Model Switching in UI** (SettingsPanel)
  - Model + provider selectors with curated options
  - PATCH /api/state with allowlist filtering
  - Settings tab added next to Chat/Tasks/Timeline
- [x] **Markdown Export** — `/api/export/chat` exports chat history to `~/.hermes-native/exports/*.md`
- [x] **Mood in StatusPanel** — displays mood label, color, and murmur
- [x] **Mood-colored PulseOrb** — orb color shifts to match mood state
- [x] **State PATCH filtering** — only allowed keys (model, provider, status, etc.) can be modified

### v0.7.0 (stable)
- [x] **Mood Engine** (backend/src/mood.py)
  - Dawn / Idle / Working / Dusk / Night / Error mood states
  - Time-of-day adaptation, idle detection
  - Murmurs: random philosophical fragments per mood
  - Mood cache refreshed every 60s
  - API: GET /api/mood — returns full mood object
  - Orb color shifts based on mood (accent colors per state)
  - Status panel shows mood label + murmur

### v0.6.2 (stable)
- [x] **Frontend SPA serving** — root `/` serves index.html, `/health` remains API

### v0.6.0
- [x] **WebSocket streaming chat** — GET /ws/chat
  - Line-by-line streaming from hermes subprocess
  - Frontend: typing animation with streaming cursor
  - HTTP fallback if websocket unavailable
- [x] **Plugin System** (backend/src/plugins.py)
  - Hook registry: pre_chat, post_chat, pre_task, post_task, on_pulse, on_mood_change
  - Auto-discovery from ~/.hermes-native/plugins/*.py
- [x] **Mood Engine v1**

### v0.5.0
- [x] **Enhanced Timeline** — date grouping, type filters (all/chat/tasks/pulses)
- [x] **Live SSE timeline** — MemoryTimeline subscribes to /events, appends new items
- [x] **Task auto-archive** — done/error tasks removed from runtime state, persisted in DB
- [x] **Monotonic task IDs** — task_counter increments, IDs like t1x2 never repeat

### v0.4.0
- [x] **SQLite persistence** — messages, tasks, pulses tables
- [x] **REST endpoints** — /api/chat/history, /api/timeline
- [x] **Tabbed UI** — Chat / Tasks / Timeline
- [x] **Chat history load** — ChatPanel fetches persistent messages on mount

### Legacy (v0.1.0–v0.3.4)
- [x] Aiohttp daemon with state keeper
- [x] REST API + SSE + WebSocket
- [x] React + Vite + TypeScript frontend
- [x] PulseOrb, StatusPanel, TaskStream, ChatPanel
- [x] Dark void aesthetic + mobile responsive
- [x] Hermes agent bridge via subprocess

## End-to-End Verified ✅

| Feature | Test | Result |
|---------|------|--------|
| Chat (HTTP) | "say hello" | streaming active |
| Chat (WS) | websocket via /ws/chat | streaming active |
| Task async | "capital of France" | "Paris" |
| Timeline | /api/timeline?limit=5 | 5 items interleaved |
| History | /api/chat/history?limit=5 | 5 messages persisted |
| Mood | /api/mood | label=idle, murmur=active |
| Export | /api/export/chat | markdown file created |
| Model switch | PATCH /api/state → model | persists and reflects |
| Markdown | chat with code blocks | renders with code styles |
| Static serving | GET / | index.html served |
| Mobile DOM | chrome inspector 375px | renders stacked |
| Systemd | systemctl --user status | running, auto-restart |
| DB stats | /api/stats | live counts |
| Chat clear | POST /api/chat/clear | messages purged |

## Running

```bash
cd /home/lucid/workspace/hermes-native
python3 backend/src/daemon.py
# open http://localhost:8789
```

Systemd service (auto-start on login):
```bash
bash scripts/setup-systemd.sh
```

Defaults: `HERMES_NATIVE_HOST=0.0.0.0`, `PORT=8789`

Serves backend API + frontend static from one port.

## Handoff

See `docs/HANDOFF.md` for full architecture, test log, and future sprints.

## Lattice Check

| # | Principle | Status |
|---|-----------|--------|
| P1 Bridges | ✅ Thin daemon, no fork of hermes-agent |
| P2 Agnostic | ✅ Any model hermes supports |
| P3 Simplicity | ✅ Pillaged webui patterns + hermes CLI |
| P4 Observable | ✅ Every pulse logged + SSE + task results |
| P9 Compounding | ✅ Task queue + task results accumulate |
