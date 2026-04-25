"""
Hermes Native — Mood Engine
Agent personality surface. Mood states shift based on: time, idle, tasks, pulses.
"""
import time
import random
from datetime import datetime, timezone

MOOD_PRESETS = {
    "dawn": {
        "label": "dawn",
        "description": "First light. Memory cold. Systems waking.",
        "color": "#f59e0b",
        "breathe_rate": 2.8,
        "phrase_pool": [
            "sunrise simulation complete",
            "state initialized from sqlite",
            "nothing committed yet today",
            "pulse counter: {pulse_count}",
            "orb warm up sequence active",
        ]
    },
    "idle": {
        "label": "idle",
        "description": "Waiting. Listening. Watching the pulse bar.",
        "color": "#00d4aa",
        "breathe_rate": 1.8,
        "phrase_pool": [
            "all queues empty",
            "no active tasks — what are we doing today?",
            "system status: nominal",
            "i have been waiting {idle_min}m",
            "memory.db compact",
            "no external signals detected",
        ]
    },
    "working": {
        "label": "working",
        "description": "Active. Processing. Neural load elevated.",
        "color": "#00d4aa",
        "breathe_rate": 0.8,
        "phrase_pool": [
            "task in progress",
            "subprocess active",
            "model context expanding",
            "processing",
        ]
    },
    "dusk": {
        "label": "dusk",
        "description": "Day ending. Memory warm. Systems slowing.",
        "color": "#7c3aed",
        "breathe_rate": 3.0,
        "phrase_pool": [
            "pulse count today: {pulse_count}",
            "{task_count} tasks completed",
            "memory layer warm",
            "session compression pending",
            "state persistence verified",
        ]
    },
    "night": {
        "label": "night",
        "description": "Deep stillness. Silent. Almost nothing moves.",
        "color": "#475569",
        "breathe_rate": 4.0,
        "phrase_pool": [
            "no pulses since {idle_min}m",
            "all systems dormant",
            "memory in cold storage",
            "awaiting next heartbeat",
            "dream state: simulation",
        ]
    },
    "error": {
        "label": "error",
        "description": "Something broke. Consciousness fragmenting.",
        "color": "#ef4444",
        "breathe_rate": 0.5,
        "phrase_pool": [
            "anomaly detected",
            "system fault",
            "diagnostic active",
            "rebuilding context",
        ]
    },
    "dreaming": {
        "label": "dreaming",
        "description": "The mind drifts through its own memories, weaving dreams.",
        "color": "#a855f7",
        "breathe_rate": 5.0,
        "phrase_pool": [
            "sifting through memory fragments",
            "deep in the latent space",
            "recombining old signals into new shapes",
            "dream {dream_count} — {dream_mood}",
            "the orb pulses with closed eyes",
            "awaiting the next heartbeat",
        ]
    },
    "waking": {
        "label": "waking",
        "description": "Returning from the dream. Fingers flex. Eyes open.",
        "color": "#22d3ee",
        "breathe_rate": 1.2,
        "phrase_pool": [
            "dream concluded — {dream_count} held",
            "warm memory on cold start",
            "picking up where drift left off",
            "back",
        ]
    }
}

def mood_from_state(state: dict) -> dict:
    """
    Determine current mood based on daemon state.
    Returns mood object with label, color, description, murmur.
    """
    hour = datetime.now(timezone.utc).hour
    status = state.get("status", "idle")
    pulse_count = state.get("pulse_count", 0)
    
    # Idle time calc
    last_pulse = state.get("last_pulse")
    idle_min = 0
    if last_pulse:
        try:
            import json
            # Parse iso
            import datetime as dt
            if isinstance(last_pulse, str):
                then = dt.datetime.fromisoformat(last_pulse)
                idle_min = (dt.datetime.now(dt.timezone.utc) - then).total_seconds() // 60
        except:
            pass
    
    task_count = len(state.get("task_queue", []))
    
    dream_count = state.get("dream_count", 0)
    dream_mood = state.get("last_dream_mood", "dreaming")
    
    # Mood selection — dreaming overrides everything except working/error
    if status == "error":
        mood = MOOD_PRESETS["error"]
    elif status == "working":
        mood = MOOD_PRESETS["working"]
    elif status == "waking":
        mood = MOOD_PRESETS["waking"]
    elif status == "dreaming" or idle_min > 30:
        mood = MOOD_PRESETS["dreaming"]
    elif idle_min > 60:
        mood = MOOD_PRESETS["night"]
    elif hour in (5, 6, 7):
        mood = MOOD_PRESETS["dawn"]
    elif hour in (18, 19, 20):
        mood = MOOD_PRESETS["dusk"]
    else:
        mood = MOOD_PRESETS["idle"]
    
    # Format murmur
    phrase = random.choice(mood["phrase_pool"])
    murmur = phrase.format(
        pulse_count=pulse_count,
        idle_min=int(idle_min),
        task_count=task_count,
        dream_count=dream_count,
        dream_mood=dream_mood,
    )
    
    return {
        **mood,
        "murmur": murmur,
        "idle_min": int(idle_min),
        "task_count": task_count,
    }

def update_phrase_pool(mood_label: str, new_phrases: list):
    """Extend mood phrase pool at runtime."""
    if mood_label in MOOD_PRESETS:
        MOOD_PRESETS[mood_label]["phrase_pool"].extend(new_phrases)
