# Functional Requirements (FR)

Домен: NATIVE Claude Code statusLine (`statusLine.command` = ccstatusline). Не путать с доменом
прогресса тестов (TUI `compact_bar.py` / `test-statusline`). Реализация: новый `tools/native-statusline/`.

> Заголовки FR на английском намеренно — `validate-spec.ts` `toAnchorSlug` удаляет non-ASCII
> из якорей; ASCII-заголовки дают стабильные ссылки. Тело требований — на русском.

## FR-1: Reconciler slot classification

Чистая функция `reconcileStatusLine(existing: string | undefined)` SHALL определять одно из трёх
решений по текущему `statusLine.command`: `install` (слот пустой/отсутствует), `noop` (слот уже
содержит наш ownership-маркер), `keep-user` (слот содержит чужую команду без маркера). Функция не
делает I/O (тестируема изолированно).

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md), [UC-2](USE_CASES.md)

## FR-2: Atomic conditional writer

Writer SHALL читать `~/.claude/settings.json`, вызывать reconciler и при `install` записывать
`statusLine = { type: "command", command: "npx -y ccstatusline@latest" }` атомарно (temp file +
rename, per `atomic-config-save`). При `noop`/`keep-user` записи НЕ происходит. Writer SHALL
сохранять все остальные поля settings.json (read-modify-write) и возвращать `changed` + `action`.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-1](USE_CASES.md), [UC-7](USE_CASES.md)

## FR-3: Native-statusline SessionStart hook

Новый хук `tools/native-statusline/install_native_statusline.ts` SHALL: читать stdin-JSON
сессии, вызывать writer, при `changed=true` возвращать hook JSON с `systemMessage` (строка
подключена, появится со следующей сессии), всегда завершаться `exit 0` (fail-open). Хук
размещается в новом домене и НЕ редактирует `tools/test-statusline/`.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-1](USE_CASES.md), [UC-6](USE_CASES.md)

## FR-4: Ownership marker

Reconciler SHALL распознавать «нашу» команду по стабильному маркеру (подстрока `ccstatusline`
в `statusLine.command`). Команда с маркером → `noop`; команда без маркера → `keep-user`
(чужая, не трогаем).

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-2](USE_CASES.md)

## FR-5: Opt-out switch

WHEN `DEV_POMOGATOR_STATUSLINE=off` — хук SHALL полностью пропускать запись (никаких мутаций
settings.json). По умолчанию (env не задан) — поведение default-on (паритет с v1). Префикс
`DEV_POMOGATOR_*` уже используется в репо (нет namespace-коллизии).

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-4](USE_CASES.md)

## FR-6: Hook registration

Новый SessionStart-хук SHALL быть добавлен в `.claude-plugin/hooks.json` (распространение
пользователям) и в `.claude/settings.json` (dogfooding репо), используя тот же bootstrap-паттерн
вызова, что и остальные хуки (`process.env.CLAUDE_PLUGIN_ROOT` resolution).

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-1](USE_CASES.md)

## FR-7: Doctor check and fix-action

pomogator-doctor SHALL иметь check, обнаруживающий отсутствие native statusLine, и fix-action,
применяющий тот же writer немедленно в текущей сессии (обход SessionStart-timing). Если statusLine
уже стоит — check репортит OK без fix.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use Case:** [UC-3](USE_CASES.md)

## FR-8: Idempotent and fail-open

Повторный запуск хука без изменений SHALL не производить запись (no disk churn). Любая ошибка
(битый JSON, отказ FS) SHALL быть поймана; хук завершается `exit 0` без мутации settings.json.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
**Use Case:** [UC-5](USE_CASES.md), [UC-6](USE_CASES.md)

## FR-9: Domain separation guard

Реализация этой спеки SHALL находиться только в `tools/native-statusline/` и НЕ изменять файлы
домена прогресса тестов (`tools/test-statusline/`, `compact_bar.py`, YAML-протокол). FILE_CHANGES
этой спеки не должен содержать путей из домена test-statusline.

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
**Use Case:** все UC (cross-cutting)

## FR-10: Bundling ccstatusline OUT OF SCOPE

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-out-of-scope)
**Use Case:** N/A (out of scope)

> OUT OF SCOPE — эта спека только прописывает `statusLine.command = npx -y ccstatusline@latest`
> (документированный сторонний тул, ставится через npx в рантайме). Мы НЕ вендорим/собираем сам
> ccstatusline, НЕ трогаем `subagentStatusLine` и НЕ покрываем домен прогресса тестов.
>
> Связанные UC, AC и User Stories помечены `> OUT OF SCOPE — см. FR-10`.
