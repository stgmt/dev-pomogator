---
name: architecture-decision-builder
description: >
  Greenfield architecture decisions — enumerates tech-stack axes from a PRD, generates
  per-axis multi-variant markdown + self-contained HTML (rendered in browser), auto-applies
  the recommendation (auto-mode default) with optional override, cascades dependent axes.
  Standalone triggers (RU): "выбери стек", "спроектируй архитектуру", "архитектура для",
  "варианты архитектуры"; (EN): "choose stack", "design architecture", "architecture decision",
  "stack options". Also invoked by create-spec Phase 1.75 (greenfield only) once for
  axis-enumeration plus once per axis. Do NOT use for brownfield refactors (existing build
  manifest), single-tech feature decisions, or post-implementation reviews.
disable-model-invocation: false
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion, WebFetch, WebSearch, ToolSearch, mcp__context7__resolve-library-id, mcp__context7__query-docs, mcp__claude_ai_Context7__resolve-library-id, mcp__claude_ai_Context7__query-docs
---

# architecture-decision-builder

## Mission

Для greenfield-проекта (только PRD-маркдауны, кода нет) разложить выбор стека на decision-axes (database / auth / hosting / email / ...), и по каждой оси выдать ≥3 варианта с pros/cons/cost/«когда выбрать»/рекомендацией — как markdown + self-contained HTML (открывается в браузере, markdown глазами читать тяжело). Helper-скрипты — детерминированная механика (detect/render/compile/audit); **проза-анализ вариантов (pros/cons с пруфами) — твоя работа как LLM**, mirror variant-matrix (helpers parse, skill fills content).

## Дисциплины (BLOCKING — из реальных провалов, см. memory feedback_design-research-discipline)

При генерации каждого варианта ОБЯЗАТЕЛЬНО:

1. **Re-research при challenge.** Если юзер усомнился («не убедил», «не уверен», «проебал») — СТОП защищать посылку, подними доки (context7/WebSearch), проверь саму посылку, честно скажи «был неправ потому что X». Не держись за гипотезу до второго пинка.
2. **Best-practice, не feasibility (R11).** Не «это работает», а «вендор сам так рекомендует [cite doc]»; отклонения от best-practice — явно обоснуй.
3. **Failure-modes per вариант (R10).** Перечисли: crash mid-operation / duplicate side-effect / poison-infinite-retry / race. «Exactly-once delivery» ≠ idempotent side-effect.
4. **External-integration timing (R12).** Для каждой внешней интеграции проверь: webhook timeout / required-response-time (respond-immediately если обработчик медленнее), sync-vs-async семантику, rate limits, per-resource queue limits.
5. **Anti-hallucination (R3, BLOCKING).** Каждое тех-заявление помечай `[VERIFIED via <source>]` или `[UNVERIFIED]`. Cost — cited или `[UNVERIFIED — knowledge cutoff]`, не голые уверенные числа.
6. **Live context7 пруфы (R15, FR-15).** Не переписывай факты из памяти/эталона second-hand — для каждого тех-заявления варианта зарезолви библиотеку через context7 MCP (`resolve-library-id` → `query-docs`; ВНИМАНИЕ: имя тулзы зависит от способа подключения сервера — `mcp__context7__*` для локальной регистрации, `mcp__claude_ai_Context7__*` для claude.ai-коннектора; если прямой вызов даёт unknown tool — найди актуальное имя через ToolSearch "context7") и пометь `[VERIFIED via context7:<lib> <ver>]`. Если context7 не нашёл библиотеку → `[UNVERIFIED — Context7 no match]`, НЕ выдумывай. context7 недоступен/rate-limit → fallback на тот же `[UNVERIFIED]` маркер (не blocking).
7. **Correction-log (R14, FR-14, опционально).** Если по ходу ресёрча ты ИЗМЕНИЛ посылку (предполагал X → context7/challenge показал Y → исправил) — зафиксируй в `VariantModel.correction_log[]` строкой «предполагал X → обнаружил Y → исправил потому что Z». Рендерится секцией `## Corrections`. Не выдумывай фейковые корректировки если их не было — пустой log не рендерит секцию.
8. **Две линзы + карта-сравнение + РЕАЛЬНОСТЬ (R24, BLOCKING — артефакт бесполезен без этого).** Каждый вариант ОБЯЗАН нести:
   - `business_summary` (**бизнес-линза**, plain language): `gets` (какую способность получает бизнес), `time_to_market` (срок до первого результата), `cost` (деньги: старт + при росте), `risk` (главный бизнес-риск). Без жаргона — это читает не инженер.
   - `scorecard[]` (**имплементатор-линза**, многокритериальная карта): по КАЖДОМУ критерию `{criterion, verdict (good/ok/bad), value, source?}`. Обязательный набор критериев: **Стоимость, Лёгкость интеграции, Кривая обучения, Ops-нагрузка, SSL/HTTPS, Масштабирование, Vendor lock-in, Экосистема** (+ axis-специфичные). Критерии должны совпадать у всех вариантов оси (иначе карта-сравнение кривая). `verdict` нормализован по СМЫСЛУ: good=зелёный (хорошо для проекта), bad=красный — «ops низкий»=good, «lock-in высокий»=bad.
   - `reality_check[]` (**«из реала»** — то что укусит, а вендор замалчивает): что придётся НАСТРАИВАТЬ И СКЛЕИВАТЬ РУКАМИ. Обязательно покрой, если применимо: **SSL-серты + HTTPS-конфиг (certbot/nginx/auto-renew)**, **бэкапы + проверка restore**, **мониторинг + алерты**, **secrets-wiring/ротация**, **обновления безопасности ОС**, **склейка между компонентами** (firewall, healthchecks, межсервисная авторизация). Для managed-платформ честно пиши что покрыто платформой, а что всё равно на тебе (алерты, custom-домен серт, бэкапы на free-плане). Голый «good/bad» буллет НЕ заменяет reality_check — это конкретные операционные шаги.
   - **Источников ≥2 на вариант** (real_world_precedent) + цитата на каждый scorecard-критерий где возможно (`source`). «Источников мало» = провал R3/R8.
