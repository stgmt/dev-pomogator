# CARL real runtime fixture capture

Captured on: 2026-07-07
Source repo: `E:/repos/presentation-reels`
Purpose: anchor the dev-pomogator `carl-integration` spec to real CARL producer output instead of hand-built fixtures.

## What was captured

The fixture set records a real CARL hook implementation and benchmark from the sibling `presentation-reels` repository:

- `manifest.json` — capture provenance, source hashes, hook commands, status codes, byte counts, and loaded-domain summaries.
- `smoke.stdout.txt` / `smoke.stderr.txt` — real smoke script output from `node scripts/carl/smoke-carl-hooks.mjs`.
- `bench.stdout.tsv` / `bench.stderr.txt` — real benchmark output from `node scripts/carl/bench-carl-hooks.mjs`.
- `claude-neutral.*`, `claude-debug.*`, `codex-debug.*` — real hook inputs, stdout JSON, stderr, and extracted `hookSpecificOutput.additionalContext` samples.
- `real-output/README.md` — detailed provenance and ground-truth ledger.
- `broken-runtime/README.md` — induced-failure fixture policy for future fail-open tests.

## Ground truth summary

Real smoke output:

- `CARL smoke OK`
- `domains=116`
- neutral Claude prompt: `691` context chars, only `[GLOBAL] always_on (2 rules)` loaded.
- debug Claude prompt: loads `[GLOBAL]`, `[CORE__DONT_BLAME_INFRA_BEFORE_TRACING]`, and `[CORE__REPRODUCE_NOT_THEORIZE]`.
- debug Codex prompt: loads `[GLOBAL]` and `[CORE__REPRODUCE_NOT_THEORIZE]`.

Real benchmark output:

- `old_bulk_autoload_chars=683575`
- `iterations=5`
- `neutral-continue`: p50 `409.7ms`, p95 `411.0ms`, `691` chars, threshold `<=2000`.
- `ru-debug-root-cause`: p50 `419.2ms`, p95 `439.8ms`, `20557` chars, threshold `<=25000`.
- `render-legibility`: p50 `398.7ms`, p95 `398.8ms`, `44524` chars, threshold `<=50000`.
- `feature-index`: p50 `393.7ms`, p95 `407.7ms`, `17169` chars, threshold `<=35000`.
- `codex-ru-debug`: p50 `399.4ms`, p95 `409.6ms`, `9155` chars, threshold `<=15000`.

## Important limits

This capture proves the CARL output shape and benchmark behavior of the local sibling `presentation-reels` CARL implementation. It does **not** prove dev-pomogator has packaged, installed, or wired CARL yet.

The captured CARL source artifacts were untracked in `presentation-reels` at capture time (`.carl/`, `.claude/hooks/carl-hook.py`, `.codex/`, `scripts/carl/`). Therefore implementation still needs an explicit source/vendor decision before dev-pomogator can treat those artifacts as accepted product code.

Do not use these files to claim CARL is healthy in dev-pomogator. They are provenance for implementation and regression tests only.
