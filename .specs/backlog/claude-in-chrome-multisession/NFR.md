# Non-Functional Requirements (NFR)

## Performance

- **Hook latency:** PreToolUse + PostToolUse execution ≤ 150ms p95 на typical Windows. Cold start через `npx tsx`: ~50ms tsx + ~20ms IO + ~20ms logic + slack.
- **State file read budget:** ≤ 5ms per session dir scan.
- **Hook fires sufficiently rare** — only on `mcp__claude-in-chrome__*` calls.

## Security

- **Path validation:** state directories scoped to `~/.dev-pomogator/cdmm-sessions/<sanitized-sessionId>/`.
- **`session_id` sanitization:** input from stdin → `replace(/[^a-zA-Z0-9_-]/g, '_')` before use as directory name.
- **No secrets in state files:** allowlist contains only numeric tabIds + ISO timestamps.
- **Atomic writes** per `atomic-config-save` rule.
- **Log file isolation:** `~/.dev-pomogator/logs/cims-guard.log` append-only, JSON-encoded events.
- **Hook fails open**: error scenarios cannot suppress legitimate DENY responses.

## Reliability

- **Idempotent install:** повторный install — no-op.
- **Atomic state writes** preserve consistency. Per-session directory isolation.
- **Hook idempotent for same tabId:** `adopt(sid, tabId)` — no duplicate entries.
- **`tabs_create_mcp` PostToolUse parse failure** degrades to manual `claim-tab.mjs add` fallback.
- **Stale session cleanup** via `claim-tab.mjs clean` (TTL 24h на `lastUsedAt`).

## Usability

- **Skill description first-line** clear для Claude Code skill-trigger detection.
- **DENY messages action-oriented** — content tells Claude exactly what to do next.
- **CLI helper output JSON-only** для programmatic consumption; errors → stderr.
- **Installer post-message** prints one-liner с restart instruction.
- **README usage examples** покрывают 95% operator needs.