9. **Экономика решения — деньги И время по жизненному циклу + обратимость (R25, BLOCKING).** Каждый вариант/ось ОБЯЗАН нести:
   - `cost_at_scale[]` — кривая ДЕНЕГ, не точка: `[{tier:"MVP/100",cost:"$0"},{tier:"10k",cost:"$25"},{tier:"100k",cost:"$300+"}]`. Ловушка дешёвого MVP должна быть видна.
   - `time_costs` — кривая ВРЕМЕНИ команды (деньги это не всё): `to_market` (до первого прода), `to_feature` (типичная фича на этом стеке), `to_test` (настройка+прогон тестов), `to_support` (мейнтенанс в месяц). Считай ВСЕ четыре — выбор который дёшев деньгами, но жрёт время на тесты/поддержку, должен это показать.
   - `exit_cost` (на варианте) — конкретная цена СЛЕЗТЬ («Postgres выгрузишь легко, Auth+RLS переписывать ~2 нед»). Делает `Vendor lock-in` не ярлыком, а числом.
   - `door_type` (на оси) — `one-way` (необратимое, выход дорогой → ресёрчь в 10× глубже) vs `two-way` (обратимое → не переусердствуй). Рамка Bezos: БД/auth обычно one-way, email/CDN — two-way.
   - `sensitivity[]` (на оси) — «рекомендация МЕНЯЕТСЯ если…»: `["→ Railway если нужен чистый Node-рантайм","→ VPS если бюджет критичен И есть devops"]`. Решение как функция параметров, не догма.
   - `real_world_precedent[].relevance` — ПОЧЕМУ пруф релевантен ИМЕННО этому проекту (похожая система/кейс), не просто звёзды. «74k★» доказывает популярность, не пригодность для cron+webhook+SMS. Ищи прецедент похожей системы.

## Selection policy (FR-16)

Рекомендация зависит от ЦЕЛИ проекта, не абсолютна. Перед per-axis loop выбери политику ОДИН раз глобально (step 1.5 ниже). 5 политик:

| PolicyId | Цель | recommended-вариант |
|----------|------|---------------------|
| `mvp-poc` **(default)** | Прототип/MVP — быстрее запуститься (time-to-market↓) | самый простой/быстрый в реализации |
| `production-grade` | Прод на годы | надёжность/SLA/observability |
| `cost-optimal` | Минимум денег | самый дешёвый при приемлемом качестве |
| `scale-ready` | Рост нагрузки | горизонтальное масштабирование |
| `portability` | Без vendor lock-in | переносимость между провайдерами |

