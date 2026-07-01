# Research

## Контекст

Домен **native statusline** — главная строка состояния Claude Code (`statusLine.command`),
которую плагин должен авто-устанавливать пользователям как `npx -y ccstatusline@latest`
(git/model info). Это НЕ строка прогресса тестов (та живёт в TUI `compact_bar.py`, домены
`test-statusline` / `tui-statusline-mode` / `tui-test-runner`).

Полное расследование регрессии: `audit-reports/statusline-install-regression-analysis.md`.

## Источники

- `audit-reports/statusline-install-regression-analysis.md` — расследование + GitHub-ресёрч.
- Официальный спек Claude Code: `code.claude.com/docs/en/plugins-reference`, `/statusline`, `/hooks`.
- Эталон реализации: `github.com/ShivaeDev/pardes` (`plugins/statusline/hooks/reconcile-settings.ts`).
- Open feature requests (нет install-события): `anthropics/claude-code#11240`, `#9394`.

## Технические находки

### Точка регрессии
Коммит `43cf946` ("Phase 1 destructive — drop installer/updater/extensions/dist/cli") удалил
`src/installer/` (включая `setupClaudeStatusLine` → `writeGlobalStatusLine`) и `src/utils/statusline.ts`
(`resolveClaudeStatusLine`). С тех пор нативный statusLine никому не пишется.
Evidence: `git log --all -S resolveClaudeStatusLine` → жил только в `src/utils/statusline.ts`.

### Почему canonical-плагин это не закрывает
- `plugin.json` не имеет поля главного `statusLine`.
- Plugin `settings.json` мержит только `agent` + `subagentStatusLine` (спек, строка 807) — главный statusLine исключён намеренно.
- Claude Code при `/plugin install` не пишет в user `~/.claude/settings.json`.
- Install-события в hooks API нет (полный список: SessionStart, Setup, ConfigChange, …) — подтверждено + 2 open feature requests.

### Единственный путь — SessionStart-хук, который сам пишет settings.json
Эталон `pardes/reconcile-settings.ts`: ставит statusLine когда слот пустой ИЛИ «наш» (ownership-маркер),
**никогда** не трогает чужую ручную строку, идемпотентно (пишет только при изменении),
эмитит `systemMessage` только когда что-то поменял. Это порт старого `resolveClaudeStatusLine`.

### Ограничение by design
SessionStart-запись подхватится только со СЛЕДУЮЩЕЙ сессии (settings читаются до хука).
Немедленный эффект в текущей сессии — только через `/pomogator-doctor` fix-action по явному действию юзера.

## Где лежит реализация

- Новый код (этот домен): `tools/native-statusline/reconcile-statusline.ts` + `tools/native-statusline/install_native_statusline.ts`
- Регистрация хука: `.claude-plugin/hooks.json` (canonical) + `.claude/settings.json` (dogfood)
- Doctor fix-action: `.claude/skills/pomogator-doctor/scripts/engine/`
- Цель записи (runtime): `~/.claude/settings.json` → `statusLine.command`
- НЕ трогать (другой домен): `tools/test-statusline/` (прогресс тестов)

## Выводы

