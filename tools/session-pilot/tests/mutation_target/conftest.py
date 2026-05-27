"""Walk up to find server.py, add to sys.path for mutation tests."""
import sys
from pathlib import Path
current = Path(__file__).resolve().parent
for _ in range(6):
    if (current / "server.py").exists():
        sys.path.insert(0, str(current))
        break
    current = current.parent