Каждому варианту проставь `policy_fit: PolicyId[]` (под какие политики он оптимален). Helper выбирает recommended = вариант чей `policy_fit` включает `selected_policy` (fallback `is_recommended`). Артефакт рендерит demonstration-таблицу (вариант × 5 политик) — наглядно показывает что выбор зависит от цели. **Default `mvp-poc` обоснован**: проще/быстрее → TTM↓; не требует обязательного ответа (auto-mode сохранён).

## Commands (stateless RPC, state в QUEUE.json)

CLI: `tools/specs-generator/architecture-decision/architecture-decision-cli.ts`

- **`detect-axes <prd-path>`** → `{axes_detected, axes[], skipped_reason?}`. 3-layer detection (BMAD seed + keyword + NEEDS CLARIFICATION). Brownfield build-manifest → axes_detected=0.
- **`generate-axis <axis-model.json> <outDir>`** → `{mdPath, htmlPath, wordBudgetOk}`. Рендерит AxisModel (варианты заполнены тобой) в md+html. Recommendation pinned top.
- **`open-browser <html-path>`** → `{launched, fallback?}`. Cross-platform, ENOENT-safe.
- **`compile-index <spec-dir>`** → `{axes_total, axes_pending, rows}`. Idempotent INDEX.md+html.
- **`audit <spec-dir>`** → `{findings[]}`. ARCHITECTURE_COVERAGE (FR-9, 9-я категория): pending axis→WARNING, accepted→MATRIX_COMPLETE, escape→ESCAPE_HATCH_USED/WARNING_REASON_TOO_SHORT.
- **`audit-completeness <spec-dir>`** → `{findings[]}`. COMPLETENESS_COVERAGE (FR-12, 10-я категория): читает `COMPLETENESS.md` ledger (8 dimensions) — pending/missing→DIMENSION_PENDING WARNING, all addressed/out-of-scope→COMPLETENESS_COMPLETE, escape `[skip-completeness-dimension:]`→WARNING_REASON_TOO_SHORT. **Отдельная команда** (не merged в audit — architecture audit unmixed для eval determinism).
- **`synthesis <spec-dir> [insights.json]`** → `{synthesisMd, insights_count, rejected[]}`. FR-13 cross-axis synthesis: ты авторишь `insights[]` (`{axes[≥2], title, description, recommendation, trade_off?}`) в JSON, helper валидирует (каждый insight ссылается на ≥2 РЕАЛЬНЫХ axis-id) + рендерит `SYNTHESIS.md`+`.html`. Невалидные → `rejected[]` с причиной (не silently). `insights_count=0` валидно (1-axis spec).
- **`record-verify <spec-dir> <lib> [ver]`** → `{recorded}`. FR-20 anti-hallucination: вызывай ПОСЛЕ реального context7-вызова, чтобы подкрепить `[VERIFIED via context7:<lib>]` маркер. Пишет в `.architecture-verify.jsonl`.
- **`audit-markers <spec-dir>`** → `{findings[]}`. FR-20: сканит AXIS-*.md на `[VERIFIED via context7:<lib>]`, сверяет с verify-log; маркер без записи → `UNBACKED_VERIFIED_MARKER` WARNING (фабрикованный пруф). Presence маркера ≠ правдивость — gate делает R3/R15 аудируемыми, не trust-based.
- **`full-report <spec-dir> [insights.json]`** → `{reportPath, axes_count, insights_count, completeness_count}`. FR-19: собирает ЕДИНЫЙ self-contained `ARCHITECTURE.html` из `AXIS-*.model.json` (пишутся generate-axis автоматически) + insights + `COMPLETENESS.md` → index-матрица + каждая ось (богатые карточки: 2 линзы + scorecard + reality + экономика) + synthesis + completeness. Рендерится через те же `renderAxisSection`/`renderSynthesisSection` (НЕ скрейп HTML) — отчёт наследует весь rich-контент. Запускать ПОСЛЕ всех generate-axis + synthesis.

## Workflow (auto-mode default — FR-4)

