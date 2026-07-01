# Non-Functional Requirements (NFR)

## Performance

- **NFR-Performance-1:** `check.py` overhead для stale-detection + auto-prune ОБЯЗАН быть < 100ms на типичном репозитории (≤200 entries в `allow:`). Реализация: O(N) pass с `os.path.exists()` + atomic save если есть changes.
- **NFR-Performance-2:** classify_file без LLM (config-only mode или cache hit в hybrid/llm) ОБЯЗАН быть < 5ms per file. Pure Python regex matching.
- **NFR-Performance-3:** LLM classification (cache miss) — bound by `claude -p` subprocess startup (~500-2000ms). Acceptable trade-off для unknown files; cache prevents repeat calls.
- **NFR-Performance-4:** `.dev-pomogator/.classifier-cache.json` size — мониторить growth; cache eviction по TTL предотвращает unbounded growth.

## Security

- **NFR-Security-1:** `auto_prune` НЕ ДОЛЖЕН удалять файлы из репозитория (только entries из YAML). YAML — write target; диск — read-only target.
- **NFR-Security-2:** Path traversal protection — entries в `allow:` ОБЯЗАНЫ интерпретироваться как basename только. Если entry содержит `/`, `\`, `..`, `\0` — пропускать с WARN, не trigger prune (могут быть intentional non-basename references).
- **NFR-Security-3:** YAML save в auto-prune ОБЯЗАН использовать atomic temp-file pattern (per `atomic-config-save` rule) — никаких partial writes при interrupt.
- **NFR-Security-4:** LLM prompt — file basename ONLY, никогда file content. Никакого автоматического data exfiltration. Prompt fixed (см. FR-3) — не user-controllable.
- **NFR-Security-5:** Cache file `.dev-pomogator/.classifier-cache.json` НЕ должен содержать sensitive data (только filename → classification mapping). Должен быть в `.gitignore` (документировать).
- **NFR-Security-6:** 0 API keys, 0 env vars, 0 secrets — только Claude Code CLI subscription через subprocess. Plugin code НЕ должен touch ANY auth credentials.

## Reliability

- **NFR-Reliability-1:** `check.py` graceful fallback при отсутствии `_classifier.py` — embedded `_FALLBACK_TRASH_PATTERNS` + WARN. Pre-commit hook никогда не должен ломаться из-за impedance mismatch версий.
- **NFR-Reliability-2:** Auto-prune idempotent — повторный запуск без новых stale entries = no-op (file mtime unchanged, exit 0).
- **NFR-Reliability-3:** YAML format preservation — auto-prune сохраняет existing header comment, порядок ключей (`mode → allow → deny → ...`), не пере-форматирует нетронутые секции.
- **NFR-Reliability-4:** Backward compatibility — формат `.root-artifacts.yaml` НЕ меняется breaking-way: новые поля (`trash_patterns`, `classifier`, `auto_prune`, `use_default_trash_patterns`) optional с defaults. Existing downstream YAMLs продолжают работать.
- **NFR-Reliability-5:** LLM call failure isolation — timeout / non-zero exit / malformed JSON / parse error → fallback `'unknown'`, не propagate exception. Один проблемный file НЕ должен валить весь pre-commit.
- **NFR-Reliability-6:** Cache corruption tolerance — если `.classifier-cache.json` malformed JSON → log warn, treat as empty, продолжить. Не crash.
- **NFR-Reliability-7:** Atomic commit pattern — auto-prune изменения yaml + удаление файлов попадают в один git commit (через pre-commit framework "files modified" mechanism). `git revert HEAD` восстанавливает both atomically.

## Usability

- **NFR-Usability-1:** Сообщения hook'а ОБЯЗАНЫ быть actionable: «forbid-root-artifacts auto-pruned N stale entries from .root-artifacts.yaml. Run `git add .root-artifacts.yaml && git commit` to include yaml changes». Не «yaml modified» без объяснения.
- **NFR-Usability-2:** Hint про SettingsMigrator для `*.testsettings` — ссылка на конкретную Microsoft Learn URL: `https://learn.microsoft.com/en-us/visualstudio/test/migrate-testsettings-to-runsettings`.
- **NFR-Usability-3:** Документация `.root-artifacts.yaml` schema в README — все новые поля с examples.
- **NFR-Usability-4:** При `claude` CLI отсутствии — одноразовый WARN в stderr, не на каждый file (отдельный flag в classifier instance).
- **NFR-Usability-5:** Pre-commit framework auto-prune workflow — задокументировать в README раздел «Auto-prune behavior»: «Hook may modify `.root-artifacts.yaml`. If it does, commit fails with message «files were modified by this hook». Run `git add .root-artifacts.yaml && git commit` to retry — yaml changes will be included in the commit (atomic with file deletions for `git revert`).»

## Compatibility

- **NFR-Compatibility-1 (FR-7):** `install-hook.ts` ОБЯЗАН импортировать ТОЛЬКО node-builtins (`node:fs`/`node:path`/`node:child_process`) + локальные `.ts`; НИ ОДНОГО пакета из `node_modules`. Плагин распространяется без `node_modules` у юзера — импорт пакета = `ERR_MODULE_NOT_FOUND` на каждом старте сессии (правило `dead-integration-guard`). Проверяется deps-absent прогоном (спрятать `node_modules`, запустить через реальный лаунчер `bootstrap.cjs`).
- **NFR-Compatibility-2 (FR-8):** entry-путь в `.pre-commit-config.yaml` ОБЯЗАН быть относительным к корню репо (`python .dev-pomogator/...`) — без абсолютных машинно-зависимых путей, чтобы резолвиться после клона у любого члена команды.

## Installer Reliability & Performance

- **NFR-Reliability-8 (FR-7/FR-9):** `install-hook.ts` fail-open — ЛЮБАЯ ошибка (нет git/python/pip, битый конфиг, упавший `setup.py`) → лог + `{continue:true}` + exit 0; хук НИКОГДА не блокирует старт сессии.
- **NFR-Reliability-9 (FR-7):** установка идемпотентна — повторный старт при уже установленном хуке = no-op без побочных эффектов; неуспех не ретраится чаще раза в 6ч (backoff-lock).
- **NFR-Performance-5 (FR-7):** fast-path (хук уже установлен) ОБЯЗАН быть дешёвым — только чтение `.pre-commit-config.yaml`, БЕЗ запуска python-subprocess; тяжёлая установка идёт detached, чтобы SessionStart возвращался быстро (бюджет хука — секунды, timeout 10s).
- **NFR-Usability-6 (FR-7):** opt-out одной переменной `DEV_POMOGATOR_ROOT_ARTIFACTS_SETUP=off`; при отсутствии deps — понятный одноразовый WARN с инструкцией (`pip install pre-commit pyyaml`), не спам на каждый старт.
