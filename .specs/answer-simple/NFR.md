# Non-Functional Requirements (NFR)

## Performance

- Always-apply шаблон самопроверки (FR-1) выполняется молча в context агента без отдельных tool вызовов — оверхед на ответ не более 5% времени генерации (~1-2 секунды дополнительного reasoning перед эмитом текста). Шаг 4 правила (octocode MCP search) не вызывается автоматически на каждом ответе — только в редких ситуациях triggered инцидент-workflow когда нужны external patterns.
- Slash-команда `/answer-simple` (FR-2) обрабатывает черновик за один turn без обращений к внешним сервисам — целевое время ответа ≤ 5 секунд для черновика ≤ 500 слов; ≤ 15 секунд для черновика 500-2000 слов.

## Security

- Skill `/answer-simple` (FR-2) НЕ ОТПРАВЛЯЕТ черновик пользователя в любые внешние сервисы (no WebFetch, no MCP с network access). Анализ выполняется локально в Claude Code reasoning context. Это критичное требование — черновики могут содержать chunks production code, чувствительные данные, internal references на private repos.
- Память `~/.claude/projects/<encoded-cwd>/memory/` читается только в read-only режиме во время инцидент-workflow для извлечения active constraints (per memory `feedback_no-jargon-questions-to-user.md`). Skill НЕ модифицирует memory автоматически без явного user request.

## Reliability

- Rule extension-layout (`.claude/rules/extension-layout.md`) ОБЯЗАН быть соблюдён — иначе installer silently skips rule/skill копирование. Валидатор `extensions/_shared/extension-layout-validate.ts` ОБЯЗАН проходить с exit 0 после implementation; CI hook блокирует commit если exit != 0.
- Manifest integrity (`.claude/rules/extension-manifest-integrity.md`) — `extension.json` ОБЯЗАН перечислять ВСЕ rule-файлы и skill-файлы. SHA-256 хеши записываются installer'ом в `~/.dev-pomogator/config.json` `managedFiles` — это enables updater для detect user modifications (per `.claude/rules/updater-managed-cleanup.md`).
- Миграция rule (FR-5) ОБЯЗАНА быть атомарна на уровне commit: либо все три шага (file move + CLAUDE.md edit + memory file edit) succeed в одном commit, либо rollback. Любое неполное состояние — bug который ломает CLAUDE.md глоссарий integrity (per `.claude/rules/claude-md-glossary.md`).

## Usability

- SKILL.md description ОБЯЗАН содержать конкретные триггеры (RU + EN keywords) и invocation-примеры, чтобы агент в чужих проектах знал когда активировать skill автоматически и через slash-команду (per `.claude/rules/checklists/skill-allowed-tools-audit.md`).
- При вызове `/answer-simple` без аргумента — skill ОБЯЗАН вернуть usage-summary (что делает + 1-2 примера вызова), а не молча зависнуть или сгенерировать пустой ответ.
- Output `/answer-simple` структурирован двумя блоками с явными заголовками "Переформулировано:" и "Найдено проблем:" — пользователь не должен парсить prose чтобы найти результат аудита. Заголовки фиксированы (не варьируются от вызова к вызову).
