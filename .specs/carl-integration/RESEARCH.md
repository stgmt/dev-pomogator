# Research

## Research question and root-cause frame

How can dev-pomogator integrate CARL without confusing plugin registration, project deployment, runtime consumption, and producer provenance?

The evidence points to one causal chain rather than an isolated missing file: CARL was registered and dispatched, but the project-local manifest was not reliably deployed; stale project-root selection then made valid projects appear `project-missing`; static registration checks also went stale after the HTTP dispatcher moved targets into the hook-service registry. The integration must therefore make event-root selection, deployment completion, executable consumer proof, and provenance explicit independent gates.

## Scope context

The current repository has **60 open issues**. CARL-specific open issues include #128, #130, #173, #203, #205, and #206. This is context for evidence drift and operational exposure, not proof that every issue is part of this spec.

Evidence: [cmd:GitHub open-issue query for stgmt/dev-pomogator returned total_count=60 on 2026-07-27].

## Root-cause evidence

### 1. Registered consumer without reliable project deployment — VERIFIED history, current state requires replay

Merged PR #202 states that CARL was already registered through `.claude-plugin/hooks.json` → `tools/hook-service/session-bootstrap.mjs` → the local hook service → `tools/hook-service/registry.json` → `tools/carl/runner.ts`, but project CARL state “did not deploy”. The repair added automatic first deployment while retaining explicit repair for existing managed artifacts. The same PR records four chained defects: stale registration lookup, an extra `node` token in the legacy doctor command, bundled-module main-guards firing during unrelated execution, and a race that truncated work at the ten-second banner timeout.

PR #94 independently reports automatic Russian adaptation and SessionStart bootstrap, with a real SessionStart/UserPromptSubmit smoke claim and three Docker BDD scenarios. PR #97 reports the managed rule diet and a 1695-scenario full Docker BDD run. These are historical claims and do not remove the current ambiguity: PR #202's merged state must be replayed against the currently installed/plugin-distributed artifact, not accepted merely because its body says “fixed”.

