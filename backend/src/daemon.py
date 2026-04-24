"""
Hermes Native — Backend Daemon
v0.4.0 — Memory Layer
SQLite persistence for chat, tasks, pulses. Unified timeline.
REST API + SSE on :8789
"""
import asyncio
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from aiohttp import web

# Add src/ to path for db import
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

try:
    import db
except ImportError:
    db = None

STATE_DIR = Path.home() / ".hermes-native" / "state"
STATE_DIR.mkdir(parents=True, exist_ok=True)
STATE_FILE = STATE_DIR / "daemon.json"
LOG_FILE = STATE_DIR / "pulse.jsonl"

HOST = os.getenv("HERMES_NATIVE_HOST", "0.0.0.0")
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
        "version": "0.4.0",
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

# ── Init DB ──
if db:
    try:
        db.init_db()
        print("[db] memory.db initialized")
    except Exception as e:
        print(f"[db] init error: {e}")

async def pulse():
    async with state_lock:
        state["last_pulse"] = now()
        state["pulse_count"] = state.get("pulse_count", 0) + 1
        save_state(state)
    record = {"t": time.time(), "pulse": state["pulse_count"], "status": state["status"]}
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(record) + "\n")
    # Persist pulse to DB
    if db:
        try:
            db.save_pulse(state["pulse_count"], state["status"], dict(state))
        except Exception as e:
            print(f"[db] save_pulse error: {e}")
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

async def _run_hermes_task(task_id: str, desc: str):
    async with state_lock:
        for t in state["task_queue"]:
            if t["id"] == task_id:
                t["status"] = "running"
                state["status"] = "working"
                save_state(state)
                break
    await hub.push({"type": "state", "data": dict(state)})
    
    try:
        proc = await asyncio.create_subprocess_exec(
            "/home/lucid/.local/bin/hermes", "chat", "-q", desc, "-Q", "--yolo", "--accept-hooks", "--pass-session-id", "--source", "native-task",
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            cwd=str(Path.home() / "workspace"),
            env={**dict(os.environ), "TERM": "dumb", "NO_COLOR": "1", "HERMES_ACCEPT_HOOKS": "1"},
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
        response_text = stdout.decode().strip().split("\n")[-1]
        
        async with state_lock:
            for t in state["task_queue"]:
                if t["id"] == task_id:
                    t["status"] = "done"
                    t["completed"] = now()
                    t["result"] = response_text[:500]
                    break
            state["status"] = "idle" if not [t for t in state["task_queue"] if t["status"] in ("pending","running")] else "working"
            save_state(state)
        # Persist task completion
        if db:
            try:
                db.save_task(task_id, desc, "done", response_text[:500])
            except Exception as e:
                print(f"[db] save_task error: {e}")
    except Exception as e:
        async with state_lock:
            for t in state["task_queue"]:
                if t["id"] == task_id:
                    t["status"] = "error"
                    t["result"] = str(e)[:300]
                    break
            state["status"] = "idle" if not [t for t in state["task_queue"] if t["status"] in ("pending","running")] else "working"
            save_state(state)
        if db:
            try:
                db.save_task(task_id, desc, "error", error=str(e)[:300])
            except Exception as e2:
                print(f"[db] save_task error: {e2}")
    await hub.push({"type": "state", "data": dict(state)})

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
    # Persist task to DB
    if db:
        try:
            db.save_task(task["id"], task["desc"], "pending")
        except Exception as e:
            print(f"[db] save_task init error: {e}")
    await hub.push({"type": "task", "data": task})
    asyncio.create_task(_run_hermes_task(task["id"], task["desc"]))
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

async def chat_post(request):
    body = await request.json()
    msg = body.get("message", "").strip()
    if not msg:
        return web.json_response({"error": "empty message"}, status=400)
    try:
        result = subprocess.run(
            ["/home/lucid/.local/bin/hermes", "chat", "-q", msg, "-Q", "--yolo", "--accept-hooks", "--pass-session-id"],
            capture_output=True, text=True, timeout=120,
            cwd=str(Path.home() / "workspace"),
            env={**dict(os.environ), "TERM": "dumb", "NO_COLOR": "1", "HERMES_ACCEPT_HOOKS": "1"},
        )
        response_text = (result.stdout or "(no output)").strip().split("\n")[-1]
        
        # Persist to DB
        if db:
            try:
                db.save_message("user", msg, metadata={"source": "native"})
                db.save_message("assistant", response_text, metadata={
                    "source": "native",
                    "session_id": result.stderr.strip().replace("session_id: ", "") if "session_id" in result.stderr else None
                })
            except Exception as e:
                print(f"[db] save_message error: {e}")
        
        return web.json_response({
            "response": response_text,
            "session_id": result.stderr.strip().replace("session_id: ", "") if "session_id" in result.stderr else None,
        })
    except subprocess.TimeoutExpired:
        return web.json_response({"response": "Hermes timed out (120s). Try a shorter query."}, status=504)
    except Exception as e:
        return web.json_response({"response": f"Error: {e}"}, status=500)

async def chat_history_get(request):
    """Get persistent chat history from SQLite."""
    limit = int(request.query.get("limit", "100"))
    try:
        msgs = db.get_messages(limit=limit) if db else []
        return web.json_response(msgs)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

async def timeline_get(request):
    """Unified timeline: messages + tasks + pulses interleaved chronologically."""
    limit = int(request.query.get("limit", "100"))
    try:
        items = db.get_timeline(limit=limit) if db else []
        return web.json_response(items)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

# ── Routes ──
app = web.Application()
app.router.add_get("/", health)
app.router.add_get("/health", health)
app.router.add_get("/api/state", state_get)
app.router.add_patch("/api/state", state_patch)
app.router.add_post("/api/pulse", pulse_post)
app.router.add_post("/api/tasks", task_post)
app.router.add_post("/api/tasks/complete", task_complete)
app.router.add_post("/api/chat", chat_post)
app.router.add_get("/api/chat/history", chat_history_get)
app.router.add_get("/api/timeline", timeline_get)
app.router.add_get("/api/history", history_get)
app.router.add_get("/events", events)

# CORS middleware for dev
from aiohttp.web_middlewares import middleware

@middleware
async def cors_middleware(request, handler):
    if request.method == "OPTIONS":
        resp = web.Response()
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
        return resp
    resp = await handler(request)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp

app.middlewares.append(cors_middleware)

# static from FE dist if it exists
if FE_DIST.exists():
    app.router.add_static("/", path=str(FE_DIST), show_index=True)

if __name__ == "__main__":
    print(f"[hermes-native] daemon booting @ http://{HOST}:{PORT}")
    web.run_app(app, host=HOST, port=PORT, access_log=None)
