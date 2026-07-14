# Fixtures

Required fixtures for implementation.

## `/stats` cache-mode zero savings

A JSON fixture where:

- `summary.mode = cache`;
- `tokens.saved = 0`;
- `tokens.proxy_compression_saved = 0`;
- `prefix_cache.totals.cache_read_tokens > 0`.

Expected doctor classification: healthy but no compression token savings.

## `/stats` token-mode compression

A JSON fixture where:

- `summary.mode = token`;
- proxy compression counters are nonzero after synthetic workload;
- prefix-cache counters may be zero or nonzero.

Expected doctor classification: compression verified.

## Unsupported flag help output

CLI help fixture for Headroom 0.31.0 where `--code-aware` is absent but
`--mode`, `--intercept-tool-results`, and `--no-ccr-proactive-expansion` are
present.

Expected planner behavior: skip `--code-aware`, include supported flags.

## Claude settings fixture

A JSON fixture with:

- existing hooks;
- enabled plugins;
- unknown keys;
- empty-string key if available from real captured settings;
- existing env entries.

Expected behavior: backup, atomic edit, unknown keys preserved, rollback exact.

## Runtime detection fixtures

Mock command outputs for:

- Docker available on host;
- Docker unavailable on host but available through WSL;
- no Docker but Python/pipx available;
- no supported runtime.

