# Research

## Sources

- GitHub issue #84: `stgmt/dev-pomogator` "Umnyi full-install headroom + context-mode".
- GitHub issue #88: `stgmt/dev-pomogator` "headroom: golyi proxy miskonfig".
- Live local Headroom 0.31.0 container on 2026-07-10.
- Headroom documentation index and proxy docs:
  - https://github.com/headroomlabs-ai/headroom/blob/main/llms.txt
  - https://headroom-docs.vercel.app/docs/proxy
  - https://headroom-docs.vercel.app/docs/installation

## Existing dev-pomogator Surface

Relevant existing pieces:

- `.claude/skills/proxy-up/SKILL.md` manages the Meridian Claude subscription
  proxy on port 3456.
- `.claude/skills/use-claude-subscription/SKILL.md` wires a project to Meridian.
- `tools/claude-subscription-proxy/` ships Docker compose, health scripts, and
  autostart scripts for Meridian.
- `pomogator-doctor` already exists as a natural integration point for status
  and repair checks.

Gap:

- No local `.specs/headroom-*` feature spec exists.
- No dev-pomogator installer surface owns Headroom as an optional beta runtime.
- Existing proxy skills are Meridian-specific and should not be overloaded with
  Headroom semantics.

## Live Headroom Observation

The owner machine had:

- Container: `headroom-sub2api`, image `headroom-sub2api:0.31.0`.
- Health: ready, upstream `http://sub2api:8080` healthy.
- `/stats`: `mode=cache`, `api_requests=492`, input tokens about `36.84M`.
- Proxy compression: `requests_compressed=0`, `tokens_saved=0`,
  `active_savings_percent=0.0`.
- Prefix cache: about `5,992,960` cache-read tokens and about `$26.97` observed
  provider cache savings.
- Tool-search/schema deferral: about `6,708,977` tokens reported separately.

Conclusion: the dashboard "Token Savings" card was zero because the runtime was
configured for cache/prefix stability, not token compression. This is not a UI
bug. A beta installer must explicitly choose and verify token/compression mode.

## Current Headroom 0.31.0 CLI Facts

Observed `headroom proxy --help` in the live container:

- Supports `--mode [token|cache]`; docs say token prioritizes compression and
  cache freezes prior turns for provider prefix cache.
- Supports `--intercept-tool-results`.
- Supports `--no-ccr-proactive-expansion`.
- Supports `--no-subscription-tracking`.
- Supports `--request-timeout-seconds`,
  `--anthropic-pre-upstream-concurrency`, and `--compression-max-workers`.
- Does not show a `--code-aware` flag in this installed version.

Observed package metadata:

- `headroom-ai[proxy]` installs proxy dependencies.
- `headroom-ai[code]` adds `tree-sitter` and `tree-sitter-language-pack`.
- `headroom-ai[all]` pulls proxy, code, ML, memory, relevance, image, reports,
  otel, evals, voice, html, mcp, and spreadsheet extras.

Design implication: the installer must be version-aware:

1. Install enough extras for the selected beta profile.
2. Inspect `headroom proxy --help`.
3. Only pass supported flags.
4. Verify runtime behavior from `/stats`, not from intended flags.

## Issue #84 Lessons To Preserve

- `pip install headroom` is the wrong package name; use `headroom-ai`.
- Windows installs can hit Defender file locks; host fallback needs retry loops.
- `headroom wrap claude` is a launcher path, not a durable global routing
  contract by itself.
- Global Claude settings must be backed up before changes.
- Hooks that call external binaries must be guarded with command-exists checks
  and fail open.
- SessionStart can self-heal an opted-in install, but cannot safely perform an
  interactive first install.
- Do not sell "99% savings" from a strawman whole-file baseline. Compare against
  disciplined native `Grep` / `Read --limit` where relevant.

## Issue #88 Lessons To Preserve

- A bare proxy can produce misleadingly low compression.
- CCR and context-mode/ctx-style tools overlap: if a tool keeps raw content out
  of the model before the wire, Headroom has less large content to compress.
- Later issue evidence corrected the early `context-1m` concern: the observed
  Headroom version forwarded beta headers. The installer must still verify
  headers/model window behavior rather than assume.

## Beta Scope Decision

This spec covers Headroom only. It may integrate with context-mode metrics and
doctor checks later, but it must not implement force-ctx or context-mode install
inside the first Headroom beta. That work belongs to a separate spec or a later
phase of #84.

