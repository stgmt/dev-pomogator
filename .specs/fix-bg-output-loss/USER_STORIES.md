# User Stories

## v0.1.0 (docker-test.sh focused)

- Как разработчик, запускающий Docker тесты в фоне через `/run-tests`, я хочу гарантированный persistent log на диске, чтобы не терять output если Claude Code harness дропнет capture handle на 22-минутной таске.
- Как AI-агент, формирующий bg Bash команду, я хочу явное правило против паттерна `long-cmd 2>&1 | tail -N` (без `tee`), чтобы не повторять single-point-of-failure anti-pattern.
- Как инженер, расследующий incident, я хочу открыть известный log файл в `.dev-pomogator/.docker-status/test-run-<timestamp>.log` и прочитать полный output прогона — независимо от того, жив ли ещё harness capture.
- Как AI-агент, работающий с памятью, я хочу feedback memory про этот конкретный anti-pattern, чтобы в будущих сессиях не генерировать `| tail` bg-команды без tee fallback.

## v0.2.0 (generic non-docker bg expansion)

- Как разработчик dev-pomogator, я хочу запускать `dotnet test`, `pytest`, `cargo test` (и любую long bg команду) через единую обёртку `scripts/bg-log.sh`, чтобы получать persistent log даже когда Claude Code Bash tool теряет stdout из-за известных багов #16305 / #21915 / #36915 / #50616.
- Как AI-агент в Claude Code, я хочу видеть в `.claude/rules/pomogator/no-blocking-on-tests.md` ссылки на confirmed Anthropic bugs (4 GitHub issue) и preferred file-redirect pattern (`> file 2>&1` без pipe), чтобы не тратить 25 минут на naked bg pipe команды при подтверждённо сломанной capture-цепочке.
- Как пользователь dev-pomogator, я хочу чтобы spec `fix-bg-output-loss` отражал реальный scope (все long bg команды, не только docker), чтобы новые контрибьюторы понимали границы и не дублировали существующее решение.
- Как Claude в новой сессии, я хочу через `feedback memory` сразу узнать про известный 25-минутный trap (`dotnet test --filter X` через `run_in_background: true` без обёртки = silent hang) и preferred workaround, чтобы не повторить incident 2026-05-10.

## v0.3.0 (refactor — generic adapter integration)

- Как разработчик dev-pomogator, я хочу чтобы long bg команды (`npm run build`, `dotnet ef migrations`, `sleep 60`) проходили через тот же `test_runner_wrapper` что и тесты через `--framework generic` — единая инфраструктура persistent log + YAML status + statusline, никаких отдельных скриптов.
- Как AI-агент, который запустил raw `dotnet test --filter X`, я хочу получить от `test_guard` готовую converted команду (с правильным `--framework` и wrapper path) в deny-message, чтобы скопировать и сразу запустить, не тратя время на построение команды по памяти.
- Как пользователь dev-pomogator, я хочу видеть в спеке v0.3.0 что предыдущая идея с bg-log.sh откачена как duplicate, и текущая архитектура — единый wrapper с generic adapter. Чтобы новые контрибьюторы не повторили ту же ошибку.
- Как продуктовый менеджер, я хочу видеть отчёт почему `/run-tests` skill не сработал в 2026-05-10 + benchmark trigger rate, чтобы решить как улучшать.
