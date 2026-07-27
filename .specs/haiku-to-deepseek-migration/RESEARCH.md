# Research

## Project Context & Constraints

### Architectural Constraints Summary

### Constraints

This is an evidence-gated migration of active dev-pomogator runtime/API model selection from Haiku to DeepSeek V4 Flash. The direct OpenRouter target is exactly `deepseek/deepseek-v4-flash`. AiPomogator is a distinct routed provider: its ID MUST be selected only after live `/go/v1/models` verification; it must not be invented from the OpenRouter slug and it must not silently retain Haiku. Supported environment overrides retain precedence. Provider/catalog/credential/output failure must remain fail-soft with an explicit secret-free diagnostic and configured non-Haiku abstention, stop, or fallback behavior.

In scope are prompt-suggest source and generated bundle; claim-evidence-gate Meridian source and generated bundle; learnings-capture semantic selection; cross-spec-reconcile canonical `.claude` and `.agents` mirror; claude-mem bootstrap plus exact-ID BDD/current-behavior documentation; meridian-model-call canonical/mirror docs/config; and exact-current-ID tests/config. Historical benchmark/evidence prose is preserved unless it defines active behavior.

## R-1: Captured cost comparison

**Evidence:** `audit-out/prompt-suggest-model-analysis.md` records 842 input tokens and 11 output tokens. At observed prices, the Haiku calculation was `$0.00022425`; the DeepSeek calculation was `$0.00007776`, approximately 65.3 percent lower. This is historical captured evidence, not a live price guarantee.

## R-2: External benchmark evidence is candidate-only

**Evidence:** The prompt-suggest model analysis identifies DeepSeek V4 Flash as a candidate, while explicitly requiring tone, latency, and task-specific verification. Product acceptance needs real redacted workload A/B evidence across relevance, hallucination, Russian quality, format/length, malformed/empty rate, latency, and cost.

## R-3: Direct and routed IDs have separate evidence sources

**Verified direct policy:** OpenRouter uses `deepseek/deepseek-v4-flash`.

**Required routed proof:** AiPomogator availability and exact route selection come only from a validated live `GET /go/v1/models` result. Missing/malformed/empty/incompatible catalog data is a fail-soft condition, not permission to synthesize an ID or use Haiku.

## R-4: Derived artifacts need executable evidence

Prompt-suggest and claim-evidence bundles are generated from canonical source. Cross-spec-reconcile and meridian-model-call use canonical `.claude` policy with a synchronized `.agents` mirror. Source-text inspection and nonempty-string assertions do not prove user-facing runtime/configuration behavior.

## Research gaps and re-check triggers

- Re-query the live AiPomogator catalog before choosing any routed route ID.
- Re-evaluate every scoped semantic surface using fixed real redacted workloads and human review.
- Revalidate pricing metadata before publishing the historical numeric saving as a current claim.
- Re-run the exact-ID census after source regeneration, mirror synchronization, installer changes, or provider contract changes.