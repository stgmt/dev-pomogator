# Use Cases

## UC-1: Чистая автоматическая установка

1. Claude Code запускает SessionStart в проекте с dev-pomogator.
2. Bootstrap разрешает HOME/USERPROFILE и проверяет canonical plugin manifest через общий detector.
3. Если claude-mem отсутствует, не отключён и backoff истёк, bootstrap запускает pinned installer без TTY.
4. Post-install verification подтверждает plugin registration, settings, worker entrypoint и MCP/config ownership.
5. Повторный SessionStart становится no-op.

## UC-2: Управляемое обновление версии

1. Doctor сравнивает установленную версию claude-mem с поддерживаемой/pinned policy.
2. Совместимая версия продолжает работу без переустановки.
3. Устаревшая или несовместимая версия получает actionable remediation; update не выполняется скрытно внутри health probe.
4. После обновления real-artifact test повторно проверяет manifest, hooks, worker и MCP/config.

## UC-3: Единая конфигурация и диагностика

1. Bootstrap, `C-CMEM` и `C-CMEM-W` используют один installed-state/config resolver.
2. Resolver читает canonical manifest, `~/.claude-mem/settings.json`, worker artifacts и global `~/.claude.json`.
3. Нестандартный `CLAUDE_MEM_WORKER_PORT` применяется одинаково health check и doctor.
4. Остаточный PID/DB без plugin registration классифицируется как stale runtime, а не как здоровая установка.

## UC-4: Worker отвечает нормально

1. Настоящий installed `session-init` обращается к worker.
2. Worker отвечает до внутреннего deadline.
3. Session initialization и memory context сохраняются.
4. Timer/request handles освобождаются.

## UC-5: Worker недоступен или завис

1. Worker отклоняет соединение, возвращает non-200 либо принимает TCP без ответа.
2. `session-init` abort-ит запрос по короткому внутреннему deadline.
3. Hook возвращает continue/fail-open без `<claude-mem-context>` и без синхронных retry.
4. Doctor/reaper отдельно диагностируют и восстанавливают допустимый runtime state.

## UC-6: Windows orphan-port recovery

1. Health probe не достигает worker на настроенном порту.
2. Windows snapshot показывает listener с dead owner и orphan process с claude-mem signature.
3. Reaper завершает только подтверждённое orphan tree и сбрасывает failure counter.
4. Живой либо чужой process owner не затрагивается.
5. Этот use case принадлежит GREEN sub-spec `claude-mem-midsession-reaper` и не дублируется в основной реализации.

## UC-7: Deterministic Docker verification

1. Default Docker BDD работает без внешней сети.
2. Fixture имитирует manifest/settings/worker HTTP responses и black-hole socket через реальные process boundaries.
3. Проверяются install decision, common detector, doctor, hook matrix, health/reaper и bounded session-init.
4. Positive control доказывает, что hook не отключён.

## UC-8: Explicit real-install Docker profile

1. Отдельный network-enabled profile использует isolated HOME и USERPROFILE.
2. Bootstrap устанавливает exact pinned claude-mem artifact.
3. Проверяются installed_plugins.json, settings, worker/MCP registration, health и idempotent second run.
4. Результат не смешивается с быстрым default suite и сохраняет provenance версии/revision.

## UC-9: Hook registry matrix

1. Canonical Claude plugin содержит SessionStart bootstrap/reaper и PreToolUse mid-session reaper.
2. Dogfood settings отражают canonical contract.
3. Codex registry либо предоставляет эквивалентные events, либо явно документирует отсутствующий PreToolUse как platform limitation.
4. Registry parity BDD блокирует случайное выпадение lifecycle hook.

## Edge Cases

- Повреждённый `installed_plugins.json` или `~/.claude-mem/settings.json`.
- HOME и USERPROFILE указывают на разные каталоги Windows/Docker.
- Installer завершился успешно, но plugin manifest, MCP или worker не появились.
- Moving `npx claude-mem` изменил flags или runtime contract.
- Порт занят живым чужим Node/Python процессом.
- Worker init успешен, но semantic context injection зависает.
- Chroma/semantic storage недоступен, но worker API отвечает.
- Docker build содержит upstream source cache, но plugin не зарегистрирован в runtime HOME.
- Legacy `/health`, `/api/readiness` и Chroma:8000 expectations не соответствуют текущему `/api/health` worker contract.
