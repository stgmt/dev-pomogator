# User Stories

## US-1: Developer в team проекте @feature1 @feature2

Как **developer работающий в team-shared проекте** (smarts, любой другой clone), я хочу запускать `dev-pomogator install` и не беспокоиться что случайный `git add .` закоммитит dev-pomogator tools/hooks всей команде — хочу чтобы managed файлы были автоматически gitignored и хуки писались в personal `.claude/settings.local.json`, не в shared `.claude/settings.json`.

## US-2: Team lead с собственными shared hooks @feature2

Как **team lead**, я хочу чтобы мой shared `.claude/settings.json` хук (например `block-dotnet-test.js`) оставался нетронутым после `dev-pomogator install` — установщик не должен вмешиваться в team-shared конфигурацию, только писать свою в `settings.local.json`.

## US-3: Жертва broken-install инцидента @feature4

Как **dkorotkov** (жертва инцидента 2026-04-06), я хочу чтобы сломанный `dev-pomogator install` падал громко сразу с clear message ("Run npm run build first"), а не оставлял меня с broken state (17 хуков записаны, runner отсутствует, каждая prompt-submit падает с MODULE_NOT_FOUND).

## US-4: Runner-disappeared after-install @feature5

Как **developer чья `~/.dev-pomogator/` была удалена** (antivirus, Claude Code v2.1.83 updater, Windows Storage Sense), я хочу чтобы dev-pomogator хуки fail-soft (silent exit 0 с diagnostic в stderr), а не блокировали каждое моё действие MODULE_NOT_FOUND ошибками — до того как я смогу починить ситуацию через `dev-pomogator bootstrap`.

## US-5: Maintainer dev-pomogator (dogfooding) @feature3

Как **мейнтейнер dev-pomogator** (stigm), я хочу чтобы `dev-pomogator install` в нашем собственном `D:\repos\dev-pomogator` НЕ модифицировал наш `.gitignore` / `.claude/settings.json` — только копировал tools (для dogfooding). Наши файлы в git — source of truth, инсталлер не должен их трогать.

## US-6: Developer заменивший extension @feature1

Как **developer заменивший один extension другим** (например удалил `auto-commit`, добавил `specs-workflow`), я хочу чтобы stale gitignore entries от удалённых plugins уходили автоматически при re-install — без ручной чистки `.gitignore` после каждой переустановки.

## US-7: User с собственным `.claude/commands/create-spec.md` @feature6

Как **user с закоммиченным `.claude/commands/create-spec.md`** (собственная team-shared команда), я хочу чтобы инсталлер НЕ перезаписывал мой файл молча, а детектировал collision через `git ls-files`, пропускал копирование и показывал WARN с именем файла в install report.

## US-8: Developer с project `.mcp.json` содержащим secrets @feature8

Как **developer чей project `.mcp.json` содержит plaintext credentials** (JIRA_API_TOKEN, CONFLUENCE_API_TOKEN — как в smarts), я хочу чтобы:
- наш `setup-mcp.py` НЕ писал наши Context7/Octocode MCP серверы в этот файл (дабы не усиливать risk leak при `git add .mcp.json`), а всегда писал в global `~/.claude.json`
- `dev-pomogator install` показывал SECURITY WARN при детекции secret-паттернов в `.mcp.json` с рекомендациями (move to env vars / gitignore / global config)

## US-9: Developer который хочет убрать dev-pomogator @feature9

Как **developer который решил избавиться от dev-pomogator в проекте**, я хочу сказать Claude Code "удали dev-pomogator" и получить безопасное, корректное удаление — через skill-инструкции для AI агента (safety checks → dev-pomogator source repo refuse → CLI-first dry-run → manual fallback → post-verification). Без риска что AI агент удалит что-то лишнее или пропустит что-то важное из managed state.
