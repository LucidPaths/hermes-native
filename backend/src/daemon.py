"""
Hermes Native — Backend Daemon
v0.9.0 — Plugin System + Token Tracking
SQLite persistence for chat, tasks, pulses. Unified timeline.
Auto-archives done/error tasks from runtime state. Monotonic task IDs.
Mood states via mood.py (dawn/idle/working/dusk/night/error).
Plugin hooks: pre_chat, post_chat, pre_task, post_task, on_pulse, on_mood_change.
REST API + SSE + WS on :8789
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

try:
    import mood
except ImportError:
    mood = None

try:
    import plugins
except ImportError:
    plugins = None

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
            data = json.loads(STATE_FILE.read_text())
            data["version"] = "0.9.0"  # always use current version
            return data
        except Exception:
            pass
    return {
        "version": "0.9.0",
        "booted": now(),
        "last_pulse": None,
        "next_pulse": None,
        "pulse_count": 0,
        "task_counter": 0,
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

# ── Plugin Registry ──
_plugin_registry = None

def _get_plugins():
    global _plugin_registry
    if _plugin_registry is None and plugins:
        try:
            _plugin_registry = plugins.get_registry()
        except Exception as e:
            print(f"[plugin] registry init error: {e}")
            _plugin_registry = None
    return _plugin_registry

# ── Helpers ──
def _prev_mood_label():
    return state.get("__prev_mood", "idle")

# ── Init DB ──
if db:
    try:
        db.init_db()
        print("[db] memory.db initialized")
    except Exception as e:
        print(f"[db] init error: {e}")

# ── Mood state cache ──
_current_mood = None
_last_mood_at = 0

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
    # Plugin: on_pulse + on_mood_change
    registry = _get_plugins()
    if registry:
        try:
            registry.run("on_pulse", state=dict(state))
        except Exception as e:
            print(f"[plugin] on_pulse error: {e}")
        try:
            cur_mood = _get_cached_mood()
            prev = state.get("__prev_mood", "idle")
            if cur_mood["label"] != prev:
                state["__prev_mood"] = cur_mood["label"]
                registry.run("on_mood_change", state=dict(state), mood=cur_mood, prev=prev)
        except Exception as e:
            print(f"[plugin] on_mood_change error: {e}")
    await hub.push({"type": "pulse", "data": state})
    return state

async def state_patch(request):
    body = await request.json()
    # Allow model/provider switching via PATCH
    allowed_keys = {"model", "provider", "status", "current_task", "version","mood_label","mood_murmur"}
    filtered = {k: v for k, v in body.items() if k in allowed_keys}
    async with state_lock:
        state.update(filtered)
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
    await hub.push({"type": "task", "data": {"role": "task", "id": task_id, "desc": desc, "status": "running", "result": None, "ts": now()}})
    
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
            # Auto-archive: remove done/error tasks from runtime state (persisted in DB)
            state["task_queue"] = [t for t in state["task_queue"] if t["status"] in ("pending","running")]
            save_state(state)
        # Persist task completion
        if db:
            try:
                db.save_task(task_id, desc, "done", response_text[:500])
            except Exception as e:
                print(f"[db] save_task error: {e}")
        # Plugin: post_task
        registry = _get_plugins()
        if registry:
            try: registry.run("post_task", task_id=task_id, description=desc, status="done", result=response_text[:500], state=dict(state))
            except Exception as e: print(f"[plugin] post_task error: {e}")
    except Exception as e:
        async with state_lock:
            for t in state["task_queue"]:
                if t["id"] == task_id:
                    t["status"] = "error"
                    t["result"] = str(e)[:300]
                    break
            state["status"] = "idle" if not [t for t in state["task_queue"] if t["status"] in ("pending","running")] else "working"
            # Auto-archive: remove done/error tasks from runtime state (persisted in DB)
            state["task_queue"] = [t for t in state["task_queue"] if t["status"] in ("pending","running")]
            save_state(state)
        if db:
            try:
                db.save_task(task_id, desc, "error", error=str(e)[:300])
            except Exception as e2:
                print(f"[db] save_task error: {e2}")
        # Plugin: post_task
        registry = _get_plugins()
        if registry:
            try: registry.run("post_task", task_id=task_id, description=desc, status="error", result=str(e)[:300], state=dict(state))
            except Exception as pe: print(f"[plugin] post_task error: {pe}")
    await hub.push({"type": "state", "data": dict(state)})

async def task_history_get(request):
    """Get persistent task history from SQLite."""
    limit = int(request.query.get("limit", "100"))
    try:
        tasks = db.get_tasks(limit=limit) if db else []
        return web.json_response(tasks)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

async def task_post(request):
    body = await request.json()
    desc = body.get("description", "")
    async with state_lock:
        state["task_counter"] = state.get("task_counter", 0) + 1
        task = {
            "id": f"t{state['pulse_count']}x{state['task_counter']}",
            "desc": desc,
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
    # Plugin: pre_task
    registry = _get_plugins()
    if registry:
        try:
            registry.run("pre_task", task=task, state=dict(state))
        except Exception as e:
            print(f"[plugin] pre_task error: {e}")
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

async def index(request):
    """Serve the frontend SPA."""
    index_path = FE_DIST / "index.html"
    if index_path.exists():
        return web.FileResponse(index_path)
    return web.json_response({"ok": True, "version": state["version"], "status": state["status"]})

async def health(_):
    m = _get_cached_mood()
    return web.json_response({"ok": True, "version": state["version"], "status": state["status"], "mood": m["label"], "murmur": m["murmur"]})

async def mood_get(_):
    return web.json_response(_get_cached_mood())

async def state_get(request):
    async with state_lock:
        s = dict(state)
        s["mood"] = _get_cached_mood()
        s["tasks_queued"] = len(state.get("task_queue", []))
        s["tokens"] = db.get_total_tokens() if db else 0
        return web.json_response(s)

async def stats_get(request):
    """Get DB stats — message, task, pulse counts."""
    try:
        s = db.get_db_stats() if db else {"messages": 0, "tasks": 0, "pulses": 0, "db_path": "unknown"}
        return web.json_response(s)
    except Exception as e:
        return web.json_response({"messages": 0, "tasks": 0, "pulses": 0, "error": str(e)}, status=500)

async def export_chat(request):
    """Export chat history to markdown file."""
    fmt = request.query.get("format", "markdown")
    try:
        import db
        path = db.export_chat_to_markdown(Path.home() / ".hermes-native" / "exports" / f"chat-export-{time.strftime('%Y%m%d-%H%M%S')}.md")
        return web.json_response({"ok": True, "path": path})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

async def clear_chat(request):
    """Clear all chat messages from the database."""
    try:
        if db:
            db.clear_messages()
            return web.json_response({"ok": True})
        else:
            return web.json_response({"ok": False, "error": "db not available"}, status=500)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

def _get_cached_mood():
    global _current_mood, _last_mood_at
    import time
    now_ts = time.time()
    if _current_mood is None or now_ts - _last_mood_at > 60:
        if mood:
            try:
                _current_mood = mood.mood_from_state(dict(state))
                _last_mood_at = now_ts
            except Exception as e:
                print(f"[mood] error: {e}")
                _current_mood = {"label": "idle", "murmur": "...", "color": "#00d4aa", "breathe_rate": 2.0}
        else:
            _current_mood = {"label": "idle", "murmur": "...", "color": "#00d4aa", "breathe_rate": 2.0}
    return _current_mood

async def chat_post(request):
    body = await request.json()
    msg = body.get("message", "").strip()
    if not msg:
        return web.json_response({"error": "empty message"}, status=400)
    registry = _get_plugins()
    if registry:
        try:
            registry.run("pre_chat", message=msg, state=dict(state))
        except Exception as e:
            print(f"[plugin] pre_chat error: {e}")
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
        # Plugin: post_chat
        if registry:
            try:
                registry.run("post_chat", message=msg, response=response_text, state=dict(state))
            except Exception as e:
                print(f"[plugin] post_chat error: {e}")
        # Broadcast to SSE listeners
        await hub.push({"type": "chat", "data": {"role": "user", "content": msg, "t": now()}})
        await hub.push({"type": "chat", "data": {"role": "assistant", "content": response_text, "t": now()}})
        
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

async def ws_chat(request):
    """WebSocket chat with stream simulation."""
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    async for msg in ws:
        if msg.type == web.WSMsgType.TEXT:
            body = json.loads(msg.data)
            user_msg = body.get("message", "").strip()
            if not user_msg:
                await ws.send_str(json.dumps({"type": "error", "text": "empty"}))
                continue
            
            # Persist user message
            if db:
                try: db.save_message("user", user_msg, metadata={"source": "native"})
                except Exception as e: print(f"[db] ws user msg error: {e}")
            
            # Plugin: pre_chat
            registry = _get_plugins()
            if registry:
                try: registry.run("pre_chat", message=user_msg, state=dict(state))
                except Exception as e: print(f"[plugin] ws pre_chat error: {e}")
            
            await hub.push({"type": "chat", "data": {"role": "user", "content": user_msg, "t": now()}})
            await ws.send_str(json.dumps({"type": "start", "text": "⏤"}))
            
            # Stream: spawn hermes
            try:
                proc = await asyncio.create_subprocess_exec(
                    "/home/lucid/.local/bin/hermes", "chat", "-q", user_msg, "-Q", "--yolo", "--accept-hooks", "--pass-session-id",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=str(Path.home() / "workspace"),
                    env={**dict(os.environ), "TERM": "dumb", "NO_COLOR": "1", "HERMES_ACCEPT_HOOKS": "1"},
                )
                
                # Stream output line by line
                chunks = []
                while True:
                    line = await proc.stdout.readline()
                    if not line:
                        break
                    chunk = line.decode().strip()
                    if chunk:
                        chunks.append(chunk)
                        # Simulate typing: send every chunk
                        await ws.send_str(json.dumps({"type": "chunk", "text": chunk}))
                
                _, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
                full_text = "\n".join(chunks).strip()
                session_id = stderr.decode().strip().replace("session_id: ", "") if "session_id" in stderr.decode() else None
                
                # Persist full response + plugin
                if db:
                    try: db.save_message("assistant", full_text, metadata={"source": "native", "session_id": session_id})
                    except Exception as e: print(f"[db] ws assistant msg error: {e}")
                if registry:
                    try: registry.run("post_chat", message=user_msg, response=full_text, state=dict(state))
                    except Exception as e: print(f"[plugin] ws post_chat error: {e}")

                await hub.push({"type": "chat", "data": {"role": "assistant", "content": full_text, "t": now()}})
                await ws.send_str(json.dumps({"type": "done", "text": full_text}))
                
            except asyncio.TimeoutError:
                await ws.send_str(json.dumps({"type": "error", "text": "timeout"}))
            except Exception as e:
                await ws.send_str(json.dumps({"type": "error", "text": str(e)}))
        elif msg.type == web.WSMsgType.ERROR:
            break
    
    return ws

async def stats_get(request):
    """Get DB stats — message, task, pulse counts."""
    try:
        s = db.get_db_stats() if db else {"messages": 0, "tasks": 0, "pulses": 0, "db_path": "unknown"}
        return web.json_response(s)
    except Exception as e:
        return web.json_response({"messages": 0, "tasks": 0, "pulses": 0, "error": str(e)}, status=500)

async def tunnel_status(request):
    """Return active tunnel URL if any."""
    import os
    url_file = Path.home() / ".hermes-native" / "state" / "tunnel.url"
    pid_file = Path.home() / ".hermes-native" / "state" / "tunnel.pid"
    running = False
    if pid_file.exists():
        try:
            pid = int(pid_file.read_text().strip())
            os.kill(pid, 0)
            running = True
        except (ValueError, ProcessLookupError, PermissionError):
            pass
    url = url_file.read_text().strip() if url_file.exists() else None
    return web.json_response({"running": running, "url": url})

async def tokens_get(request):
    """Return total token count across all messages."""
    total = db.get_total_tokens() if db else 0
    return web.json_response({"total_tokens": total})

# ── Routes ──
app = web.Application()
app.router.add_get("/", index)
app.router.add_get("/health", health)
app.router.add_get("/api/state", state_get)
app.router.add_patch("/api/state", state_patch)
app.router.add_post("/api/pulse", pulse_post)
app.router.add_post("/api/tasks", task_post)
app.router.add_get("/api/tasks/history", task_history_get)
app.router.add_post("/api/tasks/complete", task_complete)
app.router.add_get("/api/mood", mood_get)
app.router.add_post("/api/chat", chat_post)
app.router.add_get("/api/chat/history", chat_history_get)
app.router.add_get("/api/timeline", timeline_get)
app.router.add_get("/api/history", history_get)
app.router.add_get("/events", events)
app.router.add_get("/ws/chat", ws_chat)
app.router.add_get("/api/export/chat", export_chat)
app.router.add_post("/api/chat/clear", clear_chat)
app.router.add_get("/api/stats", stats_get)
app.router.add_get("/api/tunnel", tunnel_status)

app.router.add_get("/api/tokens", tokens_get)

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
