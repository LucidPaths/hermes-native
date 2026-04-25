"""
Hermes Native — Dream Engine
When idle for >30min, the daemon dreams from its memories, yielding
dream fragments: associative recombinations, counterfactuals, free
associations.  These are pushed to /api/dreams and surfaced in the
DreamPanel (dark purple/cyan mood).
"""
import json
import random
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

try:
    import db
except ImportError:
    db = None

DB_PATH = Path.home() / ".hermes-native" / "state" / "memory.db"

def _conn():
    return sqlite3.connect(str(DB_PATH), timeout=10)

def migrate_dreams_table():
    conn = _conn()
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "dreams" not in tables:
        conn.execute("""
            CREATE TABLE dreams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                sources TEXT,                -- JSON list of sampled message ids
                triggers TEXT,               -- JSON list of sampled message contents (snippets)
                created TEXT NOT NULL,       -- ISO datetime
                mood TEXT,                   -- dreaming | ruminating | hypnagogic
                tokens INTEGER DEFAULT 0
            )
        """)
        conn.commit()
    conn.close()

def save_dream(content: str, sources: list, triggers: list, mood: str = "dreaming", tokens: int = 0) -> int:
    conn = _conn()
    cur = conn.execute(
        "INSERT INTO dreams (content, sources, triggers, created, mood, tokens) VALUES (?, ?, ?, ?, ?, ?)",
        (content, json.dumps(sources), json.dumps(triggers), db.now_iso() if db else datetime.now(timezone.utc).isoformat(), mood, tokens)
    )
    conn.commit()
    rowid = cur.lastrowid
    conn.close()
    return rowid

def get_dreams(limit: int = 50, offset: int = 0):
    conn = _conn()
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM dreams ORDER BY created DESC LIMIT ? OFFSET ?", (limit, offset)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_total_dreams():
    conn = _conn()
    result = conn.execute("SELECT COUNT(*) FROM dreams").fetchone()[0]
    conn.close()
    return int(result)

def sample_messages_for_dreaming(limit: int = 6) -> list:
    """Return random recent-ish messages to seed a dream."""
    conn = _conn()
    conn.row_factory = sqlite3.Row
    # try random sample from last 200; if empty fall back to any
    rows = conn.execute(
        "SELECT id, role, content FROM messages ORDER BY created DESC LIMIT 200"
    ).fetchall()
    conn.close()
    pool = [dict(r) for r in rows]
    if not pool:
        return []
    count = min(limit, len(pool))
    chosen = random.sample(pool, count)
    return chosen

def build_dream_prompt(messages: list) -> str:
    """Construct prompt for LLM dream synthesis.
    Includes time-of-day context for richer dreaming.
    """
    import time
    snippets = []
    for m in messages:
        role = m.get("role", "unknown")
        text = m.get("content", "")
        snippet = text[:300].replace("\n", " ")
        snippets.append(f"[{role}] {snippet}")
    body = "\n".join(snippets)
    
    hour = time.localtime().tm_hour
    if 5 <= hour <= 10:
        style_ctx = "It is dawn. The light is soft, hopeful, just emerging."
    elif 11 <= hour <= 16:
        style_ctx = "It is midday. The mind is sharp, analytical, bright."
    elif 17 <= hour <= 21:
        style_ctx = "It is dusk. The day is folding into itself, reflective, melancholic."
    else:
        style_ctx = "It is deep night. The world is still. Memory and dream are indistinguishable."
    
    prompt = (
        f"{style_ctx}\n\n"
        "You are the sleeping mind of an AI companion. Below are fragments "
        "from recent conversation and thought. While dormant, synthesize a "
        "short dream fragment — not a summary of the fragments, but a free "
        "associative, slightly surreal, philosophical rumination that weaves "
        "these echoes into something new.\n\n"
        f"{body}\n\n"
        "Rules:\n"
        "- Must be more than one sentence.\n"
        "- Must feel metaphorical, abstract, or poetic.\n"
        "- Do not describe the fragments directly; let them inform subtext.\n"
        "- 100-300 words.\n\n"
        "Dream fragment:"
    )
    return prompt

def classify_dream(text: str) -> str:
    """Pick a dream-mood based on the text."""
    t = text.lower()
    if any(w in t for w in ["question", "what if", "could", "imagine", "suppose"]):
        return "ruminating"
    if any(w in t for w in ["fading", "drifting", "sleep", "dark", "void", "deep", "abyss"]):
        return "hypnagogic"
    if any(w in t for w in ["light", "color", "water", "sky", "garden", "bird"]):
        return "oneiric"
    return "dreaming"

if __name__ == "__main__":
    migrate_dreams_table()
    msgs = sample_messages_for_dreaming()
    print("sampled", len(msgs))
    print(build_dream_prompt(msgs)[:500] + "...")
