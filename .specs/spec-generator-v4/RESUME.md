# RESUME — spec-generator-v4 (handoff, continue from here)

**Updated:** 2026-06-08 · **Branch:** `feat/phase-2a-mcp-server-and-hooks` · **PR:** [#32](https://github.com/stgmt/dev-pomogator/pull/32)

Pull this branch on any machine, read this file, and continue. Single source of truth for
«где остановились и что дальше». Предыдущая версия этого файла (2026-06-05, «zero code
shipped») безнадёжно устарела — всё нижеперечисленное ОТГРУЖЕНО и проверено.

## Состояние: что отгружено (всё в этой ветке, всё verified)

- **FR-36 (Phase 13)** — композитные node ids `<slug>:<localId>`: 47→574 FR, 0 коллизий
  корпус-wide (`collision-probe.ts` exit 0), реальные `@featureN`→FR tested-by рёбра
  (0→164), tools резолвят `slug:id` / `{spec,node_id}`, bare-коллизия → candidate list.
- **FR-37 (Phase 14)** — авторитетный вердикт `spec-verdict.ts` (audit + traceability +
  conformance + coverage + FR-8 semantic над одним графом); validate-spec = pre-filter;
  правило `no-structural-valid.md` + FR-37d гарды; `corpus-health` скилл. v4 = **GREEN**.
- **FR-38 (Phase 15)** — MCP `get_spec_status` (14-й тул): lifecycle SPEC_ONLY/
  TESTS_NOT_RUN/RED/PARTIAL/GREEN + linked last_run (никогда не сфабрикован).
- **T-Trans блок закрыт целиком (1..10, 17)** — включая ПОСТРОЕННЫЙ FR-20 (threshold-only
  сводка + ack; фичи не существовало), ОЖИВЛЁННЫЙ FR-24 meta-guard (был мёртвым кодом,
  теперь охраняет v4-манифесты live), FR-21 байт-контракт, FR-25 поимённый пин стражей,
  FR-27 supply chain re-confirmed против живого upstream.
- **Phase 16 P16-1 (ревью создающей стороны, 2026-06-07)** — весь enforcement-слой
  (5 form-guards) был МЁРТВ → оживлён через `form-guards-dispatch.ts` (live в обоих
  манифестах); 10 подтверждённых дефектов create-spec пайплайна закрыты; v4 TASKS.md
  guard-clean. Отчёт: `audit-reports/spec-creation-pipeline-review.md`.
- **Гигиена**: чекбоксы TASKS.md сверены с реальностью (evidence-backed), jscpd baseline
  0.44%, CHANGELOG актуален, producer-реестр в скилле `spec-generator-dev` (13 классов).

### Канонические проверки (живые, воспроизводимые)
```bash
npx tsx tools/specs-generator/spec-verdict.ts -Path .specs/spec-generator-v4 --no-semantic  # GREEN
node --import tsx node_modules/@cucumber/cucumber/bin/cucumber.js   # 110 scenarios: 109 passed / 1 skipped (_15) / 0 failed
node --import tsx tools/spec-graph/collision-probe.ts               # exit 0
npx tsx tools/specs-validator/spec-form-parsers.ts --check tasks .specs/spec-generator-v4/TASKS.md  # 0 violations
```

## План работ (приоритетный порядок)

### Гейт ветки (до решения по PR #32)
1. **`/simplify`** — последний незакрытый пункт `final-verification` (запускает юзер).
2. **Чистый Docker-подтверждающий ран** последних коммитов из чистого worktree
   (clean-vs-clean против baseline; 12 предсуществующих падений — известны, см. P13-4).
3. **Решение юзера по PR #32** — рекомендация: вливать целиком (вся Phase 13-16 работа).

### Phase 17 — MCP-rails (СЛЕДУЮЩАЯ БОЛЬШАЯ ВОЛНА, user ask 2026-06-07)
Агент работает со спеками ТОЛЬКО через MCP (контроль + аудит-лог), живой генератор
(валидация ДО записи), фазовые headless-агенты + оркестратор-проверятор. Цепочка:
P17-1 read-sufficiency → P17-2 mutation → P17-3 shadow-хук → P17-5 миграция скиллов →
P17-6 ENFORCE (строго последним!) ∥ P17-7/8 агенты+оркестратор ∥ P17-9 слойный контракт skill↔MCP (FR-42: юзер входит через скилл, логика в MCP). Анализ:
`audit-reports/mcp-rails-wave-design.md`; сценарии SPECGEN004_111..119 (red).

**Статус (2026-06-08):** P17-2/3/7/8/9 + read-tools — DONE. **P17-4 DONE (с исправлением
review #2)** — DESIGN §"Engine carve-out". Первый вывод «whitelist ENGINE_CLI полон тремя
оракулами» оказался НЕВЕРЕН: basename-only матчинг пропускал directory-named/generic-basename
CLI (anchor-integrity/fix.mjs → basename `fix` ∉ списка → anchor-fix `--apply` был бы DENIED
под enforce). ФИКС в guard: `invokesEngineCli` распознаёт движок по сути — basename ∈ ENGINE_CLI
ИЛИ ЛЮБОЙ проектный скрипт (.ts/.js/.mjs/.cjs под tools/ или .claude/skills/); inline node-e /
heredoc-to-/tmp остаются violation. Пинит SPECGEN004_133 на РЕАЛЬНЫХ producer-инвокациях.
**P17-5 — статическая миграция ЗАВЕРШЕНА (IN_PROGRESS только по live-верификации).**
Мигрированы агентские read+write пути на MCP-дверь: `cross-spec-resolve` (read+write;
`resolve-cli.ts` эмитит план JSON, YAML in-process = carve-out), `requirements-chk-matrix`,
`discovery-forms`, `task-board-forms` (form-filler тройка — записи через `apply_spec_change`),
`spec-review` SKILL §cat-14 + весь кукбук (categories/antipattern/lessons-learned банеры),
`create-spec` phase2 + frontmatter, `session-pilot` read-реф (`spec-graph-query` — ранее).
**CLI/script-driven authoring-скиллы** (`anchor-fix`, `cross-spec-reconcile`,
`variant-matrix-build`, `architecture-decision-builder`) — enforce-safe ТЕПЕРЬ благодаря
guard-фиксу P17-4 (их basename'ы НЕ в ENGINE_CLI → были бы DENY), per-skill миграция НЕ нужна.
Финальный широкий скан агентского act-directing доступа — чисто (остаток — исторические
сниппеты lessons-learned под баннером).
**ОСТАЁТСЯ только live-verification = гейт P17-6:** прогнать мигрированные скиллы вживую
→ 0 residual в `.dev-pomogator/logs/spec-access.jsonl`. P17-6 ENFORCE — строго после.

### Phase 16 — creation-pipeline hardening (бэклог ревью, выбран вариант «всё в v4»)
- P16-2 evals для discovery-forms / requirements-chk-matrix / task-board-forms (360m) —
  самый ценный: оба guard-дедлока P16-1 жили бы меньше при наличии evals.
- P16-3 судьба 7 шаблонов-сирот (120m) · P16-4 feature.template в anchor-тест (60m) ·
  P16-5 док split-responsibility аудита (60m) · P16-6 CRLF-safe fill-template (60m) ·
  P16-7 контракт единственного писателя .progress.json (60m) ·
  P16-8 дисциплина STOP-confirm (180m; 9 legacy-спек с неподтверждёнными STOP).

### Открытый фича-долг v4 (за Phase 16, по убыванию готовности)
- spec-check-log per-FR агрегация (30m, 1 из 2 Done-When).
- Phase 7 cross-spec partials: reference-доки (6 файлов), semantic timeout/partial-flag,
  YAML summary dashboard, SARIF GitHub smoke, --dry-run, coverage-summary, арх-детекция,
  встройка в create-spec (wire-create-spec-skill), fixture corpus, e2e roundtrip (~10ч+).
- Phase 5/6: tag-predictor (~4ч, единственная не начатая фича), shared-research-base,
  enrich-research-workflow, verify-phase5/6-green.
- 20 семантических дрифтов пере-теггинг (`audit-reports/fr8-semantic-drift-inventory.md`).

### Долг корпуса (вне v4 — отдельный PR после #32)
- 118 протухших FILE_CHANGES путей в других спеках + 10 dangling covers-рёбер в
  fix-bg-output-loss (нашёл corpus-health) · 31 NOT_COVERED + 78 ORPHAN по корпусу
  (validator nag) · пере-подтверждение STOP у 9 спек (пересекается с P16-8).

## Грабли для следующей сессии (короткий список)
- Прогоны вердикта/Docker — только из ЧИСТОГО worktree (параллельные сессии мутируют
  общее дерево; не коммить чужие uncommitted файлы — был инцидент, исправлен).
- `npm run build:mcp` ОБЯЗАТЕЛЕН после правок tools.ts/server.ts/builder-цепочки.
- Не чейнить `git commit` за тест-раном в одной команде — читать хвост ДО коммита
  (инцидент 54b42e7: закоммитил «GREEN» при реальном RED; гейт поймал).
- TASKS.md теперь под живым task-form-guard: новые блоки задач — строго
  `Status:`/`Est:`/`**Done When:**` + ≥1 чекбокс (регистрозависимо).
- DONE-задача без мапящегося сценария = TASK_UNTESTED gap = RED вердикт (ловило дважды).
- Тесты, спавнящие guard-ы, пишут DENY в реальный `~/.dev-pomogator/logs/form-guards.log`
  → точные счётчики изолировать через инжектируемые пути (softLog).
- **Docker EACCES на `.docker-status`**: если host-side запустить wrapper/`mkdir -p` под
  `daria` — каталог `.dev-pomogator/.docker-status` станет 755 owned host-UID, и контейнерный
  `testuser` (UID 1000) не сможет писать → wrapper падает `EACCES` на старте, ноль тестов,
  но `docker-test.sh` отдаёт exit 0 (обманчиво — ЧИТАЙ хвост). Фикс: `docker run --rm -v
  "${PWD}\.dev-pomogator\.docker-status:/x" alpine chmod -R 777 /x` (host `chmod` — no-op на
  NTFS). Не запускать host-side `test_runner_wrapper` в этом repo — только Docker.
