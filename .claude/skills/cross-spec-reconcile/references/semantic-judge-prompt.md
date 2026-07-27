# Semantic-drift judge — prompt & contract

Full mode (`--mode full`) adds one LLM call on top of the mechanical reconciler to catch
`cross-spec/semantic-drift`: two specs with the **same FR id** whose prose shares enough
tokens to slip the mechanical `contradictory-fr` heuristic (<40% overlap) yet still describe
**different behaviour**. The judge decides "same requirement or not?".

This doc is the extract from the real code — prompt from `tools/spec-llm-judge/index.ts::buildPrompt`,
orchestration from `scripts/full-mode.ts`. Keep it in sync if either changes.

## The prompt (verbatim)

```
You are a strict spec-conformance auditor.
Compare the following FR text with the Scenario steps. Answer with a
single JSON object on stdout (no prose, no markdown fences):
  {"result": "NO_DRIFT_DETECTED"}  OR
  {"result": "DRIFT", "explanation": "<1-2 sentences>", "severity": "warning"|"error"}

--- FR ---
{frText}
--- Scenario ---
{scenarioText}
```

In cross-spec full mode the two slots are **the two specs' FR bodies** (same FR id, different
slug): `frText` = spec A's FR body, `scenarioText` = spec B's FR body. The generic "FR vs
Scenario" wording is reused as-is — the question reduces to "do these two prose blocks describe
the same requirement?".

## Verdict contract

The model MUST return one bare JSON object (markdown fences are stripped before parsing):

| `result` | extra fields | meaning |
|---|---|---|
| `NO_DRIFT_DETECTED` | — | the two blocks agree → no finding |
| `DRIFT` | `explanation` (1–2 sentences), `severity` (`warning`\|`error`) | divergence → emit `cross-spec/semantic-drift` |

Severity maps to the report: `error` → `CRITICAL`, `warning` → `WARNING`. The `explanation`
becomes the finding's `suggested_fix`. Unparseable output or transport failure returns
`SUBPROCESS_FAILED`: full mode keeps the mechanical report, emits `cross-spec/semantic-check-failed`,
and marks the affected YAML report `partial: true` with `partial_reasons[]`.

## Decision tree (per pair, mirrors `runJudge`)

1. **Opt-out** — `spec_llm_judge_deny: true` (spec frontmatter / override map) → `SKIPPED_OPT_OUT`, no spawn.
2. **Cache hit** — a prior verdict for this pair → returned, no spawn.
3. **FR-26 deny-list** — `checkDenyList(prompt)` scans the constructed prompt; a hit → `SKIPPED_DENY_LIST`, no spawn (the prompt content is never sent).
4. **Spawn** — otherwise call the model, parse JSON, cache, return `DRIFT`/`NO_DRIFT_DETECTED`.

## Pre-filters (full-mode, before the judge ever runs)

- Skip a pair already flagged mechanically as `cross-spec/contradictory-fr` (no double-count — mechanical already won).
- Skip a pair where either FR body is `< 60` chars after normalization (not enough to judge).
- Skip a pair with `< 3` shared concept nouns (PascalCase terms plus non-generic prose words) before any judge spawn.
- Hard cap `maxCalls` (default **50**) subprocess calls per run (runaway guard); cache hits don't count.

## Transport (NOT `claude -p`)

Production uses AiPomogator's OpenAI-compatible API. It first verifies the DeepSeek route through
`GET {AUTO_COMMIT_LLM_URL}/models`, then sends `POST {AUTO_COMMIT_LLM_URL}/chat/completions` with the
returned ID (normally `openrouter/deepseek/deepseek-v4-flash`), `max_tokens: 256`, temperature 0, and a
120s timeout. **Fail-open:** catalog/provider unavailable, non-200, or timeout → the spawn throws →
`runJudge` returns `SUBPROCESS_FAILED` → the pair emits a
WARNING `cross-spec/semantic-check-failed` and the per-spec report is marked `partial: true`; no
slow-path fallback is attempted. The spawn is injectable (`opts.spawn`) so tests cover every branch
without a real external call.
