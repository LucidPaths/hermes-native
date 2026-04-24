# Status — Hermes Native

Current: v0.5.0

## What's Built ✅

- [x] GitHub repo: `LucidPaths/hermes-native` — 10+ commits
- [x] Backend daemon (`backend/src/daemon.py`): aiohttp on :8789
  - State keeper (JSON file persistence)
  - REST API: `/health`, `/api/state`, `/api/pulse`, `/api/tasks`, `/api/tasks/complete`, `/api/tasks/history`, `/api/chat`, `/api/chat/history`, `/api/timeline`, `/api/history`
  - SSE `/events` (live state push)
  - CORS middleware for dev
  - **Async task invoker** — spawns `hermes chat -q` via asyncio subprocess, tracks `pending → running → done`
  - **Hermes agent bridge** — chat endpoint that invokes CLI, returns clean text
  - **SQLite memory layer** — `db.py`: messages, tasks, pulses tables with unified timeline query
  - **Task auto-archive** — done/error tasks removed from runtime state, persisted in DB
  - **Monotonic task IDs** — `task_counter` prevents ID collisions
  - **Live chat broadcast** — chat messages pushed to SSE listeners for real-time timeline updates
- [x] Frontend (Vite + React + TypeScript):
  - `App.tsx` — tabbed navigation (Chat / Tasks / Timeline), dark/light toggle
  - `PulseOrb.tsx` — animated CSS orb with `idle/working/error` color states
  - `StatusPanel.tsx` — live state display (model, pulses, queue depth, last pulse)
  - `TaskStream.tsx` — enqueue tasks, load DB history + merge with live SSE, see full past results
  - `ChatPanel.tsx` — full chat with persistent history (`/api/chat/history`), timestamps, persisted badge
  - `MemoryTimeline.tsx` — unified chronological feed of messages, tasks, pulses from `/api/timeline`
  - Dark void theme (CSS variables, radial gradient, monospace + sans-serif)
  - Mobile responsive via `@media (max-width: 768px)`
- [x] Build system:
  - `npm run build` → zero errors
  - Static serving from daemon (single port)
  - `./scripts/start.sh` — production launcher with auto-build
- [x] Heartbeat cron: `hermes-native-heartbeat` every 15m (job ID: `b7e594c34aaf`)
- [x] Session interrupt recovery skill

## End-to-End Verified ✅

| Feature | Test | Result |
|---------|------|--------|
| Chat | "what is 5*7" | "35" |
| Chat persistence | reload page | history restored from SQLite |
| Task async | "capital of France" | "Paris" |
| Task history | load TaskStream tab | past tasks visible with results |
| Task auto-archive | check state after done | runtime clean, DB has record |
| Monotonic IDs | post 2 tasks rapidly | unique IDs verified |
| Timeline | `/api/timeline` | messages+tasks+pulses interleaved |
| SSE updates | task status transitions | live |
| Mobile DOM | chrome inspector 375px | renders stacked |
| Phone LAN | `172.21.170.236:8788` | accessible |

## Running

```bash
cd /home/lucid/workspace/hermes-native
python3 backend/src/daemon.py
# open http://localhost:8789 (or http://YOUR_IP:8789 on phone)
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
| P9 Compounding | ✅ Task queue + task results + chat history accumulate |
