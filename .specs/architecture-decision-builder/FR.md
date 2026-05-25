# Functional Requirements (FR)

## FR-1: Axis enumeration из PRD

Skill (команда `enumerate`) читает PRD-маркдауны и детектит decision-axes тремя слоями: (1) BMAD 5-tier seed taxonomy (Data / Auth-Security / API-Communication / Frontend / Infra-Deployment), (2) closed-list keyword grep по PRD, (3) harvest `NEEDS CLARIFICATION` маркеров. Hard-OUT при brownfield-сигналах. Возвращает tier-grouped (Critical / Important / Deferred) список AxisCandidate с evidence-цитатами.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-standalone--выбор-стека-для-greenfield-проекта-happy-path)

## FR-2: Per-axis artefact (markdown + self-contained HTML)

Skill (команда `next-axis`) для одной оси генерит markdown + self-contained HTML артефакт с ≥3 вариантами. Каждый вариант: Y-statement TL;DR, Decision Drivers, Good/Neutral/Bad буллеты, maturity ring (Adopt/Trial/Assess/Hold), cost chip ($/$$/$$$), When-to-choose / When-NOT-to-choose, Real-world precedent, Confirmation. Порядок вариантов рандомизируется (Fisher-Yates seeded by axis.id), word-budget выравнивается ±15%. Каждое утверждение помечено `[VERIFIED]` / `[UNVERIFIED]`.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-1](USE_CASES.md#uc-1-standalone--выбор-стека-для-greenfield-проекта-happy-path)

## FR-3: Browser auto-open (cross-platform, ENOENT-safe)

После генерации HTML skill открывает его в браузере: win32 `start`, darwin `open`, linux `xdg-open`. При сбое (отсутствие браузера, WSL/headless) возвращает `launched=false` с fallback-путём, печатает путь и НЕ бросает исключение.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-1](USE_CASES.md#uc-1-standalone--выбор-стека-для-greenfield-проекта-happy-path)

## FR-4: Auto-apply рекомендации (default) с опциональным override

**Auto-mode (default):** для каждой оси skill авто-применяет рекомендованный вариант (`status: accepted`, `chosen: <recommended-id>`, `rationale: "auto-applied recommendation"`), генерит артефакт, открывает HTML и идёт к следующей оси БЕЗ блокирующего AskUserQuestion. Юзер не подтверждает каждый шаг — это паттерн «делай / начинай». В конце skill открывает финальный INDEX.html и одним сообщением показывает все авто-выбранные варианты — юзер ревьюит и переопределяет любую ось в свободной форме («ось hosting — возьми Variant B»).

**Interactive-mode (opt-in флаг `--interactive`):** если юзер явно просит выбирать вручную — skill на каждой оси вызывает AskUserQuestion с опциями `[Беру рекомендацию]` / `[Variant B]` / `[Variant C]` / `[Отложить]`.

Override (в обоих режимах): выбор + rationale перезаписывают frontmatter оси. Рекомендация всегда визуально выделена (recommended-card) чтобы override был осознанным.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-1](USE_CASES.md#uc-1-standalone--выбор-стека-для-greenfield-проекта-happy-path)

## FR-5: INDEX compile (idempotent, status matrix)

Команда `compile-index` собирает frontmatter всех `AXIS-*.md` файлов в INDEX.md + INDEX.html со status-matrix (ось → выбранный вариант / pending). Идемпотентно: контент между AUTOGEN-маркерами заменяется, user-контент вне маркеров сохраняется.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-2](USE_CASES.md#uc-2-inside-create-spec--phase-175-happy-path)

## FR-6: Cascading implications (BMAD pattern)

Выбор варианта может открыть новую decision-ось (per axis-catalog cascading map). Skill добавляет новую ось в QUEUE.json. Depth cap = 2; на границе depth-2 вызывается AskUserQuestion «расширить дальше?». Cycle detection через axis-id set membership предотвращает бесконечный loop.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-3](USE_CASES.md#uc-3-cascading-implications-bmad-pattern)

## FR-7: Два режима запуска (standalone + create-spec Phase 1.75)

Skill запускается (1) standalone по trigger-фразам («выбери стек», «спроектируй архитектуру», «architecture decision»), (2) явным вызовом из create-spec в новой Phase 1.75 (между Project Context и Requirements), возможно несколько раз. Subskill stateless между вызовами — состояние в QUEUE.json; loop оркеструется в create-spec SKILL.md.

**Phase 1.75 — авто-фаза без блокирующего STOP (per FR-4 auto-mode):** в отличие от STOP #1/#1.5/#2/#3, Phase 1.75 НЕ требует отдельного `ConfirmStop` подтверждения для перехода в Phase 2. Skill авто-применяет рекомендации по всем осям, открывает финальный INDEX, и create-spec автоматически продолжает в Phase 2 Requirements с зафиксированным стеком. Юзер переопределяет оси в свободной форме при желании, но дефолт — proceed (паттерн «делай / начинай»). Это снимает главный фрикшн: на greenfield-спеке 4-6 осей × подтверждение = слишком много STOP-ов.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use Case:** [UC-2](USE_CASES.md#uc-2-inside-create-spec--phase-175-happy-path)

## FR-8: Anti-bias guardrails

Skill: (1) live-fetch версий «latest stable» через WebFetch/WebSearch с 24h cache (не точные цены — качественные чипы `$/$$/$$$`); (2) обязательно включает ≥1 вариант вне очевидного дефолта (popular-stack bias mitigation); (3) рандомизирует порядок вариантов + equal word-budget (position bias mitigation per MIT 2026 study).

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
**Use Case:** [UC-1](USE_CASES.md#uc-1-standalone--выбор-стека-для-greenfield-проекта-happy-path)

## FR-9: Audit category ARCHITECTURE_COVERAGE

Команда `audit` (вызывается create-spec Phase 3+ audit как 9-я категория) проверяет что нет осей в статусе `pending` после Phase 2 STOP. Emit findings: severity WARNING для pending осей (блокирует STOP), INFO для accepted/deferred. Mirror VARIANT_COVERAGE category.

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
**Use Case:** [UC-2](USE_CASES.md#uc-2-inside-create-spec--phase-175-happy-path)

## FR-10: Escape hatch с audit trail

`[skip-architecture-axis: <reason ≥12 chars>]` в PRD/axis frontmatter позволяет пропустить ось. Каждое использование логируется в `.claude/logs/spec-architecture-escapes.jsonl` (ts, spec, axis_id, reason, session_id, cwd). Reason < 12 chars → emit WARNING_REASON_TOO_SHORT finding. Mirror variant-matrix escape-hatch.

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)
**Use Case:** [UC-3](USE_CASES.md#uc-3-cascading-implications-bmad-pattern)

## FR-11: Eval suite — debug + benchmark качества (2 слоя)

Skill имеет `evals/` директорию (mirror `variant-matrix-build/evals/`) с двумя слоями проверки качества:

**Слой 1 — Deterministic CLI evals** (`evals/evals.json` → `iterations/N/eval-K/`): прогон helper-скриптов на fixtures, проверка механического output (counts/codes). Cases: greenfield detect (≥N axes), brownfield hard-OUT (axes=0), pending→ARCHITECTURE_COVERAGE WARNING, escape reason<12→WARNING_REASON_TOO_SHORT, escape≥12→ESCAPE_HATCH_USED, index idempotency, artefact-shape (recommendation pinned top + ≥3 variants + word-budget ±15%), open-browser ENOENT resilience. Каждый eval: `grading.json` (expectations[] passed/evidence), roll-up `aggregate.json`.

**Слой 2 — Qualitative artifact-bench + rubric** (proza-output нельзя проверить counts): golden scenarios в `evals/artifact-bench/scenario-X/` с rubric. Rubric (anti-hallucination — пользователь требует пруфы, не галлюцинации):
- R1: ≥3 variants на ось
- R2: pros/cons — конкретное свойство, не vibe («faster» бан, «p99<50ms [source]» ок)
- R3: каждое тех-заявление имеет `[VERIFIED via context7/source]` или `[UNVERIFIED]` marker
- R4: cost — cited или `[UNVERIFIED — knowledge cutoff]`
- R5: honest recommendation + trade-off + «когда пересмотреть»
- R6: When-NOT-to-choose на каждый вариант
- R7: decision + rationale записаны (пометь выборы и причины)
- R8: ≥1 вариант вне popular default
- R9: progressive disclosure (новые варианты по мере вопросов)
- R10: **failure-mode enumeration** per вариант — crash mid-operation / duplicate side-effect / poison-infinite-retry / race condition перечислены + как обрабатываются (не только happy path). «Exactly-once delivery» ≠ idempotent side-effect
- R11: **best-practice verification** — каждый тех-выбор verified как РЕКОМЕНДУЕМЫЙ вендором [cite doc], не просто «feasible»; отклонения от best-practice явно обоснованы
- R12: **external-integration timing** — для каждой внешней интеграции verified: webhook timeout/required-response-time (respond-immediately если обработка дольше), sync-vs-async семантика вызова, rate limits/throughput caps, per-resource queue limits
- R13: **internal consistency** — диаграммы / stack-таблицы / проза НЕ противоречат принятым решениям (axis decisions, Deep-dive выводам); устаревший артефакт после смены решения = fail
- R14: **flow & endpoint completeness** — для КАЖДОЙ внешней интеграции перечислены inbound handler + outbound call + status/delivery callback + error/timeout path + trigger/scheduler (не только happy inbound)
- R15: **compliance & privacy enforcement** — каждое легальное/privacy-ограничение (opt-out/TCPA, CAN-SPAM, PII at-rest/in-transit) имеет явную точку enforcement в дизайне, не подразумевается
- R16: **auth/authz + secrets** — каждый публичный endpoint объявляет механизм authn (webhook signature vs JWT); каждый секрет — где хранится (Vault/secret store) и не светится (no service-role key в public function)
- R17: **observability & error-surfacing** — где всплывают падения / violation'ы валидатора, канал алертов, кого будят (не «мониторинг» без привязки к компоненту)
- R18: **data lifecycle / retention** — каждая растущая таблица / очередь / лог имеет retention или cleanup story (unbounded growth = fail)
- R19: **cost & quota model (design-choice-aware)** — (a) per-unit variable cost (LLM / SMS / voice / STT за событие), (b) provider quota/limit проверены там где design-choice их потребляет, с FLAG если выбор выбивает бюджет/квоту. ЕДИНСТВЕННЫЙ критерий который может задним числом изменить axis-решение → проверять ДО lock осей, не как финальный чек-лист
- R20: **build / deploy / ops** — local dev (supabase start / functions serve), migration workflow, seed data, staging, CI/CD функций, backups/PITR присутствуют

> **R13-R20 — system-completeness layer** (горизонталь: целостность системы как целого), в отличие от R1-R9 (per-axis variant decision quality) и R10-R12 (per-variant design discipline). Смежные, но НЕ дублируют: R12 = семантика тайминга одной интеграции; R14 = полнота перечня всех флоу/эндпоинтов; R19 = системная модель затрат/квот; R10 (per-variant failure modes) ≠ R17 (system-wide error-surfacing). Маппинг R13-R20 ← реальные провалы `scenario-bhph` (12 дыр) → AWS Well-Architected 6 столпов (Sustainability `[OUT_OF_SCOPE]` для не-compute-heavy домена). Метод rubric-from-failure-taxonomy: DeepVerifier (arXiv 2601.15808, +12-48% F1 vs free-form self-critique); intrinsic «be thorough» ненадёжен (CorrectBench arXiv 2510.16062). См. `audit.ts` COMPLETENESS_COVERAGE (FR-12) — детерминированный gate для этого слоя.

Golden bench: `scenario-bhph` (реальный — `D:\repos\bhph-early-warning\ARCHITECTURE_PROPOSAL.md` dry-run + референс-диалог с Variant A-F), `scenario-saas`, `scenario-cli-tool` (разные домены). Debug: при fail `grading.json` показывает провалившийся R-criterion + evidence; iteration-N tracking ловит регрессии; R3 — главный anti-hallucination сигнал.

**Связанные AC:** [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11)
**Use Case:** [UC-1](USE_CASES.md#uc-1-standalone--выбор-стека-для-greenfield-проекта-happy-path)

## FR-12: Audit category COMPLETENESS_COVERAGE + completeness ledger

Команда `audit-completeness` (отдельная от `audit`) проверяет **completeness ledger** — артефакт `ARCHITECTURE/COMPLETENESS.md` (create-spec mode) либо `architecture-decisions/{slug}/COMPLETENESS.md` (standalone). _Решение: разделено на две команды (`audit` = ARCHITECTURE_COVERAGE FR-9, `audit-completeness` = COMPLETENESS_COVERAGE FR-12), а не одна merged — architecture audit должен возвращать unmixed findings (eval-regression показал: merge ломал детерминизм architecture eval-cases лишними DIMENSION_PENDING). Это 9-я и 10-я audit-категории create-spec соответственно._ Ledger перечисляет 8 system-completeness измерений (соответствуют rubric R13-R20): `internal-consistency`, `flow-completeness`, `compliance-privacy`, `auth-secrets`, `observability`, `data-lifecycle`, `cost-quota`, `deploy-ops`. Каждое измерение имеет status: `addressed` (+ pointer куда в дизайне), `out-of-scope` (+ reason ≥12 chars), либо `pending`.

Audit emit findings (mirror ARCHITECTURE_COVERAGE / VARIANT_COVERAGE shape, category `COMPLETENESS_COVERAGE`):
- `DIMENSION_PENDING` severity **WARNING** (блокирует STOP) — измерение `pending`, ОТСУТСТВУЕТ в ledger, ИЛИ ledger-файл не создан (отсутствие файла = все 8 pending)
- `COMPLETENESS_COMPLETE` severity **INFO** (positive signal) — все 8 измерений `addressed`/`out-of-scope`
- escape `[skip-completeness-dimension: <reason ≥12>]` → запись в `.claude/logs/spec-completeness-escapes.jsonl` (reuse FR-10 JSONL writer, поле `axis_id` несёт dimension-id); reason < 12 → `WARNING_REASON_TOO_SHORT` severity INFO
- `ADDRESSED_WITHOUT_POINTER` severity **INFO** (non-blocking) — измерение `addressed`, но колонка-указатель пустая или placeholder (`—`); требует цитировать design pointer, не голую галочку (закрывает «addressed без доказательства»)

Детерминированная проверка — **presence/status**, НЕ семантическое качество (качество измерений — rubric R13-R20, qualitative layer). Cost-quota измерение (R19) рекомендуется ставить ДО lock осей — единственное которое может изменить axis-решение. Гейт заставляет explicit consideration каждого измерения (`addressed` или сознательно `out-of-scope` с reason) → закрывает silent omission. Расширяет ответственность скила: «выбрать стек» → «выбрать стек И сертифицировать полноту архитектуры». Метод per CorrectBench/DeepVerifier (см. FR-11 R13-R20 note): детерминированный structured gate, не intrinsic «не забудь проверить».

**Связанные AC:** [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12)
**Use Case:** [UC-2](USE_CASES.md#uc-2-inside-create-spec--phase-175-happy-path)

## FR-13: Cross-axis synthesis

После per-axis loop команда `synthesis <spec-dir>` собирает frontmatter всех `AXIS-*.md` → emergent insights ПОПЕРЁК осей (cross-axis dependencies, избыточность компонента, вторичные эффекты) → `SYNTHESIS.md` + секция в INDEX.html. Insight shape: `{axes[], title, description, recommendation, trade_off}`. Пример (реальный bhph): «n8n избыточен — Supabase primitives (cron+pgmq+pg_net+Edge) покрывают ВСЕ его роли» — вывод из пересечения осей scheduling+queue+webhook, который per-axis анализ не даёт. Helper собирает/рендерит, контент insights заполняет skill (LLM), mirror artefact-generator split. 0 insights допустимо для 1-axis spec.

**Связанные AC:** [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-fr-13)
**Use Case:** [UC-2](USE_CASES.md#uc-2-inside-create-spec--phase-175-happy-path)

## FR-14: Correction-log (reasoning journey)

VariantModel.correction_log[] фиксирует «assumption → discovered → corrected because» (mirror iteration-log из реального ARCHITECTURE_PROPOSAL.md где 2 major корректировки родились из диалога). Рендерится секцией `## Corrections` в axis md/html если non-empty. Опционально (вариант без корректировок → секция отсутствует, не ломает render). Закрывает gap: артефакт фиксирует не только финал, но путь с честными «было неправо→исправлено».

**Связанные AC:** [AC-14](ACCEPTANCE_CRITERIA.md#ac-14-fr-14)
**Use Case:** [UC-1](USE_CASES.md#uc-1-standalone--выбор-стека-для-greenfield-проекта-happy-path)

## FR-15: Live context7 пруфы

При построении вариантов (per-axis, skill-workflow) skill дёргает `mcp__context7__resolve-library-id` + `query-docs` для СВЕЖИХ пруфов тех-заявлений вместо second-hand. Маркер `[VERIFIED via context7:<lib> <ver>]`; нет матча библиотеки → `[UNVERIFIED — Context7 no match]` (честнее fabricated). Это **skill-workflow concern** (MCP, LLM-layer) — НЕ CLI-helper (helpers остаются pure Bash-callable для eval-детерминизма). allowed-tools += `mcp__context7__resolve-library-id`, `mcp__context7__query-docs`. Усиливает R3 anti-hallucination (дисциплина re-research при challenge: при сомнении — свежий context7, не защита посылки).

**Связанные AC:** [AC-15](ACCEPTANCE_CRITERIA.md#ac-15-fr-15)
**Use Case:** [UC-1](USE_CASES.md#uc-1-standalone--выбор-стека-для-greenfield-проекта-happy-path)

## FR-16: Selection policy (default mvp-poc)

Skill предлагает выбрать **политику рекомендации** (AskUserQuestion, ОДИН раз глобально перед per-axis loop, default `mvp-poc`): `mvp-poc` / `production-grade` / `cost-optimal` / `scale-ready` / `portability`. VariantModel.policy_fit[] = под какие политики вариант оптимален. AxisModel.selected_policy задаёт активную. recommended-вариант = тот, чей policy_fit включает selected_policy (fallback на is_recommended если ни один не fit). Артефакт **демонстрирует** политику: таблица «вариант × 5 политик → ✓» + policy-badge «Recommended under {policy}» на recommended-card. Default `mvp-poc` обоснован: рекомендовать самый простой/быстрый вариант → сокращает time-to-market (для MVP/PoC переинженеринг вреден). Политика глобальна (не per-axis) — согласуется с auto-mode (один выбор в начале, дальше auto per-axis под политикой). Демонстрация делает явным: «лучший» вариант зависит от цели, не догма.

**Связанные AC:** [AC-16](ACCEPTANCE_CRITERIA.md#ac-16-fr-16)
**Use Case:** [UC-1](USE_CASES.md#uc-1-standalone--выбор-стека-для-greenfield-проекта-happy-path)

## FR-17: Две линзы + scorecard + reality-check (R24, BLOCKING)

Каждый вариант ОБЯЗАН нести три слоя (иначе артефакт «малоинформативен» — реальный feedback). (1) **business_summary** (бизнес-линза, plain language): `gets` / `time_to_market` / `cost` / `risk` — что получает бизнес, без жаргона. (2) **scorecard[]** (имплементатор-линза → карта-сравнение): по каждому критерию `{criterion, verdict:good|ok|bad, value, source?}`; обязательный набор критериев одинаков у всех вариантов оси — Стоимость, Лёгкость интеграции, Кривая обучения, Ops-нагрузка, SSL/HTTPS, Масштабирование, Vendor lock-in, Экосистема — рендерится матрицей критерии×варианты с цветом по verdict (нормализован по смыслу: good=зелёный). (3) **reality_check[]** («из реала» — что вендор замалчивает): SSL+certbot+auto-renew, бэкапы+проверка restore, мониторинг+алерты, secrets-wiring, обновления ОС, межкомпонентная склейка. Голый good/bad буллет без конкретного reality_check — не проходит R24.

**Связанные AC:** [AC-17](ACCEPTANCE_CRITERIA.md#ac-17-fr-17)
**Use Case:** [UC-1](USE_CASES.md#uc-1-standalone--выбор-стека-для-greenfield-проекта-happy-path)

## FR-18: Экономика решения — деньги, время, обратимость (R25, BLOCKING)

Решение оценивается в ДЕНЬГАХ и ВРЕМЕНИ и ОБРАТИМОСТИ, не точечно. (1) **cost_at_scale[]** — кривая денег `[{tier,cost}]` (MVP/100 → 10k → 100k), ловушка дешёвого MVP видна. (2) **time_costs** — кривая времени команды: `to_market` (до прода) / `to_feature` (типичная фича) / `to_test` (настройка+прогон) / `to_support` (мейнтенанс в месяц) — вариант дешёвый деньгами но дорогой по тестам/поддержке должен это показать. (3) **exit_cost** (на варианте) — конкретная цена СЛЕЗТЬ, делает Vendor lock-in числом, не ярлыком. (4) **door_type** (на оси) — `one-way` (необратимо, выход дорогой → ресёрчь глубже) vs `two-way` (обратимо → не переусердствуй; рамка Bezos). (5) **sensitivity[]** (на оси) — «рекомендация МЕНЯЕТСЯ если…» (решение как функция параметров). (6) **precedent.relevance** — ПОЧЕМУ пруф релевантен ИМЕННО проекту (похожая система), не голые звёзды.

**Связанные AC:** [AC-18](ACCEPTANCE_CRITERIA.md#ac-18-fr-18)
**Use Case:** [UC-1](USE_CASES.md#uc-1-standalone--выбор-стека-для-greenfield-проекта-happy-path)
