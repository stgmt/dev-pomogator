# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-persistent-log-для-docker-testsh-output)

WHEN `scripts/docker-test.sh <args>` запускается (независимо от foreground/background, независимо от SKIP_BUILD) THEN система SHALL создать файл `.dev-pomogator/.docker-status/test-run-<epoch-seconds>.log` и записать в него **весь** stdout+stderr прогона `docker compose run`.

## AC-2 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-persistent-log-для-docker-testsh-output)

WHEN `docker compose run` эмитит output AND процесс работает дольше 60 секунд THEN система SHALL дублировать output в log файл через `tee` AND родительский stdout также SHALL получать output (не подменять forward).

## AC-3 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-обновить-rule-no-blocking-on-tests--запрет-naked--tail-в-bg)

IF AI-агент читает `.claude/rules/pomogator/no-blocking-on-tests.md` THEN rule SHALL содержать секцию "Anti-patterns" с явным запретом паттерна `<long-cmd> 2>&1 | tail -N` при `run_in_background: true` AND SHALL содержать safe replacement пример с `tee`.

## AC-4 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-directory-lifecycle--dev-pomogatordocker-status-создаётся-безопасно)

IF директория `.dev-pomogator/.docker-status/` НЕ существует при запуске `docker-test.sh` THEN скрипт SHALL создать её через `mkdir -p` ПЕРЕД первым write'ом в log файл AND SHALL НЕ fail если директория уже существует.

## AC-5 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-log-rotation--gitignore--не-коммитить-test-run-log)

IF `.dev-pomogator/` уже matched родительским gitignore pattern THEN дополнительный entry не требуется AND спека SHALL документировать это в RESEARCH.md. IF `.dev-pomogator/` НЕ gitignored THEN spec SHALL предписать добавить `.dev-pomogator/.docker-status/test-run-*.log` к `.gitignore`.

## AC-6 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-exit-code-preservation--regression-guard)

WHEN `docker compose run` exits non-zero (симуляция test failure) THEN `docker-test.sh` SHALL exit с тем же non-zero code (pipefail сохраняет первый fail в pipeline) AND integration test SHALL verify это через explicit `bash docker-test.sh <args-that-fail>; echo "exit=$?"`.
