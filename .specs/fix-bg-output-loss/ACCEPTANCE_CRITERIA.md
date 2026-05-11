# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-persistent-log-для-docker-testsh-output)

WHEN `scripts/docker-test.sh <args>` запускается (независимо от foreground/background, независимо от SKIP_BUILD) THEN система SHALL создать файл `.dev-pomogator/.docker-status/test-run-<epoch-seconds>.log` и записать в него **весь** stdout+stderr прогона `docker compose run`.

## AC-2 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-persistent-log-для-docker-testsh-output)

WHEN `docker compose run` эмитит output AND процесс работает дольше 60 секунд THEN система SHALL дублировать output в log файл через `tee` AND родительский stdout также SHALL получать output (не подменять forward).

## AC-3 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-обновить-rule-no-blocking-on-tests--запрет-naked--tail-в-bg)

IF AI-агент читает `.claude/rules/pomogator/no-blocking-on-tests.md` THEN rule SHALL содержать секцию "Anti-patterns" с явным запретом паттерна `<long-cmd> 2>&1 | tail -N` при `run_in_background: true` AND SHALL содержать safe replacement пример с `tee`.

## AC-4 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-directory-lifecycle--dev-pomogatordocker-status-создаётся-безопасно)

IF директория `.dev-pomogator/.docker-status/` НЕ существует при запуске `docker-test.sh` THEN скрипт SHALL создать её через `mkdir -p` ПЕРЕД первым write'ом в log файл AND SHALL НЕ fail если директория уже существует.

## AC-5 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-log-rotation--gitignore--не-коммитить-test-run-log)

IF `.dev-pomogator/` уже matched родительским gitignore pattern THEN дополнительный entry не требуется AND спека SHALL документировать это в RESEARCH.md. IF `.dev-pomogator/` НЕ gitignored THEN spec SHALL предписать добавить `.dev-pomogator/.docker-status/test-run-*.log` к `.gitignore`.

## AC-6 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-exit-code-preservation--regression-guard)

WHEN `docker compose run` exits non-zero (симуляция test failure) THEN `docker-test.sh` SHALL exit с тем же non-zero code (pipefail сохраняет первый fail в pipeline) AND integration test SHALL verify это через explicit `bash docker-test.sh <args-that-fail>; echo "exit=$?"`.

## AC-7 (DEPRECATED — replaced by AC-11 in v0.3.0)

> **DEPRECATED in v0.3.0**: проверял `scripts/bg-log.sh` который откачен как duplicate. Замещён AC-11 (Generic adapter integration verification).

## AC-10 (FR-10): Cleanup duplicate verified

- WHEN запускается `ls scripts/bg-log.sh` THEN file NOT found
- WHEN запускается `ls tests/e2e/bg-log-helper.test.ts` THEN file NOT found
- WHEN читается обе `.feature` файла THEN content NOT contains FBOL002_01/02/03
- WHEN читается FR.md секция FR-7 THEN содержит "DEPRECATED" marker
- WHEN читается ACCEPTANCE_CRITERIA.md секция AC-7 THEN содержит "DEPRECATED" marker

## AC-11 (FR-11): Generic adapter integration

- WHEN запускается `node test_runner_wrapper.cjs --framework generic -- echo hello` THEN exit 0, YAML status `framework: generic`, `state: passed`, log file содержит "hello"
- WHEN запускается `node test_runner_wrapper.cjs --framework generic -- /bin/false` THEN exit 1, YAML `state: failed`
- WHEN запускается existing test framework THEN no regression — existing FBOL001_01..06 scenarios still green

## AC-12 (FR-12): Smart converter deny-message

- WHEN test_guard.ts receives raw `dotnet test --filter MBIL001` THEN exit 2 AND `permissionDecisionReason` содержит exact string `node .dev-pomogator/tools/test-statusline/test_runner_wrapper.cjs --framework dotnet --`
- WHEN test_guard.ts receives raw `pytest tests/` THEN deny-message содержит `--framework pytest --`
- WHEN test_guard.ts receives wrapped command (test_runner_wrapper present) THEN exit 0 (allow)

## AC-13 (FR-13): SKILL.md description improvements

- WHEN читается SKILL.md frontmatter description THEN содержит ≥5 trigger keywords: "dotnet test", "pytest", "cargo test", "vitest", "jest", "run tests", "in background", "long bg"
- WHEN читается SKILL.md body THEN содержит "Generic mode" section с примерами `--framework generic`
- WHEN читается SKILL.md THEN NOT содержит misleading "Auto-detects framework" в позиции что выглядит как auto-invoke promise (must say "detects ... from project config files" not "auto-detects")

## AC-14 (FR-14): Analysis report saved

- WHEN читается ANALYSIS_SKILL_TRIGGER.md THEN содержит секции: "Incident timeline", "Skill auto-trigger mechanism", "Description analysis", "Hook install path investigation", "WebSearch findings 2026", "Recommendations"
- WHEN читается report THEN содержит ≥3 external links (WebSearch sources)
- WHEN читается recommendations table THEN содержит columns: recommendation | priority (HIGH/MED/LOW) | effort estimate

## AC-15 (FR-15): Benchmark report saved

- WHEN читается BENCHMARK.md THEN содержит 3 секции: "Trigger rate", "Performance overhead", "Reliability YAML accuracy"
- WHEN читается trigger rate table THEN columns: prompt | framework | AI choice (Skill/Bash) | result
- WHEN читается performance table THEN columns: framework | raw median (ms) | wrapper median (ms) | delta | %overhead
- WHEN читается reliability table THEN columns: framework | YAML passed | ground truth passed | match (Y/N)

## AC-16 (FR-16, conditional): Installer hook path bug

- IF investigation confirms bug THEN `tests/e2e/installer-hook-path.test.ts` exists AND passes; installer fix in `src/installer/claude.ts`
- ELSE section marked `[NOT APPLICABLE: investigation found no bug]` в ANALYSIS report

**Resolution:** NOT APPLICABLE (legacy install pre-FR-2, not installer bug).

## AC-17 (FR-17): Windows path mangling fix

- WHEN читается `extensions/tui-test-runner/tools/tui-test-runner/tui_session_start.ts` THEN содержит `cwd.replace(/\\\\/g, '/')` normalization перед writing к CLAUDE_ENV_FILE
- WHEN wrapper runs after new SessionStart THEN `TEST_STATUSLINE_PROJECT` env var содержит forward slashes (e.g. `D:/repos/dev-pomogator`), не mangled (`D:reposdev-pomogator`)
- WHEN `node test_runner_wrapper.cjs --framework vitest -- npx vitest run tests/e2e/docker-test-tee.test.ts` запускается THEN YAML status reports `total: 6, passed: 6` (matches `--reporter=json` ground truth)

## AC-8 (FR-8)

**Требование:** [FR-8](FR.md#fr-8-rule-update-confirmed-anthropic-bug-citations-file-redirect-pattern-v020)

- **AC-8.1 (4 issue links present)**: WHEN читается `.claude/rules/pomogator/no-blocking-on-tests.md` THEN SHALL содержать ровно 4 markdown ссылки на `github.com/anthropics/claude-code/issues/{16305,21915,36915,50616}`.
- **AC-8.2 (file-redirect pattern present)**: WHEN читается секция "Preferred pattern" THEN SHALL содержать строку с паттерном `> .dev-pomogator/.bg-logs/<slug>.log 2>&1` AND примерами для dotnet test / pytest / cargo test.
- **AC-8.3 (bg-log.sh reference present)**: WHEN читается rule body THEN SHALL содержать ссылку на `scripts/bg-log.sh` как convenience wrapper для file-redirect pattern.
