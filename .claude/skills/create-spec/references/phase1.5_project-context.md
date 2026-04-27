# Phase 1.5: Project Context Analysis

**Файл:** RESEARCH.md (секция `## Project Context & Constraints`)
**Цель:** Перед формальными FR/NFR — понять какие правила, расширения и существующие паттерны проекта влияют на дизайн фичи.

## Когда пропустить

- Пользователь явно сказал "skip context analysis" / "пропусти контекст-анализ"
- Фича greenfield (не затрагивает существующий код/правила)
- В проекте < 2 правил в `.claude/rules/`
- Фича тривиальная (1 файл, нет архитектурных решений)

При пропуске — записать в RESEARCH.md:

```
## Project Context & Constraints
> Skipped: {причина}
```

## Step 0 (только в Jira-mode)

Если `.specs/{slug}/JIRA_SOURCE.md` существует — выполнить Step 0 из [`jira-mode.md`](jira-mode.md) для Phase 1.5 (architectural constraints из comments + config_values + data_schema). Если файла нет — пропустить.

## Алгоритм

1. **Извлечь ключевые слова** из USER_STORIES.md и USE_CASES.md (домены, технологии, действия).

2. **Просканировать `.claude/rules/*.md`** — найти правила, релевантные ключевым словам.

3. **Просканировать `extensions/*/extension.json`** — найти расширения, пересекающиеся по домену фичи.

4. **Просканировать существующий код, упомянутый в USE_CASES** — найти паттерны для reuse (через `Glob` / `Grep` / `Read`).

5. **Step 4a: Детект BDD framework в target test-projects** — ОБЯЗАТЕЛЬНО если FILE_CHANGES будет упоминать `tests/**/*.test.*` или `**/Tests/**/*.cs` или `**/*_steps.py`. Для каждого target test-project:

   ```
   npx tsx extensions/specs-workflow/tools/specs-generator/bdd-framework-detector.ts {projectPath} [testProjectHints...]
   ```

   Записать DetectionResult (JSON) в RESEARCH.md `### Existing Patterns & Extensions`:
   - `language` (csharp/typescript/python)
   - `framework` (installed framework name или null)
   - `installCommand` (для Phase 0 bootstrap block)
   - `hookFileHints[]` (для scaffold hooks per framework convention)
   - `configFileHint` (`reqnroll.json` / `cucumber.js` / `behave.ini` / `pytest.ini`)
   - `evidence[]` (grep output с путями и номерами строк)
   - `suggestedFrameworks[]` (fallback при `framework=null` — remediation target для Phase 0)

   **Эта информация критически нужна в Phase 2 Step 6** для заполнения `## BDD Test Infrastructure` DESIGN.md секции и для генерации Phase 0 bootstrap block в TASKS.md. Подробнее — [`phase2_bdd-test-infrastructure.md`](phase2_bdd-test-infrastructure.md) и [`bdd-enforcement.md`](bdd-enforcement.md).

6. **Просканировать `**/Hooks/`, `**/hooks/`, `**/support/`** — найти существующие BDD hooks (BeforeScenario/AfterScenario, setup/teardown, environment hooks).

7. **Если фича создаёт/изменяет тестовые данные** — записать найденные hooks в `### Existing Patterns & Extensions` с рекомендациями по аналогии.

8. **Заполнить секцию `## Project Context & Constraints` в RESEARCH.md:**

   - `### Relevant Rules` — таблица: Rule | Path | Summary | Triggered By | Impacts
   - `### Existing Patterns & Extensions` — таблица: Source | Path | What It Provides | Relevance (включая строки DetectionResult из шага 5)
   - `### Architectural Constraints Summary` — как ограничения влияют на будущие FR/NFR

9. **Проверить статус:** `.dev-pomogator/tools/specs-generator/spec-status.ts -Path ".specs/{feature}"`

## STOP #1.5

Показать найденные ограничения проекта, спросить подтверждение перед Phase 2.

После подтверждения:

```
.dev-pomogator/tools/specs-generator/spec-status.ts -Path ".specs/{feature}" -ConfirmStop Context
```

## Next phase

После STOP #1.5 → перейти к [`phase2_requirements-and-design.md`](phase2_requirements-and-design.md).
