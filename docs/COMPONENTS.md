# dev-pomogator — карта инструментов и связей

> dev-pomogator — **одна система**, распространяемая как один canonical Claude Code plugin
> (`/plugin install dev-pomogator@stgmt`). Внутри — десятки встроенных инструментов,
> доставляемых четырьмя механизмами: **skills** (47), **hooks** (37 записей на 5 событий),
> **MCP-сервер** (1), **LSP-плагин** (1), плюс 5 slash-команд и 46 папок-подсистем в `tools/`.
> Этот документ — справочник «что есть и как связано». Источники истины: `.claude-plugin/hooks.json`,
> `.mcp.json`, `.lsp.json`, `.claude/skills/*/SKILL.md`, `tools/*/`.

## Механизмы доставки

| Механизм | Где объявлен | Когда срабатывает |
|---|---|---|
| Skill | `.claude/skills/<name>/SKILL.md` | По триггер-фразе юзера или вызову `Skill("...")` из другого скилла |
| Hook | `.claude-plugin/hooks.json` | Автоматически на событии (SessionStart / Stop / PreToolUse / PostToolUse / UserPromptSubmit) |
| MCP | `.mcp.json` | Тулзы доступны агенту всю сессию |
| LSP | `.lsp.json` | Тул `LSP` (definition/references/rename) для markdown |
| Slash-command | `.claude/commands/*.md` | Юзер вводит `/команду` |
| Tool (CLI) | `tools/<name>/` | Механика; вызывается хуками/скиллами через `tools/_shared/bootstrap.cjs` |

## Контуры системы (что с чем связано)

### 1. Спеки: создание → валидация → согласованность

```
create-spec (skill, 4 фазы со STOP-точками)
 ├─ Phase 1:    research-workflow (skill) — верификация гипотез ≥3 источниками
 ├─ Phase 1.75: architecture-decision-builder (skill, только greenfield)
 │               └─ arch-review-loop (skill) — автономный fix→verify цикл
 ├─ Phase 2:    requirements-chk-matrix, variant-matrix-build, discovery-forms (skills)
 ├─ Phase 3:    task-board-forms (skill)
 └─ перед каждым STOP: spec-review (skill, 15 категорий)
                 └─ spec-reality-check (skill) — спека vs реальность файлов
```

Механический слой под этим контуром:

- **tools/specs-generator** — scaffold/validate/audit/status CLI (вызывает create-spec).
- **tools/specs-validator** — hook на UserPromptSubmit + PreToolUse(Write|Edit): форматы спек.
- **tools/spec-conformance-guard** — hook PreToolUse(Write|Edit): DENY структурных нарушений `.specs/*.md`.
- **tools/spec-conformance-push** — hook PostToolUse(Write|Edit): мягкие находки в system-reminder.
- **tools/spec-graph** — билдер SpecGraph (узлы FR/AC/scenario/task + рёбра) — фундамент для MCP и guard-ов.

Согласованность между спеками:

```
cross-spec-reconcile (skill, 28 классов drift) → consistency-report.yaml
 ├─ cross-spec-resolve (skill) — интерактивный разбор находок
 └─ spec-backlog (skill + tools/spec-backlog) — batch-triage → 8 resolver-агентов
     (ac-author / link-fixer / scenario-writer / fr-author / decision-arbiter / owner-picker / …)
```

### 2. Spec-граф как сервис: MCP + LSP

- **dev-pomogator-specs (MCP)** — `tools/spec-mcp-server/server.bundle.mjs` (бандл, работает у юзеров без node_modules). Read-only тулзы по графу спек: `get_trace`, `find_by_tags`, `conformance_check`, `get_coverage`, `validate_anchor`, `list_specs` и др. Шпаргалка по выбору тулзы — skill **spec-graph-query**; runtime-проверка живости тулз — skill **spec-mcp-dogfood**.
- **marksman (LSP)** — `tools/marksman-installer/` качает и верифицирует бинарь (sha256), `.lsp.json` регистрирует его как нативный LSP Claude Code. Навигация/rename по markdown-якорям — skill **markdown-lsp**; массовая починка битых якорей — skill **anchor-fix** + hook **tools/anchor-integrity** (PostToolUse + Stop).

Разделение доменов: spec-MCP = трассируемость спек (coverage/honesty), Marksman = навигация по прозе/якорям.

### 3. Тесты: единая точка запуска + мониторинг + качество

```
/run-tests (skill) — ЕДИНСТВЕННЫЙ способ запускать тесты
 ├─ tools/tui-test-runner: test_guard (PreToolUse Bash) — блокирует голые npm test/pytest/…
 │                          build_guard — блокирует тесты на устаревшем билде
 ├─ tools/test-statusline: wrapper пишет YAML-статус прогона
 │   ├─ читает statusline (compact bar, прогресс в строке статуса)
 │   └─ читает Python TUI (4 вкладки мониторинга)
 └─ tools/bash-post-test (PostToolUse Bash): парсит вывод тестов → YAML
```

Качество тестов: **strong-tests** (12-пунктный чеклист + mutation resistance, хинт после прогона), **tests-create-update** (TDD-first), **dedup-tests** + `tools/test-quality` (hook: дубли/JiT-подсказки), **suite-failure-triage** (разбор красного сьюта), **real-fixtures** (фикстуры из реального вывода producer-а).

