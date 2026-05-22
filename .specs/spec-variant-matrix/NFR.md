# Non-Functional Requirements (NFR)

## Performance

- Detection regex `O(n)` over FR.md content — линейный scan, no AST построение.
- Total audit overhead для VARIANT_COVERAGE category <=50ms per spec на типичном размере (FR.md <=500 lines).
- Skill variant-matrix-build при Phase 2 step 4c — synchronous вызов, без external LLM calls.

## Security

- Trigger phrases stored в versioned source (trigger-phrases.ts), git-tracked, immutable runtime.
- Никаких external LLM calls для detection — pure regex (per H2 risk: code-evidence trumps domain-sense).
- Escape-hatch reason — plain text, длина limited (>=8 chars enforced, no upper bound), validated regex без template injection.
- JSONL log `.claude/logs/spec-variant-matrix-escapes.jsonl` — append-only via O_APPEND, никогда не truncated runtime.

## Reliability

- Hooks fail-open: any error в variant-matrix detection module → exit 0 (not blocking). Existing pattern из extensions/scope-gate/.
- Atomic JSONL log writes через `fs.open(path, 'a')` semantic — concurrent write от parallel sessions не corrupts.
- Idempotent skill: re-invocation produces stable output (same spec content → same matrix template).
- Detection module pure (no I/O, no shared state) → trivially testable, deterministic.

## Usability

- Skill output explains почему trigger fired: returned JSON содержит `triggers: [{phrase, lineNumber}]` для каждого matched pattern.
- AUDIT_REPORT.md findings include link на phase3plus_audit-variant-coverage.md для resolution guide.
- Hard-OUT signals documented в .claude/rules/specs-workflow/variant-matrix/when-to-build-matrix.md — agent может proactively проверить triggering.
- Escape hatch syntax `[skip-variant-matrix: reason]` mirrors existing scope-gate syntax — consistent UX.
