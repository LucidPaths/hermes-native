# Hermes Native

> A persistent, self-aware companion surface for Hermes Agent. Not a web wrapper — a native heartbeat.

## What This Is

Hermes Native is a desktop-first, phone-accessible application that gives Hermes Agent a persistent presence. It runs as a daemon with a heartbeat cycle, maintaining state across session boundaries so the agent never truly "sleeps."

## Architecture

```
┌─────────────────────────────────────────┐
│           Frontend (React/Vite)        │  ← Desktop + Mobile
│    ┌────────┬────────┬──────────────┐  │
│    │ Pulse  │  Chat  │  Workspace   │  │
│    │  Orb  │ +Tasks │  + Status    │  │
│    └────────┴────────┴──────────────┘  │
└─────────────────────────────────────────┘
              │ REST + SSE
┌─────────────────────────────────────────┐
│        Hermes Native Daemon (aiohttp)   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │Heartbeat│ │  State  │ │  Task   │   │
│  │  Loop   │ │ Keeper  │ │ Queue   │   │
│  └─────────┘ └─────────┘ └─────────┘   │
└─────────────────────────────────────────┘
```

## Quick Start

```bash
git clone https://github.com/LucidPaths/hermes-native.git
cd hermes-native

# Backend
pip install -r backend/requirements.txt
cd backend/src && python3 daemon.py

# Frontend (another terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:8788 in your browser. Mobile works too on the same local network.

## Heartbeat

A cron job fires every 15 minutes asking:
> "What was I about to do?"

State persists in `~/.hermes-native/state/`. The daemon serves it via SSE so the UI updates live.

## Lattice Alignment

- **P1 Bridges**: Thin integration layer, not a fork
- **P2 Agnostic**: Works with any model, any provider
- **P3 Simplicity**: Pillaged hermes-webui patterns, no reinvention
- **P4 Observable**: Every pulse logged, every state streamed
- **P9 Compounding**: Task queue + history accumulates

## Status

See [docs/STATUS.md](docs/STATUS.md) for current build state and what's next.

## License

MIT — derived from Hermes webui and HiveMind lattice.
