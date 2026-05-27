# Escape Hatch Audit (architecture-decision)

`[skip-architecture-axis: <reason>]` в PRD/axis frontmatter bypasses an axis. Each use logged to `.claude/logs/spec-architecture-escapes.jsonl`. Mirror `.claude/rules/specs-workflow/variant-matrix/escape-hatch-audit.md`.

## Формат лога

JSONL append-only (O_APPEND via `escape-log.ts`). One object per line:

```jsonl
{"ts":"ISO8601","spec":"slug","axis_id":"string","reason":"string","session_id":"uuid","cwd":"abs/path"}
```

Log dir override: `ARCHITECTURE_LOG_DIR` env (eval-runner isolation). Default `<cwd>/.claude/logs/`.

## Как аудитить

```bash
# Последние 10 escape
tail -10 .claude/logs/spec-architecture-escapes.jsonl | jq .
# Группировка по reason prefix
jq -r '.reason' .claude/logs/spec-architecture-escapes.jsonl | awk -F: '{print $1}' | sort | uniq -c | sort -rn
```

## Red flags при review

- **Reason < 12 chars** — `audit.ts` emit `WARNING_REASON_TOO_SHORT` INFO, но escape логируется. Высокий приоритет ручной проверки.
- **Repeated identical reason** ≥3× — признак gaming (копипаст чтобы bypass).
- **Reason не соответствует axis** — «covered by helper» но axis про hosting.
- **Escape на Critical-tier axis** (database/auth/api/hosting) без team-lead подтверждения.

## Anti-gaming

ЗАПРЕЩЕНО escape для: bypass потому что «медленно»; ship noted-concerns без resolution; circumvent после repeated blocks без изменения решения. Reason ≥12 chars и описывает ПОЧЕМУ bypass безопасен:
- ✅ «org policy mandates AWS-only, no genuine choice for hosting axis»
- ✅ «database pre-decided per JIRA-NNNN — Postgres locked by data-team»
- ❌ «skip» / «ok» / «later» (<12 chars → WARNING)

## Когда легитимен

- Axis pre-decided внешним constraint (org policy, regulatory, existing contract).
- Single-vendor lock-in уже committed до этой спеки.
- PoC/prototype scope где architecture сознательно throwaway.

## Completeness-dimension escape (FR-12, sibling)

Параллельный escape для COMPLETENESS_COVERAGE: `[skip-completeness-dimension: <reason ≥12 chars>]` в `ARCHITECTURE/COMPLETENESS.md`. Логируется в **отдельный** файл `.claude/logs/spec-completeness-escapes.jsonl` (separate concern от axis escapes; `axis_id` поле несёт dimension-id). Те же red flags + anti-gaming (reason ≥12). Легитимно: измерение не применимо (e.g. `data-lifecycle` для stateless MVP) — но это `out-of-scope` в ledger, escape только если даже строку нельзя осмысленно заполнить.

## Related

- Trigger rule: [when-to-build-architecture.md](when-to-build-architecture.md)
- Audit logic: `tools/specs-generator/architecture-decision/audit.ts` (`checkArchitectureCoverage` + `checkCompletenessCoverage`)
- Completeness audit ref: `.claude/skills/create-spec/references/phase3plus_audit-completeness-coverage.md`
- Mirror: `.claude/rules/specs-workflow/variant-matrix/escape-hatch-audit.md`
