# Status — Hermes Native

Current: v0.11.0

## What's Built ✅

### v0.11.0 (current)
- [x] **Clickable search results** — search overlay results are now clickable; click a result to jump directly to its session
- [x] **Auto-create session on first chat** — if no session is selected when sending a message, a new session is automatically created using the first message text as title
- [x] **Code block copy buttons** — all code blocks rendered via `marked` now get a "Copy" button header
- [x] **Per-message token badge** — each message shows its token count (e.g. "124t") next to timestamp
- [x] **Message deletion** — hover any message to reveal × delete button; DELETE `/api/messages/{id}` removes from DB
- [x] **Version bumped** — v0.11.0 across frontend + backend + docs
- [x] **Frontend rebuilt** — latest dist with all v0.11.0 features

### v0.10.0
- [x] **Chat Sessions** — persistent session grouping in SQLite
  - `sessions` table with id/title/created_at/updated_at/metadata
  - `GET /api/sessions` list, `POST /api/sessions` create, `GET /api/sessions/{id}` get with messages, `PATCH /api/sessions/{id}` rename, `DELETE /api/sessions/{id}` delete with cascade
  - `messages.session_id` links messages to sessions; auto-assigns on chat send
  - ChatPanel sidebar: session list (+ new, × delete, click to switch)
  - Auto-title from first user message
  - Session-scoped message loading (isolated chat histories)
- [x] **Full-Text Search** — SQLite FTS5 over messages
  - `GET /api/search?q=hello` returns ranked results
  - ChatPanel: Ctrl+F opens global search overlay with live results
  - Graceful fallback to LIKE if FTS5 unavailable
  - FTS5 index auto-populates on migration
- [x] **DB auto-migration** — adds `sessions` table + `messages_fts` FTS5 index on boot
  - `stats` endpoint includes `sessions` count
- [x] **Version bumped** — v0.10.0 across frontend + backend

### v0.9.0
- [x] **Plugin system wired into daemon** — every lifecycle hook fires:
  - `pre_chat`, `post_chat`, `pre_task`, `post_task`, `on_pulse`, `on_mood_change`
- [x] **Token tracking** — `messages.tokens` column with tiktoken (cl100k_base) + fallback
  - `save_message` auto-counts tokens on insert
  - `/api/tokens` endpoint returns `total_tokens`
  - `state_get` includes `"tokens"` field
  - DB migration: auto-adds `tokens` column to existing DBs
  - Backfills tokens for historical messages
- [x] **StatusPanel token display** — shows total token count alongside pulses/queued
- [x] **Sample logger plugin** — `~/.hermes-native/plugins/logger.py` logs all hooks to `plugins.log`
- [x] **TaskStream dedup fix** — uses map by task ID instead of array append for stable live updates
- [x] **Version bumped** — v0.9.0 across frontend + backend

### v0.8.1
- [x] **Remote tunnel integration** — `scripts/tunnel.sh` wraps `npx localtunnel`, stores URL in `~/.hermes-native/state/tunnel.url`
- [x] **Tunnel status API** — `GET /api/tunnel` returns `{running, url}`
- [x] **Tunnel display in Settings** — SettingsPanel fetches `/api/tunnel`, shows active URL with hyperlink
- [x] **Frontend rebuilt** — latest JS/CSS bundles with tunnel UI

### v0.8.0
- [x] **Mobile hamburger drawer** — hamburger icon on ≤768px, slide-in drawer from right with overlay, hides desktop tabs
- [x] **Responsive nav** — all tabs accessible on phone: Chat, Tasks, Timeline, Settings, Light/Dark toggle

### v0.7.3
- [x] **DB Stats endpoint** — `/api/stats` returns message/task/pulse counts from SQLite
- [x] **Chat clear** — "Clear" button + Ctrl+K shortcut calls `POST /api/chat/clear`, purges DB messages
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
- Status panel shows mood label + murmur
- [x] **Systemd user service** — `hermes-native.service` with venv Python, auto-restart

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
| DB Stats | /api/stats | live counts |
| Chat Clear | POST /api/chat/clear | messages purged |
| Tokens | /api/tokens | total_tokens returns int |
| Plugin Hooks | logger plugin in plugins/ | plugins.log written |
| Sessions | POST /api/sessions + GET /api/sessions | created + listed |
| Session Msgs | GET /api/sessions/{id} | messages scoped |
| Search | GET /api/search?q=hello | FTS5 ranked results |
| Msg Delete | DELETE /api/messages/1 | {"ok": true} |
| Search to Jump | Click search result → session switch | navigates |
| Auto Session | Send chat with no session | auto-creates + titles |

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
