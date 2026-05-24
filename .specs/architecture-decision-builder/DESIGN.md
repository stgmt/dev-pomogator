# Design

## Реализуемые требования

- [FR-1: Axis enumeration](FR.md#fr-1-axis-enumeration-из-prd)
- [FR-2: Per-axis artefact (md+html)](FR.md#fr-2-per-axis-artefact-markdown--self-contained-html)
- [FR-3: Browser auto-open](FR.md#fr-3-browser-auto-open-cross-platform-enoent-safe)
- [FR-4: Iterative choice](FR.md#fr-4-итеративный-выбор-через-askuserquestion)
- [FR-5: INDEX compile](FR.md#fr-5-index-compile-idempotent-status-matrix)
- [FR-6: Cascading implications](FR.md#fr-6-cascading-implications-bmad-pattern)
- [FR-7: Two run modes](FR.md#fr-7-два-режима-запуска-standalone--create-spec-phase-175)
- [FR-8: Anti-bias guardrails](FR.md#fr-8-anti-bias-guardrails)
- [FR-9: ARCHITECTURE_COVERAGE audit](FR.md#fr-9-audit-category-architecture_coverage)
- [FR-10: Escape hatch](FR.md#fr-10-escape-hatch-с-audit-trail)
- [FR-11: Eval suite (debug + benchmark)](FR.md#fr-11-eval-suite--debug--benchmark-качества-2-слоя)
- [FR-12: COMPLETENESS_COVERAGE audit + ledger](FR.md#fr-12-audit-category-completeness_coverage--completeness-ledger)

## Компоненты

- `SKILL.md` — mission + 4 команды (enumerate / next-axis / compile-index / audit) + contract. Mirror `variant-matrix-build/SKILL.md`.
- `axis-detector.ts` — `detectAxes(prdContent, opts) → AxisCandidate[]`; 3-layer detection + hard-OUT brownfield.
- `artefact-generator.ts` — `generateAxisArtefact(axis, ctx) → {mdPath, htmlPath}`; Fisher-Yates seeded randomization, word-budget.
- `html-renderer.ts` — `renderAxisHtml(model)` / `renderIndexHtml(axes)`; pure template-literal, inline CSS.
- `index-compiler.ts` — glob AXIS-*.md frontmatter → status matrix (AUTOGEN markers).
- `open-in-browser.ts` — `openInBrowser(path) → {launched, fallback?}`; cross-platform, ENOENT-safe.
- `live-fetch.ts` — версии latest stable, 24h cache в `.architecture-cache.json`.
- `escape-log.ts` — JSONL append-only writer.
- `audit.ts` — ARCHITECTURE_COVERAGE (FR-9) + COMPLETENESS_COVERAGE (FR-12) category logic; latter reads `COMPLETENESS.md` ledger via `collectCompletenessRows`.
- `architecture-decision-cli.ts` — dispatcher для 4 команд.

## Где лежит реализация

- Skill: `.claude/skills/architecture-decision-builder/SKILL.md` + `references/{axis-catalog,variant-format-spec,html-style-guide}.md`
- Helpers: `extensions/specs-workflow/tools/specs-generator/architecture-decision/*.ts`
- Templates: `extensions/specs-workflow/tools/specs-generator/templates/ARCHITECTURE_{AXIS,INDEX}.md.template`
- Rules: `.claude/rules/specs-workflow/architecture-decision/{when-to-build-architecture,escape-hatch-audit}.md`
- create-spec integration: `.claude/skills/create-spec/references/phase1.75_architecture-decisions.md`
- Reference shape (mirror): `.claude/skills/variant-matrix-build/SKILL.md` (verified — прочитан в RESEARCH)

## Директории и файлы

- `.claude/skills/architecture-decision-builder/` — skill core
- `extensions/specs-workflow/tools/specs-generator/architecture-decision/` — 9 helper scripts
- `.claude/rules/specs-workflow/architecture-decision/` — 2 rules
- Output (create-spec mode): `.specs/{slug}/ARCHITECTURE/AXIS-NN-{slug}.md|.html` + `INDEX.md|.html` + `QUEUE.json` + `COMPLETENESS.md` (ledger, FR-12)
- Output (standalone mode): `./architecture-decisions/{slug}/` (cwd-local) + `COMPLETENESS.md`

## Алгоритм

1. **enumerate** — читает PRD → `detectAxes` (3-layer) → если brownfield hard-OUT: вернуть axes_detected=0 → иначе показать tier-grouped список → AskUserQuestion подтверждение → write QUEUE.json.
2. **next-axis** (loop, оркеструется в create-spec) — взять next pending из QUEUE.json → `live-fetch` версий → `generateAxisArtefact` (md+html, randomized) → `openInBrowser` → AskUserQuestion выбор → записать в frontmatter оси → cascading check (add to QUEUE если depth<2) → `compile-index`.
3. **compile-index** — glob AXIS-*.md → renderIndexHtml → write INDEX.md+html (idempotent AUTOGEN markers).
4. **audit** — проверить QUEUE.json/frontmatter на pending оси → emit ARCHITECTURE_COVERAGE findings.

## API

### CLI: architecture-decision-cli.ts

- Method: `detect-axes <prd-path>` → JSON `{axes: AxisCandidate[], skipped_reason?}` (exit 0/3)
- Method: `generate-axis <spec-path> <axis-id>` → JSON `{mdPath, htmlPath}` (exit 0/1)
- Method: `compile-index <spec-path>` → JSON `{indexMd, indexHtml, axes_total, axes_pending}` (exit 0)
- Method: `open-browser <html-path>` → JSON `{launched, fallback?}` (exit 0)
- Method: `audit <spec-path>` → JSON `{findings: [{code, severity, axis_id}]}` (exit 0)

Все команды: JSON в stdout, диагностика в stderr. Exit codes: 0 success / 1 generic / 2 usage / 3 PRD missing / 4 cascading-depth-exceeded.

## Key Decisions

> Auto-populated by Skill `requirements-chk-matrix` during Phase 2. Hook `design-decision-guard` enforces format:
> each `### Decision:` block must include **Rationale:**, **Trade-off:**, **Alternatives considered:** with ≥2 `- {alt}` bullets.
> Files without any `### Decision:` heading pass unblocked — section is optional but strongly recommended for Phase 2.

### Decision: Отдельный markdown+html файл на каждую ось + общий INDEX

**Rationale:** Реальный greenfield = 4-6 связанных decision-axes (dry-run на bhph показал email/LLM/hosting/compliance как отдельные ресёрчи в HANDOFF.md). Один файл на ось держит каждый артефакт обозримым, позволяет ревьюить по одному и итеративно принимать решения.

**Trade-off:** Перекрёстные связи между осями видны только в INDEX.md, не внутри per-axis файла — есть риск что юзер пропустит зависимость если читает один файл изолированно.

**Alternatives considered:**
- Один большой документ со всеми осями — rejected because для bhph-style проекта это 1500+ строк, ревью-усталость, теряется итеративность «одно решение за раз» которую просил юзер
- Только markdown без HTML — rejected because юзер прямо сказал markdown читать сложно, нужна браузерная визуализация

### Decision: Static self-contained HTML с inline CSS, без JS-фреймворка

**Rationale:** Артефакт должен открываться из file:// без build step, без npm, без сервера. Inline CSS + native `<details>` дают сворачивание секций без JavaScript. Self-contained = переносимый одним файлом.

**Trade-off:** Нет интерактивной сортировки/фильтрации вариантов; сравнение только глазами по статичной таблице.

**Alternatives considered:**
- React/Vue SPA для артефакта — rejected because требует build pipeline + npm install, противоречит zero-dependency принципу и усложняет перенос файла
- Markdown→HTML через внешний движок (mkdocs/docsify) — rejected because добавляет runtime-зависимость и сетевые ресурсы, ломает self-contained требование (NFR Security)

### Decision: Subskill stateless, состояние в QUEUE.json, loop в create-spec

**Rationale:** Mirror существующего variant-matrix-build паттерна (каждый Skill-вызов = отдельная RPC-операция возвращающая JSON). create-spec оркеструет loop и рендерит прогресс между итерациями; subskill восстанавливает состояние из QUEUE.json.

**Trade-off:** Состояние pers-ится на диск (QUEUE.json) — лишний файловый I/O на каждой итерации против in-memory loop.

**Alternatives considered:**
- Stateful loop внутри subskill — rejected because create-spec не сможет показывать TUI-прогресс между осями, и subskill стал бы long-running вместо stateless RPC (расходится с паттерном 4 existing child-skills)
- Состояние в .progress.json — rejected because .progress.json создаётся только через spec-status.ts (запрет на прямой Write), не подходит для per-axis queue

### Decision: Cascading depth cap = 2 с AskUserQuestion на границе

**Rationale:** BMAD cascading («выбор X открывает ось Y») полезен, но без лимита взаимозависимые оси дают бесконечный loop. Cap=2 покрывает реальные случаи (hosting→storage→nothing), на границе спрашиваем юзера явно.

**Trade-off:** Глубоко вложенные архитектуры (3+ уровня зависимостей) требуют ручного подтверждения на каждой границе — лишние вопросы юзеру.

**Alternatives considered:**
- Unbounded cascading с cycle detection — rejected because даже без цикла глубина 5+ перегружает юзера осями, теряется фокус
- Без cascading вообще — rejected because теряется BMAD-ценность (выбор Cloudflare Workers реально открывает «KV vs D1 vs external Postgres»)

### Decision: Auto-mode по умолчанию (применять рекомендацию без подтверждения)

**Rationale:** Юзер прошёл 4 STOP-подтверждения вручную при создании самой спеки и явно потребовал «делай / начинай» — авто без подтверждения каждой оси. На greenfield-спеке 4-6 осей × AskUserQuestion = слишком много фрикшна. Auto-apply рекомендации + финальный batch-review (юзер переопределяет в свободной форме) даёт скорость без потери контроля.

**Trade-off:** Юзер может пропустить неудачную авто-рекомендацию если не вчитается в финальный INDEX; рекомендация должна быть действительно качественной (отсюда eval rubric R5 honest recommendation).

**Alternatives considered:**
- Блокирующий AskUserQuestion на каждой оси (исходный дизайн) — rejected because юзер прямо сказал что подтверждать каждый шаг муторно, паттерн «делай начинай»
- Полный авто без финального review — rejected because юзер теряет контроль совсем; batch-review в конце — компромисс (default proceed, override опционально)

### Decision: Eval — 2 слоя (deterministic CLI + qualitative rubric)

**Rationale:** Helper-скрипты (axis-detector/audit) дают детерминированный output → проверяются как variant-matrix evals.json (counts/codes). Но сам анализ вариантов — проза (pros/cons/recommendation), её counts не проверить. Юзер требует «не галюны, пруфы» → нужен rubric-слой с anti-hallucination R3 (каждое тех-заявление [VERIFIED]/[UNVERIFIED]).

**Trade-off:** Qualitative rubric требует LLM-judge или ручной оценки — не полностью автоматизируется как deterministic слой; iteration-N tracking смягчает (regression diff против golden bench).

**Alternatives considered:**
- Только deterministic CLI evals (как variant-matrix) — rejected because не покрывает главную ценность скила (качество прозы-анализа), пропустит галлюцинации
- Только LLM-judge без deterministic слоя — rejected because механические инварианты (counts, idempotency, ENOENT-safety) дешевле и надёжнее проверять детерминированно

### Decision: Completeness — 2 слоя (qualitative rubric R13-R20 + deterministic ledger gate)

**Rationale:** 12 реальных дыр в `scenario-bhph` (диаграмма-дрейф, пропущенный status-callback, voice-флоу, opt-out комплаенс, секреты, мониторинг, cleanup, cost/quota, deploy) — все НЕ axis-decision-quality, а system-completeness провалы, которые axis-centric rubric R1-R12 структурно не ловит. Completeness семантичен — нельзя надёжно проверить механически (греп «есть ли compliance» галлюцинирует false-pass). Поэтому split mirror существующего 2-слойного eval: R13-R20 = qualitative rubric (судит КАЧЕСТВО против artifact-bench), `COMPLETENESS_COVERAGE` audit = deterministic presence-check ledger-а (`COMPLETENESS.md`), заставляющий EXPLICIT consideration каждого из 8 измерений (addressed / out-of-scope / pending). Метод rubric-from-failure-taxonomy подтверждён DeepVerifier (arXiv 2601.15808, +12-48% F1 vs free-form self-critique); intrinsic «be thorough» ненадёжен (CorrectBench arXiv 2510.16062) → нужен детерминированный gate, не prompt-надежда.

**Trade-off:** Скил расширяет ответственность с «выбрать стек» на «сертифицировать полноту системы» — больше surface area, ledger нужно поддерживать; deterministic слой проверяет лишь presence/status, не суть — халтурный `addressed` без содержания ловит только qualitative rubric (LLM-judge / ручная оценка).

**Alternatives considered:**
- Семантический audit (грепом детектить «есть ли compliance enforcement») — rejected because completeness семантична; механический греп даёт false-pass/false-fail (та же галлюцинация что у free-form self-critique по CorrectBench)
- Отдельный плагин completeness-gate (Stop hook + /gap-audit для любого design-doc) — rejected для ЭТОЙ задачи because 12 дыр родились именно в architecture-flow, ledger живёт рядом с AXIS-артефактами, bench `scenario-bhph` уже здесь; generic Stop-hook вариант остаётся открытым для не-architecture документов (отдельная задача)
- Только qualitative rubric R13-R20 без deterministic gate — rejected because возвращает к «надежде что модель вспомнит» — ровно провал инициировавший задачу

## Eval & Debug (FR-11)

Структура `evals/` mirror `variant-matrix-build/evals/`:

```
evals/
  evals.json                          ← contract: deterministic cases (fixture→expected codes/counts)
  iterations/iteration-N/
    eval-K-{name}/
      with_skill/outputs/*.json        ← фактический CLI output
      grading.json                     ← expectations[] passed/evidence
    aggregate.json                     ← roll-up total/passed/failed
  artifact-bench/
    scenario-bhph/                     ← golden: ARCHITECTURE_PROPOSAL.md (Variant A-F + context7 Evidence table)
    scenario-saas/
    scenario-cli-tool/
  rubric.json                          ← R1-R9 qualitative criteria
```

**Слой 1 deterministic** — 8 cases (см. FR-11): greenfield-detect / brownfield-hard-OUT / pending-WARNING / escape-short / escape-valid / index-idempotency / artefact-shape / browser-ENOENT.

**Слой 2 qualitative** — rubric R1-R12 (R10 failure-modes, R11 best-practice-verified, R12 external-integration-timing — из реальных провалов bhph, см. memory feedback_design-research-discipline); R3 (anti-hallucination: [VERIFIED via context7/source] или [UNVERIFIED] на каждое тех-заявление) — блокирующий. Golden bench `scenario-bhph` = реальный `D:\repos\bhph-early-warning\ARCHITECTURE_PROPOSAL.md` (Variant F DECIDED + Evidence table с context7-пруфами на каждое capability claim — эталон R3/R7).

**Debug flow:** eval fail → grading.json показывает провалившийся criterion + evidence (строка/код) → iteration-N diff против предыдущего прогона ловит регрессию.

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**Classification:** TEST_DATA_ACTIVE
**TEST_DATA:** TEST_DATA_ACTIVE
**TEST_FORMAT:** BDD
**Framework:** vitest (TypeScript) — `.feature` companion + 1:1 `@featureN` mapping per `extension-test-quality` rule; integration-first через spawnSync на CLI
**Install Command:** already installed (vitest в package.json dev-pomogator)
**Evidence:** RESEARCH.md "Existing Patterns" — `tests/e2e/*.test.ts` + `tests/specs-workflow/` используют vitest; bdd-framework-detector ложно вернул C#/Reqnroll из fixture `tests/fixtures/steps-validator/csharp/Project.csproj`, не реальный стек
**Verdict:** Нужны per-test cleanup hooks (afterEach удаляет temp output dir) + 3 fixtures (greenfield-prd / brownfield-prd / expected-axes). Тесты через spawnSync на architecture-decision-cli.ts.

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/e2e/helpers.ts` | setup helper | shared | runInstaller / spawnSync wrappers / temp dir | Да — переиспользовать spawnSync wrapper |

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| `tests/specs-workflow/architecture-decision/*.test.ts` (inline afterEach) | AfterScenario | per-test | удаляет temp ARCHITECTURE output dir | existing variant-matrix tests |

### Cleanup Strategy

Каждый тест создаёт temp output в `os.tmpdir()/arch-test-{random}/`; afterEach рекурсивно удаляет. Live-fetch мокается (нет реальных сетевых вызовов в тестах). Cascading-cap тест использует фиктивный axis-catalog.

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| greenfield-prd.md | `tests/fixtures/architecture-decision/greenfield-prd.md` | PRD без build-manifest для detection | shared |
| brownfield-prd.md | `tests/fixtures/architecture-decision/brownfield-prd.md` | PRD с упоминанием стека для hard-OUT | shared |
| expected-axes.json | `tests/fixtures/architecture-decision/expected-axes.json` | Golden output axis-detector | shared |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| QUEUE.json | file | enumerate | next-axis / audit | Очередь осей + статусы (stateless RPC state) |
| .architecture-cache.json | file | live-fetch | live-fetch | 24h cache версий |
