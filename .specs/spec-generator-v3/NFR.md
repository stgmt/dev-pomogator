# Non-Functional Requirements (NFR)

## Performance

- Каждый form-guard short-circuit ≤ 30ms для non-target files (filename filter в первых 3 строках).
- Full validation ≤ 150ms worst case (500-line spec).
- Combined chain (7 PreToolUse hooks) adds ≤ 180ms per Write|Edit.
- `audit-logger.logEvent` ≤ 5ms (synchronous appendFileSync).
- `renderFormGuardsSummary` ≤ 50ms (read + parse last 24h events).

## Security

- Hooks read-only на target file.
- Audit log стоит в user-local `~/.dev-pomogator/logs/` — не shared; не secrets.
- Fail-open safe default — bug hook'а никогда не блокирует.
- Meta-guard защищает manifest от агент-driven removal; обход только через human editing снаружи Claude Code.

## Reliability

- `main().catch(exit(0))` wrapper гарантирует no-block при any internal error.
- Regex tested на 28+ existing specs before live activation.
- `.progress.json` schema v3 backward-compatible (unknown fields ignored).
- Audit log rotation (30d retention + 10MB cap) — log не растёт unbounded.

## Usability

- Error messages multi-line, actionable: line numbers + fix hint + `Skill("...")` recommendation.
- UserPromptSubmit summary в один взгляд: counts per event type.
- Skills anti-pushy — не спамят autosuggest; вызываются parent skill'ом.
- Migration guard silent for existing specs — нет false-positive noise.
