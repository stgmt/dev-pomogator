# Haiku to DeepSeek Migration

This specification plans a controlled, evidence-gated replacement of every current live Haiku runtime/API selection in scope with `deepseek/deepseek-v4-flash`. It covers specifications only; it does not implement the migration or advance the phase.

## Intended outcome

- Direct OpenRouter paths use the exact DeepSeek ID unless an explicit environment override wins.
- AiPomogator-backed paths first verify the real `/go/v1/models` catalog before routed-ID selection; missing, malformed, or absent DeepSeek availability yields explicit configured fail-soft behavior and never silently retains Haiku.
- Prompt-suggest and claim-evidence-gate source/bundle pairs stay behaviorally aligned through regeneration, while `.claude` canonical content and `.agents` mirrors stay aligned through synchronization.
- learnings-capture, claude-mem installer, meridian-model-call instructions, and exact-current-ID configuration/integration surfaces are included in the migration census.
- A redacted real-workload A/B gate assesses relevance, hallucination, Russian quality, format/length, empty/malformed output, latency, and pricing-aware cost evidence before any savings claim.

## Delivery boundaries

**Source of truth:** edit canonical selectors, canonical `.claude` content, and documented installer/configuration sources.

**Derived artifacts:** regenerate prompt-suggest and claim-evidence-gate executable bundles using their supported build process; synchronize `.agents` and other designated mirrors. Derived artifacts must not receive independent manual model changes.

**Proof:** BDD-only, integration-first tests use Docker and supported entry points. Provider/catalog fixtures must be redacted captures of real shapes, not invented JSON. Environment overrides remain higher precedence than defaults.

## Pricing claim guard

The captured 842-input / 11-output sample may claim a DeepSeek target cost no higher than `$0.00007776` against the `$0.00022425` baseline only when live pricing metadata still matches the captured rates. Pricing drift invalidates the numeric claim and must be reported, not silently reused.

## Scope map

| Surface | Delivery rule | Primary proof |
|---|---|---|
| prompt-suggest | canonical source → regenerate bundle | exact outbound model and bundle parity |
| claim-evidence-gate | canonical source → regenerate bundle | exact selector and gate/bundle parity |
| learnings-capture | canonical semantic selector | workload semantic contract |
| cross-spec-reconcile | canonical `.claude` → synchronize `.agents` | canonical/mirror parity |
| claude-mem installer | canonical installer argument | exact-ID integration path |
| meridian-model-call | canonical guidance → synchronize mirror | instruction parity and boundary correctness |
| AiPomogator routes | catalog-first routing | real catalog, absence/malformed fail-soft behavior |
| all scoped selectors | inventory/census | no-Haiku integration census |

## Reading order

- [USER_STORIES.md](USER_STORIES.md) — user value and scoped runtime surfaces.
- [RESEARCH.md](RESEARCH.md) — evidence status, risks, and pricing basis.
- [FR.md](FR.md) and [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — formal requirements and acceptance.
- [DESIGN.md](DESIGN.md) and [FILE_CHANGES.md](FILE_CHANGES.md) — design/file inventory to be completed before implementation.
- [TASKS.md](TASKS.md) — TDD-ordered implementation plan and Docker BDD proof.
- [CHANGELOG.md](CHANGELOG.md) — specification change history.
