# No Structural «Valid» — структурный pass не является вердиктом здоровья (FR-37d)

## Правило

**ЗАПРЕЩЕНО** заявлять «spec valid / clean / done» (в чате, статусе, PR, отчёте) на основании
одного лишь `validate-spec: 0 errors`. Канонический вердикт здоровья спеки — **СМАРТ-анализ**:

```bash
npx tsx tools/specs-generator/spec-verdict.ts -Path .specs/<slug>   # [--no-semantic] [--json]
```

Он композирует над ОДНИМ графом (FR-36): structural pre-filter + `audit-spec` (hard gate) +
traceability-completeness FR-37b (stale FILE_CHANGES / UNCOVERED_FR / TASK_UNTESTED /
UNTAGGED_SCENARIO — hard gate) + conformance (error-severity гейтит) + coverage-rollup FR-32 +
FR-8 semantic (при наличии `claude`; иначе fail-loud `SEMANTIC_SKIPPED`). RED = есть gap list;
репортить здоровье = цитировать вердикт И gap list.

## Инцидент-основание (2026-06-05)

Агент прогнал структурный `validate-spec` (0 errors) и отрапортовал «spec valid» — при этом
`audit-spec` держал **10 P0 ERROR**, а smart-слой — **1256 находок** (1243 UNTAGGED_SCENARIO,
11 UNCOVERED_FR, 2 TASK_UNTESTED). Классический false green: структурный валидатор проверяет
форматирование и ссылки, не логику. Отчёт: `audit-reports/v4-smart-verdict-and-organism-traceability.md`.

## Антипаттерн

```
# ❌
npx tsx tools/specs-generator/validate-spec.ts -Path .specs/foo   # → valid: true
«Спека foo валидна, можно шипить»

# ✅
npx tsx tools/specs-generator/spec-verdict.ts -Path .specs/foo
«Вердикт: RED — 3 gap-а: [UNCOVERED_FR] foo:FR-7 …; структурный pre-filter чистый, но это не вердикт»
```

## Где enforced

- `spec-verdict.ts` сам печатает ноту «pre-filter only — NOT reportable as "valid/clean/done"».
- FR-37d гард-секции в скиллах `spec-status`, `spec-mcp-dogfood`, `runtime-dogfood`,
  `suite-failure-triage`.
- BDD: SPECGEN004_96 (бесструктурно-чистая спека с открытыми smart-находками ⇒ RED) и
  SPECGEN004_101 (скилл обязан отдавать smart-вердикт + gap list).

## Чеклист перед «спека готова»

- [ ] Прогнан `spec-verdict.ts` (не только validate-spec)
- [ ] Вердикт GREEN, ИЛИ каждый пункт gap list-а явно адресован/отнесён к известному долгу
- [ ] В сообщении процитирован ИМЕННО вердикт (+ semantic-нота, если SKIPPED)

## Связанные

- `.specs/spec-generator-v4/FR.md` FR-37 (a–e)
- `.claude/rules/verify-status-against-code-before-acting.md` — родственная дисциплина (доки дрейфуют)
- skill `spec-status` — честный evidence-backed статус (его вердикт ОБЯЗАН включать spec-verdict)
