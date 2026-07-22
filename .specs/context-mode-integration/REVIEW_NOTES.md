# Spec Review: context-mode-integration

**Generated:** 2026-07-21
**Updated:** 2026-07-22 after runtime wiring, executable BDD, and full canonical BDD evidence
**Scope:** implementation review + spec-reality-check + validate-spec + audit-spec + spec-verdict + filtered/full Docker BDD evidence.

## Summary

| Severity | Count | Verdict |
|----------|-------|---------|
| P0 | 0 | Clear |
| P1 | 0 | Clear |
| P2 | 3 | Known corpus/reality notes |
| P3 | 0 | Clear |

**Overall verdict:** READY for `context-mode-integration`. The feature now has runtime wiring, doctor coverage, docs, executable BDD, and canonical Docker BDD evidence for all 9 CTXMODE scenarios. The whole BDD corpus is still red for unrelated legacy hook/manifests scenarios, but this spec's canonical lane is green.

## Implemented Runtime Surface

| Area | Evidence |
|------|----------|
| SessionStart setup | `tools/context-mode-setup/setup.ts` emits fail-open Claude/Codex hook JSON, fires the non-interactive context-mode installer, preserves install guidance as fallback, uses a backoff lock, supports opt-out, and supports MCP-only mode. |
| Health model | `tools/context-mode-health/*` classifies install missing, config poisoning, process death, handshake, hook safety, Windows friction, and honest value boundary. |
| Hook distribution | `.claude-plugin/hooks.legacy.json`, `.Codex/hooks.json`, and `tools/hook-service/registry.json` include the context-mode setup target; generated `.claude-plugin/hooks.json` / `.claude/settings.json` route through `session-bootstrap.mjs`. |
| Doctor integration | `.claude/skills/pomogator-doctor/scripts/engine/checks/context-mode.ts` adds `C-CMODE`; fix mode can launch the same context-mode installer; `doctor.bundle.mjs` contains the bundled check. |
| BDD integration | `cucumber.json`, `context-mode-integration.feature`, `feature_context_mode_integration.ts`, and `tests/fixtures/context-mode/*` cover all 9 CTXMODE scenarios. |
| Docs/reporting | `docs/context-mode-integration.md` documents the install path and honest savings boundary. |

## Resolved Findings

| # | Previous issue | Resolution |
|---|----------------|------------|
| R-1 | 9 `SOURCE_ONLY` / pending BDD scenarios | `context-mode-integration.feature` is wired into `cucumber.json`, `@wip` markers were removed, and `tests/step_definitions/feature_context_mode_integration.ts` binds every CTXMODE step. |
| R-2 | Missing runtime modules | Added `tools/context-mode-setup/*` and `tools/context-mode-health/*`; setup hook and doctor bundle were smoke-tested. |
| R-3 | Missing real-shaped fixtures | Added registry, manifest, process, and hook fixtures under `tests/fixtures/context-mode/`. |
| R-4 | Hook registry snapshot drift after adding setup hook | Updated `tools/spec-graph/__tests__/__fixtures__/registry-parity/settings-hooks.snapshot.json`; `SPECGEN004_372` now passes in Docker. |
| R-5 | TASKS/FILE_CHANGES drift | FILE_CHANGES/TASKS/DESIGN now include the real runtime files, hook manifests, generated registry, and doctor bundle. |

## Remaining Notes

| # | Category | Location | Note |
|---|----------|----------|------|
| P2-1 | Whole-corpus failures outside this spec | `.dev-pomogator/.last-test-run.ndjson` | Full Docker BDD updated canonical coverage and CTXMODE passed 9/9. The whole corpus still has 28 failed, 1 undefined, and 1 pending scenario outside `context-mode-integration`, mostly legacy hook/manifest expectations around generated `.claude-plugin/hooks.json`. |
| P2-2 | Existing-code drift warnings | `spec-reality-check` | Reality-check reports 9 `CODE_DRIFT_FR_ALREADY_DONE` warnings because implementation files now exist. These are expected after implementation and are not readiness blockers. |
| P2-3 | Semantic lane skipped | `spec-verdict --no-semantic` | Semantic LLM drift check was intentionally skipped for local verification. Structural, traceability, execution, task-truth, and BDD-sync lanes are green. |

## Verification Evidence

- Setup hook smoke in `main`: `node --import tsx tools/context-mode-setup/setup.ts` with temp home => JSON `{ "continue": true, "additionalContext": ... }`, `.dev-pomogator/.context-mode-bootstrap.lock` created, and installer launcher captured `claude plugin marketplace add mksglu/context-mode && claude plugin install context-mode@context-mode -s user`.
- Doctor source smoke in `main`: direct `C-CMODE` check with `fix: true` reports `reinstallable: true`, `fixAction: context-mode-install`, `fixLaunched: true`, and captures the same installer invocation.
- `bash scripts/docker-bdd.sh --name "CTXMODE001_"` in `main` => 9 scenarios / 67 steps passed; filtered artifact `.dev-pomogator/.test-history/run-1784719477427-filtered.ndjson`.
- `bash scripts/docker-bdd.sh --name "SPECGEN004_372"` in `main` => 1 scenario / 6 steps passed after registry snapshot update.
- Full `bash scripts/docker-bdd.sh` in `main` => canonical `.dev-pomogator/.last-test-run.ndjson` updated; whole corpus summary: 1832 scenarios (28 failed, 1 undefined, 1 pending, 1802 passed), 10776 steps (28 failed, 6 undefined, 1 pending, 41 skipped, 10700 passed). All 9 `CTXMODE001_*` scenarios are `PASSED` in canonical NDJSON.
- `npm run lint` => exit 0.
- `npx tsx tools/specs-generator/validate-spec.ts -Path .specs/context-mode-integration` => 0 errors / 0 warnings.
- `npx tsx tools/specs-generator/audit-spec.ts -Path .specs/context-mode-integration` => 0 findings.
- `npx tsx .claude/skills/spec-reality-check/scripts/verify.ts .specs/context-mode-integration --format human` => 0 ERROR / 9 WARNING / 0 INFO.
- `npx tsx tools/specs-generator/spec-verdict.ts -Path .specs/context-mode-integration --no-semantic` => `OVERALL: READY`; `STRUCTURE`, `TRACEABILITY`, `EXECUTION`, `TASK_TRUTH`, `BDD_SYNC`, and `FILTERED_PROOF` are green; canonical coverage is `passed: 9` / `failed: 0` / `undefined: 0` / `not_run: 0`.
