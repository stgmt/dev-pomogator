# User Stories

- Как разработчик, запускающий Docker тесты в фоне через `/run-tests`, я хочу гарантированный persistent log на диске, чтобы не терять output если Claude Code harness дропнет capture handle на 22-минутной таске.
- Как AI-агент, формирующий bg Bash команду, я хочу явное правило против паттерна `long-cmd 2>&1 | tail -N` (без `tee`), чтобы не повторять single-point-of-failure anti-pattern.
- Как инженер, расследующий incident, я хочу открыть известный log файл в `.dev-pomogator/.docker-status/test-run-<timestamp>.log` и прочитать полный output прогона — независимо от того, жив ли ещё harness capture.
- Как AI-агент, работающий с памятью, я хочу feedback memory про этот конкретный anti-pattern, чтобы в будущих сессиях не генерировать `| tail` bg-команды без tee fallback.
