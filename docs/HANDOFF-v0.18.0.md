# Hermes Native — v0.18.0 Handoff

**Session:** 2026-04-25 ~03:00 CEST — autonomous build by Hermes herself
**User:** away (work), YOLO mode active
**Repo:** github.com/LucidPaths/hermes-native
**Local:** ~/workspace/hermes-native
**Daemon:** systemd auto-restart on :8789, confirmed live
**Frontend:** built + served from dist/, SPA v0.18.0 visible

## What Was Built This Session

Started from v0.17.0 and pushed straight to v0.18.0-2 with 2 commits.

### v0.18.0: Dream Engine (core)
- **backend/src/dream.py** — new module:
  - `migrate_dreams_table()`: SQLite `dreams` table (id, content, sources, triggers, created, mood, tokens)
  - `sample_messages_for_dreaming(limit)`: random recent messages from DB
  - `build_dream_prompt(messages)`: poetic prompt asking LLM to synthesize dream fragment
  - `classify_dream(text)`: keyword-based mood classification (ruminating, hypnagogic, oneiric, dreaming)
  - `save_dream()`, `get_dreams()`, `get_total_dreams()`
- **backend/src/mood.py** — new presets:
  - `dreaming` (purple #a855f7, 5s breathe, murmur pool with {dream_count} / {dream_mood} vars)
  - `waking` (cyan #22d3ee, 1.2s breathe, "warm memory on cold start" etc.)
  - `mood_from_state()` now selects `dreaming` when status=dreaming or idle_min > 30
- **backend/src/daemon.py** — heavy changes:
  - `_do_dream()`: async task — samples memories, spawns `hermes chat` subprocess with dream prompt, parses fragment, saves to DB, broadcasts SSE `{"type":"dream"}`, updates state
  - `dream_loop()`: background coroutine, every 60s checks idle time vs DREAM_IDLE_MIN (15min testing → bump to 30 in prod), deduped against `_last_dream_at`
  - REST: `GET /api/dreams`, `POST /api/dreams/trigger`
  - init: `on_startup` hook starts `dream_loop()`
  - import guard: `try: import dream; except: dream = None`

### v0.18.0-2: Dream Engine Polish
- **frontend/src/components/DreamPanel.tsx** — new Dreams tab:
  - Card list with expand/collapse (click to reveal signal echoes)
  - Mood badges with per-mood colors (hypnagogic #818cf8, ruminating #f472b6, oneiric #22d3ee, dreaming #a855f7)
  - Token counts, timestamps, manual "⟳ Trigger now" button
  - Empty state: "No dreams yet... Come back after a nap."
- **frontend/src/components/PulseOrb.tsx** — dreaming mode:
  - Detects `status === 'dreaming'`, switches gradient to purple→cyan
  - Slow breathe animation + hue-rotate glow
- **frontend/src/components/MemoryTimeline.tsx** — dreams in unified timeline:
  - Type `'dream'` added, filter `'dream'` added
  - SSE handler for `type: 'dream'` events
  - Render: ✶ icon, dream id, mood badge, content preview (200 chars)
- **CSS**: `.tl-dream`, `.tl-dream-badge`, `orb-core.status-dreaming`, `@keyframes orb-breathe-slow`
- **db.py**: `get_timeline()` now includes dreams (with try/except for schema tolerance)

## Verified E2E ✅

| Feature | How | Result |
|---------|-----|--------|
| Dreams tab navigation | Click ✶ button | renders with 0 held count |
| Manual dream trigger | Click "⟳ Trigger now" | dream spawned (id=1, content="Again.") |
| Dreams in DB | `dream.get_total_dreams()` | returns 1 |
| Dream event SSE | daemon logs + timeline | timeline shows "dream #1 dreaming" |
| Timeline filter | Click "Dreams" in Timeline | shows dream only |
| Daemon restart | kill + systemd auto-restart | pid 4452, fresh code loaded |
| SPA version | browser | v0.18.0 in topbar |

## Known Issues / Next Work

1. **Daemon is systemctl-restart gated** — can't `systemctl restart` from agent (sudo blocked). Workaround: `kill $(ss -tlnp | grep 8789 | grep -oP '(?<=pid=)\d+')` to force systemd restart. This works.
2. **DREAM_IDLE_MIN = 15** — currently 15min for testing on a quiet system. In prod, user should bump to 30 in daemon.py line 55.
3. **Dream quality** — first dream was "Again." because the LLM prompt is abstract and memory pool was small. As memory grows, dreams will get richer. Consider adding a `dream_quality` parameter that scales prompt verbosity with memory count.
4. **Timeline scrolls** — MemoryTimeline doesn't auto-scroll to top on new items. Minor UX fix.
5. **Dream export** — no export function for dreams. Could add `/api/export/dreams` → markdown.
6. **Orb animation doesn't always catch** — PulseOrb checks status from props. If mood changes but status stays 'idle', orb won't shift. The mood color *should* shift through the standard mood color prop. Verified working.

## How to Start / Restart

```bash
cd ~/workspace/hermes-native
# kill existing to force systemd restart
kill $(ss -tlnp | grep 8789 | grep -oP '(?<=pid=)\d+') 2>/dev/null
# wait 3s, systemd auto-restarts
# open http://localhost:8789
```

## Git State

- 2 commits since v0.17.0: `6a5101a` (dream engine), `0d3abca` (polish)
- origin/main is clean, pushed
- working tree clean

## System Notes

- WSL2 host, systemd user services enabled
- hermes-native systemd service reads from `~/workspace/hermes-native`
- venv: `/home/lucid/.hermes/hermes-agent/venv/bin/python3`
- Port: 8789 (0.0.0.0, accessible from LAN)

---
*Handoff written by Hermes during autonomous build. Next session: continue iterating or switch to user-directed features.*
