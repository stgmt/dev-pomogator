# F-3 — Real CARL output provenance ledger

Captured on: 2026-07-07
Source repo: `E:/repos/presentation-reels`
Fixture root: `tests/fixtures/carl/`
Spec task: `capture-real-carl-artifact`

## Capture commands

```bash
cd E:/repos/presentation-reels && node scripts/carl/smoke-carl-hooks.mjs
cd E:/repos/presentation-reels && node scripts/carl/bench-carl-hooks.mjs
powershell -NoProfile -Command <command from .claude/settings.json or .codex/hooks.json>
```

The hook command recorded in `manifest.json` was:

- Claude Code: `python "E:/repos/presentation-reels/.claude/hooks/carl-hook.py"`
- Codex: `python 'E:\\repos\\presentation-reels\\.claude\\hooks\\carl-hook.py'`

## Captured artifacts

| File | Meaning |
|------|---------|
| `../manifest.json` | Provenance, source hashes, source git status, hook commands, hook sample summaries, smoke/bench status. |
| `../smoke.stdout.txt` | Real smoke stdout, including domain counts and loaded-domain summaries. |
| `../smoke.stderr.txt` | Real smoke stderr; captured empty for this run. |
| `../bench.stdout.tsv` | Real benchmark TSV with p50/p95, context chars, estimated tokens, thresholds, and loaded domains. |
| `../bench.stderr.txt` | Real benchmark stderr; captured empty for this run. |
| `../claude-neutral.input.json` | Real Claude Code neutral prompt hook input envelope. |
| `../claude-neutral.stdout.json` | Real hook JSON stdout for neutral Claude Code prompt. |
| `../claude-neutral.additionalContext.txt` | Extracted `hookSpecificOutput.additionalContext` from the neutral Claude Code prompt. |
| `../claude-debug.input.json` | Real Claude Code debug prompt hook input envelope. |
| `../claude-debug.stdout.json` | Real hook JSON stdout for debug Claude Code prompt. |
| `../claude-debug.additionalContext.txt` | Extracted `hookSpecificOutput.additionalContext` from the debug Claude Code prompt. |
| `../codex-debug.input.json` | Real Codex debug prompt hook input envelope. |
| `../codex-debug.stdout.json` | Real hook JSON stdout for debug Codex prompt. |
| `../codex-debug.additionalContext.txt` | Extracted `hookSpecificOutput.additionalContext` from the debug Codex prompt. |

## Ground truth from the producer

Smoke result:

```text
CARL smoke OK
domains=116
neutral_chars=691
debug_domains=[GLOBAL] always_on (2 rules) | [CORE__DONT_BLAME_INFRA_BEFORE_TRACING] matched: инфра (1 rules) | [CORE__REPRODUCE_NOT_THEORIZE] matched: че за ошибка, исследуй втф, до конца (1 rules)
codex_domains=[GLOBAL] always_on (2 rules) | [CORE__REPRODUCE_NOT_THEORIZE] matched: че за ошибка (1 rules)
```

Benchmark result:

```text
old_bulk_autoload_chars=683575
iterations=5
neutral-continue: p50 409.7ms, p95 411.0ms, 691 chars, <=2000
ru-debug-root-cause: p50 419.2ms, p95 439.8ms, 20557 chars, <=25000
render-legibility: p50 398.7ms, p95 398.8ms, 44524 chars, <=50000
feature-index: p50 393.7ms, p95 407.7ms, 17169 chars, <=35000
codex-ru-debug: p50 399.4ms, p95 409.6ms, 9155 chars, <=15000
```

## Source hashes

`manifest.json` records SHA-256 hashes for the captured producer inputs:

- `.claude/hooks/carl-hook.py`: `06c061d58c13433a41290534eb38e578a8dfbdf6295cb21ee04dd74451c8ab07`
- `.carl/carl.json`: `943362c21753f0f9b53875db9d79f301c26a407b12e574754f9a4da2f7cbae5d`
- `scripts/carl/smoke-carl-hooks.mjs`: `faec3c449f042112e014f151a809062472360d6b57e5ba56e3f37daefff9ce91`
- `scripts/carl/bench-carl-hooks.mjs`: `4d139e3b73e023551fa062998b7b555aa3e419dde8add05504ed6c12151f4a1d`
- `scripts/carl/generate-carl-rules.mjs`: `1e4e7c553e60f85e98d70209cacdeed6af38727019def39a4029f3d56e43a341`
- `.claude/settings.json`: `6c19559f48bfe664600422b7f1d72b8eacceb3da4b38f520b32b5932f3c1c75b`
- `.codex/hooks.json`: `ab3adefbd6c7adb0e5b9ec49b711118dad06e341d498d673f6796472520a6bfc`

## Trust boundary

This fixture is accepted as real producer evidence for CARL output shape and benchmark behavior. It is not accepted as proof that dev-pomogator already integrates CARL.

At capture time, the CARL source files were untracked in the sibling repo. Before implementation, dev-pomogator must decide whether to vendor, port, regenerate, or otherwise source these artifacts, and must then prove the plugin-distributed hook path invokes the accepted runtime.

## dev-pomogator benchmark gate usage

`tools/carl/bench.ts` consumes this fixture only when called with `--fixture-root tests/fixtures/carl`. In that mode it records a fixture-backed real-artifact baseline from `bench.stdout.tsv`, cites this ledger and `manifest.json` source hashes, and enables future regression comparison for the supported metrics (`p50_ms`, `p95_ms`, `chars`, `estimatedTokens`, `loadedDomains`).

Without `--fixture-root`, the benchmark deliberately returns `status: "blocked"`, `thresholdState: "draft-no-real-artifact"`, `baseline: null`, and `regressionGate.enabled: false`. That blocked mode is intentional: dev-pomogator must not invent numeric pass/fail thresholds before a real CARL artifact or approved external requirement supplies them.