### 4. Native statusline (repo + cwd + ветка)

```
SessionStart hook → tools/native-statusline/install_native_statusline.ts
 ├─ reconcile-statusline.ts: ставит statusLine.command = ccstatusline (если слот пуст; чужое не трогает)
 └─ ccstatusline-widgets.ts: создаёт ~/.config/ccstatusline/settings.json — 3-строчный столбик
     (model|ctx / repo|cwd / branch|changes) — ТОЛЬКО если конфига ещё нет

/pomogator-doctor → check C-NSL (команда statusline) + C-NSW (виджеты repo/cwd)
 └─ fix-action: apply-statusline.ts — немедленная установка + ремонт «слетевшего»
     стокового конфига (кастомные раскладки никогда не трогаются)
```

Opt-out: `DEV_POMOGATOR_STATUSLINE=off`. Домен НЕ пересекается с test-statusline (прогресс тестов) — см. `.specs/native-statusline/` FR-9.

### 5. Диагностика и установка

- **pomogator-doctor** (skill + `/pomogator-doctor`) — 17 проверок окружения в 🟢🟡🔴 группах + fix-actions; тихий hook-вариант на SessionStart.
- **install-diagnostics** — разбор молчаливых/упавших установок; **verify-plugin-install** — полнота canonical install; **dev-pomogator-uninstall** — безопасное удаление; **tools/migrate-v1-to-v2**, **tools/migrate-v3-to-v4** — миграции.
- **onboard-repo** (tools) — генерит AI-centric `.specs/.onboarding.json` для чужого репо.

### 6. Гигиена сессии (hooks на Stop/UserPromptSubmit)

| Инструмент | Событие | Что делает |
|---|---|---|
| tools/auto-commit | Stop | авто-коммит с LLM-сообщением |
| tools/auto-simplify | Stop | триггерит /simplify-ревью изменений |
| tools/answer-simple | Stop | аудит ответа: жаргон/коды/перегруженные вопросы (правило clear-questions) |
| tools/claim-evidence-gate | Stop | заявления без evidence не проходят |
| tools/learnings-capture | Stop + UserPromptSubmit | очередь сигналов для /reflect и /suggest-rules |
| tools/bg-task-guard | PostToolUse(Bash) + Stop | не даёт завершить сессию при живых bg-задачах |
| tools/prompt-suggest | UserPromptSubmit + Stop | подсказки по промптам |
| tools/plan-pomogator | PreToolUse(ExitPlanMode) + … | гейт формата планов (9 секций + File Changes) |
| tools/scope-gate | pre-commit | ловит no-op «фиксы» при расширении enum/switch |

### 7. Окружения и инфраструктура

- **worktree-setup** (+ `/worktree`) — готовый git worktree: ветка + bootstrap + build + doctor.
- **session-pilot** — dashboard ворктри (localhost:8083), запуск/resume Claude в ворктри.
- **docker-optimize**, **devcontainer** (tools), **context-menu** (Windows right-click), **edge-debug-port**, **proxy-up** / **use-claude-subscription**, **debug-screenshot** (визуальная верификация), **observability-review** (где агент споткнулся), **runtime-dogfood** (мёртвые/сломанные entrypoints), **deep-insights** (аналитика usage), **skills-rules-optimizer** (аудит/мерж правил и скиллов), **answer-simple** (skill-аудит черновика).

## Жизненный цикл сессии (хуки по событиям)

```
SessionStart (9): bun-oom-guard · marksman-installer · claude-mem-health · test-statusline
                  · native-statusline · tui-test-runner · pomogator-doctor(quiet)
                  · skill-listing-budget · spec-backlog(summary)
PreToolUse  (5): plan-gate(ExitPlanMode) · specs-validator + spec-conformance-guard(Write|Edit)
                  · build_guard + test_guard(Bash)
PostToolUse (6): test-quality + spec-conformance-push + anchor-integrity(Write|Edit)
                  · bg-task-guard + bash-post-test(Bash) · research-workflow-marker-guard(Skill)
UserPromptSubmit (4): plan-pomogator · prompt-suggest · specs-validator · learnings-capture
Stop        (13): auto-commit · auto-simplify · answer-simple · claim-evidence-gate
                  · learnings-capture · anchor-integrity · bg-task-guard · tui-test-runner
                  · test-quality-gate · spec-backlog auto-ingest · plan-pomogator · prompt-suggest · dedup
```

## Принципы (почему так)

1. **Одна система, один плагин.** Инструменты не распространяются по отдельности — они связаны
   (doctor чинит statusline, reconcile кормит backlog, guard читает spec-graph). Разделение
   сломало бы связи и умножило установку.
2. **Skills = оркестрация, tools/ = механика.** SKILL.md описывает workflow для агента;
   детерминированную работу делают скрипты в `tools/`, вызываемые через `bootstrap.cjs`.
3. **Hooks = автоматика без участия агента.** Всё, что должно происходить «само»
   (валидация, статуслайн, авто-коммит), висит на событиях, а не на памяти агента.
4. **Plugin-distributed код обязан работать без node_modules** — bundle / lazy-import /
   builtins-only (правило dead-integration-guard; инциденты: MCP-сервер, Marksman).

---

*При добавлении нового инструмента: добавь его в соответствующий контур здесь + строку в
README («Что устанавливается» / Skills overview) + спеку в `.specs/<slug>/`.*
