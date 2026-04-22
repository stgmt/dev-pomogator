# User Stories

## Основные роли

- **Developer using dev-pomogator** — разработчик, использующий dev-pomogator в target-проекте (своём или клиентском)
- **AI agent (Claude Code, subagents, другие AI)** — читатель/консюмер онбординг-артефактов во время работы
- **Team lead / reviewer** — читает `.onboarding.md` для быстрого понимания незнакомого проекта команды
- **New team member** — онбордится на проект сам + использует артефакт как checklist

## Stories

### US-1 (Developer) @feature1
Как developer, использующий dev-pomogator, я хочу чтобы при **первом `/create-spec` в новом репо** автоматически запускалась Phase 0 Repo Onboarding, чтобы не объяснять агенту проект вручную перед каждой спекой.

### US-2 (AI agent) @feature2
Как AI agent, я хочу читать типизированный JSON (`.specs/.onboarding.json`) со всем контекстом проекта, чтобы детерминированно парсить состояние репо вместо повторного сканирования при каждом запросе.

### US-3 (Developer) @feature3
Как developer, я хочу чтобы PreToolUse hook автоматически блокировал raw-команды (`npm test`, `pytest`, `git commit`), если в проекте есть skill-обёртка (`/run-tests`, `auto-commit`), чтобы agent не обходил TUI/statusline/auto-commit интеграции.

### US-4 (Developer) @feature4
Как developer, я хочу инвалидацию cache по **git SHA** и флагу `--refresh-onboarding`, чтобы онбординг пересчитывался когда проект изменился, но не перезапускался при каждой новой спеке в том же состоянии репо.

### US-5 (Developer) @feature5
Как developer, я хочу чтобы онбординг включал **baseline-прогон тестов** через существующий `/run-tests`, чтобы видно было что сломано ДО моих изменений — это защита от ложных обвинений агенту в поломке.

### US-6 (Developer) @feature6
Как developer, я хочу **text gate** — ёмкое описание архитектуры одним абзацем от агента, которое я должен подтвердить перед Phase 1 Discovery, чтобы ошибочное понимание ловилось рано, а не после часов работы над FR/AC.

### US-7 (Developer крупного репо) @feature7
Как developer, работающий с крупным репо (>500 файлов), я хочу чтобы онбординг использовал **параллельных Explore subagents** для recon и сжатую ingestion (repomix или fallback), чтобы main-контекст Claude не переполнился в процессе онбординга.

### US-8 (Developer) @feature8
Как developer, я хочу **archetype-триаж на входе** (2 минуты — Backend API / Frontend / Library / CLI / Monorepo / ...), чтобы дальнейшие шаги собирали данные релевантные типу проекта, а не сканировали всё подряд.

### US-9 (Team lead) @feature9
Как team lead, я хочу **человекочитаемый `.specs/.onboarding.md` отчёт** по фиксированному 6-секционному шаблону (Project snapshot / Dev env / Tests / Behavior / Risks / Next steps), чтобы быстро передавать понимание проекта новым членам команды без устного "объяснения на пальцах".

### US-10 (AI agent) @feature10
Как AI agent, я хочу чтобы `.onboarding.json` содержал **AI-specific секции** (rules_index, skills_registry, hooks_registry, mcp_servers, boundaries 3-tier, gotchas, glossary), не только generic project metadata (languages/frameworks), чтобы вести себя в репо корректно с первой команды.

### US-11 (New team member) @feature11
Как new team member, я хочу использовать `.specs/.onboarding.md` как **onboarding checklist** (команды, env vars, тест-паттерны, gotchas), чтобы за 30 минут быть продуктивным вместо 2 дней чтения кода и документации.

### US-12 (Developer) @feature12
Как developer, я хочу чтобы онбординг не пересекался с Anthropic `/init` — наш skill **пишет в свои файлы**, `/init` пишет в `CLAUDE.md`, оба могут жить параллельно без конфликта.

### US-13 (Maintainer dev-pomogator) @feature13
Как maintainer dev-pomogator, я хочу чтобы онбординг был **отдельным extension**, чтобы его можно было обновлять/отключать/удалять независимо от других плагинов и чтобы ответственность была чётко очерчена.

### US-14 (Developer) @feature14
Как developer, я хочу **scratch-файл `.specs/.onboarding-scratch.md`** для крупных онбордингов, куда агент пишет находки порциями по ходу работы, чтобы не потерять контекст при переполнении в процессе.

### US-15 (Developer) @feature15
Как developer, я хочу dual-render из одного source-of-truth `.onboarding.json`: (a) **prose в `.claude/rules/onboarding-context.md`** для декларативного чтения агентом, (b) **`PreToolUse` hook в `.claude/settings.local.json`** для механического блокирования — чтобы agent не мог проигнорировать инструкции по забывчивости.
