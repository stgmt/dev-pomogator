# Tasks

## TDD Workflow

Задачи организованы TDD: Red → Green → Refactor. Каждая implementation task привязана к `@featureN` тегу из `.feature`, Phase завершается verify-шагом "сценарии переходят Red→Green".

---

## Phase -1: Infrastructure Prerequisites

N/A — фича не требует новых сервисов, БД, контейнеров, env vars, secrets. vitest уже установлен в dev-pomogator; git + node + tsx уже доступны.

---

## Phase 0: BDD Foundation (Red)

> BDD framework — vitest (already installed in dev-pomogator). 1:1 mapping `.feature` scenarios → vitest `describe/it` per `@featureN` tag, per `extension-test-quality.md`.

(BDD foundation already in place, verified in DESIGN.md Evidence: existing `tests/e2e/` folder uses vitest with `describe(DOMAIN_CODE: ...)` + `it(CODE_NN: ...)` convention.)

- [ ] **P0-1** Создать `.specs/verify-generic-scope-fix/verify-generic-scope-fix.feature` с Background + 11 VSGF001_NN сценариев — **ГОТОВО в Phase 3** ✓
  _Source: FIXTURES.md, DESIGN.md Architecture_

- [ ] **P0-2** Создать `tests/e2e/scope-gate-helpers.ts` с функциями `createTmpRepoWithDiff()`, `writeMarkerFile()`, `spawnHook()` — @feature1 through @feature5
  _Source: DESIGN.md "BDD Test Infrastructure" > "Новые hooks"_
  _Reuse: `tests/e2e/helpers.ts` `runInstaller()` + `spawnSync` wrappers_

- [ ] **P0-3** Создать fixture files per FIXTURES.md — F-1..F-7 в `tests/fixtures/scope-gate/`
  _Source: FIXTURES.md Fixture Details_

- [ ] **P0-4** Создать `tests/e2e/scope-gate.test.ts` — 12 `it()` блоков, по одному per VSGF001_NN scenario, все с `expect.fail('not implemented')` skeletons
  _Source: verify-generic-scope-fix.feature_
  _Naming: `describe('VSGF001: Verify Generic Scope Fix gate', ...)` + `it('VSGF001_10: Enum extension in Service file is blocked without marker', ...)` per `extension-test-quality.md`_

- [ ] **P0-4b** В `tests/e2e/scope-gate.test.ts` добавить `beforeEach` + `afterEach` lifecycle hooks (vitest framework) — cleanup `tmpDir` через `fs.rmSync(..., {recursive: true, force: true})` после каждого теста
  _Source: DESIGN.md "BDD Test Infrastructure" > "Новые hooks" (afterEach row)_
  _Rationale: per-scenario tmp directory isolation + marker state cleanup_

