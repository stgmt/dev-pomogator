# Spec-Reality-Check — Maintain Evals on Edit

## Правило

При ЛЮБОМ изменении файлов skill `spec-reality-check` — кода / fixtures / hook / SKILL.md / references — агент ОБЯЗАН в той же сессии перед коммитом запустить **все три артефакта проверки**:

```bash
# 1) Functional evals (25+ кейсов: positive + negative + i18n + hook + baseline pinned)
npx tsx .claude/skills/spec-reality-check/evals/run-evals.ts

# 2) Bulk run на всех реальных спеках (45 .specs/ folders) — surface новые false positives
npx tsx .claude/skills/spec-reality-check/evals/bulk-run.ts

# 3) In-process algorithm bench (10/100/500/1000/2000 FC rows)
npx tsx .claude/skills/spec-reality-check/evals/bench-synthetic.ts
```

## Почему

Bulk-run на real corpus в session 2026-05-24 поймал **4 systemic false-positive bugs за 1 проход** которые не видны на isolated fixtures:

1. Template placeholders `{путь/...}` → FC_*_MISSING ERROR
2. Glob patterns `extensions/*/extension.json` → FC_EDIT_MISSING ERROR
3. Glob narrative refs `steps/**/*.ts` → NARRATIVE_PATH_MISSING WARNING
4. Cyrillic header `Файл | Описание` → 27 FC_PARSE_UNPARSEABLE per spec

Без bulk-run эти баги ушли бы в production. Eval suite алгоритмически чистая, но real specs имеют форматы которые fixtures не симулируют.

## Что проверять

- [ ] `run-evals.ts` — 25/25 PASS, 100% points, 0 regressions in `regression-baseline-pinned` category
- [ ] `bulk-run.ts` — Number of clean specs не уменьшилось vs предыдущая итерация (`bulk-real-specs.json`); если уменьшилось → новый false positive
- [ ] `bench-synthetic.ts` — algorithm остаётся O(N) linear; p95@2000rows < 100ms; NFR (≤30s) не нарушен

## При изменении verify.ts/verify-hook.ts

После каждого Edit:
1. Скопировать в installed copy: `cp .claude/skills/spec-reality-check/scripts/verify*.ts .dev-pomogator/tools/spec-reality-check/`
2. Запустить evals (см. выше)
3. Запустить bulk-run
4. Если regression-baseline-pinned ИЛИ bulk clean count fell — НЕ коммитить пока не починено

## При добавлении нового check

После добавления нового check code (например `FC_NEW_THING`):
1. Добавить его в `expected_codes_optional` всех baseline-pinned evals (16, 17 в iteration-2)
2. Добавить positive eval с isolated fixture
3. Добавить negative eval — что новый check НЕ fire-ит когда не должен
4. Описать в `references/checks.md`
5. Обновить `evals/README.md` — codes list

## При добавлении нового языка/локали в parser

После расширения parser regex (header / action / placeholder / glob):
1. Создать i18n eval (см. `v2-fc-cyrillic-header-recognized` как template)
2. Bulk-run на real specs — проверить что не упали другие
3. Update parser docs в `verify.ts` JSDoc

## Запреты

- НЕ коммитить изменения verify.ts/verify-hook.ts без запуска evals
- НЕ удалять existing evals — только дополнять
- НЕ менять `expected_codes` / `forbidden_codes` существующих evals "чтобы прошло" — это эквивалент disabling test
- НЕ полагаться только на vitest tests/e2e/spec-reality-check.test.ts — они на синтетических фикстурах; bulk-run на real corpus обязателен

## Связанные правила

- `.claude/rules/extension-test-quality.md` — 1:1 mapping тестов и сценариев
- `.claude/rules/extension-manifest-integrity.md` — обновлять extension.json при изменениях skill
- `.claude/rules/post-edit-verification.md` — после каждого edit: build + tests + verify

## История

Создано 2026-05-24 после iteration-2 + bulk-run discovery 4 bugs. Цель — чтобы будущие сессии не теряли trail из 3 артефактов (evals/bench/bulk) при редактировании skill.
