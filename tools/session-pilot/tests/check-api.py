#!/usr/bin/env python3
import json
import urllib.request

with urllib.request.urlopen("http://127.0.0.1:8083/api/data", timeout=5) as r:
    data = json.load(r)

print(f"Total rows: {len(data['rows'])}")
print(f"Live Zellij sessions: {len(data['all_zellij_sessions'])}")
print()
print("--- dev-pomogator rows ---")
for row in [r for r in data["rows"] if r["repo"] == "dev-pomogator"]:
    flag = "🟢 LIVE" if row["claude_running_now"] else ("🟡 idle" if row["claude_last_modified"] else "—")
    print(f"  {flag}  {row['branch']:50s}  last_mod={row['claude_last_modified']}  jsonls={len(row['claude_sessions'])}")
    for s in row["claude_sessions"][:2]:
        print(f"      └ {s['uuid'][:12]}  age={s['age_sec']}s  src={s['source']}")
print()
print("--- ALL rows with claude_running_now=True ---")
running = [r for r in data["rows"] if r["claude_running_now"]]
for r in running:
    print(f"  🟢 {r['repo']:30s} {r['branch']:40s} last_mod={r['claude_last_modified']}")
if not running:
    print("  (none — current Claude session not detected, will diagnose)")
