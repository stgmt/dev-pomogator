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
                  [audit] → ARCHITECTURE_COVERAGE findings
```

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
  "is_recommended": "boolean"
}
```

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
