# Use Cases

## UC-1: Long-running Docker test в background с persistent log

Разработчик или AI-агент запускает `bash scripts/docker-test.sh <args>` как background Bash task через `run_in_background: true`. Docker build + vitest suite выполняются 7-22 минуты.

- Шаг 1: `docker-test.sh` создаёт persistent log файл `.dev-pomogator/.docker-status/test-run-<timestamp>.log`
- Шаг 2: Script пишет stdout/stderr **одновременно** в log файл и stdout (через `tee`)
- Шаг 3: Claude Code harness захватывает stdout для bg capture; если capture дропнется — log файл остаётся целым
- Шаг 4: По завершении task — user или AI может прочитать log файл независимо от состояния harness capture
- Результат: Evidence полного прогона доступно всегда, даже при 0-byte capture (как в инциденте bd9aii2if).

## UC-2: AI-агент формирует bg Bash команду — rule блокирует naked `| tail`

AI-агент собирается запустить long-running команду в background и добавляет `| tail -40` для сокращения output.

- Шаг 1: AI формирует команду `bash scripts/docker-test.sh ... 2>&1 | tail -40` с `run_in_background: true`
- Шаг 2: Rule `no-blocking-on-tests.md` (расширенная секция "tee fallback for bg long-output") явно запрещает паттерн
- Шаг 3: AI видит правило в CLAUDE.md и либо выбирает `| tee /tmp/full.log | tail -40`, либо `&> /tmp/full.log; tail -40 /tmp/full.log`
- Результат: anti-pattern не закрепляется; нет риска silent output loss в future bg-тасках.

## UC-3: Recovery инцидента — читаем persistent log

Пользователь заметил пустой capture у завершённой bg task. Нужно восстановить full output прогона.

- Шаг 1: User/AI открывает `.dev-pomogator/.docker-status/` — видит `test-run-<timestamp>.log` файлы
- Шаг 2: Последний по времени log совпадает по timestamp с завершённой task
- Шаг 3: `cat .dev-pomogator/.docker-status/test-run-1745000000.log | tail -100` показывает фактический tail, независимо от bg capture
- Результат: Incident investigation не требует 22-минутного re-run; полный output уже на диске.
