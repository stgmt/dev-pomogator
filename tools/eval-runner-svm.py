#!/usr/bin/env python3
"""Iteration-2 eval runner для variant-matrix-build skill."""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
WS = REPO / "extensions/specs-workflow/.claude/skills/variant-matrix-build-workspace/iteration-2"
EVAL_FILE = REPO / "extensions/specs-workflow/.claude/skills/variant-matrix-build/evals/evals.json"
CLI = REPO / "extensions/specs-workflow/tools/specs-generator/variant-matrix/variant-matrix-cli.ts"

WS.mkdir(parents=True, exist_ok=True)
evals = json.loads(EVAL_FILE.read_text(encoding="utf-8"))

aggregate = {"total": 0, "passed": 0, "failed": 0, "details": []}

for ev in evals["evals"]:
    name = ev["name"]
    eval_dir = WS / f"eval-{ev['id']}-{name}"
    out_dir = eval_dir / "with_skill" / "outputs"
    out_dir.mkdir(parents=True, exist_ok=True)

    fixture = REPO / ev["fixture"]
    # Isolate JSONL log per-eval так чтобы fixtures не pollute repo.
    log_dir = eval_dir / "with_skill" / "log-dir"
    log_dir.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "VARIANT_MATRIX_LOG_DIR": str(log_dir)}
    start = time.time()
    proc = subprocess.run(
        ["npx", "tsx", str(CLI), str(fixture)],
        capture_output=True,
        text=True,
        cwd=str(REPO),
        encoding="utf-8",
        shell=(os.name == "nt"),
        env=env,
    )
    duration_ms = int((time.time() - start) * 1000)

    output = proc.stdout
    (out_dir / "audit-output.json").write_text(output, encoding="utf-8")
    (eval_dir / "with_skill" / "timing.json").write_text(
        json.dumps({"duration_ms": duration_ms}), encoding="utf-8"
    )

    try:
        parsed = json.loads(output)
        findings = parsed.get("findings", [])
    except Exception as e:
        findings = []
        print(f"[eval-{ev['id']}] PARSE ERROR: {e}, stdout={output[:200]}, stderr={proc.stderr[:300]}")

    actual_total = len(findings)
    actual_warning = sum(1 for f in findings if f.get("severity") == "WARNING")
    actual_info = sum(1 for f in findings if f.get("severity") == "INFO")
    actual_codes = sorted([f.get("code", "") for f in findings])
    expected_codes = sorted(ev["expected_codes"])

    has_triggers = all("triggers" in f for f in findings) if findings else True
    has_axis_when_polymorphic = all(
        "axis" in f or f.get("code") == "WARNING_REASON_TOO_SHORT"
        for f in findings
        if f.get("code")
        in ("AC_DECISION_TABLE_MISSING", "MATRIX_COMPLETE", "HARD_OUT_DETECTED", "ESCAPE_HATCH_USED")
    ) if findings else True

    expectations = [
        {
            "text": f"Total findings = {ev['expected_total']}",
            "passed": actual_total == ev["expected_total"],
            "evidence": f"actual={actual_total}",
        },
        {
            "text": f"WARNING count = {ev['expected_warning']}",
            "passed": actual_warning == ev["expected_warning"],
            "evidence": f"actual={actual_warning}",
        },
        {
            "text": f"INFO count = {ev['expected_info']}",
            "passed": actual_info == ev["expected_info"],
            "evidence": f"actual={actual_info}",
        },
        {
            "text": f"Finding codes = {expected_codes}",
            "passed": actual_codes == expected_codes,
            "evidence": f"actual={actual_codes}",
        },
        {
            "text": "All findings include `triggers` array",
            "passed": has_triggers,
            "evidence": "yes" if has_triggers else "missing in some findings",
        },
        {
            "text": "Polymorphic findings include `axis` field",
            "passed": has_axis_when_polymorphic,
            "evidence": "yes" if has_axis_when_polymorphic else "missing in some findings",
        },
    ]

    grading = {"expectations": expectations}
    (eval_dir / "grading.json").write_text(
        json.dumps(grading, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    passed = sum(1 for e in expectations if e["passed"])
    total = len(expectations)
    aggregate["total"] += total
    aggregate["passed"] += passed
    aggregate["failed"] += total - passed
    detail = {
        "id": ev["id"],
        "name": name,
        "passed": passed,
        "total": total,
        "duration_ms": duration_ms,
        "actual_codes": actual_codes,
        "expected_codes": expected_codes,
        "warning_count": actual_warning,
        "info_count": actual_info,
    }
    aggregate["details"].append(detail)
    status = "PASS" if passed == total else "FAIL"
    print(f"[eval-{ev['id']} {name}] {status} {passed}/{total} | {actual_warning}W/{actual_info}I | {duration_ms}ms")

(WS / "aggregate.json").write_text(
    json.dumps(aggregate, ensure_ascii=False, indent=2), encoding="utf-8"
)
print()
print(f"=== AGGREGATE iteration-2: {aggregate['passed']}/{aggregate['total']} assertions passed ===")
print(f"Workspace: {WS}")

# Exit non-zero if any failed
sys.exit(0 if aggregate["failed"] == 0 else 1)
