#!/usr/bin/env python3
"""Iteration-1 eval runner для architecture-decision-builder skill.

Host-run (no Docker). Reads evals.json, spawns `npx tsx architecture-decision-cli.ts`
per case, grades JSON output against expectations, writes grading.json + aggregate.json.
detect-axes cases use static PRD fixtures; audit cases write temp AXIS-*.md from setup_axes.
"""
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SKILL = REPO / ".claude/skills/architecture-decision-builder"
EVAL_FILE = SKILL / "evals/evals.json"
WS = SKILL / "evals/iterations/iteration-1"
CLI = REPO / "extensions/specs-workflow/tools/specs-generator/architecture-decision/architecture-decision-cli.ts"

WS.mkdir(parents=True, exist_ok=True)
evals = json.loads(EVAL_FILE.read_text(encoding="utf-8"))
aggregate = {"total": 0, "passed": 0, "failed": 0, "details": []}


def run_cli(args, log_dir):
    env = {**os.environ, "ARCHITECTURE_LOG_DIR": str(log_dir)}
    proc = subprocess.run(
        ["npx", "tsx", str(CLI), *args],
        capture_output=True, text=True, cwd=str(REPO),
        encoding="utf-8", shell=(os.name == "nt"), env=env,
    )
    return proc


def write_setup_axes(spec_dir: Path, setup_axes):
    spec_dir.mkdir(parents=True, exist_ok=True)
    for ax in setup_axes:
        chosen = ax.get("chosen", "null")
        body = f"---\naxis_id: {ax['id']}\nstatus: {ax['status']}\nchosen: {chosen}\n---\n# {ax['id']} axis\n"
        if "escape" in ax:
            body += f"\n[skip-architecture-axis: {ax['escape']}]\n"
        (spec_dir / f"AXIS-{ax['id']}.md").write_text(body, encoding="utf-8")


def write_ledger(spec_dir: Path, setup_ledger):
    """FR-12: write COMPLETENESS.md ledger table from setup_ledger rows."""
    spec_dir.mkdir(parents=True, exist_ok=True)
    lines = ["# Completeness ledger\n", "| dimension | status | reason |", "|---|---|---|"]
    for row in setup_ledger:
        lines.append(f"| {row['dimension']} | {row['status']} | {row.get('reason', '—')} |")
    body = "\n".join(lines) + "\n"
    for esc in [r for r in setup_ledger if "escape" in r]:
        body += f"\n[skip-completeness-dimension: {esc['escape']}]\n"
    (spec_dir / "COMPLETENESS.md").write_text(body, encoding="utf-8")


def grade_detect(output, expect):
    parsed = json.loads(output)
    exps = []
    if "axes_detected_min" in expect:
        exps.append({
            "text": f"axes_detected >= {expect['axes_detected_min']}",
            "passed": parsed.get("axes_detected", 0) >= expect["axes_detected_min"],
            "evidence": f"actual={parsed.get('axes_detected')}",
        })
    if "axes_detected" in expect:
        exps.append({
            "text": f"axes_detected == {expect['axes_detected']}",
            "passed": parsed.get("axes_detected") == expect["axes_detected"],
            "evidence": f"actual={parsed.get('axes_detected')}",
        })
    if "skipped_contains" in expect:
        sr = parsed.get("skipped_reason", "") or ""
        exps.append({
            "text": f"skipped_reason contains '{expect['skipped_contains']}'",
            "passed": expect["skipped_contains"] in sr,
            "evidence": f"actual={sr!r}",
        })
    if "categories_include" in expect:
        cats = {a.get("category") for a in parsed.get("axes", [])}
        for want in expect["categories_include"]:
            exps.append({
                "text": f"axes include category '{want}'",
                "passed": want in cats,
                "evidence": f"actual_categories={sorted(c for c in cats if c)}",
            })
    return exps


def grade_synthesis(output, expect):
    """FR-13: insights_count + rejected_count from synthesis output."""
    parsed = json.loads(output)
    exps = []
    if "insights_count" in expect:
        exps.append({
            "text": f"insights_count == {expect['insights_count']}",
            "passed": parsed.get("insights_count") == expect["insights_count"],
            "evidence": f"actual={parsed.get('insights_count')}",
        })
    if "rejected_count" in expect:
        rc = len(parsed.get("rejected", []))
        exps.append({
            "text": f"rejected_count == {expect['rejected_count']}",
            "passed": rc == expect["rejected_count"],
            "evidence": f"actual={rc}; reasons={[r.get('reason') for r in parsed.get('rejected', [])]}",
        })
    return exps


def grade_policy(recommended_by_policy, expect):
    """FR-16: recommended variant id differs per selected_policy."""
    exps = []
    for policy, want in expect["recommended_by_policy"].items():
        got = recommended_by_policy.get(policy)
        exps.append({
            "text": f"policy '{policy}' → recommended '{want}'",
            "passed": got == want,
            "evidence": f"actual={got}",
        })
    # cross-check: the recommendations actually differ (policy is doing work, not constant)
    distinct = set(recommended_by_policy.values())
    exps.append({
        "text": "recommendations differ across policies",
        "passed": len(distinct) > 1,
        "evidence": f"recommended_by_policy={recommended_by_policy}",
    })
    return exps


