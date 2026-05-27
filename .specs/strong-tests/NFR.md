# Non-Functional Requirements (NFR)

## Performance

- **NFR-P1: Mutation run budget.** Default scope for mutation runs SHALL be single-file (not whole project) to stay under 5min wall-clock for typical TS modules. For runs >2min skill SHALL instruct the caller to use `run_in_background: true` per `.claude/rules/pomogator/no-blocking-on-tests.md`. Persistent log via `tee` to `.dev-pomogator/.strong-tests-logs/run-EPOCH.log (EPOCH = unix epoch seconds)` so output survives capture drops.
- **NFR-P2: Audit scan throughput.** Anti-pattern grep scan SHALL process ≥100 test files in ≤10s on commodity hardware (single-pass ripgrep with pre-compiled regex set).
- **NFR-P3: Self-eval overhead.** 12-point self-eval SHALL add ≤5s to skill execution time (pure markdown emission, no external tool invocation in the eval step itself).

## Security

- **NFR-S1: No secrets in mutation logs.** `run-mutation.ts` SHALL NOT log file contents that match secret patterns (API keys, tokens) to the persistent log file. The log captures tool exit code + mutation summary + survivor file:line references only — never source-code snippets containing matched secrets.
- **NFR-S2: Sandboxed Bash invocations.** Mutation tool invocations via `Bash` tool SHALL use exact command strings (no shell interpolation of untrusted inputs). Target paths SHALL be `path.resolve`-d and verified to stay within the project root per `.claude/rules/no-unvalidated-manifest-paths.md`.
- **NFR-S3: Skill cannot auto-install.** Skill SHALL NOT execute `npm install` / `pip install` / package manager commands without explicit user confirmation via `AskUserQuestion`. Install commands are emitted as text suggestions only.

## Reliability

- **NFR-R1: Graceful tool-missing.** When the auto-detected stack's mutation tool is not installed (e.g., Stryker missing from devDeps), skill SHALL fall back to AI-driven manual mutation per the 8-category catalogue rather than failing.
- **NFR-R2: Idempotent re-invocation.** Re-invoking the skill on the same target with the same mode SHALL produce identical findings (modulo non-deterministic mutation tool seeding — flag those cases in output).
- **NFR-R3: Equivalent-mutant tolerance.** Skill SHALL flag suspicious survivors with `[EQUIVALENT_SUSPECT]` marker (per Meta ACH equivalence detector pattern) rather than treating them as kill-rate failures. Default heuristic: if a survivor's diff is purely cosmetic (whitespace, redundant cast, dead code removal) → mark equivalent-suspect for human review.
- **NFR-R4: Max-iter safety.** Mutation-feedback loop SHALL have a hard max-iter ceiling (configurable, default 5) to prevent infinite loops. On ceiling-hit skill SHALL emit `[GAP]` report instead of failing silently.

## Usability

- **NFR-U1: Single-glance progress.** Audit + Mutation-feedback modes SHALL emit progress lines (e.g., `[2/5] Running Stryker on src/foo.ts...`) for runs >30s to give the operator a visible heartbeat.
- **NFR-U2: Verbatim prompt templates.** SKILL.md SHALL include 4 copy-paste-ready user-facing prompt templates (A: Greenfield TS, B: Greenfield Python, C: Audit, D: Mutation-feedback) so users can re-invoke without reading the skill body.
- **NFR-U3: Negative scope explicit.** SKILL.md description SHALL list `NOT for: mocking-heavy unit tests, perf benchmarks, e2e UI tests` to keep auto-loading on-topic per `skill-allowed-tools-audit` discipline.
- **NFR-U4: Bidirectional cross-link with `tests-create-update`.** Both skills SHALL contain a `## Related Skills` paragraph pointing at each other with one-line summary of differentiation (write-time prevention vs post-write strength).
- **NFR-U5: §1.5 Behavioural prior — non-skippable section ordering.** SKILL.md §1.5 SHALL load **before** §2 (Pre-write checklist) in every Skill activation path (slash / semantic / JiT hook context). Enforced by physical section ordering в файле (markdown section §1.5 inserted between §1 и §2). Section budget: ≤1500 tokens to keep skill body under 8K soft cap per Anthropic skill-development meta-skill.

## Performance JiT

- **NFR-P4: JiT detector latency.** `detect-invariant-candidates.ts` SHALL complete detection scan on a single production file ≤500ms p95 для файлов ≤2000 LOC. Uses ast-grep с pre-compiled rules. PostToolUse hook fires inline с Write|Edit — не должен perceptibly замедлять file write. Если scan >500ms detected on single file → hook emits `additionalContext` noting latency overhead но не blocks Write.

## Security JiT

- **NFR-S4: Suppression audit log integrity.** `.claude/logs/strong-tests-skips.jsonl` SHALL be append-only (открыт с `O_APPEND` flag, никогда `O_TRUNC`). Каждая entry SHALL be one valid JSON object on its own line (JSONL convention). Entries SHALL include `session_id` (UUID v4) для cross-session aggregation. Log SHALL NOT contain source-code snippets — только function names + line refs + reason text. Reason text SHALL be sanitized: no embedded newlines (replaced с U+2028 line separator), no embedded JSON-breaking chars (escaped per JSON.stringify).
- **NFR-S5: PostToolUse hook никогда не executes Bash command from detector output.** Detector returns JSON; hook reads JSON; hook emits text-only `additionalContext`. Hook SHALL NOT shell out на детектор output (e.g., если detector contained malicious `additionalContext`, оно бы воспринималось AI как nudge но не как exec instruction).

## Reliability JiT

- **NFR-R5: JiT detector graceful degradation.** If ast-grep binary not installed OR detector encounters parse error on input file (e.g., syntactically invalid TS), hook SHALL emit `additionalContext: "JiT detector unavailable — invoke /strong-tests manually if function returns collection or has N×M loops"` instead of failing. PostToolUse hook MUST NOT cause Write|Edit to fail due to detector errors. Hook exits 0 unconditionally (emit-only contract).
- **NFR-R6: Suppression marker recognition idempotency.** Same suppression comment on same function across multiple Write|Edit invocations SHALL produce только один new JSONL log entry per Write|Edit (not per detection scan iteration). Detector caches per-file scan result keyed на content-hash for duration of single hook invocation.
