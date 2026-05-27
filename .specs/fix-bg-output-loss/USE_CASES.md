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

## UC-4 (DEPRECATED v0.3.0) — replaced by UC-7 (generic adapter)

> **DEPRECATED in v0.3.0**: bg-log.sh откачен. См. UC-7 ниже.

## UC-7 (v0.3.0): AI запускает long bg команду через generic adapter

AI планирует запустить `npm run build` или `dotnet ef migrations add` в background. Через тот же wrapper что и тесты.

- Шаг 1: AI вызывает `Skill("run-tests")` с `--framework generic -- npm run build` ИЛИ напрямую Bash: `node .dev-pomogator/tools/test-statusline/test_runner_wrapper.cjs --framework generic -- npm run build` с `run_in_background: true`
- Шаг 2: wrapper.ts validates `framework: 'generic'`, dispatches to `GenericAdapter` (passthrough — parseLine always returns null)
- Шаг 3: wrapper создаёт `.dev-pomogator/.test-status/test.<prefix>.log` и YAML status `.dev-pomogator/.test-status/status.<prefix>.yaml`
- Шаг 4: child process spawned, stdout/stderr forwarded to parent + logStream.write(file)
- Шаг 5: YAML heartbeat update каждые 2s — TUI compact bar видит running state
- Шаг 6: По завершении state: passed (exit 0) / failed (exit ≠ 0), wrapper propagates exit code
- Шаг 7: AI читает log file через Read tool offset/limit для tail-эффекта ИЛИ смотрит YAML status

## UC-8 (v0.3.0): AI запускает raw dotnet test → smart converter дает готовую команду

- Шаг 1: AI вызывает Bash: `dotnet test --filter MBIL001` (raw, без wrapper)
- Шаг 2: PreToolUse hook `test_guard.ts` matches `\bdotnet\s+test\b` pattern, framework: 'dotnet'
- Шаг 3: Hook `buildConvertedCommand()` строит готовую строку: `node .dev-pomogator/tools/test-statusline/test_runner_wrapper.cjs --framework dotnet -- dotnet test --filter MBIL001`
- Шаг 4: Hook возвращает exit 2 (deny) с converted command в `permissionDecisionReason`
- Шаг 5: AI видит deny-message в Bash tool error, копирует готовую converted строку, запускает повторно — теперь через wrapper
- Результат: 0 friction для AI — не нужно вспоминать синтаксис wrapper, просто copy-paste готовую команду

## UC-5 (v0.2.0): AI читает обновлённое правило и выбирает file-redirect

AI планирует запустить bg команду напрямую без обёртки — нужно точное invocation.

- Шаг 1: AI читает `.claude/rules/pomogator/no-blocking-on-tests.md` перед формированием bg команды
- Шаг 2: Видит subsection `## Confirmed Anthropic bugs` с 4 GitHub issue ссылками — понимает что naked pipe в bg сломан by design
- Шаг 3: Видит subsection `## Preferred pattern: file redirect (Windows-safe)` с примерами для dotnet/pytest/cargo
- Шаг 4: Применяет паттерн напрямую: `dotnet test --filter X > .dev-pomogator/.bg-logs/dotnet-run.log 2>&1` с `run_in_background: true`
- Результат: Те же гарантии что UC-4, без необходимости вспоминать API обёртки.

## UC-6 (v0.2.0): Recovery после зависшей dotnet test bg task

AI запустил `dotnet test` через `bg-log.sh` 15 минут назад. Подозрение что процесс умер.

- Шаг 1: AI идёт в `.dev-pomogator/.bg-logs/` — открывает последний `<epoch>-dotnet-test.log`
- Шаг 2: Видит что последняя строка лога — `xunit.runner.json loaded` от 10 минут назад, нет новых entries
- Шаг 3: Делает вывод: процесс реально завис (Testcontainers deadlock?), а не capture lost
- Шаг 4: Kill через `tasklist | grep dotnet` + `taskkill /F /PID <pid>` без 25-минутного ожидания
- Результат: Diagnosis "висит vs работает" решается за минуту вместо 25-минутного wait + manual taskkill из incident 2026-05-10.
