# Prompt-Suggest model analysis

Date: 2026-07-27

## Scope

The current prompt-suggest implementation is in `tools/prompt-suggest/prompt_suggest_core.ts`. It defaults to `anthropic/claude-3-haiku` for direct OpenRouter calls and to `openrouter/anthropic/claude-3-haiku` through AiPomogator. The request is a short `/chat/completions` call with `max_tokens: 50`, `temperature: 0.3`; the captured example used 842 input tokens and 11 output tokens.

## Baseline

OpenRouter model: `anthropic/claude-3-haiku`

- Input: $0.25 / 1M tokens
- Output: $1.25 / 1M tokens
- Context: 200K
- Captured request cost: `(842*0.25 + 11*1.25)/1M = $0.00022425`, displayed as `$0.000224`
- OpenRouter benchmark snapshot: IFBench 36.1%, SciCode 18.6%, GPQA 37.4%, HLE 3.9%.

Sources:
- [src:https://openrouter.ai/anthropic/claude-3-haiku/api]
- [src:https://openrouter.ai/anthropic/claude-3-haiku]

## Candidates

| Candidate | Input / output $/M | Context | Cost for 842 in + 11 out | Saving vs Haiku | Assessment |
|---|---:|---:|---:|---:|---|
| `deepseek/deepseek-v4-flash` | $0.09 / $0.18 | 1,048,576 | $0.00007776 | 65.3% | Best first replacement for prompt-suggest; much stronger current instruction-following/coding benchmark signals, but verify tone and latency. |
| `qwen/qwen3-30b-a3b-instruct-2507` | $0.04815 / $0.1931 | 262,144 | $0.00004267 | 81.0% | Cheapest serious candidate; quality likely adequate for short suggestions, but less evidence than DeepSeek for this exact workload. |
| `google/gemini-2.5-flash` via AiPomogator catalog | $0.15 / $0.60 | provider catalog | $0.00013290 | 40.7% | Familiar strong low-cost alternative if already available through AiPomogator; not as cheap as DeepSeek V4 Flash. |
| `deepseek/deepseek-chat` via AiPomogator catalog | $0.14 / $0.28 | provider catalog | $0.00012096 | 46.1% | Conservative AiPomogator-compatible option; still cheaper than Haiku. |
| `qwen/qwen2.5-coder-7b` via AiPomogator catalog | $0.03 / $0.09 | provider catalog | $0.00002625 | 88.3% | Lowest listed cost, but older/smaller and should be treated as a quality-risk fallback, not the default. |

Sources:
- [src:https://openrouter.ai/deepseek/deepseek-v4-flash/api]
- [src:https://openrouter.ai/deepseek/deepseek-v4-flash/benchmarks]
- [src:https://openrouter.ai/qwen/qwen3-30b-a3b-instruct-2507/api]
- [src:https://openrouter.ai/qwen/qwen3-30b-a3b-instruct-2507]
- [src:https://docs.aipomogator.ru/models/pricing]

DeepSeek V4 Flash benchmark snapshot: IFBench 79.2%, SciCode 44.9%; OpenRouter's model page also reports LiveBench dimensions. These are not a direct apples-to-apples product-quality guarantee, but they strongly disfavor retaining Claude 3 Haiku when the task is instruction-following and short coding/prompt assistance.

Sources:
- [src:https://openrouter.ai/deepseek/deepseek-v4-flash/benchmarks]
- [src:https://livebench.ai/]

## Recommendation

1. **If the hook calls OpenRouter directly:** change the default to `deepseek/deepseek-v4-flash`. It cuts the measured request cost by about 65% and has materially stronger current benchmark signals than Claude 3 Haiku.
2. **If the normal path is AiPomogator:** first check that `deepseek/deepseek-v4-flash` is exposed by `GET https://aipomogator.ru/go/v1/models`. Do not assume that an OpenRouter model slug is available through the proxy. If it is absent, use the cheapest listed `deepseek/deepseek-chat` or `google/gemini-2.5-flash` according to a small quality smoke set; the existing code already accepts `PROMPT_SUGGEST_MODEL` without code changes.
3. **Do not use `qwen/qwen2.5-coder-7b` as the unattended default** until a real transcript benchmark confirms it does not produce malformed, overlong, or irrelevant suggestions. It is an excellent cost floor, not a quality-safe conclusion.
4. Preserve an environment override: `PROMPT_SUGGEST_MODEL=...` so rollback does not require a code edit.

## Important implementation detail

The current default is duplicated in source and the generated bundle. If changing the default, update both:

- `tools/prompt-suggest/prompt_suggest_core.ts`
- `tools/prompt-suggest/prompt_suggest_stop.bundle.mjs`

Also update `.env.example` with the selected model as an explicit override. The `temperature: 0.3` request field is compatible with the OpenAI-compatible endpoint today; verify it against the chosen provider before removing it.

## Evidence limits

- The benchmark numbers are vendor/OpenRouter surfaced aggregates, not a benchmark of aiпомогатор.ru's actual prompt-suggest corpus.
- The request is only 50 output tokens, so output price is low impact here; input price and latency matter more.
- Model availability and prices can change. The definitive runtime check is the provider's live `/models` endpoint and one controlled A/B run over real, redacted prompt-suggest transcripts.
