import json
import sys
from pathlib import Path

payload = json.loads(sys.stdin.read())
sys.path.insert(0, str(Path(payload["package_root"]).resolve()))

from tui.log_reader import LogReader

reader = LogReader(payload["log_file"])
print(json.dumps({"lines": reader.read_new_lines()}))
