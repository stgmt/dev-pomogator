# Architecture Decision Builder Schema

## Pipeline

```
[PRD markdown] → [enumerate: axis-detector] → AxisCandidate[] → QUEUE.json
                                                                    ↓
                  [next-axis: live-fetch → artefact-generator] → AXIS-NN.md + AXIS-NN.html
                                                                    ↓
                  [AskUserQuestion choice] → frontmatter update → [cascading check → QUEUE.json]
                                                                    ↓
                  [compile-index] → INDEX.md + INDEX.html
                                                                    ↓
                  [synthesis] → SYNTHESIS.md (cross-axis insights, FR-13)
                                                                    ↓
                  [audit + audit-completeness] → ARCHITECTURE_COVERAGE + COMPLETENESS_COVERAGE findings
```

> Selection policy (FR-16) выбирается ОДИН раз глобально перед per-axis loop (default `mvp-poc`); влияет на recommended-вариант каждой оси.

## AxisCandidate (output axis-detector)

```json
{
  "id": "string (kebab-case, e.g. 'hosting')",
  "name": "string (human label)",
  "category": "Data | Auth-Security | API-Communication | Frontend | Infra-Deployment | Other",
  "tier": "Critical | Important | Deferred",
  "why_needed": "string (1 sentence)",
  "evidence_quotes": ["string (PRD line quote)"],
  "suggested_variants": [{ "name": "string", "one_liner": "string", "sources_to_verify": ["string"] }],
  "depends_on": ["axis-id"]
}
```

- `id`: стабильный идентификатор, используется как seed для Fisher-Yates рандомизации
- `tier`: BMAD 3-tier приоритизация
- `evidence_quotes`: цитаты из PRD доказывающие что ось релевантна (anti-fantasy)
- `depends_on`: оси которые должны быть решены раньше (ordering)

## QUEUE.json (stateless RPC state)

```json
{
  "spec_slug": "string",
  "axes": [
    { "id": "string", "status": "pending | accepted | deferred | rejected", "chosen": "variant-id | null", "depth": "number" }
  ],
  "cascading_depth": "number (max 2)"
}
```

- `status`: жизненный цикл оси; `audit` блокирует STOP при наличии `pending`
- `depth`: уровень cascading (0 = из enumerate, 1-2 = из cascading); cap 2
- `chosen`: записывается из AskUserQuestion выбора

## Axis artefact frontmatter (AXIS-NN-{slug}.md)

```json
{
  "axis_id": "string",
  "status": "pending | accepted | deferred | rejected",
  "chosen": "variant-id | null",
  "rationale": "string (почему выбран, из AskUserQuestion)",
  "recommended": "variant-id",
  "variants_count": "number"
}
```

## VariantModel (вход html-renderer)

```json
{
  "id": "string",
  "name": "string",
  "y_statement": "string (6-part Zimmermann formula)",
  "maturity_ring": "Adopt | Trial | Assess | Hold",
  "cost_chip": "$ | $$ | $$$",
  "good": ["string (concrete property + [VERIFIED]/[UNVERIFIED])"],
  "neutral": ["string"],
  "bad": ["string"],
  "when_to_choose": "string (1 sentence)",
  "when_not_to_choose": "string (1 sentence)",
  "real_world_precedent": [{ "repo": "string", "stars": "number", "url": "string" }],
  "confirmation": "string (fitness function)",
  "is_recommended": "boolean",
  "policy_fit": ["PolicyId (опц., FR-16) — под какие политики вариант оптимален"],
  "correction_log": ["string (опц., FR-14) — 'предполагал X → обнаружил Y → исправил потому что Z'"],
  "business_summary": { "gets": "...", "time_to_market": "...", "cost": "...", "risk": "..." },
  "scorecard": [{ "criterion": "string", "verdict": "good|ok|bad", "value": "string", "source": "string (опц.)" }],
  "reality_check": ["string — что руками: SSL/HTTPS, бэкапы+restore, мониторинг, secrets, обновления ОС, склейка"],
  "exit_cost": "string (R25) — цена слезть с варианта",
  "cost_at_scale": [{ "tier": "MVP/100", "cost": "$0" }, { "tier": "10k", "cost": "$25" }],
  "time_costs": { "to_market": "...", "to_feature": "...", "to_test": "...", "to_support": "..." }
}
```

`Precedent` += `relevance?: string` (R25 — почему релевантно проекту, не звёзды).
`AxisModel` += `door_type?: 'one-way' | 'two-way'` (R25 обратимость, Bezos) + `sensitivity?: string[]` (R25 — «рекомендация меняется если…», решение как функция параметров).

