# Acceptance Criteria (EARS)

## AC-1 (FR-1) @feature1
**Требование:** [FR-1](FR.md#fr-1-skill-bundle-layout-feature1)

WHEN Claude Code загружает skill registry AND `.claude/skills/spec-reality-check/SKILL.md` существует THEN frontmatter SHALL содержать поле `description` с EN+RU триггерами покрывающими все 4 lifecycle-операции (create/modify/supplement/implement) плюс общие проверки.

## AC-2 (FR-2) @feature2
**Требование:** [FR-2](FR.md#fr-2-filechanges-verification-checks-feature2)

WHEN `verify.ts` запущен на спеке с FILE_CHANGES row `action=create` указывающей на существующий файл THEN output SHALL содержать finding `FC_CREATE_EXISTS` severity=ERROR с file path в details.

WHEN row `action=edit` указывает на несуществующий файл THEN output SHALL содержать finding `FC_EDIT_MISSING` severity=ERROR с file path.

WHEN row `action=delete` указывает на несуществующий файл THEN output SHALL содержать finding `FC_DELETE_MISSING` severity=ERROR.

## AC-3 (FR-3) @feature3
**Требование:** [FR-3](FR.md#fr-3-narrative-path-verification-feature3)

WHEN `verify.ts` парсит FR.md / DESIGN.md / TASKS.md AND находит inline backtick path с расширением (ts/js/json/md/py/etc) на несуществующий файл AND path НЕ внутри fenced code block THEN output SHALL содержать finding `NARRATIVE_PATH_MISSING` severity=WARNING.

## AC-4 (FR-4) @feature4
**Требование:** [FR-4](FR.md#fr-4-code-drift-detection-via-git-log-feature4)

WHEN `verify.ts` запускает `git log --max-count=20 -S "FR-N"` для каждой FR ID AND output non-empty (≥1 commit) THEN output SHALL содержать finding `CODE_DRIFT_FR_ALREADY_DONE` severity=WARNING с commit SHAs в details.

IF `.git/` directory отсутствует THEN check SHALL skip с INFO finding "git unavailable, code-drift check skipped" AND continue с остальными checks.

## AC-5 (FR-5) @feature5
**Требование:** [FR-5](FR.md#fr-5-tasksfilechanges-consistency-feature5)

WHEN `verify.ts` парсит TASKS.md `**files:**` блоки AND FILE_CHANGES.md table AND находит файл в TASKS но не в FILE_CHANGES (orphan TASK file) THEN output SHALL содержать finding `TASKS_FC_CONSISTENCY` severity=WARNING.

WHEN файл в FILE_CHANGES но не упомянут в TASKS (orphan FC file) THEN output SHALL содержать finding severity=INFO.

## AC-6 (FR-6) @feature6
**Требование:** [FR-6](FR.md#fr-6-three-output-formats-feature6)

WHEN `verify.ts` вызвана с `--format json` THEN stdout SHALL содержать valid JSON парсимый через `JSON.parse` со shape `AuditFinding[]`.

WHEN `--format human` THEN stdout SHALL содержать ANSI-colored output через chalk package с file:line clickable references.

WHEN `--format markdown` THEN stdout SHALL содержать валидную markdown table со столбцами Check / Severity / File / Message / Suggested fix.

## AC-7 (FR-7) @feature7
**Требование:** [FR-7](FR.md#fr-7-pretooluse-hook-on-exitplanmode-feature7)

WHEN AI вызывает ExitPlanMode tool AND план содержит references на `.specs/{slug}/` где spec-reality-check находит ≥1 finding severity=ERROR THEN PreToolUse hook SHALL output JSON `{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "<formatted findings>"}}` AND exit 0.

## AC-8 (FR-8) @feature8
**Требование:** [FR-8](FR.md#fr-8-hook-fail-open-on-exception-feature8)

IF verify.ts падает с unhandled exception during hook execution THEN hook SHALL log warning в stderr AND output empty JSON (permits ExitPlanMode) AND exit 0 (fail-open).

## AC-9 (FR-9) @feature9
**Требование:** [FR-9](FR.md#fr-9-extension-manifest-wiring-feature9)

WHEN dev-pomogator installer reads `extensions/specs-workflow/extension.json` THEN manifest SHALL содержать `skills["spec-reality-check"]` AND `skillFiles["spec-reality-check"]` array AND `hooks.claude.PreToolUse` array entry с matcher `ExitPlanMode` AND version `"1.21.0"`.

## AC-10 (FR-10) @feature10
**Требование:** [FR-10](FR.md#fr-10-test-coverage-feature10)

WHEN `vitest run tests/e2e/spec-reality-check*.test.ts` запущен AND все 5+ fixture-based scenarios + 3 hook scenarios выполнены THEN все scenarios SHALL exit GREEN.

## AC-11 (FR-11) @feature11
**Требование:** [FR-11](FR.md#fr-11-applied-on-canonical-plugin-spec-feature11)

WHEN `verify.ts` применён на текущую `.specs/dev-pomogator-canonical-plugin/` THEN output SHALL содержать ≥3 ERRORs включая `bin/postinstall.js missing`, `src/installer/install-user-scope.ts missing`, `src/installer/git-exclude.ts missing`.

WHEN spec docs обновлены AND повторный run THEN output SHALL содержать 0 ERRORs (≤2 cosmetic WARNs допустимо).

## AC-12 (FR-12) @feature12
**Требование:** [FR-12](FR.md#fr-12-spec-review-category-15-integration-feature12)

WHEN `Skill("spec-review")` вызывается перед любым `ConfirmStop` THEN spec-review SHALL invoke `Skill("spec-reality-check")` как category 15 step AND включить findings в общий report под severity mapping ERROR→P0, WARNING→P1, INFO→P2.

## AC-13 (FR-13) @feature13
**Требование:** [FR-13](FR.md#fr-13-create-spec-phase-3-integration-feature13)

WHEN `Skill("create-spec")` доходит до Phase 3 Finalization step "validation" перед `ConfirmStop Finalization` THEN workflow SHALL invoke `Skill("spec-reality-check")` AND если есть ERRORs — Phase 3 NOT SHALL confirm-иться пока drift не починен.

## AC-14 (FR-14) @feature14
**Требование:** [FR-14](FR.md#fr-14-graceful-filechanges-parser-fallback-feature14)

WHEN `verify.ts` парсит FILE_CHANGES.md row которая не содержит column `Action` или unparseable THEN parser SHALL emit INFO finding "row N unparseable" AND continue с остальными rows, не crash.

## AC-15 (FR-15) @feature15
**Требование:** [FR-15](FR.md#fr-15-bug-fix-plan-gate-phase-25-already-shipped-feature15)

WHEN `plan-gate.ts` Phase 2.5 detects relevance score ≤ -20 AND вызывает `denyAndExit` THEN argument SHALL быть `ValidationError[]` objects (не string array) AND printer выводит реальный `line N: message\n💡 hint` format. **Shipped в commit b8a2bca**.