Вернуть авто-установку нативного statusLine в canonical-модели через ОТДЕЛЬНЫЙ SessionStart-хук
в новом домене `native-statusline`, идемпотентно, с ownership-маркером, не перетирая чужую строку,
fail-open. Опционально — doctor fix-action для немедленного применения. Домен прогресса тестов не трогаем.

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| atomic-config-save | `.claude/rules/atomic-config-save.md` | Конфиги через temp file + atomic move | запись settings.json | FR-writer / NFR-Reliability |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Тесты через реальный flow (spawnSync hook → settings.json), не unit-only | тестирование хука | AC / NFR-Reliability |
| ts-import-extensions | `.claude/rules/ts-import-extensions.md` | relative imports в tools/**/*.ts с `.ts` расширением | новый tool-код | FR-writer |
| spec-test-sync | `.claude/rules/plan-pomogator/spec-test-sync.md` | tests/** → нужны .feature; багфикс → BDD | tests + .feature в File Changes | TASKS |
| verify-render-target | `.claude/rules/pomogator/verify-render-target.md` | различать ccstatusline (native) vs compact_bar.py (tests) | разграничение доменов | весь spec scope |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| ShivaeDev/pardes | `plugins/statusline/hooks/reconcile-settings.ts` (GitHub) | reconcile statusLine: empty/ours → install, user → keep, idempotent | эталон reconciler |
| старый installer (git history) | `43cf946^:src/utils/statusline.ts` | `resolveClaudeStatusLine` logic (preserve user / fill empty / replace managed) | порт логики |
| test-statusline (НЕ трогать) | `tools/test-statusline/statusline_session_start.ts` | SessionStart-хук другого домена (прогресс тестов) | граница домена — не редактировать |
| BDD stack (реальный) | `vitest.config.ts`, `tests/e2e/*.test.ts`, `tests/features/**/*.feature` | vitest ^4.1.0 + Gherkin `.feature`, 1:1 mapping `it()`↔`Scenario`, naming `DOMAIN_CODE_NN` | таргет для тестов FR; см. `extension-test-quality` rule |
| существующий SessionStart-хук как образец формата | `tools/test-statusline/statusline_session_start.ts` | readStdin + JSON parse + fail-open exit 0 (формат хука) | образец структуры хука (НЕ редактировать сам файл) |

> **BDD framework detection (Step 4a) — corrected.** `bdd-framework-detector.ts .` вернул
> `{language: csharp, framework: Reqnroll}` — **false-positive**: матчнул тест-фикстуру
> `tests/fixtures/steps-validator/csharp/Project.csproj`, а не реальный стек репо. Реальная
> инфра: **TypeScript / vitest ^4.1.0** + `.feature` (Gherkin), запуск `bash scripts/docker-test.sh`
> (через `/run-tests`). hookFileHints (C# Hooks/*.cs) и `reqnroll.json` НЕ применимы. Per
> `verify-against-real-artifact` — доверяем коду (package.json + tests/), а не детектору.

### Architectural Constraints Summary

Запись только в `~/.claude/settings.json` (canonical-плагин не даёт декларативно). Atomic write обязателен
(`atomic-config-save`). Хук fail-open (exit 0). Тесты обязаны быть интеграционными (`integration-tests-first`):
spawnSync хук → read-back settings.json. Код в `tools/**/*.ts` с `.ts`-импортами. Строгое разграничение
с доменом test-statusline.

## Risk Assessment

> Auto-populated by Skill `discovery-forms` during Phase 1. Hook `risk-assessment-guard` enforces:
> when `## Risk Assessment` heading is present, the table below must have ≥2 non-placeholder rows
> with Likelihood ∈ Low / Medium / High, Impact ∈ Low / Medium / High, and non-empty Mitigation.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Смешение с доменом test-statusline (код в чужой папке/хуке) | Medium | High | Новый `tools/native-statusline/` + отдельный SessionStart-хук; запрет редактировать `tools/test-statusline/`; verify-render-target rule |
| Перетирание чужого кастомного statusLine пользователя | Medium | High | Ownership-маркер + action=keep-user; интеграционный тест, проверяющий сохранение чужой строки |
| SessionStart timing: строка появляется только со следующей сессии, юзер думает «не сработало» | High | Medium | `systemMessage` при первой установке + doctor fix-action для немедленного применения |
| Битый/конкурентный settings.json → потеря пользовательского конфига | Low | High | Atomic write (temp + rename) per atomic-config-save; fail-open exit 0; запись только при реальном изменении |
| ccstatusline требует npx/сеть или не установлен → ошибка рендера строки | Medium | Low | Это документированный дефолтный тул Claude Code; выключатель `DEV_POMOGATOR_STATUSLINE=off`; doctor surface |
