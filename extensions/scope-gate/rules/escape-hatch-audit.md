# Escape Hatch Audit (scope-gate)

`[skip-scope-verify: <reason>]` в commit message + `SCOPE_GATE_SKIP=1` env var bypasses hook. Каждое использование logged в `.claude/logs/scope-gate-escapes.jsonl`. Этот файл документирует audit workflow + anti-gaming guidance.

## Формат лога

JSONL (newline-delimited JSON), append-only. One object per line:

```jsonl
{"ts":"ISO8601","diff_sha256":"64hex","reason":"string","session_id":"uuid","cwd":"abs/path"}
```

Поля:
- `ts` — ISO 8601 timestamp escape-а
- `diff_sha256` — sha256 staged diff на момент escape (what was skipped)
- `reason` — extracted из `[skip-scope-verify: ...]` regex group 1 OR `SCOPE_GATE_SKIP` env value
- `session_id` — Claude Code session UUID
- `cwd` — absolute path to git repo root (для cross-project aggregation)

## Как аудитить

### Ручная проверка log-а

```bash
# Последние 10 escape
tail -10 .claude/logs/scope-gate-escapes.jsonl | jq .

# Escape за последние 24 часа
jq -c 'select(.ts > "'"$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)"'")' \
   .claude/logs/scope-gate-escapes.jsonl

# Группировка по reason prefix
jq -r '.reason' .claude/logs/scope-gate-escapes.jsonl | \
   awk -F: '{print $1}' | sort | uniq -c | sort -rn
```

### Red flags при review

- **Reason < 8 chars** — hook already logs WARN в stderr, но все равно пропускает. Приоритет high для review — escape был использован без substantive rationale.
- **Repeated identical reason** — если одна и та же reason появляется 5+ раз, это признак gaming (agent копипастит одну строку чтобы bypass). Запросить у автора объяснение.
- **Reason doesn't match diff** — reason говорит "docs only" но diff_sha256 соответствует diff с enum changes. Красный флаг на gaming.
- **Multiple escapes within short window (5 min)** — agent стучится в gate повторно без изменения diff. Обычно означает что real issue existed но escape-ом завалили. Требует ручной проверки.

### Как найти original diff

`diff_sha256` в логе — это sha256 output от `git diff --cached` на момент escape. Если commit уже в git log — найти:

```bash
# Найти commit где diff sha256 matches
for commit in $(git log --format=%H --all); do
  diff_sha=$(git show --format= "$commit" | sha256sum | cut -d' ' -f1)
  if [[ "$diff_sha" == "<sha_from_log>" ]]; then
    echo "Found: $commit"
    git show "$commit"
    break
  fi
done
```

(Эвристика — staged diff ≠ commit diff строго, но для большинства single-commit escape-ей совпадает.)

## Anti-gaming guidance

**ЗАПРЕЩЕНО** использовать escape hatch в следующих случаях:

1. **Bypass потому что skill "слишком медленный"** — если skill кажется slow, open issue на ускорение. Не игнорируй gate.
2. **Ship noted concerns без resolution** — H3 failure mode. "Concerns for Review-after-Ship" в spec + escape hatch = offloading на ревьюера. Резолви до ship.
3. **Repeated escapes на ту же diff без изменений** — если hook denied 3+ раза на одной и той же diff, то либо (a) fix действительно нужен — run skill и zero out variants, либо (b) fix действительно невозможен и должен быть отдельной задачей. "Копировать reason из прошлого commit чтобы пропихнуть" — прямое gaming.
4. **Reason без substance** — "skip", "ok", "fix", "yes", "lgtm", "verified" (single word без context). Reviewer не сможет audit. Минимум 8 chars формально, но realistic — опиши **почему** bypass безопасен:
   - ✅ "dead-code path removed in previous commit, this adds type placeholder for future deletion"
   - ✅ "pure type-level refactor: `T | 'x'` → `T | 'x' | 'y'` without code generation"
   - ❌ "tl;dr no effect"
   - ❌ "reviewed locally"

## Когда escape hatch легитимен

- **Tooling-only change** that happens to match score pattern: e.g., bumping an enum in test fixture file matching `*Service.ts` because fixture happens to be in that folder. Reason: `"test fixture enum bump, not production gate; see tests/fixtures/mock-service.ts"`.
- **Generated code**: if your codebase auto-generates code and gate-matching file is committed from generator output. Reason: `"generated from schema.json via codegen; source of truth elsewhere"`.
- **Refactor with semantic equivalence**: e.g., extracting guard function but preserving enum order/membership. Reason: `"pure refactor: extracted isOutboundDocument to separate file, no membership change"` + add diff context line count to show no new variants.
- **Explicit deferred issue**: if real verification needed but будет решено в отдельной задаче. Reason: `"deferred per JIRA-NNNN; current PR only addresses type-level change, behavioral verification in follow-up MR"`.

## Log rotation

No automatic log rotation. Log может grow indefinitely. Для long-running projects:

```bash
# Archive escape log periodically (monthly)
mv .claude/logs/scope-gate-escapes.jsonl .claude/logs/scope-gate-escapes-$(date +%Y-%m).jsonl
```

Alternatively — если log больше 10K lines, invoke this rotation. Hook creates new file automatically (append-only with implicit create).

## Related

- Trigger rule: `.claude/rules/scope-gate/when-to-verify.md`
- Spec: `.specs/verify-generic-scope-fix/FR.md#fr-3-escape-hatch-with-audit-trail`
- Schema: `.specs/verify-generic-scope-fix/verify-generic-scope-fix_SCHEMA.md#escape-log-entry-jsonl-append-only`
