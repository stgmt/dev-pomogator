# Escape Hatch Audit (variant-matrix)

`[skip-variant-matrix: <reason>]` в FR.md body bypasses matrix enforcement. Каждое использование logged в `.claude/logs/spec-variant-matrix-escapes.jsonl`. Этот файл документирует audit workflow + anti-gaming guidance. Mirror `.claude/rules/scope-gate/escape-hatch-audit.md`.

## Формат лога

JSONL (newline-delimited JSON), append-only через atomic `O_APPEND`. One object per line:

```jsonl
{"ts":"ISO8601","spec":"slug","fr":"FR-N","reason":"string","session_id":"uuid","cwd":"abs/path"}
```

Поля:

- `ts` — ISO 8601 timestamp escape-а
- `spec` — spec slug (basename `.specs/{slug}/`)
- `fr` — FR identifier (e.g. `FR-3`)
- `reason` — extracted из `[skip-variant-matrix: ...]` regex group 1
- `session_id` — Claude Code session UUID
- `cwd` — absolute path к git repo root (для cross-project aggregation)

## Как аудитить

### Ручная проверка log-а

```bash
# Последние 10 escape
tail -10 .claude/logs/spec-variant-matrix-escapes.jsonl | jq .

# Escape за последние 24 часа
jq -c 'select(.ts > "'"$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)"'")' \
   .claude/logs/spec-variant-matrix-escapes.jsonl

# Группировка по reason prefix
jq -r '.reason' .claude/logs/spec-variant-matrix-escapes.jsonl | \
   awk -F: '{print $1}' | sort | uniq -c | sort -rn

# Cross-spec escape frequency
jq -r '.spec' .claude/logs/spec-variant-matrix-escapes.jsonl | sort | uniq -c | sort -rn
```

### Red flags при review

- **Reason < 8 chars** — audit category VARIANT_COVERAGE already emit INFO finding `WARNING_REASON_TOO_SHORT`, но escape пропускается. Высокий приоритет ручной проверки — escape был использован без substantive rationale.
- **Repeated identical reason** — если одна и та же reason появляется 5+ раз cross specs, это признак gaming (agent копипастит). Запросить у автора объяснение.
- **Reason doesn't match FR content** — reason говорит "covered by parametrized helper" но FR не упоминает test runner. Красный флаг на gaming.
- **Multiple escapes within short window (5 min)** — agent стучится в gate повторно без изменения spec content. Обычно означает что real issue existed но escape-ом завалили. Требует ручной проверки.
- **Escape применяется к FR который потом изменяется** — escape был applied к старой версии FR. После edit нужно re-evaluate.

### Как найти original spec state

`spec` field в логе указывает на `.specs/{slug}/`. `ts` позволяет найти git commit вокруг этой даты:

```bash
git log --since="2026-04-29T00:00:00Z" --until="2026-04-29T01:00:00Z" -- .specs/<spec>/FR.md
```

## Anti-gaming guidance

**ЗАПРЕЩЕНО** использовать escape hatch в следующих случаях:

1. **Bypass потому что skill "слишком медленный"** — если skill кажется slow, open issue. Не игнорируй gate.
2. **Ship noted concerns без resolution** — H3 failure mode. "Concerns for Review-after-Ship" в spec + escape hatch = offloading на ревьюера. Резолви до ship.
3. **Repeated escapes на ту же FR без изменений** — если audit denied 3+ раза на одной и той же FR, то либо (a) matrix действительно нужна — run skill и enumerate variants, либо (b) FR scope изменился и должен быть отдельной задачей. "Копировать reason из прошлого commit чтобы пропихнуть" — прямое gaming.
4. **Reason без substance** — "skip", "ok", "fix", "yes", "lgtm", "verified" (single word без context). Reviewer не сможет audit. Минимум 8 chars формально, но realistic — опиши **почему** bypass безопасен:
   - ✅ "covered by parametrized test helper at tests/runner.ts which iterates через DocumentType enum"
   - ✅ "deferred per JIRA-NNNN — current PR addresses type-level change, behavioral verification в follow-up MR"
   - ✅ "shared validation already tested per-variant в legacy tests/integration/per-doctype.test.ts (legacy code, not duplicating)"
   - ❌ "tl;dr no effect"
   - ❌ "reviewed locally"
   - ❌ "covered" (too short — какие тесты?)

## Когда escape hatch легитимен

- **Variant matrix already tested через parametrized runner** — e.g., тесты iterate через enum в shared helper. Reason example: `"variants enumerated в tests/helpers/per-doctype-runner.ts которое iterates через DocumentType enum (5 cases)"`.
- **Generated code scenarios** — если codegen produces variant handlers automatically, manual matrix duplicates source-of-truth schema. Reason: `"generated from openapi-spec.yaml через codegen; matrix duplicates schema"`.
- **Pure refactor with semantic equivalence** — extracting shared helper but preserving all variants. Reason: `"pure refactor: extracted validateStockForItems в separate file, no membership change in switch dispatch"`.
- **Explicit deferred issue** — real verification needed но will be addressed в отдельной задаче. Reason: `"deferred per JIRA-NNNN; current spec only addresses architectural change, per-variant testing в follow-up spec spec-variant-matrix-rollout"`.
- **Test-only spec** — если spec ONLY about test infrastructure (no production behavior), variant matrix может не applicable. Reason: `"test infrastructure only — no production code dispatch; variant matrix не applicable"`.

## Log rotation

No automatic rotation для v0.1.0. Log может grow indefinitely. Для long-running projects:

```bash
# Archive escape log periodically (monthly)
mv .claude/logs/spec-variant-matrix-escapes.jsonl \
   .claude/logs/spec-variant-matrix-escapes-$(date +%Y-%m).jsonl
```

Если log crosses 10K lines — invoke этот rotation. Helper создаёт новый файл automatically (append-only с implicit create).

## Related

- Trigger rule: [when-to-build-matrix.md](when-to-build-matrix.md)
- Adjacent rule: [`.claude/rules/scope-gate/escape-hatch-audit.md`](../../scope-gate/escape-hatch-audit.md) — same JSONL pattern для commit-time scope-gate.
- Spec: [`.specs/spec-variant-matrix/FR.md` FR-7](../../../../.specs/spec-variant-matrix/FR.md)
- Audit reference: [`.claude/skills/create-spec/references/phase3plus_audit-variant-coverage.md`](../../../skills/create-spec/references/phase3plus_audit-variant-coverage.md)
