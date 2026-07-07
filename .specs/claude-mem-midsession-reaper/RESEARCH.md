# Research

## Контекст

Юзеры dev-pomogator + claude-mem ловят `UserPromptSubmit hook timed out after 60s — output discarded` ПОСРЕДИ активной сессии. Причина установлена в этой сессии по логам claude-mem и транскриптам Claude Code: это отказ ДОСТУПНОСТИ воркера, а не размер стора/auth/chroma. Существующий reaper лечит зомби только на SessionStart и слеп к зомби, возникающему в середине сессии.

## Источники

- `~/.claude-mem/logs/*.log` — реальные эпизоды: `Failed to start server. Is port 37777 in use?` ×226; эпизод 2026-07-04 воркер мёртв 1ч25м (18:36 `No successor` → 20:01 `Worker started`).
- Транскрипт `~/.claude/projects/E--repos-lm-saas/25af22b9-*.jsonl` — reaper (`claude-mem-health`) отработал 312×, но `hook timed out after 60s` всё равно встречается.
- `tools/claude-mem-health/TASK-pin-hook-timeout-cause-20260707.md` — запинённый разбор (issue #92).
- Commit `262b5206` — SessionStart reaper (базовый, переиспользуемый).
- Memory `reference_claude-mem-ups-hook-60s-timeout-root`, `reference_claude-mem-worker-wedged-block-storm`, `gotchas/no-reboot-remediation`.

## Технические находки

### Корень: отказ доступности воркера + неограниченный вызов хука

Хук claude-mem (`session-init`/UPS) не имеет короткого дедлайна на HTTP-вызов к воркеру (`127.0.0.1:37777`). Пока воркер недоступен, вызов висит весь 60-секундный бюджет Claude Code → таймаут (fail-open: ход проходит, теряется `<claude-mem-context>`). Отсеяно уликами: размер стора (warm inject 553 мс), Credential-read (WARN, 0.3–1.4 с, red herring), chroma-prewarm (lazy, не на read-пути).

### Механизм зомби-порта (почему висит, а не отбивается)

Пустой TCP-порт даёт мгновенный `ECONNREFUSED` (замер: свободный порт → 10 мс) — зависнуть нельзя. Зависание требует, чтобы порт СЛУШАЛСЯ, но не отвечал. На Windows после SIGKILL воркера его дочерний `chroma-mcp` наследует хэндл LISTENING-сокета и выживает orphan-ом, держа порт под мёртвым PID. Коннект хука принимается, но ответа нет → хук висит до 60с. Триггер окна down: version-mismatch recycle при авто-апдейте плагина → `Graceful shutdown` → `No successor` → успешник не может ре-байндить порт минутами.

### Разрыв существующего reaper (SessionStart-only)

`reapWedgedWorker` + чистое ядро `reaperDecision` уже реализованы и BDD-протестированы: probe `/api/health` → если unhealthy И порт держит DEAD PID → kill orphan-процессов с claude-mem-сигнатурой и мёртвым родителем → reset `hook-failures.json`. Но хук зарегистрирован ТОЛЬКО на `SessionStart` — на старте воркер обычно здоров (skip-healthy), а зомби появляется позже. Между стартами reaper не запускается → mid-session зомби висит.

### Решение — тот же reaper на mid-session событии

Повесить лёгкий guard на `PreToolUse` (стреляет перед каждым тул-коллом), переиспользуя `reapWedgedWorker`/`reaperDecision`. Обязательна near-zero стоимость при здоровом воркере: сперва быстрый bounded health-probe (~7 мс), эскалация к дорогому PowerShell-снапшоту/reap ТОЛЬКО при unhealthy И по истечении debounce-окна (троттлинг, чтобы не гонять снапшот на каждый тул-колл).

## Где лежит реализация

- App-код: `tools/claude-mem-health/health-check.ts` (существующий reaper: `reaperDecision` pure core, `reapWedgedWorker`, `matchesClaudeMemSignature`, env-seams `CLAUDE_MEM_REAPER_SNAPSHOT`/`_KILL_RECORD`/`_HOME`).
- Конфигурация: `.claude-plugin/hooks.json` (canonical distribution — регистрация нового mid-session события) + `.claude/settings.json` (repo dogfood).

## Выводы

Фикс — не новый механизм, а второе событие-триггер для уже существующего, протестированного reaper-ядра, с debounce-обвязкой ради near-zero латентности на PreToolUse. Раздаётся всем через `.claude-plugin/hooks.json`.

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| dead-integration-guard | `.claude/rules/testing/dead-integration-guard.md` | Plugin-distributed код с non-builtin импортом падает у юзеров без node_modules | новый hook в hooks.json | NFR-Reliability, FR-builtins |
| no-blocking-on-tests | `.claude/rules/pomogator/no-blocking-on-tests.md` | Docker-тесты в фоне, не блокировать сессию | прогон BDD | NFR-Operability |
| tui-debug-verification | `.claude/rules/pomogator/tui-debug-verification.md` | Проверять реальный артефакт, не grep по YAML | верификация фикса | NFR-Usability |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Тесты через реальный запуск (spawnSync), не unit-изоляция | BDD step-defs | FR-1, AC |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| SessionStart reaper | `tools/claude-mem-health/health-check.ts` | `reaperDecision` pure core + `reapWedgedWorker` + surgical matcher + env-seams | Переиспользуется целиком; mid-session guard вызывает то же ядро |
| Plugin hooks manifest | `.claude-plugin/hooks.json` | Canonical distribution хуков всем юзерам | Регистрация нового PreToolUse события |

### Architectural Constraints Summary

Guard ОБЯЗАН быть builtins-only (dead-integration-guard) и fail-open (никогда не блокировать тул-колл). PreToolUse на каждый тул-колл → near-zero при healthy обязательна (быстрый probe + debounce). Reap хирургический — только claude-mem orphan с мёртвым родителем (существующий matcher).

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Латентность на каждом тул-колле (PreToolUse fires per call) | High | High | Fast bounded health-probe first (~7ms) + debounce-троттлинг тяжёлого снапшота; healthy → мгновенный skip-healthy |
| Убийство не того процесса | Medium | High | Переиспользуется существующий surgical `matchesClaudeMemSignature` (только claude-mem orphan с мёртвым родителем); ядро уже BDD-протестировано |
| Падение хука у юзеров без node_modules | Medium | High | Builtins-only (node:fs/os/path/http/child_process); fail-open — любая ошибка → `{continue:true}` |
| Реап во время нормальной работы воркера | Low | Medium | Reap только когда health FAIL И порт держит DEAD PID; healthy воркер → skip-healthy, никогда не трогается |