Evidence: [src:https://github.com/stgmt/dev-pomogator/pull/202], [src:https://github.com/stgmt/dev-pomogator/pull/94], [src:https://github.com/stgmt/dev-pomogator/pull/97].

### 2. Wrong project selected by stale `CARL_PROJECT_DIR` — VERIFIED

Issue #128 reports `project-missing` from a subfolder because root selection did not reliably locate the repository project marker. Issue #130 shows a settings-injected `CARL_PROJECT_DIR` pointing at `C:\repos\lm-saas` while the event was under `C:\repos\lm-saas\source-code\AiPomogator`; upward walking could select an unrelated project. Issue #203 reproduces a cross-drive mismatch where `CARL_PROJECT_DIR=C:\repos\lm-saas` was selected while the event `cwd` and valid manifest were `E:\repos\lm-saas`. Issue #205 reports multiple candidate `.carl/carl.json` locations selected from the wrong project context. Issue #206 describes the same stale override precedence and proposes event `input.cwd` as primary, with an override only when it resolves to a valid `.carl` marker.

This is the causal root for the observed “project CARL exists but session says project-missing” symptom: an environment/settings path can redirect lookup before the event's project is considered. Final precedence semantics remain an implementation decision, not a Discovery fact.

Evidence: [src:https://github.com/stgmt/dev-pomogator/issues/128], [src:https://github.com/stgmt/dev-pomogator/issues/130], [src:https://github.com/stgmt/dev-pomogator/issues/203], [src:https://github.com/stgmt/dev-pomogator/issues/205], [src:https://github.com/stgmt/dev-pomogator/issues/206].

### 3. Static hook grep missed live registry route — VERIFIED

The current registry routes `UserPromptSubmit/0/0` to `tools/carl/runner.ts`. The canonical plugin manifest starts SessionStart with `tools/hook-service/session-bootstrap.mjs`, while HTTP dispatch targets live in the registry. PR #202 explicitly says that grepping only `hooks.json` could not prove registration after the HTTP dispatcher migration; manifest reporting was changed to inspect both legacy direct commands and the live registry.

Evidence: [ref:tools/hook-service/registry.json:307-313], [ref:.claude-plugin/hooks.json:3-11], [ref:tools/carl/manifest.ts:340-389], [src:https://github.com/stgmt/dev-pomogator/pull/202].

### 4. Runtime consumer and fail-open contract — VERIFIED locally, external transport boundary open

`tools/carl/runner.ts` is builtins-only and emits `hookSpecificOutput.additionalContext`. Its controlled failure path maps missing, timeout, malformed, unsupported, and exception modes to diagnostics, includes the load-bearing warning `CARL did not run; tell the user CARL guidance/recall was unavailable.`, and exits with status zero. The manifest updates runtime status only when the runner can verify the packaged command; the review report keeps a fake-green block while project execution is unverified.

Evidence: [ref:tools/carl/runner.ts:1-16], [ref:tools/carl/runner.ts:70-110], [ref:tools/carl/runner.ts:184-259], [ref:tools/carl/manifest.ts:340-440]. The exact Claude Code agent-visible transport and a clean installed-plugin dependency-absent run remain audit gates.

### 5. Managed ownership and doctor repair — VERIFIED locally, adaptation failure currently swallowed

The installer writes a deterministic managed key, checks whether an existing owner is different, returns `user-conflict`, and uses atomic JSON writes. However, `install.ts` catches `applyContextDiet` and `adaptProject` exceptions, converts them to `null`, and still returns `ok: true` with an `installed`/`repaired` status. This means a failed adaptation can be reported as successful deployment. The Discovery contract must require explicit degraded/adaptation-failed evidence rather than treating `adaptation: null` as readiness.

Evidence: [ref:tools/carl/install.ts:133-213]. Exact byte-for-byte preservation across every doctor path still requires executable BDD proof.

### 6. Codex sequencing is separate from Claude Code — VERIFIED locally

The CARL manifest evaluates Codex prerequisites independently: context-menu launcher, Codex plugin manifest, and deterministic version-aware hook dispatcher. Missing prerequisites produce `codex-deferred-prerequisite`; the Claude Code path is evaluated separately. This preserves the existing Codex/context-menu sequencing rule and forbids ad-hoc copied Claude Code hooks.

Evidence: [ref:tools/carl/manifest.ts:257-301], [src:https://github.com/stgmt/dev-pomogator/issues/173]. Version capability semantics and a fully ready Codex producer path remain implementation/audit scope.

## Graph/spec versus executable evidence drift

The current spec-level CARL feature contains 12 scenarios (`CARL001_01` through `CARL001_12`). The executable `tests/features/carl-integration.feature` adds `CARL001_13`, `CARL001_14`, and `CARL001_15`, so the executable inventory has 15 named scenarios. The audit's current graph census says 9 FR, 9 AC, and 12 scenario/task units, while the executable feature has 15; these counts are not interchangeable and must be reconciled before any coverage green claim. In addition, the current spec inventory says 9 FR, 9 AC, and 10/10 coverage in one summary while task history contains 12 CARL IDs; this is evidence of stale or mixed snapshots, not proof of completeness.

Evidence: [ref:.specs/carl-integration/carl-integration.feature:1-119], [ref:tests/features/carl-integration.feature:1-148], [ref:.specs/carl-integration/AUDIT_REPORT.md:1-85], [ref:.specs/carl-integration/README.md:1-51].

## External producer and benchmark evidence

### Sibling fixture — VERIFIED as captured output, NOT VERIFIED as dev-pomogator ownership

The repository includes a CARL fixture ledger with a captured sibling producer at `E:/repos/presentation-reels`. The captured smoke output reports `CARL OK`, `domains=116`, `neutral_chars=691`, and loaded domains including `CORE__DONT_BLAME_INFRA_BEFORE_TRACING` and `CORE__REPRODUCE_NOT_THEORIZE`. The benchmark output reports `old_bulk_autoload_chars=683575`, `iterations=5`, and five prompt rows with latency/context/loaded-domain summaries.

Evidence: [ref:tests/fixtures/carl/manifest.json], [ref:tests/fixtures/carl/smoke.stdout.txt], [ref:tests/fixtures/carl/bench.stdout.tsv], [ref:tests/fixtures/carl/real-output/README.md]. These prove producer shape and captured measurements only. The source/vendor relationship, license, and dev-pomogator plugin-distributed runtime remain `[NEEDS_CONFIRMATION]`/`[UNVERIFIED]`; they cannot establish dev-pomogator readiness.

### Benchmark policy — VERIFIED contract, threshold UNVERIFIED

`tools/carl/bench.ts` is designed to remain `draft-no-real-artifact` when provenance is incomplete. Numeric thresholds must not be invented from the sibling rows. A future baseline must cite the artifact provenance, source hashes, producer ground truth, and only metrics actually supported by the producer output.

Evidence: [ref:tools/carl/bench.ts:1-40], [ref:tests/fixtures/carl/bench.stdout.tsv], [src:https://github.com/stgmt/dev-pomogator/blob/main/tools/carl/bench.ts].

## Russian recall and context-diet findings

PR #94 establishes historical intent for auto-adaptation and Russian aliases; PR #97 establishes the managed lazy-rule diet and its large BDD verification run. The current adapter/runner design keeps Russian coverage explicit in `.carl/carl.json`: `project-language-missing`, `project-language-stale`, `partial`, or `ready`, with source hashes, generated aliases, and `needsAliasSources`. The sibling fixture demonstrates Russian prompt rows, but it is not evidence that dev-pomogator's project runtime loads the same domains.

The observed project output `lazy-managed; reduction=21562->4239` demonstrates a measurable context-diet optimization lane, but issue #203 simultaneously reports `project-missing`. Context reduction must therefore never upgrade runtime health, producer readiness, or benchmark status. Russian evaluation must report expected/actual domains, false positives, false negatives, and concrete alias/normalization/ranking/domain-splitting/context-budget recommendations.

Evidence: [src:https://github.com/stgmt/dev-pomogator/pull/94], [src:https://github.com/stgmt/dev-pomogator/pull/97], [src:https://github.com/stgmt/dev-pomogator/issues/203], [src:https://github.com/stgmt/dev-pomogator/pull/202], [ref:tools/carl/adapt-rules.ts:1-40], [ref:tools/carl/context-diet.ts:1-30].

## Research matrix

| Claim | Evidence | Status | Consequence |
|---|---|---|---|
| Canonical plugin starts CARL bootstrap | `.claude-plugin/hooks.json`, PR #202 | [VERIFIED history/current shape] | Replay the real SessionStart chain. |
| UserPromptSubmit routes to runner | `tools/hook-service/registry.json` | [VERIFIED current source] | Test registry-backed runtime consumption. |
| Project CARL deployment is required | PR #202, issue #173 | [VERIFIED history] | Separate install from registration. |
| Stale `CARL_PROJECT_DIR` causes wrong-root/project-missing | issues #128/#130/#203/#206 | [VERIFIED] | Define and test event-root precedence. |
| Runner fail-open warning shape | `tools/carl/runner.ts` | [VERIFIED locally] | Exercise real output and exit status. |
| User-owned config preservation | `tools/carl/install.ts` | [VERIFIED locally] | Add byte-preservation and conflict BDD. |
| Install adaptation errors are surfaced | `tools/carl/install.ts` catches them | [NOT VERIFIED; current code swallows] | Fix or explicitly gate readiness on adaptation result. |
| Codex prerequisite gate | `tools/carl/manifest.ts`, issue #173 | [VERIFIED locally] | Keep Codex independent and deferred when needed. |
| Sibling producer output shape | CARL fixture files | [VERIFIED captured output] | Use only as fixture-backed evidence. |
| Sibling source/vendor relationship | fixture manifest/research | [NEEDS_CONFIRMATION] | Do not claim dev-pomogator runtime readiness. |
| Agent-visible transport semantics | runner/local contract | [UNVERIFIED external boundary] | Prove through installed-plugin hook execution. |
| Numeric recall threshold | no approved real baseline | [UNVERIFIED] | Keep benchmark draft/blocked. |
| Final project-root precedence | issue proposals, not accepted contract | [UNVERIFIED] | Resolve before closing implementation. |
| Graph census equals executable census | 9/9/12/12 versus 15 executable | [FALSE / DRIFTED] | Reconcile graph, feature, task, and result inventories. |
| Dependency-absent installed-plugin path | no captured proof | [UNVERIFIED] | Run deps-absent test; silent skip is failure. |

## Discovery conclusions

1. The primary failure is causal: registered CARL did not reliably imply deployed project CARL, and stale root selection could make deployment appear absent.
2. The live runtime path is registry-backed; file greps and static manifests are insufficient proof after HTTP dispatch migration.
3. Install currently catches adaptation errors and may still return a successful status; adaptation readiness must be explicit.
4. Project-local deployment, runtime-consumer execution, fail-open disclosure, doctor ownership safety, Codex gating, and producer provenance must be separate evidence lanes.
5. The sibling fixture is valuable real producer-shape evidence but cannot be promoted to dev-pomogator-owned runtime evidence without source/vendor proof and a dependency-absent installed-plugin run.
6. The graph/spec census is stale or mixed: 9 FR, 9 AC, 12/12 units versus 15 executable CARL scenarios. This is a reconciliation blocker, not a green coverage result.
7. Context-diet reduction and Russian alias coverage are optimization/evaluation outputs, not health or readiness proofs.
8. Implementation must preserve the current explicit non-green states: `project-missing`, `missing-runtime`, `broken-runtime`, `unsupported`, `user-conflict`, `codex-deferred-prerequisite`, `draft-no-real-artifact`, and fake-green blocking.

## Discovery boundary

Discovery is complete for the causal model and evidence inventory. It deliberately does not assert final root-precedence semantics, dev-pomogator ownership of the external CARL producer, clean installed-plugin dependency-absent proof, adaptation-success propagation, reconciled graph/executable census, or numeric benchmark thresholds. Those remain Requirements/Implementation/Audit gates.
