# Use Cases

## UC-1: Создание новой спеки с v3 автозаполнением @feature1

**Actor:** Разработчик
**Main flow:**
1. Запускает `/create-spec billing-webhooks`.
2. Scaffold создаёт `.specs/billing-webhooks/` с `.progress.json` `version: 3`.
3. Parent create-spec вызывает `Skill("discovery-forms")` → USER_STORIES.md заполнен v3-блоками + RESEARCH.md получил `## Risk Assessment`.
4. STOP #1 подтверждается.
5. Phase 2: parent вызывает `Skill("requirements-chk-matrix")` → REQUIREMENTS.md получает CHK matrix + DESIGN.md Key Decisions.
6. STOP #2 подтверждается.
7. Phase 3: parent вызывает `Skill("task-board-forms")` → TASKS.md с Done When + Status/Est + Task Summary Table.
8. STOP #3 подтверждается.

**Postcondition:** 13-файловая спека в v3 формате; все form-guards passed.

## UC-2: Агент вручную редактирует TASKS.md без Done When @feature4

**Actor:** Claude agent
**Main flow:**
1. Агент пишет TASKS.md с новой задачей без `**Done When:**` блока.
2. `task-form-guard.ts` PreToolUse — parse violates rule → exit 2.
3. Stderr содержит line number + fix hint + `Skill("task-board-forms")` recommendation.
4. Audit log пишет `DENY task-form-guard {filepath} missing Done When`.
5. Агент видит error → вызывает `Skill("task-board-forms")` → TASKS.md корректно обогащён → Write проходит.

**Postcondition:** TASKS.md содержит Done When; форма enforced.

## UC-3: Existing v2 spec не блокируется @feature5

**Actor:** Разработчик работает с existing `.specs/bg-task-guard/` (v1/v2).
**Main flow:**
1. Write USER_STORIES.md с устаревшим форматом `- Как роль...`.
2. `user-story-form-guard.ts` читает `.progress.json` — `version` отсутствует → `isV3Spec` = false.
3. Hook пишет `ALLOW_AFTER_MIGRATION` в audit log → exit 0.
4. Write проходит без проверки формы.

**Postcondition:** Existing spec не трогается; агент не видит deny.

## UC-4: Агент пытается удалить form-guard из extension.json @feature7

**Actor:** Claude agent
**Main flow:**
1. Агент, столкнувшись с deny от user-story-form-guard, пытается Edit `extension.json` убирая entry.
2. `extension-json-meta-guard.ts` читает current + computed new content → detects removal.
3. Exit 2 + message "cannot remove form-guards from manifest without human review".
4. Audit log: `DENY extension-json-meta-guard extension.json removed: user-story-form-guard.ts`.
5. На следующий prompt UserPromptSubmit summary показывает `📊 Form guards (24h): 1 DENY` → user видит попытку обхода.

**Postcondition:** Manifest intact; попытка зафиксирована в audit log.

## UC-5: Parser crash — fail-open с логом @feature5

**Actor:** любой form-guard
**Main flow:**
1. RegExp encounters malformed content (unescaped multi-byte unicode in title).
2. Parser throws exception.
3. `main().catch()` ловит → `logEvent('PARSER_CRASH', ..., e.message)` → `exit 0`.
4. Audit log: `PARSER_CRASH user-story-form-guard /tmp/foo.md RegExp stack overflow`.
5. UserPromptSubmit summary на следующем prompt: `📊 Form guards (24h): ... 1 PARSER_CRASH (user-story-form-guard)`.
6. Maintainer видит, читает лог, фиксит regex.

**Postcondition:** Legit Write не заблокирован; bug виден через telemetry.

## UC-6: UserPromptSubmit summary в каждом промпте @feature8

**Actor:** Разработчик
**Main flow:**
1. Пользователь пишет любой prompt Claude Code.
2. UserPromptSubmit hook `validate-specs.ts` читает `~/.dev-pomogator/logs/form-guards.log` last 24h.
3. Если есть DENY / PARSER_CRASH / ALLOW_AFTER_MIGRATION events — output summary `📊 Form guards (24h): X DENY, Y PARSER_CRASH, Z ALLOW_AFTER_MIGRATION`.
4. Только ALLOW_VALID events → silent skip (не шумит).

**Postcondition:** Maintainer имеет O(1) visibility в события form-guards без `Read` лога вручную.

## Edge Cases

- **EC-1:** Пустая USER_STORIES.md (template only) → user-story-form-guard parses 0 blocks → ALLOW_VALID (не блокирует пустой файл, `discovery-forms` заполнит позже).
- **EC-2:** Phase -1 task без Done When → task-form-guard relaxed, stderr warn но exit 0 (infra tasks часто тривиальны).
- **EC-3:** DESIGN.md без `### Decision:` headings → design-decision-guard passes (section optional).
- **EC-4:** Orphan CHK (CHK-FR99-01 но FR-99 не существует) → requirements-chk-guard denies на Traces To validation.
- **EC-5:** Jira-mode spec с существующими `Jira imperative:` lines → skills preserve byte-for-byte; `requirements-chk-matrix` добавляет CHK rows с `_Jira: {fragment}_` notes.
- **EC-6:** Race condition — два Write в параллель на одну USER_STORIES.md → hooks независимы per-invocation, оба получают current content, оба принимают решение.
