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

# ── Token counting (best-effort; uses tiktoken if available) ──
_enc = None

def _get_enc():
    global _enc
    if _enc is None:
        try:
            import tiktoken
            _enc = tiktoken.get_encoding("cl100k_base")
        except Exception:
            _enc = None
    return _enc

def _count_tokens(text: str) -> int:
    if not text:
        return 0
    enc = _get_enc()
    if enc:
        return len(enc.encode(text))
    # rough fallback: ~0.75 words per token
    return int(len(text.split()) * 1.33)

SCHEMA = """
-- messages: chat conversation
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,           -- 'user' or 'assistant'
    content TEXT NOT NULL,
    created TEXT NOT NULL,        -- ISO datetime
    session_id TEXT,              -- optional client session
    metadata TEXT,               -- JSON blob
    tokens INTEGER DEFAULT 0
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

-- sessions: chat session grouping
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Untitled',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    metadata TEXT               -- JSON blob
);

-- messages FTS5 index for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    content, role, session_id,
    content='messages',
    content_rowid='id'
);
"""

def migrate_db():
    """Lightweight migrations: add missing columns/tables, then init schema."""
    conn = sqlite3.connect(DB_PATH, timeout=10)
    cursor = conn.execute("PRAGMA table_info(messages)")
    columns = {row[1] for row in cursor.fetchall()}
    if "tokens" not in columns:
        print("[db] migrating: adding messages.tokens column")
        conn.execute("ALTER TABLE messages ADD COLUMN tokens INTEGER DEFAULT 0")
        conn.commit()
    # Check for sessions table
    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    if "sessions" not in tables:
        print("[db] migrating: adding sessions table")
        conn.execute("""
            CREATE TABLE sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT 'Untitled',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                metadata TEXT
            )
        """)
        conn.commit()
    if "messages_fts" not in tables:
        print("[db] migrating: adding messages_fts FTS5 index")
        try:
            conn.execute("""
                CREATE VIRTUAL TABLE messages_fts USING fts5(
                    content, role, session_id,
                    content='messages',
                    content_rowid='id'
                )
            """)
            conn.commit()
            # Populate initial index
            conn.execute("INSERT INTO messages_fts(rowid, content, role, session_id) SELECT id, content, role, session_id FROM messages")
            conn.commit()
        except Exception as e:
            print(f"[db] fts5 migration error (fts5 may not be available): {e}")
    conn.close()
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()
    return DB_PATH

# Alias for backwards compat
init_db = migrate_db

def now_iso():
    return datetime.now(timezone.utc).isoformat()

# ──────────────────────── Messages ────────────────────────

def save_message(role: str, content: str, session_id: str = None, metadata: dict = None, tokens: int = None):
    if tokens is None:
        tokens = _count_tokens(content)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT INTO messages (role, content, created, session_id, metadata, tokens) VALUES (?, ?, ?, ?, ?, ?)",
        (role, content, now_iso(), session_id or "", json.dumps(metadata or {}), tokens)
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

def get_total_tokens():
    conn = sqlite3.connect(DB_PATH)
    result = conn.execute("SELECT COALESCE(SUM(tokens), 0) FROM messages").fetchone()[0]
    conn.close()
    return int(result)

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

def get_task_by_key(task_key: str):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT * FROM tasks WHERE task_key = ?", (task_key,)).fetchone()
    conn.close()
    return dict(row) if row else None

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
    sessions = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
    conn.close()
    return {"messages": msgs, "tasks": tasks, "pulses": pulses, "sessions": sessions, "db_path": str(DB_PATH)}

# ── Sessions ────────────────────────

def create_session(session_id: str, title: str = None, metadata: dict = None):
    conn = sqlite3.connect(DB_PATH)
    title = title or "Untitled"
    created = now_iso()
    conn.execute(
        "INSERT INTO sessions (id, title, created_at, updated_at, metadata) VALUES (?, ?, ?, ?, ?)",
        (session_id, title, created, created, json.dumps(metadata or {}))
    )
    conn.commit()
    conn.close()

def get_sessions(limit: int = 100):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_session(session_id: str):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def update_session(session_id: str, title: str = None):
    conn = sqlite3.connect(DB_PATH)
    fields = []
    params = []
    if title is not None:
        fields.append("title = ?")
        params.append(title)
    fields.append("updated_at = ?")
    params.append(now_iso())
    params.append(session_id)
    conn.execute(f"UPDATE sessions SET {', '.join(fields)} WHERE id = ?", params)
    conn.commit()
    conn.close()

def delete_session(session_id: str):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
    conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    conn.commit()
    conn.close()

def get_messages_by_session(session_id: str, limit: int = 100):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM messages WHERE session_id = ? ORDER BY created ASC LIMIT ?",
        (session_id, limit)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def delete_message(msg_id: int):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DELETE FROM messages WHERE id = ?", (msg_id,))
    conn.commit()
    conn.close()

# ── Full-Text Search ────────────────────────

def search_messages(query: str, limit: int = 50):
    """Search messages via FTS5. Falls back to LIKE if FTS5 unavailable."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # Try FTS5 first
    try:
        rows = conn.execute(
            """SELECT m.id, m.role, m.content, m.created, m.session_id, m.tokens
               FROM messages_fts fts
               JOIN messages m ON m.id = fts.rowid
               WHERE messages_fts MATCH ?
               ORDER BY rank
               LIMIT ?""",
            (query, limit)
        ).fetchall()
    except Exception:
        # Fallback to LIKE
        rows = conn.execute(
            "SELECT id, role, content, created, session_id, tokens FROM messages WHERE content LIKE ? ORDER BY created DESC LIMIT ?",
            (f"%{query}%", limit)
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def rebuild_fts():
    """Rebuild the FTS5 index. Call after bulk inserts."""
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("INSERT INTO messages_fts(messages_fts) VALUES('rebuild')")
        conn.commit()
    except Exception as e:
        print(f"[db] fts rebuild error: {e}")
    finally:
        conn.close()

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
