# Headroom Beta Integration

This spec turns GitHub issues #84 and #88 into an implementable beta feature for
dev-pomogator.

Goal: dev-pomogator can optionally install, run, verify, and repair a Headroom
context-optimization layer for Claude Code users. The user chooses one runtime
topology:

1. `codex-sub2api`: Claude Code -> Headroom -> sub2api -> OpenAI/Codex subscription.
2. `anthropic-direct`: Claude Code -> Headroom -> Anthropic API directly.

The feature is beta and opt-in. It must not silently rewrite global Claude Code
settings, silently start unauthenticated non-loopback proxies, or claim token
savings before a real `/stats` verification proves them.

## Key Findings From Discovery

- Current live Headroom on the owner machine was healthy but ran in `cache`
  mode, so dashboard `Token Savings` was `0` and proxy compression counters
  were zero.
- Headroom has distinct savings surfaces: proxy compression, provider prefix
  cache, tool-search/schema deferral, and optional CLI/context-tool filtering.
  The installer must report them separately.
- `headroom-ai[proxy]` is not enough for a full feature install. The runtime must
  install full or selected extras that include code-aware dependencies, and must
  warm up the compression/model paths.
- Headroom CLI flags are version-sensitive. The installer must derive supported
  flags from `headroom proxy --help` and never pass stale flags such as
  `--code-aware` when the installed version does not support them.
- SessionStart hooks may ensure an already opted-in installation, but first
  install must be explicit and reversible.

## Read Next

- [RESEARCH.md](RESEARCH.md)
- [REQUIREMENTS.md](REQUIREMENTS.md)
- [FR.md](FR.md)
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md)
- [DESIGN.md](DESIGN.md)
- [TASKS.md](TASKS.md)
- [FILE_CHANGES.md](FILE_CHANGES.md)

