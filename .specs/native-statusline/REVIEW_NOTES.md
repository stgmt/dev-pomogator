# Spec Review: native-statusline

**Phase:** Complete (review навёрстан после STOP #1/#2/#3 — был пропущен «ради momentum», восстановлен по требованию advisor)
**Generated:** 2026-06-04
**Scope:** категории 1, 2, 4, 6, 9, 10, 14, 15 (spec-time, Phase Complete)

## Summary

| Severity | Count | Verdict |
|----------|-------|---------|
| P0 (blockers) | 0 | ✅ clear |
| P1 (fix before stop) | 0 | ✅ clear |
| P2 (recommendations) | 1 | ℹ️ logged (verification-gap caveat добавлен) |
| P3 (informational) | 2 | ℹ️ logged (audit INFO false-positives) |

**Overall verdict:** READY (spec/план готов; см. оговорку про verification-gap)

## Категории — результат

| # | Category | Result |
|---|----------|--------|
| 1 | External-API claim verify | ✅ Core claim VERIFIED: `statusLine.command` в `~/.claude/settings.json` рендерит строку (официальные statusline-доки). Эталон pardes/claude-octopus — verified через WebFetch description (не исходник) → понижено до «образец паттерна», не источник правды поведения. |
| 2 | Existing-asset duplicate | ✅ Домен native statusline не занят (grep `.specs/`, `tools/`); test-statusline — другой домен, не дублируется. |
| 4 | Assumption-vs-Requirement | ✅ Допущение «ccstatusline — правильный дефолт» зафиксировано как литерал команды (документированный дефолтный тул CC), не как непроверенное требование. |
| 6 | @featureN consistency | ✅ @feature1-5 присутствуют в USER_STORIES/USE_CASES/REQUIREMENTS/.feature. FR/AC мапятся через REQUIREMENTS traceability matrix (конвенция — inline-теги в FR/AC не требуются). |
| 9 | BDD Test Infra → Phase 0 | ✅ TEST_DATA_ACTIVE → Phase 0 содержит hook (beforeEach/afterEach temp HOME) + 5 fixtures. |
| 10 | Hallucination/fluff | ✅ Нет vague-метрик без чисел; claims подкреплены evidence (git/docs/grep). |
| 14 | Memory-constraint compliance | ✅ В memory нет `feedback_*.md` → нет forbidden-literal ограничений. |
| 15 | Reality drift | ℹ️ FILE_CHANGES — преимущественно `create` (новый код ещё не существует) — ожидаемо для pre-implementation спеки. |

## P2 — verification-gap (исправлено в спеке)

**Findings (advisor):** планируемые spawnSync-тесты доказывают только **запись** `statusLine` в settings.json, НЕ **рендеринг** строки самим Claude Code. Зелёные автотесты ≠ «строка вернулась у юзеров».

**Resolution:** добавлены явные **Manual Verification** требования в DESIGN.md (раздел «Manual Verification») и TASKS Phase 5 final verification (manual E2E: реальный install → restart → строка ВИДНА, screenshot CONFIRMED). Баг закрывается только после этого ручного шага.

## P3 — принятые audit INFO (см. AUDIT_REPORT.md)

- `TASKS_FR_REFS: FR-10` — корректно (OUT OF SCOPE, без задачи).
- `UNVERIFIED_CONFIG: TEST_DATA / TEST_FORMAT` — false-positive (BDD-метки классификации, не env vars).

## Важно (scope)

Это **спека/план**, а не починенный статуслайн. Баг «statusLine пропал у юзеров» остаётся
**открытым** до реализации по TASKS.md + ручной E2E-проверки рендера.