def grade_audit(output, expect):
    parsed = json.loads(output)
    findings = parsed.get("findings", [])
    codes = sorted(f.get("code", "") for f in findings)
    warning = sum(1 for f in findings if f.get("severity") == "WARNING")
    info = sum(1 for f in findings if f.get("severity") == "INFO")
    exps = [{
        "text": f"codes == {sorted(expect['codes'])}",
        "passed": codes == sorted(expect["codes"]),
        "evidence": f"actual={codes}",
    }]
    if "warning" in expect:
        exps.append({"text": f"WARNING == {expect['warning']}", "passed": warning == expect["warning"], "evidence": f"actual={warning}"})
    if "info" in expect:
        exps.append({"text": f"INFO == {expect['info']}", "passed": info == expect["info"], "evidence": f"actual={info}"})
    return exps


for ev in evals["evals"]:
    eval_dir = WS / f"eval-{ev['id']}-{ev['name']}"
    eval_dir.mkdir(parents=True, exist_ok=True)
    log_dir = eval_dir / "log-dir"
    log_dir.mkdir(parents=True, exist_ok=True)

    start = time.time()
    try:
        if ev["command"] == "detect-axes":
            proc = run_cli(["detect-axes", str(REPO / ev["fixture"])], log_dir)
            output = proc.stdout
            exps = grade_detect(output, ev["expect"])
        elif ev["command"] == "audit":
            spec_dir = Path(tempfile.mkdtemp(prefix=f"adb-eval-{ev['id']}-"))
            write_setup_axes(spec_dir, ev["setup_axes"])
            proc = run_cli(["audit", str(spec_dir)], log_dir)
            output = proc.stdout
            exps = grade_audit(output, ev["expect"])
        elif ev["command"] == "audit-completeness":
            spec_dir = Path(tempfile.mkdtemp(prefix=f"adb-eval-{ev['id']}-"))
            write_ledger(spec_dir, ev["setup_ledger"])
            proc = run_cli(["audit-completeness", str(spec_dir)], log_dir)
            output = proc.stdout
            exps = grade_audit(output, ev["expect"])
        elif ev["command"] == "synthesis":
            spec_dir = Path(tempfile.mkdtemp(prefix=f"adb-eval-{ev['id']}-"))
            write_setup_axes(spec_dir, ev["setup_axes"])
            insights_path = spec_dir / "insights.json"
            insights_path.write_text(json.dumps(ev["insights"]), encoding="utf-8")
            proc = run_cli(["synthesis", str(spec_dir), str(insights_path)], log_dir)
            output = proc.stdout
            exps = grade_synthesis(output, ev["expect"])
        elif ev["command"] == "generate-axis-policy":
            # FR-16: render the same axis under each policy, read recommended id from md frontmatter.
            recommended_by_policy = {}
            for policy in ev["expect"]["recommended_by_policy"]:
                pdir = Path(tempfile.mkdtemp(prefix=f"adb-eval-{ev['id']}-{policy}-"))
                model = {**ev["axis_model"], "selected_policy": policy}
                model_path = pdir / "axis-model.json"
                model_path.write_text(json.dumps(model), encoding="utf-8")
                proc = run_cli(["generate-axis", str(model_path), str(pdir)], log_dir)
                md = (pdir / f"AXIS-{model['axis_id']}.md").read_text(encoding="utf-8")
                m = [ln for ln in md.splitlines() if ln.startswith("recommended:")]
                recommended_by_policy[policy] = m[0].split(":", 1)[1].strip() if m else None
            output = json.dumps({"recommended_by_policy": recommended_by_policy})
            exps = grade_policy(recommended_by_policy, ev["expect"])
        else:
            raise ValueError(f"unknown command {ev['command']}")
    except Exception as e:
        output = locals().get("proc").stdout if locals().get("proc") else ""
        exps = [{"text": "no exception", "passed": False, "evidence": f"{type(e).__name__}: {e}; stderr={locals().get('proc').stderr[:200] if locals().get('proc') else ''}"}]

    duration_ms = int((time.time() - start) * 1000)
    (eval_dir / "output.json").write_text(output or "", encoding="utf-8")
    (eval_dir / "grading.json").write_text(json.dumps({"expectations": exps}, ensure_ascii=False, indent=2), encoding="utf-8")

    passed = sum(1 for e in exps if e["passed"])
    total = len(exps)
    aggregate["total"] += total
    aggregate["passed"] += passed
    aggregate["failed"] += total - passed
    aggregate["details"].append({"id": ev["id"], "name": ev["name"], "passed": passed, "total": total, "duration_ms": duration_ms})
    status = "PASS" if passed == total else "FAIL"
    print(f"[eval-{ev['id']} {ev['name']}] {status} {passed}/{total} | {duration_ms}ms")
    if passed != total:
        for e in exps:
            if not e["passed"]:
                print(f"    ✗ {e['text']} — {e['evidence']}")

(WS / "aggregate.json").write_text(json.dumps(aggregate, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"\n=== AGGREGATE iteration-1: {aggregate['passed']}/{aggregate['total']} assertions passed ===")
sys.exit(0 if aggregate["failed"] == 0 else 1)
