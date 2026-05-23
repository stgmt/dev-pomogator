Feature: SRC001 spec-reality-check skill

  Background:
    Given dev-pomogator репозиторий установлен в workspace
    And `.claude/skills/spec-reality-check/scripts/verify.ts` существует
    And tmpdir создан per-test через `os.tmpdir()` isolation

  # @feature2 — FC_CREATE_EXISTS check
  Scenario: SRC001_01 verify.ts detects action=create row pointing at existing file
    Given fixture spec `tests/fixtures/spec-reality-check/stale-create/` со spec в tmpdir
    And FILE_CHANGES.md row `action=create` указывает на существующий файл в tmpdir
    When запущен `verify.ts <tmpdir-spec> --format json`
    Then output содержит finding с check=FC_CREATE_EXISTS severity=ERROR
    And details содержит file path
    And exit code = 0

  # @feature2 — FC_EDIT_MISSING check
  Scenario: SRC001_02 verify.ts detects action=edit row pointing at missing file
    Given fixture spec `missing-edit/` с FILE_CHANGES.md row `action=edit` на несуществующий файл
    When запущен verify.ts на spec
    Then output содержит finding check=FC_EDIT_MISSING severity=ERROR с file path

  # @feature2 — FC_DELETE_MISSING check
  Scenario: SRC001_03 verify.ts detects action=delete row pointing at missing file
    Given fixture spec с FILE_CHANGES.md row `action=delete` на отсутствующий файл
    When запущен verify.ts
    Then output содержит finding check=FC_DELETE_MISSING severity=ERROR

  # @feature3 — NARRATIVE_PATH_MISSING check
  Scenario: SRC001_04 verify.ts detects inline backtick path on missing file
    Given fixture `narrative-drift/` где FR.md содержит inline backtick path `src/foo/bar.ts`
    And этот файл НЕ существует в tmpdir
    When запущен verify.ts на spec
    Then output содержит finding check=NARRATIVE_PATH_MISSING severity=WARNING с file path
    And paths внутри fenced code blocks NOT в findings (skip examples)

  # @feature4 — CODE_DRIFT_FR_ALREADY_DONE check
  Scenario: SRC001_05 verify.ts detects FR-N with existing git commits
    Given fixture `code-drift/` с tmp git repo внутри tmpdir
    And FR.md содержит "FR-1: Feature X"
    And git log содержит commit с message "Implement FR-1 X"
    When запущен verify.ts
    Then output содержит finding check=CODE_DRIFT_FR_ALREADY_DONE severity=WARNING
    And details содержит commit SHA(s)

  # @feature4 — Edge case 3: git unavailable
  Scenario: SRC001_05b verify.ts skips code-drift if .git missing
    Given fixture spec в tmpdir БЕЗ .git/ directory
    When запущен verify.ts на spec
    Then output содержит INFO finding "git unavailable, code-drift check skipped"
    And остальные checks (FC + narrative) продолжают работать
    And exit code = 0

  # @feature5 — TASKS_FC_CONSISTENCY check
  Scenario: SRC001_06 verify.ts detects TASKS files not in FILE_CHANGES
    Given fixture `task-orphan/` с TASKS.md содержит `**files:** \`some/file.ts\``
    And FILE_CHANGES.md НЕ содержит row для `some/file.ts`
    When запущен verify.ts
    Then output содержит finding check=TASKS_FC_CONSISTENCY severity=WARNING

  # @feature10 — Negative test (clean spec)
  Scenario: SRC001_07 verify.ts emits zero ERRORs on clean shipped spec
    Given fixture clean spec (все paths существуют, нет drift)
    When запущен verify.ts
    Then output findings filter severity=ERROR равен пустому массиву
    And cosmetic WARNINGs count ≤ 5

  # @feature6 — JSON format output
  Scenario: SRC001_08 verify.ts --format json outputs valid JSON
    Given любой fixture spec
    When запущен verify.ts с `--format json`
    Then stdout парсится через JSON.parse без ошибки
    And shape соответствует AuditFinding[]

  # @feature6 — Human format output
  Scenario: SRC001_09 verify.ts --format human outputs ANSI colored
    Given fixture spec с ERROR findings
    When запущен verify.ts с `--format human`
    Then stdout содержит ANSI escape codes (через chalk)
    And содержит file:line clickable references

  # @feature6 — Markdown format output
  Scenario: SRC001_10 verify.ts --format markdown outputs valid table
    Given fixture spec с findings
    When запущен verify.ts с `--format markdown`
    Then stdout содержит markdown table со столбцами Check / Severity / File / Message / Suggested fix

  # @feature7 — Hook denies on drift
  Scenario: SRCHOOK001_01 verify-hook.ts denies ExitPlanMode on drift in referenced spec
    Given план содержит ссылку на спеку с ≥1 ERROR finding
    When ExitPlanMode тригерит PreToolUse hook
    Then hook stdout содержит JSON shape `{hookSpecificOutput.permissionDecision: "deny"}`
    And permissionDecisionReason содержит formatted findings
    And exit code = 0

  # @feature7 — Hook permits on clean
  Scenario: SRCHOOK001_02 verify-hook.ts permits ExitPlanMode on clean spec
    Given план ссылается на спеку с 0 ERRORs
    When ExitPlanMode тригерит hook
    Then hook stdout empty (no deny output)
    And exit code = 0

  # @feature8 — Hook fail-open on exception
  Scenario: SRCHOOK001_03 verify-hook.ts fails open on internal exception
    Given verify.ts падает с unhandled exception (искусственно — corrupt input)
    When hook execution catches exception
    Then hook stderr содержит warning message
    And hook stdout НЕ содержит deny output
    And exit code = 0
