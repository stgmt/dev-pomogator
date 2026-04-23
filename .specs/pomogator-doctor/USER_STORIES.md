# User Stories

## US-1 @feature1
Как **новый contributor dev-pomogator**, я хочу запустить одну команду `/pomogator-doctor` сразу после clone, чтобы за 5 секунд узнать что из окружения (Node, Git, Bun, Python, `~/.dev-pomogator/`, env vars, MCP серверы, hooks) не работает — а не тратить час на debug ENOENT в hooks.

## US-2 @feature2
Как **пользователь со сломанной установкой помогатора**, я хочу чтобы доктор сам обнаружил missing `~/.dev-pomogator/tools/` / устаревшие hooks / несоответствие версий и предложил переустановить помогатор (`npx dev-pomogator`) — чтобы не искать правильную команду в README или issues.

## US-3 @feature3
Как **пользователь без API ключа** (нет `AUTO_COMMIT_API_KEY` в `.env` и в `settings.local.json → env`), я хочу получить чёткий actionable hint "add to .env or settings.local.json env block, see `.env.example` line N" и ясное указание что переустановка здесь не поможет — чтобы не тратить время на ненужные reinstall circles.

## US-4 @feature4
Как **maintainer dev-pomogator**, я хочу чтобы SessionStart hook тихо проверял окружение каждый запуск Claude Code и показывал короткий баннер (через `additionalContext`) только когда реально есть проблема — чтобы не захламлять output чистого happy-path и не отвечать на одни и те же вопросы в issues.

## US-5 @feature8
Как **DevOps инженер**, я хочу запускать `dev-pomogator --doctor --json` в CI pipeline на build-агенте с осмысленным exit code (0 ok / 1 warnings / 2 critical) и machine-readable JSON output — чтобы автоматизировать проверку окружения и ломать pipeline при critical issues.

## US-6 @feature9
Как **junior разработчик в команде**, я хочу видеть traffic-light отчёт по установленным расширениям помогатора: 🟢 self-sufficient работают / 🟡 нужны env vars / 🔴 нужны внешние зависимости (Python/Bun/Docker) — чтобы сразу понять какой объём setup меня ждёт перед продуктивной работой.

## US-7 @feature10
Как **пользователь у которого `/create-spec` не появился** в Claude Code после установки, я хочу чтобы доктор проверил что commands/skills из `plugin.json` реально зарегистрированы plugin-loader-ом (не только физически лежат в `.claude/`) — чтобы отличить "файлов нет" от "файлы есть, но Claude их не видит".

## US-8 @feature11
Как **пользователь с частичной установкой** (только 3 из 18 extensions), я хочу чтобы доктор проверял зависимости **только для моих installed extensions** — не кричал "Bun missing" если у меня нет `claude-mem`, и не требовал `pyyaml` если `forbid-root-artifacts` не установлен.

---

## Post-Launch User Stories (2026-04-20)

## US-9 @feature12
Как **пользователь у которого хуки выдают стену ошибок** после каждого ответа Claude (22 сломанных хука × 5 events, реальный кейс webapp от 2026-04-20), я хочу чтобы доктор прочитал `settings.local.json → hooks` и точно показал какие command paths ссылаются на отсутствующие файлы — чтобы понять что надо реинсталлить или удалить stale-регистрацию, а не гадать по stack traces.

## US-10 @feature12
Как **пользователь с несколькими проектами** (dev-pomogator и webapp оба в `installedExtensions[*].projectPaths`), я хочу команду `dev-pomogator --doctor --all-projects` которая обойдёт все известные установки и покажет агрегированный traffic-light отчёт — чтобы не переключаться в каждый cwd вручную и не узнать про сломанный webapp только когда спам хуков уже придёт в чат.

## US-11 @feature12
Как **maintainer dev-pomogator**, я хочу чтобы доктор ловил hash drift: `auto_commit_stop.ts` в dev-pomogator имеет один sha256, в webapp — другой, оба managed → хоть один drift, хоть user edit — warning с указанием файла и предложением сравнить с source в `extensions/{ext}/tools/`. Чтобы не затирать user changes при reinstall без его ведома.

## US-12 @feature12
Как **пользователь broken install** у которого в `webapp` doctor hook не зарегистрирован (pomogator-doctor extension не попал в projectPaths при исходной установке), я хочу чтобы installer автоматически регистрировал SessionStart doctor hook во всех target проектах — чтобы проактивный баннер срабатывал без моего явного opt-in, иначе я могу никогда не узнать что `/pomogator-doctor` существует.
