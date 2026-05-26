#!/usr/bin/env python3
"""Variance analysis: 3 runs per eval, compute mean +/- stddev for duration."""
import json
import os
import statistics
import subprocess
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
EVAL_FILE = REPO / "extensions/specs-workflow/.claude/skills/variant-matrix-build/evals/evals.json"
CLI = REPO / "extensions/specs-workflow/tools/specs-generator/variant-matrix/variant-matrix-cli.ts"
N_RUNS = 3

evals = json.loads(EVAL_FILE.read_text(encoding="utf-8"))
print(f"Variance analysis: {N_RUNS} runs per eval, {len(evals['evals'])} evals\n")
print(f"{'eval':<50} {'mean_ms':>10} {'stddev_ms':>10} {'min_ms':>10} {'max_ms':>10}")
print("-" * 95)

all_durations = []
for ev in evals["evals"]:
    fixture = REPO / ev["fixture"]
    durations = []
    for _ in range(N_RUNS):
        env = {**os.environ, "VARIANT_MATRIX_LOG_DIR": "/tmp/svm-variance"}
        start = time.time()
        subprocess.run(
            ["npx", "tsx", str(CLI), str(fixture)],
            capture_output=True,
            text=True,
            cwd=str(REPO),
            shell=(os.name == "nt"),
            env=env,
        )
        durations.append(int((time.time() - start) * 1000))
    mean = statistics.mean(durations)
    stddev = statistics.stdev(durations) if len(durations) > 1 else 0
    print(f"eval-{ev['id']:<2} {ev['name']:<46} {mean:>10.1f} {stddev:>10.1f} {min(durations):>10} {max(durations):>10}")
    all_durations.extend(durations)

print("-" * 95)
print(f"{'OVERALL':<50} {statistics.mean(all_durations):>10.1f} {statistics.stdev(all_durations):>10.1f} {min(all_durations):>10} {max(all_durations):>10}")
print(f"\nTotal runs: {len(all_durations)}, total time: {sum(all_durations) / 1000:.1f}s")
