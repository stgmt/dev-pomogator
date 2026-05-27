"""
pytest conftest — adds the parent directory (where server.py lives) to sys.path.

Needed because:
1. tests import `from server import ...`
2. mutmut copies tests to mutants/ subdirectory; relative parent.parent
   resolution there points to tests/ not tools/session-pilot/
3. conftest.py is auto-discovered by pytest and runs before test collection

Resolution: walk up looking for server.py — works whether tests are in
tests/ or tests/mutants/.
"""

import sys
from pathlib import Path


def _find_server_dir() -> Path | None:
    """Walk up from this file looking for server.py."""
    current = Path(__file__).resolve().parent
    for _ in range(5):  # at most 5 levels up
        if (current / "server.py").exists():
            return current
        current = current.parent
    return None


_server_dir = _find_server_dir()
if _server_dir and str(_server_dir) not in sys.path:
    sys.path.insert(0, str(_server_dir))
