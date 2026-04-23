# Functional Requirements (FR)

## FR-1: Persistent log для docker-test.sh output

Скрипт `scripts/docker-test.sh` ОБЯЗАН писать полный stdout+stderr прогона vitest в persistent файл `.dev-pomogator/.docker-status/test-run-<timestamp>.log` **одновременно** с forward'ом в родительский stdout. Файл создаётся в начале прогона и остаётся на диске после exit (не удаляется trap cleanup). Параллельная запись через `tee` в pipeline не меняет exit code благодаря уже активному `set -o pipefail`.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1), [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-1](USE_CASES.md#uc-1-long-running-docker-test-в-background-с-persistent-log), [UC-3](USE_CASES.md#uc-3-recovery-инцидента--читаем-persistent-log)

## FR-2: Обновить rule `no-blocking-on-tests` — запрет naked `| tail` в bg

Файл `.claude/rules/pomogator/no-blocking-on-tests.md` ОБЯЗАН явно документировать anti-pattern `<long-cmd> 2>&1 | tail -N` с `run_in_background: true` и safe replacement (`| tee /tmp/full.log | tail -N` ИЛИ `&> /tmp/full.log; tail -N /tmp/full.log`). Секция "Anti-patterns" с reasoning (три hypotheses почему это ломается) включена.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-2)
**Use Case:** [UC-2](USE_CASES.md#uc-2-ai-агент-формирует-bg-bash-команду--rule-блокирует-naked--tail)

## FR-3: Directory lifecycle — `.dev-pomogator/.docker-status/` создаётся безопасно

`docker-test.sh` ОБЯЗАН создать директорию `.dev-pomogator/.docker-status/` через `mkdir -p` ПЕРЕД открытием log файла. Директория уже существует на dogfood-проекте (для YAML heartbeat), но скрипт должен быть self-sufficient для fresh checkouts и CI.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-3)
**Use Case:** [UC-1](USE_CASES.md#uc-1-long-running-docker-test-в-background-с-persistent-log)

## FR-4: Log rotation / gitignore — не коммитить test-run-*.log

Files `.dev-pomogator/.docker-status/test-run-*.log` не должны попадать в git. Либо `.dev-pomogator/` уже в `.gitignore` (как managed dir), либо добавить паттерн. Спека ОБЯЗАНА верифицировать текущий gitignore-статус и задокументировать его.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-4)
**Use Case:** [UC-1](USE_CASES.md#uc-1-long-running-docker-test-в-background-с-persistent-log)

## FR-5: Exit code preservation — regression guard

После добавления `tee` в pipeline docker-test.sh ОБЯЗАН сохранять exit code `docker compose run` (non-zero при test failure). `set -o pipefail` уже активен; patch MUST NOT удалить этот flag. Integration test ОБЯЗАН проверить что `bash docker-test.sh false` (симуляция неудачного теста) возвращает non-zero.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-5)
**Use Case:** [UC-1](USE_CASES.md#uc-1-long-running-docker-test-в-background-с-persistent-log)

## FR-6: Feedback memory — anti-pattern зафиксирован в personal memory — OUT OF SCOPE (частично)

> OUT OF SCOPE — Создание файла `memory/feedback_bg-tail-requires-tee.md` происходит в runtime через user request или AI proactive capture, не через шеллится инсталлером. Спека документирует рекомендуемый text/содержимое, но файл пишется вручную после merge. Связанный User Story №4 также помечен OUT OF SCOPE для этой фичи.