## R24 two-lens + scorecard + reality (FR-2 расширение)

- `business_summary` — бизнес-линза (plain language): `gets`/`time_to_market`/`cost`/`risk`. Рендерится `💼 Для бизнеса` лентой.
- `scorecard[]` — имплементатор-линза → **карта-сравнение** (критерии в строках × варианты в колонках, цвет по `verdict`). Обязательные критерии: Стоимость, Лёгкость интеграции, Кривая обучения, Ops-нагрузка, SSL/HTTPS, Масштабирование, Vendor lock-in, Экосистема — одинаковые у всех вариантов оси.
- `reality_check[]` — «из реала» (что вендор замалчивает): SSL+certbot+auto-renew, бэкапы+restore-verify, мониторинг+алерты, secrets-wiring, обновления ОС, межкомпонентная склейка. Рендерится `⚠️ Реальность` секцией.
- `verdict` нормализован по смыслу: `good`=зелёный (хорошо для проекта), `bad`=красный — «ops низкий»=good, «lock-in высокий»=bad.

## PolicyId (FR-16 selection policy)

```
PolicyId = "mvp-poc" | "production-grade" | "cost-optimal" | "scale-ready" | "portability"
```

- `mvp-poc` — **default**; рекомендовать самый простой/быстрый вариант (time-to-market↓)
- `production-grade` — надёжность/SLA/observability приоритет
- `cost-optimal` — минимизация стоимости
- `scale-ready` — горизонтальное масштабирование
- `portability` — без vendor lock-in
- Глобальна для одного прогона (не per-axis). `AxisModel.selected_policy?: PolicyId` (отсутствует → `mvp-poc`).
- recommended-вариант = тот, чей `policy_fit` включает `selected_policy`; fallback на `is_recommended` если ни один не подходит.

## Insight (FR-13 cross-axis synthesis, элемент SYNTHESIS.md)

```json
{
  "axes": ["axis-id (≥2 — cross-axis по определению)"],
  "title": "string (краткий заголовок инсайта)",
  "description": "string (что именно поперёк осей обнаружено)",
  "recommendation": "string (что делать — напр. 'убрать n8n, оркестрация в Supabase')",
  "trade_off": "string (компромисс/риск инсайта)"
}
```

- `synthesis <spec-dir>` → `{ synthesisMd: "path", insights_count: number }`; пишет `SYNTHESIS.md`.
- `insights_count = 0` допустимо (1-axis spec) — не ложно-падает.

## Escape log entry (.claude/logs/spec-architecture-escapes.jsonl)

```json
{ "ts": "ISO8601", "spec": "slug", "axis_id": "string", "reason": "string", "session_id": "uuid", "cwd": "abs/path" }
```

## ARCHITECTURE_COVERAGE finding (audit output)

```json
{ "code": "AXIS_PENDING | WARNING_REASON_TOO_SHORT | MATRIX_COMPLETE", "severity": "WARNING | INFO", "axis_id": "string", "message": "string" }
```

## Правила валидации

- `AxisCandidate.tier` ∈ {Critical, Important, Deferred}; `category` ∈ closed list; `evidence_quotes` non-empty (anti-fantasy — ось должна иметь PRD-обоснование)
- `QUEUE.json.cascading_depth` ≤ 2; превышение → exit code 4
- `VariantModel`: ≥3 вариантов на ось; ровно один `is_recommended=true`; каждый `good`/`bad` буллет содержит конкретное свойство (не прилагательное) + маркер `[VERIFIED]`/`[UNVERIFIED]`
- Escape reason ≥ 12 chars иначе WARNING_REASON_TOO_SHORT
- HTML self-contained: inline CSS, нет внешних `<link>`; mermaid CDN только при отсутствии `--no-mermaid`
- Word-budget: разброс длины описаний вариантов ≤ ±15% (position-bias mitigation)
- `PolicyId` ∈ closed list из 5 значений; `selected_policy` отсутствует → трактуется как `mvp-poc`
- `policy_fit` опционален; при наличии — каждый элемент валидный `PolicyId`; ось с разными `policy_fit` у вариантов → артефакт обязан содержать demonstration-таблицу
- `Insight.axes` ≥ 2 (cross-axis инвариант); `synthesis` insights_count=0 — valid (не ошибка)
- `correction_log` опционален; пустой/отсутствует → секция `## Corrections` не рендерится (не пустой заголовок)