- [ ] **P0-5** Создать `tests/unit/score-diff.test.ts` — 12-15 unit тестов для pure `scoreDiff()`: happy match, docs dampening, no match, edge cases (empty diff, malformed diff); все RED
  _Requirements: [FR-6](FR.md#fr-6-weighted-suspicionscore-heuristic), [FR-4](FR.md#fr-4-docstest-dampening--anti-over-application)_

- [ ] **P0-6** Создать `tests/unit/marker-store.test.ts` — unit тесты для `writeMarker`, `readFreshMarker`, `runGC`: atomic write, TTL, hash mismatch, session scoping, concurrent write safety, path traversal protection; все RED
  _Requirements: [FR-5](FR.md#fr-5-marker-invalidation--diff-hash-pin--ttl), [S-2 path-traversal](NFR.md#security)_

- [ ] **P0-7** Создать `tests/regressions/stocktaking-incident.test.ts` — regression pin: `scoreDiff(fs.readFileSync('tests/fixtures/scope-gate/stocktaking-diff.patch')).score >= 4`; RED (depends on P1-1)
  _Rationale: RESEARCH.md H-regression-pin — prevent future heuristic tweaks from losing incident detection_

- [ ] **P0-verify** Запустить `/run-tests` — все scope-gate тесты показывают RED (expected, Phase 0 complete)

---

## Phase 1: scoreDiff pure heuristic (Green, @feature1 @feature4)

- [ ] **P1-1** Создать `extensions/scope-gate/tools/scope-gate/score-diff.ts` — pure function `scoreDiff(diff, {dampenFiles})`: {score, reasons}
  _Requirements: [FR-6](FR.md#fr-6-weighted-suspicionscore-heuristic), [FR-4](FR.md#fr-4-docstest-dampening--anti-over-application)_
  _Reuse: pattern из plan-gate.ts:164-188 (scorePromptRelevance weighted overlap)_

- [ ] **P1-2** Implement detection helpers в `score-diff.ts`: `parseFilesFromDiff()`, `isEnumLikeItem()`, `isSwitchCase()`, `findEnclosingFunction()` — line-by-line regex + 3-line context window
  _Requirements: [FR-6 R-enum, R-case, R-predicate](FR.md#fr-6-weighted-suspicionscore-heuristic)_

- [ ] **P1-3** Implement FR-4 dampening в `score-diff.ts`: `-2 per .md/.txt/.rst`, `-1 per docs/tests path`
  _Requirements: [FR-4](FR.md#fr-4-docstest-dampening--anti-over-application)_

- [ ] **P1-verify** Запустить `tests/unit/score-diff.test.ts` — все unit тесты GREEN. Запустить `tests/regressions/stocktaking-incident.test.ts` — GREEN (стоктэйкинг diff score >= 4). @feature1 @feature4 unit layer complete.

---

## Phase 2: marker-store atomic I/O (Green, @feature2)

- [ ] **P2-1** Создать `extensions/scope-gate/tools/scope-gate/marker-store.ts` с функциями `writeMarker`, `readFreshMarker`, `runGC`, `shortSha`
  _Requirements: [FR-5](FR.md#fr-5-marker-invalidation--diff-hash-pin--ttl), [S-2 path-traversal](NFR.md#security), [S-3 session-scoping](NFR.md#security)_
  _Reuse: `.claude/rules/atomic-config-save.md` (temp+rename), `.claude/rules/atomic-update-lock.md` (`flag: 'wx'`), `.claude/rules/no-unvalidated-manifest-paths.md` (resolve+startsWith), `.claude/rules/gotchas/hook-global-state-cwd-scoping.md` (cwd-scoped)_

- [ ] **P2-2** Implement atomic write: `tempPath` → `fs.writeFileSync(temp, content, {flag: 'wx'})` → `fs.renameSync(temp, final)`; retry на EEXIST
  _Requirements: [R-3 concurrent invocation safety](NFR.md#reliability)_

- [ ] **P2-3** Implement TTL + session + hash invalidation в `readFreshMarker()`; fail-open JSON parse error
  _Requirements: [FR-5](FR.md#fr-5-marker-invalidation--diff-hash-pin--ttl), [R-4 corrupt marker resilience](NFR.md#reliability)_

- [ ] **P2-4a** Implement GC guard в `runGC()`: read `.last-gc` file mtime, skip if < 1h ago (fast path)
  _Requirements: [P-3 GC budget <100ms](NFR.md#performance)_

- [ ] **P2-4b** Implement stale file iteration в `runGC()`: `fs.readdirSync` + filter по `Date.now() - mtime > 24h`, skip `.last-gc` sentinel
  _Requirements: [FR-5](FR.md#fr-5-marker-invalidation--diff-hash-pin--ttl) GC rule_

- [ ] **P2-4c** Implement unlink + sentinel update в `runGC()`: `fs.unlinkSync` для каждого stale, then `fs.writeFileSync('.last-gc', timestamp)`; fail-open on unlink errors (log WARN, continue)
  _Requirements: [R-1 fail-open](NFR.md#reliability)_

- [ ] **P2-verify** `tests/unit/marker-store.test.ts` — все GREEN. @feature2 unit layer complete.

---

## Phase 3: scope-gate-guard hook (Green, @feature1 @feature2 @feature3 @feature4)

- [ ] **P3-1** Создать `extensions/scope-gate/tools/scope-gate/scope-gate-guard.ts` — main() per DESIGN.md алгоритм (14 шагов)
  _Requirements: [FR-2](FR.md#fr-2-pretooluse-hook--block-commit-without-fresh-verification)_
  _Reuse: **direct template** из `extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts:206-296` (stdin read, isTTY check, JSON parse fail-open, tool_name filter, denyAndExit pattern)_
  _Imports: `./score-diff.ts`, `./marker-store.ts` (per `ts-import-extensions.md` — `.ts` не `.js`)_

- [ ] **P3-2** Implement command parser для extracting commit message from `-m` / `-F` / inherited `.git/COMMIT_EDITMSG`
  _Requirements: [FR-3](FR.md#fr-3-escape-hatch-with-audit-trail) parse escape hatch regex_

- [ ] **P3-3** Implement escape hatch flow: match `/\[skip-scope-verify:([^\]]+)\]/i` OR env `SCOPE_GATE_SKIP`; append to `.claude/logs/scope-gate-escapes.jsonl`; WARN на short reason
  _Requirements: [FR-3](FR.md#fr-3-escape-hatch-with-audit-trail), [S-1 reason ≥8 chars](NFR.md#security), [S-4 append-only audit](NFR.md#security)_

- [ ] **P3-4** Implement docs-only short-circuit: parse `git diff --cached --name-only`, check `/\.(md|txt|rst)$|(\/|^)(docs?|tests?|__tests__|spec)\//i`
  _Requirements: [FR-4 rule (c)](FR.md#fr-4-docstest-dampening--anti-over-application)_

- [ ] **P3-5** Implement marker lookup via `marker-store.readFreshMarker()`
  _Requirements: [FR-5](FR.md#fr-5-marker-invalidation--diff-hash-pin--ttl)_

- [ ] **P3-5b** Honor `should_ship: false` в hook: deny даже на fresh marker (fail-loud propagation)
  _Requirements: [FR-7](FR.md#fr-7-fail-loud-on-unreachable-variant--explicit-counter-h3)_

- [ ] **P3-6** Implement `denyAndExit()` — emit `hookSpecificOutput.permissionDecision: "deny"` JSON + `process.exit(2)`; message per U-1 (≤1000 chars, actionable)
  _Requirements: [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-feature1), [U-1 deny reason ≤1000 chars](NFR.md#usability)_

- [ ] **P3-verify** Запустить `/run-tests -FilterPattern scope-gate.test.ts` — сценарии VSGF001_10, VSGF001_12, VSGF001_20, VSGF001_21, VSGF001_30, VSGF001_31, VSGF001_40, VSGF001_60 переходят Red→Green. Остальные (VSGF001_11, VSGF001_41, VSGF001_50, VSGF001_51) покрываются Phases 4-5.

---

## Phase 4: skill + analyze-diff (Green, @feature1 @feature5)

- [ ] **P4-1** Создать `extensions/scope-gate/skills/verify-generic-scope-fix/SKILL.md` — frontmatter (`disable-model-invocation: true`, `allowed-tools: Read, Bash, Grep, Glob`) + 5-step checklist + Gotchas section + Related section
  _Requirements: [FR-1](FR.md#fr-1-skill-workflow--mechanical-reach-analysis-per-variant), [FR-8](FR.md#fr-8-skill-frontmatter--disable-model-invocation-pattern)_
  _Reuse: frontmatter shape from `.claude/skills/dev-pomogator-uninstall/SKILL.md` (+ NEW field `disable-model-invocation: true`)_

- [ ] **P4-2** Создать `extensions/scope-gate/skills/verify-generic-scope-fix/scripts/analyze-diff.ts` — `parseAddedVariants()` + orchestrates reach analysis + calls `writeMarker()` из marker-store
  _Requirements: [FR-1](FR.md#fr-1-skill-workflow--mechanical-reach-analysis-per-variant), [FR-7](FR.md#fr-7-fail-loud-on-unreachable-variant--explicit-counter-h3)_
  _Imports: `../../../tools/scope-gate/score-diff.ts`, `../../../tools/scope-gate/marker-store.ts`_

- [ ] **P4-3** Implement reach classification в `analyze-diff.ts`: per variant (grep dedicated flow → grep gate call sites → check read-only flags); output `{variant, reach, evidence}`; если any `unreachable` → `should_ship: false`
  _Requirements: [FR-1 reach analysis](FR.md#fr-1-skill-workflow--mechanical-reach-analysis-per-variant), [FR-7 fail-loud](FR.md#fr-7-fail-loud-on-unreachable-variant--explicit-counter-h3)_

- [ ] **P4-4** Implement human-readable report output: per-variant verdict + overall `should_ship` + actionable hint
  _Requirements: [U-2 structured skill output](NFR.md#usability)_

- [ ] **P4-verify** Запустить `tests/e2e/scope-gate.test.ts` — VSGF001_11 (fresh marker unblocks) + VSGF001_50 (frontmatter validation) переходят GREEN.

---

## Phase 5: extension.json + rules + CLAUDE.md (Green, @feature5)

- [ ] **P5-1** Создать `extensions/scope-gate/extension.json` per FR-9 schema
  _Requirements: [FR-9](FR.md#fr-9-integration-with-dev-pomogator-extension-system), [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-feature5)_
  _Compliance: `installer-hook-formats.md` Object format, `extension-manifest-integrity.md` всех файлов в toolFiles/skillFiles_

- [ ] **P5-2** Создать `extensions/scope-gate/rules/when-to-verify.md` — trigger map (когда invoke skill), hard-OUT signals (когда НЕ invoke — prevents H1 over-application), пример stocktaking incident as reference
  _Rationale: R-risk-3 mitigation (over-application prevention)_

- [ ] **P5-3** Создать `extensions/scope-gate/rules/escape-hatch-audit.md` — how to review `.claude/logs/scope-gate-escapes.jsonl`, anti-gaming guidance (reason должен быть substantive, not "skip"), grep examples
  _Requirements: [U-4 escape hatch documentation](NFR.md#usability)_

- [ ] **P5-4** Edit `D:\repos\dev-pomogator\CLAUDE.md` — добавить 2 rows в Rules > Triggered table per `claude-md-glossary.md`:
  ```
  | scope-gate/when-to-verify | Триггер map + hard-OUT signals для /verify-generic-scope-fix | `.claude/rules/scope-gate/when-to-verify.md` |
  | scope-gate/escape-hatch-audit | Audit + anti-gaming для [skip-scope-verify:] escape hatch | `.claude/rules/scope-gate/escape-hatch-audit.md` |
  ```

- [ ] **P5-5** Edit `.claude/rules/plan-pomogator/cross-scope-coverage.md` — добавить в конце секцию:
  ```markdown
  ## See also
  - `.claude/rules/scope-gate/when-to-verify.md` — per-case codepath reach verification (scope-gate extension). Смежное правило: cross-scope-coverage покрывает matrix scope × variant (test coverage); scope-gate покрывает per-case codepath reach (prevents structurally no-op fixes).
  ```

- [ ] **P5-verify** Запустить `/run-tests -FilterPattern scope-gate.test.ts` — VSGF001_41 + VSGF001_51 GREEN. Запустить `validate-spec.ts` для spec — 0 errors.

---

## Phase 6: E2E + Hyper-V + Refactor (Green + Polish)

- [ ] **P6-1** Complete `tests/e2e/scope-gate.test.ts` — все 11 scenarios GREEN
  _Requirements: все AC, `integration-tests-first.md`_

- [ ] **P6-2** Создать `tests/hyperv-scenarios/HV-scope-gate-01.yaml` — clean Win VM catalog entry per `hyperv-test-runner` skill convention; install dev-pomogator + scope-gate в VM, drop stocktaking diff, screenshot deny message
  _Reuse: `tests/hyperv-scenarios/` patterns_

- [ ] **P6-3** Refactor: extract common utilities если обнаружены; review all TS files против `ts-import-extensions.md` (`.ts` specifiers); verify `extension-manifest-integrity.md` checklist
  _Requirements: ts-import-extensions, extension-manifest-integrity_

- [ ] **P6-4** Run full test suite `/run-tests` — unit + e2e + regression — все GREEN

- [ ] **P6-5** Dogfood: locally run `dev-pomogator install --extension scope-gate` в tmp project, verify install + unblock flow manually

- [ ] **P6-verify** `/simplify` ОДИН раз финально (per `feedback_simplify-once-at-end.md`); apply resulting review comments если applicable

---

## Definition of Done

- [ ] Все 11 VSGF001_NN BDD scenarios GREEN
- [ ] Unit tests (score-diff, marker-store) GREEN
- [ ] Regression pin `stocktaking-incident.test.ts` GREEN
- [ ] `validate-spec.ts` для `.specs/verify-generic-scope-fix/` → 0 ERROR
- [ ] `audit-spec.ts` → findings resolved или `[KNOWN_UB:]` tagged
- [ ] `extension-manifest-integrity.md` checklist passed (все toolFiles/skillFiles существуют, hooks обновлены)
- [ ] `ts-import-extensions.md` checked (`.ts` specifiers везде в extensions/)
- [ ] CLAUDE.md Rules table обновлена (2 rows)
- [ ] `cross-scope-coverage.md` See also section добавлена
- [ ] Hyper-V scenario создан + dogfooded вручную
- [ ] `/simplify` финальный run применён
- [ ] Memory cross-references intact (RESEARCH.md цитирует reference_stocktaking-incident-products-20218.md; DESIGN.md цитирует feedback_code-evidence-trumps-domain-sense.md)
