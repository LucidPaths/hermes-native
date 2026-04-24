"""
Hermes Native — Plugin System
Extensible hooks at key lifecycle points.
"""
import json
from pathlib import Path
import time

PLUGINS_DIR = Path.home() / ".hermes-native" / "plugins"
PLUGINS_DIR.mkdir(parents=True, exist_ok=True)

class PluginRegistry:
    """Lightweight plugin system. Plugins are Python modules loaded from ~/.hermes-native/plugins/."""
    
    def __init__(self):
        self.hooks = {
            "pre_chat": [],
            "post_chat": [],
            "pre_task": [],
            "post_task": [],
            "on_pulse": [],
            "on_mood_change": [],
            "on_notification": [],
        }
        self._load_all()
    
    def _load_all(self):
        """Auto-discover plugins from plugins dir."""
        for f in PLUGINS_DIR.glob("*.py"):
            try:
                self._load_plugin(f)
            except Exception as e:
                print(f"[plugin] failed to load {f.name}: {e}")
    
    def _load_plugin(self, path: Path):
        import importlib.util
        spec = importlib.util.spec_from_file_location(path.stem, path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        
        # Register hooks
        for hook_name in self.hooks.keys():
            fn = getattr(mod, hook_name, None)
            if callable(fn):
                self.hooks[hook_name].append(fn)
                print(f"[plugin] {path.stem} → {hook_name}")
    
    def run(self, hook_name: str, **kwargs) -> list:
        """Execute all plugins for a hook. Returns list of results."""
        results = []
        for fn in self.hooks.get(hook_name, []):
            try:
                result = fn(**kwargs)
                if result is not None:
                    results.append(result)
            except Exception as e:
                print(f"[plugin] {hook_name} error: {e}")
        return results

# Global singleton
_registry = None

def get_registry():
    global _registry
    if _registry is None:
        _registry = PluginRegistry()
    return _registry
