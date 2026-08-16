# Правила валидации спеков

Полная таблица правил, которые проверяют `validate-spec.ts` (структурно) и `audit-spec.ts` (семантически). Severity ERROR блокирует STOP-точку; WARNING позволяет переход с предупреждением; INFO — только информирование.

| Правило | Описание | Severity |
|---------|----------|----------|
| STRUCTURE | Наличие обязательных файлов | ERROR |
| PLACEHOLDER | Незаполненные плейсхолдеры | WARNING |
| FR_FORMAT | Формат `## FR-N: {Название}` | ERROR |
| UC_FORMAT | Формат `## UC-N: {Название}` | ERROR |
| EARS_FORMAT | WHEN/IF...THEN...SHALL | WARNING |
| NFR_SECTIONS | Performance/Security/Reliability/Usability | WARNING |
| FEATURE_NAMING | `{DOMAIN}{NNN}_{Название}` | WARNING |
| CONTEXT_SECTION | `## Project Context & Constraints` в RESEARCH.md с подсекциями или skip reason | WARNING |
| TDD_TASK_ORDER | Phase 0 (BDD Foundation) или `.feature` задача в TASKS.md | WARNING |
| CROSS_REF_LINKS | Markdown ссылки `[ID](file.md#anchor)` — целевой файл и якорь существуют | WARNING |
| LINK_VALIDITY | FR/AC/NFR в REQUIREMENTS/TASKS — кликабельные линки, не plain text | ERROR |
| BDD_INFRA | `## BDD Test Infrastructure` в DESIGN.md с Classification (TEST_DATA_ACTIVE/TEST_DATA_NONE) | WARNING |
| BDD_HOOKS_TASKS | Если TEST_DATA_ACTIVE, Phase 0 в TASKS.md содержит задачи для всех hooks из DESIGN.md | WARNING |
| OUT_OF_SCOPE_PROPAGATION | FR с OUT OF SCOPE → связанные UC/AC/User Stories тоже помечены | WARNING |
| UNVERIFIED_CONFIG | Env vars в DESIGN.md без `[VERIFIED]`/`[UNVERIFIED]` маркера | INFO |
| INFRA_TASKS_MISSING | DESIGN.md упоминает инфраструктуру, TASKS.md без infra-задач | WARNING |
| CONFIG_DUPLICATION | Идентичные блоки 3+ строк в DESIGN.md и TASKS.md | INFO |
| OPEN_QUESTIONS | Незакрытые `- [ ]` в RESEARCH.md (escape: `> DEFERRED:` на предыдущей строке) | WARNING |
| FIXTURES_CONSISTENCY | TEST_DATA_ACTIVE в DESIGN.md, но FIXTURES.md отсутствует или пуст | WARNING |
| JIRA_SOURCE_PRESERVED | _(conditional: только если `JIRA_SOURCE.md` exists)_ FR/AC/BDD/TASKS содержат trace (`Jira imperative:` / `Jira acceptance:` / `Evidence:` / `# Jira trace:` / `_Jira:_`) к `JIRA_SOURCE.md`. Opt-out: удалить `JIRA_SOURCE.md` → правило no-op. | WARNING |
| JIRA_DRIFT | _(conditional: только если `.jira-cache.json` exists)_ `.jira-cache.json` cached snapshot vs live Jira (при MCP доступе): новые comments, изменённые attachments, drift description; missing trace; scope enumeration gaps; hallucinated FR; visual mismatch. MCP недоступен → INFO "skipped". | WARNING / ERROR (missing CRITICAL directive) |
| FILE_CHANGES_COMPLETENESS | Файлы из TASKS.md `**files:**` отсутствуют в FILE_CHANGES.md | WARNING |
| FILE_CHANGES_VERIFY | FILE_CHANGES.md action=edit для несуществующего файла | ERROR |
| COUNT_CONSISTENCY | Числовые claims ("N FR") расходятся с фактическими counts | WARNING |
| FEATURE_TAG_PROPAGATION | @featureN из `.feature` отсутствует в TASKS.md | WARNING |
| SCENARIO_COUNT_SYNC | "N scenarios" в README/CHANGELOG расходится с actual `.feature` count | WARNING |
| AC_TAG_SYNC | @featureN в FR-N отсутствует в matching AC-N header | WARNING |
| PHANTOM_CREATE_SOURCE | FILE_CHANGES action=create "Move from X" — source X не существует | WARNING |
| PROSE_COUNT_SYNC | "N phase/orphan/duplicate" claims расходятся с actual counts | WARNING |
| TABLE_ROW_COUNT | _(AI check)_ Section header count vs actual table rows | — |
| AUDIT_REPORT_EXISTS | _(AI check)_ AUDIT_REPORT.md отсутствует после Phase 3+ | — |

## См. также

- `tools/specs-generator/validate-spec.ts` — структурный валидатор
- `tools/specs-generator/audit-spec.ts` — семантический аудит (Phase 3+)
- [`specs-validation.md`](specs-validation.md) — синхронизация через @featureN теги (используется UserPromptSubmit hook)
- [`bdd-enforcement.md`](bdd-enforcement.md) — BDD-default policy