1. **Enumerate.** `detect-axes <prd>` → tier-grouped список (Critical/Important/Deferred). Если brownfield (axes_detected=0) → выйти, сообщить skipped_reason. Иначе показать оси, write QUEUE.json.
1.5. **Policy selection (FR-16) — ОДИН раз глобально.** `AskUserQuestion`: «Под какую цель выбираем стек?» с опцией `[MVP / прототип]` ПЕРВОЙ (Recommended) и `[Production]`. Это единственный полу-блокирующий вопрос; default — `mvp-poc` (если auto-mode / нет ответа). Запиши `selected_policy` в QUEUE.json, прокидывай в каждый AxisModel. НЕ спрашивай политику per-axis — она глобальна.
2. **Per axis (auto-mode):**
   - Построить AxisModel: ≥3 варианта, каждый с дисциплинами 1-7 выше (Y-statement, Good/Neutral/Bad, failure_modes, when/when-NOT, [VERIFIED via context7] markers, cost chip, `policy_fit[]`). ≥1 вариант вне очевидного дефолта (R8). Проставь `selected_policy` (из step 1.5) в AxisModel.
   - `generate-axis` → md+html (recommended выбирается policy-aware: `policy_fit` ∋ `selected_policy`, fallback `is_recommended`; рендерит demonstration-таблицу + policy-badge). `open-browser`.
   - **Auto-apply рекомендации** (status=accepted, chosen=recommended) — БЕЗ блокирующего AskUserQuestion. Cascading check: выбор открыл новую ось? → добавить в QUEUE (depth cap 2).
   - `compile-index`.
3. **Completeness ledger (R13-R20, FR-12) — горизонталь полноты системы.** ПЕРЕД финалом запиши `COMPLETENESS.md` рядом с INDEX — markdown-таблица `| Dimension | Status | Pointer / Reason |` из 8 system-completeness измерений: `internal-consistency`, `flow-completeness`, `compliance-privacy`, `auth-secrets`, `observability`, `data-lifecycle`, `cost-quota`, `deploy-ops`. Каждое: `addressed` (+ где в дизайне) / `out-of-scope` (`[skip-completeness-dimension: <reason ≥12>]`) / `pending`. **`cost-quota` оцени ДО lock осей** — единственное измерение, которое может изменить axis-решение (напр. poll-cadence выбивает invocation-quota → переключись на event-driven ДО фиксации стека). Per-axis качество (R1-R12) ≠ полнота системы (R13-R20): ось может быть «выбрана отлично», а флоу/секрет/комплаенс/стоимость — пропущены. Маппинг измерений ← 12 реальных дыр scenario-bhph → AWS Well-Architected.
   - **Заполняй ledger ОТДЕЛЬНЫМ свежим под-агентом** (`Agent` tool), который НЕ писал архитектуру — настоящая вторая пара глаз, не самопроверка. Дай ему ТОЛЬКО 8 пунктов + PRD + дизайн (не свои выводы), попроси для КАЖДОГО пункта сверить «PRD требует X — закрыт ли X реальным компонентом дизайна?» и вернуть `status` + пруф-ссылку (`addressed` без пруфа = подозрительно). «PRD хочет, компонента нет» = `pending`. Self-grade замылен — подтверждено research (CorrectBench/DeepVerifier) И слепым прогоном bhph (автор пропустил 3 дыры, свежий агент нашёл за проход).
3.5. **Cross-axis synthesis (FR-13).** Когда все оси resolved — прочитай все AXIS-*.md side-by-side и найди emergent-выводы поперёк осей (cross-axis dependency / избыточность компонента / вторичный эффект). Главный кейс bhph «Variant F» был именно такой: hosting=Supabase + auth=Supabase → n8n-orchestrator избыточен. Заавторь `insights[]` (каждый `axes[]` ≥2 реальных axis-id) в JSON → `synthesis <spec-dir> insights.json` → SYNTHESIS.md+html. Проверь `rejected[]` в ответе (insight с <2 осями или unknown axis-id отклонён). 0 insights валидно (независимые оси / 1-axis spec).
4. **Audit перед STOP — две раздельные команды.** `audit <spec-dir>` (ARCHITECTURE_COVERAGE — нет pending осей) И `audit-completeness <spec-dir>` (COMPLETENESS_COVERAGE — все 8 измерений addressed/out-of-scope). Любой `AXIS_PENDING` / `DIMENSION_PENDING` WARNING блокирует STOP — закрой ось/измерение, отметь `out-of-scope` с reason, или escape. Команды раздельны намеренно: architecture audit остаётся unmixed для eval-детерминизма.
5. **Финал:** `full-report <spec-dir> [insights.json]` → единый `ARCHITECTURE.html` (index-матрица + все оси с богатыми карточками + synthesis + completeness, self-contained). `open-browser` на него. Одним сообщением показать все авто-выборы. Юзер переопределяет в свободной форме («ось hosting — возьми Variant B»). INDEX.html остаётся как лёгкая статус-матрица; ARCHITECTURE.html — полный отчёт «всё в одном».
6. **Interactive-mode** (`--interactive`): на каждой оси AskUserQuestion `[Беру рекомендацию] / [Variant B] / [Variant C] / [Отложить]`.

