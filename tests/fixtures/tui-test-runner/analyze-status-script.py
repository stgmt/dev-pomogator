import json
import sys
from pathlib import Path

import yaml

payload = json.loads(sys.stdin.read())
sys.path.insert(0, str(Path(payload["package_root"]).resolve()))

from tui.models import TestStatus
from tui.analyst.output import analyze_status

status_path = Path(payload["status_file"])
status = TestStatus.from_dict(yaml.safe_load(status_path.read_text(encoding="utf-8")))
report = analyze_status(status, project_root=payload["project_root"], user_patterns_path=payload["user_patterns_path"])

print(json.dumps({
    "failed": report.failed,
    "pattern_ids": [card.matched_pattern.pattern.id if card.matched_pattern else None for card in report.failures],
}))
