# When to Verify (scope-gate)

Trigger map for `/verify-generic-scope-fix` skill invocation.

## Apply WHEN

Run skill BEFORE `git commit` if your diff matches ANY of:

- Adds 2+ items to an enum / switch / array / Set that gates a shared code path
- Modifies file matching `*Service.ts`, `*Validator.ts`, `*Gate.ts`, `*Guard.ts`, `*Policy.ts`, `*Filter.ts`, `*Predicate.ts`, `*Rule.ts`
- Modifies function with name matching `is*`, `should*`, `can*`, `has*`, `must*`, `check*`, `validate*`, `verify*`, `allow*`, `permit*` (predicate-style)
- Task scope was articulated as "all X except Y" in Jira / user prompt (letter-of-ticket reasoning is the exact failure mode that motivates this gate)
- Hook `scope-gate-guard` just denied your commit with `permissionDecision: "deny"`

## Do NOT apply (hard-OUT signals)

These patterns are **hard-OUT** — do NOT invoke skill:

- Diff contains only `*.md`, `*.txt`, `*.rst` files
- Diff is in `tests/` / `docs/` / `__tests__/` / `spec/` paths ONLY (no production code)
- Pure rename (`git mv`) — no semantic change
- Pure comment change — no code logic touched
- Formatting-only change (Prettier, clang-format output) — no token-level code difference
- Dependency version bump in `package.json` / `Cargo.toml` / `requirements.txt` — no enum/switch edit
- **Removing** items from an enum/switch (deletion, not expansion) — removal doesn't add no-op variants

## Why the hard-OUT list exists

**Prevents H1 regression** (`feedback_single-incident-rules-over-generalize.md`): over-applying a prevention rule to cases it wasn't designed for is the same failure mode that motivated this gate in the first place. If every trivial commit triggers verification, agent will learn to game the escape hatch — defeating the gate.

**Decision heuristic:** if you're not sure whether to invoke, check the hook's deny message — it tells you exactly what patterns it detected. If hook did NOT deny, skill is likely not needed.

## Escape hatch vs. skill invocation

When both are available:

- **Prefer skill** for genuine multi-variant scope additions (enum/switch with 2+ new items, predicate gate changes). Skill produces marker with evidence trail — future audit-friendly.
- **Prefer escape hatch** only when (a) you are confident fix is structurally benign AND (b) skill's grep-based analysis would not surface the reasoning (e.g., dead-code path, tooling-only change that happens to touch a guard file, refactor with semantically equivalent output).

**Never use escape hatch** to:
- Bypass skill because it's "slow"
- Ship noted-concerns without resolution
- Circumvent hook after repeated blocks on the same diff without changing the diff

See `.claude/rules/scope-gate/escape-hatch-audit.md` for audit details.

## Related

- Spec: `.specs/verify-generic-scope-fix/`
- Adjacent rule: `.claude/rules/plan-pomogator/cross-scope-coverage.md` (multi-scope test coverage matrix — complementary, not duplicate: coverage = test breadth, scope-gate = per-case codepath reach)
- Reference incident memory: `reference_stocktaking-incident-products-20218.md`