## Output location

- create-spec mode: `.specs/{slug}/ARCHITECTURE/AXIS-NN-{id}.md|.html|.model.json` + `INDEX.md|.html` + `COMPLETENESS.md` + `SYNTHESIS.md|.html` + `ARCHITECTURE.html` (full-report)
- standalone: `./architecture-decisions/{slug}/` (incl. `COMPLETENESS.md`, `SYNTHESIS.md`, `ARCHITECTURE.html`)
- `AXIS-*.model.json` — persisted AxisModel (источник для full-report re-render; не для глаз)

## Hard-OUT (НЕ запускать)

- Repo содержит build-manifest (`package.json`/`*.csproj`/`pyproject.toml`/`Cargo.toml`/`go.mod`) — brownfield.
- PRD фиксирует стек / «existing stack» / «locked» / «not being reconsidered».
- Single-tech feature decision (одна технология, нет выбора).
См. rule `.claude/rules/specs-workflow/architecture-decision/when-to-build-architecture.md`.

## Escape hatch

`[skip-architecture-axis: <reason ≥12 chars>]` в PRD/axis frontmatter — пропустить ось. Логируется в `.claude/logs/spec-architecture-escapes.jsonl`. reason <12 chars → WARNING_REASON_TOO_SHORT. См. `.claude/rules/specs-workflow/architecture-decision/escape-hatch-audit.md`.

## Eval / debug

`evals/` — deterministic eval-runner (`tools/eval-runner-adb.py`, host, no Docker) + qualitative rubric R1-R20 (`evals/rubric.json`; R1-R9 per-axis decision quality, R10-R12 per-variant design discipline, R13-R20 system-completeness layer). Golden bench `evals/artifact-bench/scenario-bhph/`. Прогон: `python tools/eval-runner-adb.py`. Completeness gate (R13-R20) enforced deterministically via `audit-completeness` COMPLETENESS_COVERAGE (FR-12, отдельная команда), tested via eval-7/8 (`eval-runner-adb.py`).

## Contract (JSON returns)

| Command | Returns |
|---------|---------|
| detect-axes | `{axes_detected, axes[], skipped_reason?}` |
| generate-axis | `{axis_id, mdPath, htmlPath, wordsPerVariant[], wordBudgetOk}` |
| open-browser | `{launched, fallback?}` |
| compile-index | `{axes_total, axes_pending, rows[]}` |
| audit | `{findings[]}` (ARCHITECTURE_COVERAGE) |
| audit-completeness | `{findings[]}` (COMPLETENESS_COVERAGE, FR-12) |
| synthesis | `{synthesisMd, insights_count, rejected[]}` (FR-13 cross-axis) |
| full-report | `{reportPath, axes_count, insights_count, completeness_count}` (FR-19 ARCHITECTURE.html) |
| record-verify | `{recorded}` (FR-20 back a real context7 verification) |
| audit-markers | `{findings[]}` (FR-20 UNBACKED_VERIFIED_MARKER) |

## Related

- Spec: `.specs/architecture-decision-builder/`
- Mirror reference: `.claude/skills/variant-matrix-build/SKILL.md`
- Trigger rule: `.claude/rules/specs-workflow/architecture-decision/when-to-build-architecture.md`
- Escape audit: `.claude/rules/specs-workflow/architecture-decision/escape-hatch-audit.md`
- create-spec Phase 1.75: `.claude/skills/create-spec/references/phase1.75_architecture-decisions.md`
