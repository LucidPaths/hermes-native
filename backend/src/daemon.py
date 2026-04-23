"""
Hermes Native — Backend Daemon
aiohttp: REST API + SSE on :8789
"""
import asyncio
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from aiohttp import web

STATE_DIR = Path.home() / ".hermes-native" / "state"
STATE_DIR.mkdir(parents=True, exist_ok=True)
STATE_FILE = STATE_DIR / "daemon.json"
LOG_FILE = STATE_DIR / "pulse.jsonl"

HOST = os.getenv("HERMES_NATIVE_HOST", "127.0.0.1")
PORT = int(os.getenv("HERMES_NATIVE_PORT", "8789"))
FE_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

def now():
    return datetime.now(timezone.utc).isoformat()

def load_state():
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    return {
        "version": "0.1.0",
        "booted": now(),
        "last_pulse": None,
        "next_pulse": None,
        "pulse_count": 0,
        "status": "idle",
        "current_task": None,
        "task_queue": [],
        "memory": {},
        "model": "kimi-k2.6",
        "provider": "ollama-cloud",
    }

def save_state(data):
    STATE_FILE.write_text(json.dumps(data, indent=2))

class BroadcastHub:
    def __init__(self):
        self.listeners = []
    
    def add(self, q):
        self.listeners.append(q)
    
    def remove(self, q):
        try:
            self.listeners.remove(q)
        except ValueError:
            pass
    
    async def push(self, msg):
        dead = []
        for q in self.listeners:
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                dead.append(q)
        for d in dead:
            self.remove(d)

hub = BroadcastHub()
state = load_state()
state_lock = asyncio.Lock()

async def pulse():
    async with state_lock:
        state["last_pulse"] = now()
        state["pulse_count"] = state.get("pulse_count", 0) + 1
        save_state(state)
    record = {"t": time.time(), "pulse": state["pulse_count"], "status": state["status"]}
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(record) + "\n")
    await hub.push({"type": "pulse", "data": state})
    return state

async def state_get(request):
    async with state_lock:
        return web.json_response(dict(state))

async def state_patch(request):
    body = await request.json()
    async with state_lock:
        state.update(body)
        save_state(state)
    await hub.push({"type": "state", "data": dict(state)})
    return web.json_response(dict(state))

async def pulse_post(request):
    s = await pulse()
    return web.json_response(s)

async def task_post(request):
    body = await request.json()
    async with state_lock:
        task = {
            "id": f"t{state['pulse_count']}x{len(state['task_queue'])}",
            "desc": body.get("description", ""),
            "status": "pending",
            "created": now(),
        }
        state["task_queue"].append(task)
        state["status"] = "working" if state["task_queue"] else "idle"
        save_state(state)
    await hub.push({"type": "task", "data": task})
    return web.json_response(task)

async def task_complete(request):
    body = await request.json()
    tid = body.get("task_id")
    async with state_lock:
        q = state["task_queue"]
        if q:
            if tid:
                for i, t in enumerate(q):
                    if t["id"] == tid:
                        t["status"] = "done"
                        t["completed"] = now()
                        q.pop(i)
                        break
            else:
                t = q.pop(0)
                t["status"] = "done"
                t["completed"] = now()
        state["status"] = "idle" if not q else "working"
        save_state(state)
    await hub.push({"type": "state", "data": dict(state)})
    return web.json_response(dict(state))

async def history_get(request):
    limit = int(request.query.get("limit", "100"))
    if not LOG_FILE.exists():
        return web.json_response([])
    lines = []
    with open(LOG_FILE) as f:
        for l in f:
            lines.append(json.loads(l))
    return web.json_response(lines[-limit:])

async def events(request):
    resp = web.StreamResponse()
    resp.headers["Content-Type"] = "text/event-stream"
    resp.headers["Cache-Control"] = "no-cache"
    resp.headers["Access-Control-Allow-Origin"] = "*"
    await resp.prepare(request)
    
    q = asyncio.Queue(maxsize=16)
    hub.add(q)
    
    init = json.dumps({"type": "state", "data": dict(state)})
    await resp.write(f"data: {init}\n\n".encode())
    
    try:
        while True:
            msg = await asyncio.wait_for(q.get(), timeout=30)
            payload = json.dumps(msg)
            await resp.write(f"data: {payload}\n\n".encode())
    except asyncio.TimeoutError:
        await resp.write(f"data: {json.dumps({'type':'ping'})}\n\n".encode())
    except Exception:
        pass
    finally:
        hub.remove(q)
    return resp

async def health(_):
    return web.json_response({"ok": True, "version": state["version"], "status": state["status"]})

app = web.Application()
app.router.add_get("/", health)
app.router.add_get("/health", health)
app.router.add_get("/api/state", state_get)
app.router.add_patch("/api/state", state_patch)
app.router.add_post("/api/pulse", pulse_post)
app.router.add_post("/api/tasks", task_post)
app.router.add_post("/api/tasks/complete", task_complete)
app.router.add_get("/api/history", history_get)
app.router.add_get("/events", events)

# static from FE dist if it exists
if FE_DIST.exists():
    app.router.add_static("/", path=str(FE_DIST), show_index=True)

if __name__ == "__main__":
    print(f"[hermes-native] daemon booting @ http://{HOST}:{PORT}")
    web.run_app(app, host=HOST, port=PORT, access_log=None)
