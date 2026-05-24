# When to Build Architecture Decisions (specs-workflow)

Trigger map для `Skill("architecture-decision-builder")` invocation (standalone + create-spec Phase 1.75). Mirror structure `.claude/rules/specs-workflow/variant-matrix/when-to-build-matrix.md`.

## Apply WHEN

Invoke skill if ANY:

- Standalone trigger phrases — RU: «выбери стек», «спроектируй архитектуру», «архитектура для», «варианты архитектуры»; EN: «choose stack», «design architecture», «architecture decision», «stack options».
- create-spec Phase 1.5 ran AND repo has **no build-manifest** in root (`package.json`/`*.csproj`/`pyproject.toml`/`Cargo.toml`/`go.mod`) — i.e. greenfield, only `.md` files.
- PRD/USER_STORIES mentions «new project» / «from scratch» / «greenfield» / «с нуля» / «только PRD».
- `architecture-decision-cli.ts detect-axes` returns `axes_detected ≥ 1`.

## Do NOT apply (hard-OUT)

These prevent invocation — hard-OUT priority over trigger phrases:

- Repo root contains a build-manifest (`package.json`/`*.csproj`/`pyproject.toml`/`Cargo.toml`/`go.mod`/`build.gradle`/`pom.xml`) → brownfield, stack chosen.
- PRD says «existing stack» / «stack is locked/chosen/fixed» / «not being reconsidered» / «do not introduce new infrastructure».
- Single-tech feature decision (one technology, no genuine choice between alternatives).
- Modifying an existing system's behaviour (refactor, bugfix) — not greenfield architecture.

## Why the hard-OUT list exists

**Prevents H1 regression** (`feedback_single-incident-rules-over-generalize.md`): over-applying to brownfield/single-tech cases is the same failure mode that motivates the gate. If every PRD triggers architecture analysis, the agent games the escape hatch — defeating it. `detect-axes` encodes these signals (BROWNFIELD_SIGNALS) → returns `axes_detected: 0, skipped_reason`.

## Escape hatch vs. skill invocation

- **Prefer skill** for genuine greenfield multi-axis decisions (no build-manifest, ≥1 detected axis).
- **Prefer escape hatch** `[skip-architecture-axis: <reason ≥12 chars>]` only when (a) the axis is genuinely pre-decided (org policy / constraint) AND (b) skill analysis would not add value.

**Never escape** to: bypass skill because "slow"; ship noted-concerns unresolved; circumvent after repeated blocks without changing the decision.

## Related

- Skill: `.claude/skills/architecture-decision-builder/SKILL.md`
- Escape audit: [escape-hatch-audit.md](escape-hatch-audit.md)
- Adjacent (plan-time): `.claude/rules/plan-pomogator/cross-scope-coverage.md`
- Reference incidents: bhph-early-warning architecture decision (Variant F); memory `feedback_design-research-discipline`.
