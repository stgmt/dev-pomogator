# Research

## Контекст

Спека вызвана инцидентом в сессии 2026-05-23: агент дважды подряд задал жаргонные multi-select вопросы (формата "Issue B — Wave 14 (gates+OpenRouter) ПЕРЕД Wave 11 — Keep / Swap / Parallel"), пользователь не понял ("ниче не понял в вопросах слишком сложно написано"), затем тот же паттерн повторился в моём собственном AskUserQuestion (4-опционный multi-select про триггеры/scope GitHub-поиска). Пользователь сформулировал требование цитатой:

> "я хочу сделать плагин который бы вот так работал. анализ инцидента и поиск решений в гитзабе октокодом. по простому я рулес всегдаподключаемый хотел"

И позже уточнил format ответов:

> "ответ должен быть таким структурированным, чтоб я через неделю диалог посмотрел и все понял. типа микроистории — что зачем почему что привело к текущей точке, что в текущей точке и почему так и так далее"

В той же сессии уже создано правило `.claude/rules/clear-questions-to-user.md` (108 строк, 5-шаговый шаблон самопроверки + ответ-микроистория с 5 опорными точками + триггер инцидента + связь с octocode MCP). Спека answer-simple оформляет это правило в полноценный installable extension с rules+skill+slash-команда.

## Источники

- `.claude/rules/clear-questions-to-user.md` (создано в этой же сессии, версия после правки шаблона ответа на микроисторию)
- Memory `~/.claude/projects/D--repos-dev-pomogator/memory/feedback_no-jargon-questions-to-user.md` (фидбек с прямыми цитатами пользователя)
- Conversation transcript 2026-05-23 (точки фрустрации: Wave 14 жаргон, мой собственный multi-select с триггерами)
- Существующие extensions как reference: `extensions/auto-simplify/` (rule + slash command `/simplify`), `extensions/suggest-rules/` (skill + slash + анализ сессии)
- `.claude/skills/create-spec/SKILL.md` — пример skill со скриптами и references/ subdir
- Rule `.claude/rules/extension-layout.md` — конвенция расположения rules/skills/tools

## Технические находки

### Skill как slash-команда в Claude Code

Skill `.claude/skills/<name>/SKILL.md` с frontmatter `name`/`description`/`allowed-tools` автоматически становится доступен через `/skill-name` в Claude Code. Triggers (когда agent должен активировать) описаны в `description`. Workflow skill — это содержимое SKILL.md body. См. живой пример: `.claude/skills/create-spec/SKILL.md`.

### Always-apply rules

Rules в `.claude/rules/<category>/*.md` (или root) перечисляются в `CLAUDE.md` глоссарий-таблице (per rule `claude-md-glossary`). Agent читает их каждый turn через CLAUDE.md context loading. Always-apply поведение = просто упоминание правила в Always-apply таблице CLAUDE.md без trigger column.

### Extension structure (per extension-layout rule)

Запрещено держать rules/skills внутри `extensions/<name>/rules/` или `extensions/<name>/skills/` — installer не найдёт. Правильно:
- Rules: `.claude/rules/<extension-name>/*.md` (в dev-pomogator repo root)
- Skills: `.claude/skills/<skill-name>/*` (в dev-pomogator repo root)
- Tools (если есть): `extensions/<extension-name>/tools/<tool-name>/*` (внутри extension folder)
- Manifest: `extensions/<extension-name>/extension.json`

Manifest fields (per extension-manifest-integrity rule): `ruleFiles.claude[]` (SOURCE paths в dev-pomogator repo), `skills.<name>` (SOURCE dir), `skillFiles.<name>[]` (TARGET paths after install для managed tracking).

### Hook'и не требуются для answer-simple

Always-apply поведение реализуется через rule (agent читает rule из CLAUDE.md и применяет молча). Slash-команда реализуется через skill (Claude Code сам диспатчит /answer-simple → SKILL.md). Hook (PostToolUse/Stop/UserPromptSubmit) НЕ нужен — это не event-driven логика, а guidance. Если в будущем потребуется forced enforcement (например, блокировать отправку ответа с жаргоном) — добавится hook через `.claude/settings.local.json`, но это вне scope текущей спеки.

## Где лежит реализация

- App-код: `extensions/answer-simple/` (новый extension folder с extension.json)
- Rule: `.claude/rules/answer-simple/clear-questions-to-user.md` (мигрирует из текущей локации `.claude/rules/clear-questions-to-user.md` чтобы группироваться под extension)
- Skill: `.claude/skills/answer-simple/SKILL.md` (новый, определяет slash-команду + workflow аудита)
- Конфигурация: `extensions/answer-simple/extension.json` (manifest)
- CLAUDE.md глоссарий: обновляется (path rule меняется на `.claude/rules/answer-simple/clear-questions-to-user.md`)

