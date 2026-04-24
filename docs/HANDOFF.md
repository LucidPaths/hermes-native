# Hermes Native — Status

**Version:** v0.17.0
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

### v0.17.0 (current)
- **Multiline textarea input** -- Shift+Enter for newline, Enter to send; auto-resizes up to 200px height
- **Per-session draft persistence** -- each session's compose box is saved in `localStorage` and restored on re-select
- **Inline message editing** -- user messages get a ✎ Edit button; save hits PATCH `/api/messages/{id}`, recalculates tokens
- Version bumped to v0.17.0; frontend rebuilt; daemon restarted

### v0.16.0 (current)
- **Stop streaming button** -- while assistant is streaming, the send button becomes an `&times;` Stop button; clicking closes the WebSocket, sets `streaming=false`, and frees the input immediately
- Version bumped to v0.16.0; frontend rebuilt; daemon restarted

### v0.15.1
- **Session persistence** -- selected session id stored in `localStorage`; survives page reload and page refreshes
- Version bumped to v0.15.1; frontend rebuilt; daemon restarted

### v0.15.0
- **Inline session rename** -- double-click any session title in sidebar to edit; Enter saves, Escape cancels, blur auto-saves; inline styled input with accent border
- **Dark-mode auto-detect** -- reads `prefers-color-scheme: dark` on first load via `window.matchMedia`; no flash of wrong theme
- **Message actions** -- assistant messages get 📋 Copy + ↻ Regenerate; user messages get 📋 Copy + × Delete; all hover-revealed
- Version bumped to v0.15.0; frontend rebuilt; daemon restarted

### v0.14.0
- **Session-scoped export** -- `GET /api/export/chat?session_id={id}` exports only the selected session; ChatPanel header shows "Export" button per-session
- **Search with session titles** -- search results include `session_title` via LEFT JOIN; show session name below each result
- **Connection status dot** -- green/red dot in topbar reflects `/api/state` health polling every 5s
- Version bumped to v0.14.0; frontend rebuilt; daemon restarted

### v0.13.0
- **Message regenerate** -- hover any assistant message → ↻ Regenerate button; POST `/api/regenerate` with `message_id` finds the preceding user message, re-runs hermes, replaces the assistant response in DB and updates the UI in place
- **Message copy** -- hover any non-system message → 📋 Copy button; copies raw content to clipboard via `navigator.clipboard`
- **Session counts in sidebar** -- `GET /api/sessions` now returns per-session `message_count` + `token_count` via correlated subqueries; ChatPanel sidebar shows "3 msgs · 124t" under each session title
- **Session stats endpoint** -- `GET /api/sessions/{id}/stats` returns `message_count`, `token_count`, `first_message`, `last_message`
- Version bumped to v0.13.0; frontend rebuilt; daemon restarted

### v0.12.0
- **Task retry** -- failed tasks show ↻ Retry button in TaskStream; POST `/api/tasks/{id}/retry` re-queues the same task description, resets DB status to pending, broadcasts state, and fires `_run_hermes_task` async
- **Smart session titles** -- POST `/api/sessions/{id}/smart-title` sends first 6 messages to hermes LLM with "generate an extremely short, catchy title (2-5 words, max 40 chars)"; frontend auto-triggers after first user→assistant exchange completes (only when title is still auto-generated)
- **Auto-refreshing stats** -- SettingsPanel mounts a `setInterval` (15s) that polls `/api/stats`; teardown on unmount
- **Keyboard shortcuts help overlay** -- Ctrl+/ toggles centered modal with all shortcuts; Tab cycles panels (chat→tasks→timeline→settings); Escape closes overlays/modals; CSS: glassmorphic help-box with key-value table

### v0.11.0
- **UX Polish** -- search-to-jump, auto-sessions, copy code, token badges, message deletion
  - Clickable search results: click result → jump directly to its session
  - Auto-create session: if no session selected when sending chat, new session auto-created + titled from first message
  - Code block copy buttons: every rendered code block gets a "Copy" header with language tag
  - Per-message token badge: shows token count next to each message timestamp
  - Message deletion: hover any message → × button appears; DELETE `/api/messages/{id}` removes from DB + SQLite
