# Variant Format Spec

Each variant in an AxisModel (consumed by `artefact-generator.ts` → `VariantModel`) follows this skeleton. Attribution = where each field comes from.

```
{
  "id": "kebab-id",
  "name": "Human name",
  "y_statement": "In the context of X, facing Y, use Z and reject W, to achieve V, accepting U.",   // Zimmermann Y-statement
  "maturity_ring": "Adopt | Trial | Assess | Hold",                                                  // Thoughtworks Tech Radar
  "cost_chip": "$ | $$ | $$$",                                                                        // qualitative, not exact $ (stale)
  "good":    ["Good, because <concrete property> [VERIFIED via <doc>]"],                              // MADR Good + R3 marker
  "neutral": ["Neutral, because <wash fact>"],                                                        // MADR Neutral (avoids fake con)
  "bad":     ["Bad, because <concrete cost> [VERIFIED|UNVERIFIED]"],                                   // MADR Bad
  "failure_modes": ["crash mid-op → mitigation", "duplicate side-effect → idempotency key", ...],     // R10 (bhph)
  "when_to_choose": "one scenario sentence",                                                           // TC39 use-cases / KEP Goals
  "when_not_to_choose": "one scenario sentence",                                                       // KEP Non-Goals (R6)
  "real_world_precedent": [{ "repo": "...", "stars": N, "url": "..." }],                               // live octocode grep (R8 evidence)
  "confirmation": "fitness function — how we know it works post-adoption",                            // MADR v4 Confirmation
  "is_recommended": true|false,
  "policy_fit": ["mvp-poc", "cost-optimal"],                                                          // FR-16 — под какие из 5 политик вариант оптимален (опц.)
  "correction_log": ["предполагал X → context7 показал Y → исправил потому что Z"],                   // FR-14 — reasoning journey (опц., пусто → нет секции)
  "business_summary": {                                                                               // R24 бизнес-линза (plain language, не для инженера)
    "gets": "какую способность/ценность получает бизнес",
    "time_to_market": "срок до первого результата",
    "cost": "деньги: старт + при росте",
    "risk": "главный бизнес-риск выбора"
  },
  "scorecard": [                                                                                      // R24 имплементатор-линза → карта-сравнение (критерии × варианты)
    { "criterion": "Лёгкость интеграции", "verdict": "good|ok|bad", "value": "БД+auth из коробки", "source": "[VERIFIED via context7:...]" }
    // обязательный набор: Стоимость, Лёгкость интеграции, Кривая обучения, Ops-нагрузка, SSL/HTTPS, Масштабирование, Vendor lock-in, Экосистема (одинаковый у всех вариантов оси)
  ],
  "reality_check": [                                                                                  // R24 «из реала» — что руками: SSL/HTTPS, бэкапы+restore, мониторинг, secrets, обновления ОС, склейка
    "SSL-серты — certbot+nginx, auto-renew cron (забыл → сайт лёг через 90 дней)",
    "Бэкапы — pg_dump + offsite cron сам, проверяешь restore"
  ],
  "exit_cost": "Postgres выгрузишь легко, Auth+RLS переписывать ~2 нед",                              // R25 цена СЛЕЗТЬ (lock-in → число)
  "cost_at_scale": [{ "tier": "MVP/100", "cost": "$0" }, { "tier": "10k", "cost": "$25" }, { "tier": "100k", "cost": "$300+" }], // R25 кривая денег
  "time_costs": { "to_market": "1-2 дня", "to_feature": "часы", "to_test": "встроено", "to_support": "~2ч/мес" }  // R25 кривая ВРЕМЕНИ команды
}
```

На уровне ОСИ (`AxisModel`, не варианта): `door_type` (`one-way`=необратимо, выход дорогой → ресёрчь глубже; `two-way`=обратимо) и `sensitivity[]` («рекомендация меняется если…» — решение как функция параметров). `real_world_precedent[].relevance` — почему пруф релевантен ИМЕННО проекту (похожая система), не звёзды.

`verdict` нормализован по СМЫСЛУ (good=зелёный=хорошо для проекта): «ops низкий»=`good`, «lock-in высокий»=`bad`. `scorecard.criterion` должны совпадать у всех вариантов оси — иначе карта-сравнение (критерии × варианты) рендерится кривой. `reality_check` — конкретные операционные шаги (не маркетинг), для managed-платформ честно: что покрыто, а что всё равно на тебе.

`policy_fit` ∈ {`mvp-poc`, `production-grade`, `cost-optimal`, `scale-ready`, `portability`}. Helper выбирает recommended = вариант чей `policy_fit` ∋ `selected_policy` оси (fallback `is_recommended`). Если у вариантов оси РАЗНЫЕ `policy_fit` → артефакт рендерит demonstration-таблицу (вариант × 5 политик).

## Discipline reminders (BLOCKING — see SKILL.md)

- **R3:** every technical claim → `[VERIFIED via <source>]` or `[UNVERIFIED]`. No bare confident facts.
- **R10:** `failure_modes` non-empty — crash / duplicate / poison / race. "Exactly-once delivery" ≠ idempotent side-effect.
- **R11:** each choice is vendor-RECOMMENDED [cite], not just feasible.
- **R12:** for external integrations note webhook timeout / sync-vs-async / rate limits in good/bad/failure_modes.
- **R8:** ≥1 variant outside the obvious popular default.
- **R14:** if a premise changed mid-research (assumed X → found Y → corrected), record it in `correction_log` — honest reasoning journey, not fabricated. Empty log → no Corrections section.
- **R15:** prefer `[VERIFIED via context7:<lib> <ver>]` (live fetch) over second-hand facts; no match → `[UNVERIFIED — Context7 no match]`.

Exactly one variant per axis has `is_recommended: true` (the policy-neutral default). The RENDERED recommendation is policy-aware: `policy_fit` ∋ `selected_policy` wins, falling back to `is_recommended`. Recommendation pinned top by html-renderer regardless of grid shuffle order.
