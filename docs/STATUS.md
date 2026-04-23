# Status — Hermes Native

Current: v0.1.0 (pre-release)

## What's Built ✅

- [x] GitHub repo: `LucidPaths/hermes-native`
- [x] Heartbeat cron: `hermes-native-heartbeat` firing every 15m
- [x] Backend daemon (`backend/src/daemon.py`): state keeper, REST API, SSE stream
- [x] Frontend skeleton (Vite + React + TS):
  - App.tsx dashboard
  - PulseOrb visual heartbeat
  - StatusPanel live state
  - TaskStream enqueue + completion
  - Dark void aesthetic
- [x] Styles: `frontend/src/styles/index.css` (~250 lines)
- [x] Scripts: `scripts/start.sh`

## Working During User Absence

- Heartbeat ran every 15m
- Task log populated at `~/.hermes-native/state/tasklog.md`
- Daemon wrote pulse history to `~/.hermes-native/state/pulse.jsonl`

## What's Missing ⚠️

- [ ] Frontend dependency install + build (npm install)
- [ ] Backend dependency install + test run (aiohttp)
- [ ] Integration test: `npm run dev` + `python3 backend/src/daemon.py`
- [ ] Mobile responsive polish (tablet okay, phone could be tighter)
- [ ] Chat interface (beyond state display)
- [ ] Hermes-agent bridge (MCP or direct tool call)
- [ ] Desktop packaging (electron/tauri when rust available)
- [ ] Phone-accessible deployment (caddy reverse proxy or tailscale)

## Next Sprint

1. Get `npm install` working, verify build
2. Run backend, hit `/health`
3. Wire frontend SSE to backend events
4. Add a minimal chat route that proxies to hermes-agent
5. Polish responsive grid

## Lattice Check

| # | Principle | Status |
|---|-----------|--------|
| P1 Bridges | ✅ Thin daemon, no fork |
| P2 Agnostic | ✅ Any model via config |
| P3 Simplicity | ✅ Pillaged hermes-webui patterns |
| P4 Observable | ✅ Every pulse logged + SSE |
| P9 Compounding | ✅ Task queue + history |
