Feature: SRC001 spec-reality-check skill

  Background:
    Given dev-pomogator репозиторий установлен в workspace
    And `.claude/skills/spec-reality-check/scripts/verify.ts` существует
    And tmpdir создан per-test через `os.tmpdir()` isolation

  @feature2
  Scenario: SRC001_01 verify.ts detects action=create row pointing at existing file
    Given fixture spec `tests/fixtures/spec-reality-check/stale-create/` со spec в tmpdir
    And FILE_CHANGES.md row `action=create` указывает на существующий файл в tmpdir
    When запущен `verify.ts <tmpdir-spec> --format json`
    Then output содержит finding с check=FC_CREATE_EXISTS severity=ERROR
    And details содержит file path
    And exit code = 0

  @feature2
  Scenario: SRC001_02 verify.ts detects action=edit row pointing at missing file
    Given fixture spec `missing-edit/` с FILE_CHANGES.md row `action=edit` на несуществующий файл
    When запущен verify.ts на spec
    Then output содержит finding check=FC_EDIT_MISSING severity=ERROR с file path

  @feature2
  Scenario: SRC001_03 verify.ts detects action=delete row pointing at missing file
    Given fixture spec с FILE_CHANGES.md row `action=delete` на отсутствующий файл
    When запущен verify.ts
    Then output содержит finding check=FC_DELETE_MISSING severity=ERROR

  @feature3
  Scenario: SRC001_04 verify.ts detects inline backtick path on missing file
    Given fixture `narrative-drift/` где FR.md содержит inline backtick path `src/foo/bar.ts`
    And этот файл НЕ существует в tmpdir
    When запущен verify.ts на spec
    Then output содержит finding check=NARRATIVE_PATH_MISSING severity=WARNING с file path
    And paths внутри fenced code blocks NOT в findings (skip examples)

  @feature4
  Scenario: SRC001_05 verify.ts detects FR-N with existing git commits
    Given fixture `code-drift/` с tmp git repo внутри tmpdir
    And FR.md содержит "FR-1: Feature X"
    And git log содержит commit с message "Implement FR-1 X"
    When запущен verify.ts
    Then output содержит finding check=CODE_DRIFT_FR_ALREADY_DONE severity=WARNING
    And details содержит commit SHA(s)

  @feature4
  Scenario: SRC001_05b verify.ts skips code-drift if .git missing
    Given fixture spec в tmpdir БЕЗ .git/ directory
    When запущен verify.ts на spec
    Then output содержит INFO finding "git unavailable, code-drift check skipped"
    And остальные checks (FC + narrative) продолжают работать
    And exit code = 0

  @feature5
  Scenario: SRC001_06 verify.ts detects TASKS files not in FILE_CHANGES
    Given fixture `task-orphan/` с TASKS.md содержит `**files:** \`some/file.ts\``
    And FILE_CHANGES.md НЕ содержит row для `some/file.ts`
    When запущен verify.ts
    Then output содержит finding check=TASKS_FC_CONSISTENCY severity=WARNING

  @feature10
  Scenario: SRC001_07 verify.ts emits zero ERRORs on clean shipped spec
    Given fixture clean spec (все paths существуют, нет drift)
    When запущен verify.ts
    Then output findings filter severity=ERROR равен пустому массиву
    And cosmetic WARNINGs count ≤ 5

  @feature6
  Scenario: SRC001_08 verify.ts --format json outputs valid JSON
    Given любой fixture spec
    When запущен verify.ts с `--format json`
    Then stdout парсится через JSON.parse без ошибки
    And shape соответствует AuditFinding[]

  @feature6
  Scenario: SRC001_09 verify.ts --format human outputs ANSI colored
    Given fixture spec с ERROR findings
    When запущен verify.ts с `--format human`
    Then stdout содержит ANSI escape codes (через chalk)
    And содержит file:line clickable references

  @feature6
  Scenario: SRC001_10 verify.ts --format markdown outputs valid table
    Given fixture spec с findings
    When запущен verify.ts с `--format markdown`
    Then stdout содержит markdown table со столбцами Check / Severity / File / Message / Suggested fix

  @feature7
  Scenario: SRCHOOK001_01 verify-hook.ts denies ExitPlanMode on drift in referenced spec
    Given план содержит ссылку на спеку с ≥1 ERROR finding
    When ExitPlanMode тригерит PreToolUse hook
    Then hook stdout содержит JSON shape `{hookSpecificOutput.permissionDecision: "deny"}`
    And permissionDecisionReason содержит formatted findings
    And exit code = 0

  @feature7
  Scenario: SRCHOOK001_02 verify-hook.ts permits ExitPlanMode on clean spec
    Given план ссылается на спеку с 0 ERRORs
    When ExitPlanMode тригерит hook
    Then hook stdout empty (no deny output)
    And exit code = 0

  @feature8
  Scenario: SRCHOOK001_03 verify-hook.ts fails open on internal exception
    Given verify.ts падает с unhandled exception (искусственно — corrupt input)
    When hook execution catches exception
    Then hook stdout НЕ содержит deny output (fail-open silently)
    And exit code = 0

  @feature2
  Scenario: SRC002_01 runChecks summary severity counts equal the per-finding counts
    Given fixture spec `missing-edit/` со spec в tmpdir
    When запущен verify.ts на spec
    Then summary by_severity равен подсчёту findings по severity
    And summary total равен числу findings

  @feature2
  Scenario: SRC002_02 parseFileChangesTable on a 3-row table yields 3 unique rows
    Given FILE_CHANGES markdown с 3 строками таблицы
    When распарсен через parseFileChangesTable
    Then получено ровно 3 строки
    And пути строк уникальны

  @feature2
  Scenario: SRC002_03 extractInlineCodePaths keeps real paths and drops urls
    Given markdown с inline backtick путями и url
    When извлечены пути через extractInlineCodePaths
    Then извлечены src/a.ts и README.md
    And ни один путь не содержит url-схему

  @feature2
  Scenario: SRC002_04 extractFrIds collapses duplicate FR ids
    Given текст с повторяющимися FR id
    When извлечены id через extractFrIds
    Then id уникальны и отсортированы

  @feature5
  Scenario: SRC002_05 extractTaskPaths skips OUT_OF_SCOPE and strikethrough rows
    Given TASKS markdown с обычной, out-of-scope и зачёркнутой задачами
    When извлечены пути через extractTaskPaths
    Then включён a.ts
    And исключены b.ts и c.ts

  @feature2
  Scenario: SRC002_06 runChecks is idempotent across two calls
    Given fixture spec `missing-edit/` со spec в tmpdir
    When запущен verify.ts дважды
    Then оба прогона дают равные severity counts

  @feature7
  Scenario: SRCHOOK002_01 extractSpecRefs collapses duplicate spec refs
    Given текст с повторяющимися ссылками на спеки
    When извлечены ссылки через extractSpecRefs
    Then ссылки уникальны и их ровно 2

  @feature7
  Scenario: SRCHOOK002_02 extractSpecRefs on empty text returns empty array
    Given пустой текст
    When извлечены ссылки через extractSpecRefs
    Then ссылок ноль

  @feature7
  Scenario: SRCHOOK002_03 extractSpecRefs captures a backlog subpath as one ref
    Given текст со ссылкой на backlog-спеку
    When извлечены ссылки через extractSpecRefs
    Then ровно одна ссылка содержит archived-spec

  @feature7
  Scenario: SRCHOOK002_04 extractSpecRefs drops file paths and keeps spec dirs
    Given текст со ссылками на спеки и файлы
    When извлечены ссылки через extractSpecRefs
    Then файловые пути отброшены а каталог спеки сохранён

  @feature15
  Scenario: SRC003_01 plan-gate Phase 2.5 scores an off-topic plan at the deny threshold
    Given план, чьи Extracted Requirements про постороннюю тему
    And prompt-тексты сессии про совсем другое
    When scorePromptRelevance оценивает план против prompt-текстов
    Then relevance score <= -20 (Phase 2.5 denies as a readable ValidationError)

  @feature15
  Scenario: SRC003_02 plan-gate Phase 2.5 passes an on-topic plan
    Given план, чьи Extracted Requirements отражают запрос сессии
    And prompt-тексты сессии про ту же тему
    When scorePromptRelevance оценивает план против prompt-текстов
    Then relevance score > -20 (Phase 2.5 allows)

  @feature15
  Scenario: SRC003_03 plan-gate Phase 2.5 deny рендерится читаемо (line 0, не "line undefined")
    Given payload отказа Phase 2.5 из plan-gate
    When payload отказа отрендерен общим форматтером deny
    Then текст содержит "line 0:" с непустым сообщением и без "undefined"
