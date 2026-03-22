import json
import sys
from pathlib import Path

import yaml

payload = json.loads(sys.stdin.read())
sys.path.insert(0, str(Path(payload["package_root"]).resolve()))

from tui.models import TestStatus

try:
    TestStatus.from_dict(yaml.safe_load(Path(payload["status_file"]).read_text(encoding="utf-8")))
    print(json.dumps({"accepted": True}))
except ValueError:
    print(json.dumps({"accepted": False}))
