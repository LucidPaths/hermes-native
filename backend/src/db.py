"""
Hermes Native — Database Layer
Persistent chat history, tasks, pulses in SQLite
"""
import json
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

DB_DIR = Path.home() / ".hermes-native" / "state"
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DB_DIR / "memory.db"

SCHEMA = """
-- messages: chat conversation
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,           -- 'user' or 'assistant'
    content TEXT NOT NULL,
    created TEXT NOT NULL,        -- ISO datetime
    session_id TEXT,              -- optional client session
    metadata TEXT               -- JSON blob
);

-- tasks: task queue history
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_key TEXT NOT NULL UNIQUE, -- daemon's generated key like t1x0
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending|running|done|error
    result TEXT,
    created TEXT NOT NULL,
    completed TEXT,
    error TEXT
);

-- pulses: heartbeat records
CREATE TABLE IF NOT EXISTS pulses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pulse_num INTEGER NOT NULL,
    status TEXT,
    created REAL NOT NULL,        -- unix timestamp
    data TEXT                     -- JSON state snapshot
);

-- timeline_view: convenience for unified feed display
-- materialized by query, not stored
"""

def init_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()
    return DB_PATH

def now_iso():
    return datetime.now(timezone.utc).isoformat()

# ──────────────────────── Messages ────────────────────────

def save_message(role: str, content: str, session_id: str = None, metadata: dict = None):
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT INTO messages (role, content, created, session_id, metadata) VALUES (?, ?, ?, ?, ?)",
        (role, content, now_iso(), session_id or "", json.dumps(metadata or {}))
    )
    conn.commit()
    conn.close()

def get_messages(limit: int = 100, offset: int = 0):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM messages ORDER BY created ASC LIMIT ? OFFSET ?",
        (limit, offset)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def clear_messages():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DELETE FROM messages")
    conn.commit()
    conn.close()

# ──────────────────────── Tasks ────────────────────────

def save_task(task_key: str, description: str, status: str = "pending", result: str = None, error: str = None):
    conn = sqlite3.connect(DB_PATH)
    # Upsert
    conn.execute(
        """INSERT INTO tasks (task_key, description, status, result, created, completed, error) 
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(task_key) DO UPDATE SET
           status = excluded.status,
           result = excluded.result,
           completed = excluded.completed,
           error = excluded.error""",
        (task_key, description, status, result, now_iso(), now_iso() if status in ("done", "error") else None, error)
    )
    conn.commit()
    conn.close()

def get_tasks(limit: int = 100):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM tasks ORDER BY created DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

# ──────────────────────── Pulses ────────────────────────

def save_pulse(pulse_num: int, status: str, data: dict):
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT INTO pulses (pulse_num, status, created, data) VALUES (?, ?, ?, ?)",
        (pulse_num, status, time.time(), json.dumps(data))
    )
    conn.commit()
    conn.close()

def get_pulses(limit: int = 100):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM pulses ORDER BY created DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

# ──────────────────────── Unified Timeline ────────────────────────

def get_timeline(limit: int = 100):
    """
    Merge messages, tasks, pulses into unified chronological feed.
    Returns list of dicts with 'type', 't', 'data'.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    items = []
    # messages
    for r in conn.execute("SELECT role, content, created FROM messages ORDER BY created DESC LIMIT ?", (limit,)):
        items.append({"type": "msg", "t": r["created"], "data": {"role": r["role"], "content": r["content"]}})
    # tasks
    for r in conn.execute("SELECT task_key, description, status, result, created, completed FROM tasks ORDER BY created DESC LIMIT ?", (limit,)):
        items.append({"type": "task", "t": r["completed"] or r["created"], "data": {"key": r["task_key"], "desc": r["description"], "status": r["status"], "result": r["result"]}})
    # pulses
    for r in conn.execute("SELECT pulse_num, status, created FROM pulses ORDER BY created DESC LIMIT ?", (limit,)):
        items.append({"type": "pulse", "t": datetime.fromtimestamp(r["created"], tz=timezone.utc).isoformat(), "data": {"pulse": r["pulse_num"], "status": r["status"]}})
    conn.close()
    items.sort(key=lambda x: x["t"], reverse=True)
    return items[:limit]
# ──────────────────────── Export / Stats ────────────────────────

def export_chat_to_markdown(path: Path):
    msgs = get_messages(limit=10000)
    lines = ["# Hermes Native — Chat Export\n", f"Generated: {datetime.now(timezone.utc).isoformat()}\n\n"]
    for m in msgs:
        role = m["role"]
        content = m["content"]
        ts = m["created"]
        lines.append(f"## {'👤' if role=='user' else '🜹'} {role.capitalize()} ({ts})\n\n{content}\n\n---\n\n")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(lines))
    return str(path)

def get_db_stats():
    conn = sqlite3.connect(DB_PATH)
    msgs = conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
    tasks = conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
    pulses = conn.execute("SELECT COUNT(*) FROM pulses").fetchone()[0]
    conn.close()
    return {"messages": msgs, "tasks": tasks, "pulses": pulses, "db_path": str(DB_PATH)}

# ── Clear ────────────────────────

def clear_messages():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DELETE FROM messages")
    conn.commit()
    conn.close()

def clear_tasks():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DELETE FROM tasks")
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("db init", DB_PATH)
