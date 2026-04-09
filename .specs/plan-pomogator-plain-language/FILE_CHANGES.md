# File Changes

Список файлов которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `extensions/plan-pomogator/tools/plan-pomogator/template.md` | edit | [FR-1](FR.md#fr-1-template-содержит-секцию-простыми-словами-первой-feature1) — добавить `## 💬 Простыми словами` первой секцией с тремя подсекциями-плейсхолдерами |
| `extensions/plan-pomogator/tools/plan-pomogator/validate-plan.ts` | edit | [FR-2](FR.md#fr-2-required_sections-массив-содержит-новую-запись-первой-feature2) + [FR-3](FR.md#fr-3-validatehumansummarysection-функция-проверяет-non-empty-content-feature3) — добавить запись в REQUIRED_SECTIONS массив (lines 20-29) первой + добавить функцию validateHumanSummarySection после validateContextContent + добавить вызов в validatePlanPhased Phase 1 блок |
| `extensions/plan-pomogator/tools/plan-pomogator/fixtures/valid.plan.md` | edit | [FR-4](FR.md#fr-4-fixture-validplanmd-содержит-новую-секцию-первой-feature4) — добавить ту же секцию первой с реальным контентом для устойчивости существующего теста "valid plan passes validation" |
| `.claude/rules/plan-pomogator/plan-pomogator.md` | edit | [FR-5](FR.md#fr-5-правило-plan-pomogatormd-содержит-two-stage-workflow-секцию-feature5) — добавить новую top-level секцию Two-Stage Plan Presentation Workflow с 4 Step + обновить Обязательную структуру + Pre-flight Checklist |
| `extensions/plan-pomogator/tools/plan-pomogator/requirements.md` | edit | [FR-6](FR.md#fr-6-canonical-requirementsmd-документирует-новую-секцию-feature6) — обновить секцию "Обязательная структура (порядок секций)" + добавить секцию "Two-Stage Plan Presentation" |
| `extensions/plan-pomogator/extension.json` | edit | [FR-7](FR.md#fr-7-extensionjson-версия-200-breaking-feature7) — bump версии 1.8.0 → 2.0.0 (BREAKING) + обновить description |
| `tests/e2e/plan-validator.test.ts` | edit | [FR-8](FR.md#fr-8-e2e-тесты-для-новой-секции-feature8) — добавить три новых теста (missing section / empty section / valid plan) |
| `tests/features/plugins/plan-pomogator/PLUGIN007_plan-pomogator.feature` | edit | [FR-8](FR.md#fr-8-e2e-тесты-для-новой-секции-feature8) — добавить минимум 6 BDD сценариев PLUGIN007_43..48 с @feature1..@feature8 тегами |