- Version bumped to v0.11.0; frontend rebuilt

### v0.10.0
- **Chat Sessions** — isolate conversations into named sessions persisted in SQLite
  - `sessions` table with id, title, timestamps, metadata
  - API: `GET /api/sessions`, `POST /api/sessions`, `GET /api/sessions/{id}`, `PATCH /api/sessions/{id}`, `DELETE /api/sessions/{id}`
  - Messages saved with `session_id`; session-scoped loading
  - ChatPanel sidebar: switch sessions, create new, delete, auto-title from first message
- **Full-Text Search** — SQLite FTS5 over message contents with fallback LIKE
  - API: `GET /api/search?q=...&limit=...`
  - Frontend: Ctrl+F opens global search overlay; live debounced results
  - FTS5 auto-created + backfilled on DB migration
- **DB Stats expanded** — `/api/stats` now includes `sessions` count

### v0.10.0
- **Chat Sessions** — isolate conversations into named sessions persisted in SQLite
  - `sessions` table with id, title, timestamps, metadata
  - API: `GET /api/sessions`, `POST /api/sessions`, `GET /api/sessions/{id}`, `PATCH /api/sessions/{id}`, `DELETE /api/sessions/{id}`
  - Messages saved with `session_id`; session-scoped loading
  - ChatPanel sidebar: switch sessions, create new, delete, auto-title from first message
- **Full-Text Search** — SQLite FTS5 over message contents with fallback LIKE
  - API: `GET /api/search?q=...&limit=...`
  - Frontend: Ctrl+F opens global search overlay; live debounced results
  - FTS5 auto-created + backfilled on DB migration
- **DB Stats expanded** — `/api/stats` now includes `sessions` count

### v0.9.0
- **Plugin system wired** — `pre_chat`, `post_chat`, `pre_task`, `post_task`, `on_pulse`, `on_mood_change` all fire
  - Auto-discovery from `~/.hermes-native/plugins/*.py`
  - Sample: `plugins/logger.py`
- **Token tracking** — tiktoken `cl100k_base` + fallback
  - `messages.tokens` column, auto-counted on save
  - `/api/tokens` endpoint
  - `state_get` includes `"tokens"`
  - DB migration auto-adds column, backfills history
- **TaskStream dedup fix** — map by ID, stable live updates
- **Version bumped** — v0.9.0 across daemon + frontend + docs

### v0.8.1 (current)
- **Remote tunnel integration** — `scripts/tunnel.sh` wraps `npx localtunnel`, stores URL in `~/.hermes-native/state/tunnel.url`
- **Tunnel status API** — `GET /api/tunnel` returns `{running, url}`
- **Tunnel display in SettingsPanel** — shows active localtunnel URL with hyperlink
- **Auto-version pinning** — daemon.json version overwritten on load so UI never lies

### v0.7.3
- **DB Stats endpoint** — `/api/stats` returns message/task/pulse counts from SQLite
- **Chat clear** — "Clear" button + Ctrl+K shortcut calls `POST /api/chat/clear`, purges DB messages
- **Chat streaming fix** — chunks joined with `\n` instead of spaces, line-by-line readable
- **SettingsPanel live stats** — dynamic version from `/api/state`, live counts from `/api/stats`
- **Version pinning** — daemon.json version overwritten on load so UI never lies

### v0.7.2
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
- [ ] Desktop packaging (electron/tauri when rust available)
- [ ] Token count display per message ✅ DONE v0.11.0
- [ ] Markdown rendering in chat messages ✅ DONE v0.7.2
- [ ] Export chat/session to markdown file ✅ DONE v0.7.1
- [ ] Model switching in UI ✅ DONE v0.7.1
- [ ] Systemd service for auto-start on boot ✅ DONE v0.7.2

## Skill Created

`session-interrupt-recovery` — prevents the 6-hour death spiral from ever happening again. Trigger: any session where I was mid-build before interrupt. Protocol: trust git, use `git status`, classify state, do NOT audit with `execute_code`.
