"""
State persistence service — saves/restores TUI state (active tab, filter text).
Debounced YAML save (0.5s) to avoid excessive disk I/O.
Ported from zoho tui_test_explorer.adapter.state_service.
"""

import threading
import yaml
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Optional


@dataclass
class TuiState:
    """Serializable TUI state."""
    active_tab: str = "monitoring"
    filter_text: str = ""


class StateService:
    """Singleton state persistence with debounced YAML save."""

    _instance: Optional["StateService"] = None
    _lock = threading.Lock()

    def __new__(cls, state_file: Optional[str] = None) -> "StateService":
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self, state_file: Optional[str] = None) -> None:
        if self._initialized:
            return
        self._initialized = True
        self._state_file = Path(state_file) if state_file else None
        self._state = TuiState()
        self._save_timer: Optional[threading.Timer] = None
        self._save_lock = threading.Lock()
        self._load()

    def _load(self) -> None:
        """Load state from YAML file. Use defaults if missing/corrupted."""
        if not self._state_file or not self._state_file.exists():
            return
        try:
            data = yaml.safe_load(self._state_file.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                self._state = TuiState(
                    active_tab=data.get("active_tab", "monitoring"),
                    filter_text=data.get("filter_text", ""),
                )
        except Exception:
            # Corrupted file — use defaults
            self._state = TuiState()

    def _schedule_save(self) -> None:
        """Debounced save — cancel previous timer, start new 0.5s timer."""
        with self._save_lock:
            if self._save_timer:
                self._save_timer.cancel()
            self._save_timer = threading.Timer(0.5, self._do_save)
            self._save_timer.daemon = True
            self._save_timer.start()

    def _do_save(self) -> None:
        """Actually write state to YAML file."""
        if not self._state_file:
            return
        try:
            self._state_file.parent.mkdir(parents=True, exist_ok=True)
            self._state_file.write_text(
                yaml.dump(asdict(self._state), default_flow_style=False),
                encoding="utf-8",
            )
        except Exception:
            pass  # Non-critical — state persistence is best-effort

    @property
    def state(self) -> TuiState:
        return self._state

    def set_active_tab(self, tab_id: str) -> None:
        """Update active tab and schedule save."""
        self._state.active_tab = tab_id
        self._schedule_save()

    def set_filter_text(self, text: str) -> None:
        """Update filter text and schedule save."""
        self._state.filter_text = text
        self._schedule_save()

    def flush(self) -> None:
        """Force immediate save (call on app exit)."""
        with self._save_lock:
            if self._save_timer:
                self._save_timer.cancel()
                self._save_timer = None
        self._do_save()

    @classmethod
    def reset(cls) -> None:
        """Reset singleton (for testing)."""
        with cls._lock:
            if cls._instance and cls._instance._save_timer:
                cls._instance._save_timer.cancel()
            cls._instance = None