## Выводы

Extension answer-simple — wrapping существующего правила clear-questions-to-user в installable plugin с минимальными изменениями. Реализация декомпозируется на: (1) создать extension structure по конвенциям dev-pomogator, (2) мигрировать rule из root в `.claude/rules/answer-simple/`, (3) добавить skill `.claude/skills/answer-simple/SKILL.md` с workflow двух режимов (silent always-apply + explicit /answer-simple invocation), (4) обновить CLAUDE.md (новый path rule + skill упоминание), (5) обновить manifest. Никаких новых TypeScript tools не нужно — это чисто rule+skill extension, аналогичный по структуре `extensions/auto-simplify/` (только без TS-скриптов).

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| extension-layout | `.claude/rules/extension-layout.md` | Rules/skills extensions обязаны жить в `.claude/rules/<ext>/` + `.claude/skills/<name>/` корня dev-pomogator, не в `extensions/<ext>/rules\|skills/` | при создании любого extension с rules/skills | FR-3, FR-4 |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | manifest — единственный источник истины для апдейтера; обновлять files/rules/skills/skillFiles при изменениях | при создании extension.json или изменении состава extension | FR-3, NFR-Maintainability |
| claude-md-glossary | `.claude/rules/claude-md-glossary.md` | CLAUDE.md = глоссарий/индекс на rules; при add/remove обновлять таблицу | при создании/удалении rule файла | FR-3 |
| clear-questions-to-user | `.claude/rules/clear-questions-to-user.md` | Само правило которое extension оборачивает | always-apply; триггер на "не понял" | FR-1, FR-2 |
| skill-allowed-tools-audit | `.claude/rules/checklists/skill-allowed-tools-audit.md` | При создании skill — проверить что allowed-tools покрывает все инструменты workflow | при создании SKILL.md | NFR-Reliability |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| auto-simplify | `extensions/auto-simplify/` | rule + slash command `/simplify` без tools | template — answer-simple похож по структуре (rule + skill, без TS-скриптов) |
| suggest-rules | `extensions/suggest-rules/` | skill + slash + анализ сессии + работа с MCP | template для workflow внутри SKILL.md |
| create-spec | `.claude/skills/create-spec/` | skill с references/ subdir + sub-skills | reference для skill structure с большим workflow |
| clear-questions-to-user rule | `.claude/rules/clear-questions-to-user.md` | сам контент правила | мигрирует под extension path |

### Architectural Constraints Summary

Extension должен следовать extension-layout: rule живёт в `.claude/rules/answer-simple/` (не в `extensions/answer-simple/rules/`), skill в `.claude/skills/answer-simple/` (не в `extensions/answer-simple/skills/`). Manifest extension.json в `extensions/answer-simple/extension.json` перечисляет SOURCE paths для installer. CLAUDE.md глоссарий обновляется при миграции rule (path меняется с `.claude/rules/clear-questions-to-user.md` на `.claude/rules/answer-simple/clear-questions-to-user.md`). Никаких tools (TS-скриптов) не требуется — extension чисто декларативный (rule + skill).

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Правило слишком строгое — агент переусердствует с rephrasing, ответы становятся overengineered или пустыми | Medium | Medium | В правиле явный exit condition: тривиальные ответы (одно слово, простое подтверждение типа "ок"/"да") пропускают шаблон; пилотный период с feedback loop в этой же сессии |
| Slash-команда `/answer-simple` конфликтует со scope существующего `/simplify` (auto-simplify extension) | Low | Medium | Documented scope difference в SKILL.md description: `/simplify` = code/spec review через rule simplify-extended; `/answer-simple` = response/question text reformulation. Разные триггеры в description |
| После установки на чужой проект (не source-repo dev-pomogator) rule может конфликтовать с team conventions целевого проекта (например, команда любит multi-select) | Medium | Low | Extension опциональный (не включён по умолчанию в default install bundle); README extension объясняет когда использовать и как отключить через `.claude/settings.local.json` |
| Миграция rule из root path в extension-specific path сломает существующие ссылки на этот rule в CLAUDE.md и memory | Low | High | Atomic update: одной commit пара (rm root → write extension path → update CLAUDE.md → update memory cross-reference); spec FR явно требует cross-reference update |
