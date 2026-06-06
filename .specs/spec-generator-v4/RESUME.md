# RESUME — spec-generator-v4 (handoff, continue from here)

**Updated:** 2026-06-05 · **Branch:** `feat/phase-2a-mcp-server-and-hooks` · **PR:** [#32](https://github.com/stgmt/dev-pomogator/pull/32)

Pull this branch on any machine, read this file + the two audit-reports below, and continue. This is
the single source of truth for "where we stopped and what to do next."

## Where we are (this session's deliverables — SPEC-level, committed)

Two new requirements were integrated INTO this spec (not as separate specs — the corpus is one organism):

- **FR-36 — unified spec-graph via spec-qualified node ids.** Root cause (measured by dogfood): the
  graph keys nodes by the BARE id, so 46 specs' `FR-2` collide → only 47 FR nodes survive (~470
  expected). Fix = composite key `<slug>:<localId>` (anchors stay bare/file-local; Marksman untouched).
  Design + id-scheme deep-dive: `audit-reports/unified-spec-graph-design.md`. Evidence:
  `audit-reports/spec-mcp-dogfood-dataset.md`.
- **FR-37 — smart verdict authoritative + cell→atom traceability gate.** A structural `validate-spec:
  0 errors` was reported as "valid" while the smart layer showed real debt — false green. Fix = the
  verdict is the SMART analysis (conformance + get_coverage + audit-spec + a traceability-completeness
  check) over the one graph, default-ON; `validate-spec` demoted to a pre-filter; full traceability is
  a hard gate. Report: `audit-reports/v4-smart-verdict-and-organism-traceability.md`.

Both are FULLY TRACED (dogfood-verified, FR→AC→Scenario→Task→Design):
- FR-36 → 7 AC, 6 scenarios (`@feature36` / SPECGEN004_90–95), 5 tasks (P13-1..4 + P14-5), DESIGN entry.
- FR-37 → 6 AC, 6 scenarios (`@feature37` / SPECGEN004_96–101), 5 tasks (P14-1..4 + P14-5), DESIGN entry.
- `validate-spec` 0 errors; BDD suite green (101 scenarios, 12 undefined @feature36+37, 0 failed —
  cucumber is non-strict here, so undefined scenarios ahead of step-defs do NOT redden the suite).

### Commits this session (newest last)
- `b3c2c6e` feat(spec-v4): FR-36 unified spec-graph via spec-qualified node ids
- `ed34ecc` feat(spec-v4): FR-37 smart verdict authoritative + cell→atom traceability gate
- (this commit) traceability fixes: task→FR bare-ref links, DESIGN decisions, P14-5 corpus-health skill, RESUME.md

## What is NOT done (the work — CODE — none of it is written yet)

The spec now DESCRIBES the fix; the implementation is Phase 13 + Phase 14 in `TASKS.md`. Zero code shipped.

### Measured debt (drive these to 0 — this is the gate)
- **1 audit P0** (was 10): 1× FR-1 missing AC-link (scope: `final-verification`). ✅ P14-1 (2026-06-05)
  closed the 9 stale-path P0s: 58 stale `extensions/…`/`dist/installer/…` paths reconciled (57 rewritten
  to canonical post-v2 paths, existence-verified; 1 removed with reason). Live proof is reproducible:
  `npx tsx tools/specs-generator/spec-verdict.ts -Path .specs/spec-generator-v4` — now RED with exactly
  1× LINK_VALIDITY (`FILE_CHANGES_VERIFY` 9→0); on the pre-fix checkout (`7d1954c`) the same command
  reads RED with 10 ERROR naming all 9 stale paths.
- **conformance_check: 1557** (после P13-1; было 1256 на склеенном графе) = 1498 `UNTAGGED_SCENARIO` +
  54 `UNCOVERED_FR` + 2 `TASK_UNTESTED` + 3 `TASK_STATUS_UNVERIFIED`. Рост 11→54 / 1243→1498 — ВЕРИФИЦИРОВАН
  как newly-visible узлы после де-коллизии, НЕ повисшие рёбра: `grep -rnE "^\s*@(FR|AC|NFR)-" tests/features/`
  пуст (cross-root tested-by рёбер в корпусе нет — все `@featureN` там комментарии).
- **corpus specs-validator: 32 NOT_COVERED + 75 ORPHAN + 9 unconfirmed STOP.**
- **collision: ~470 FR nodes expected, 47 present** (bare-id collision — FR-36 fixes this GLOBALLY across all 47 specs).

### Done this leg (P14-1, 2026-06-05)
- `tools/specs-generator/spec-verdict.ts` — SEED of the authoritative verdict (FR-37a/e): exported
  `runSpecVerdict()` (P14-3 composes onto it, P14-4 skills import it) + CLI. validate-spec = pre-filter
  (pass NOT reportable as valid), ANY audit ERROR = hard gate with a per-class gap list; fail-loud on
  core errors (a `{error:…}` reply can't read as GREEN); explicit `SEMANTIC_SKIPPED` /
  `TRACEABILITY_PENDING` notes until P14-2/3 land.
- `specs-generator-core.mjs`: `SPECS_GENERATOR_ROOT` env override — verdict runs on fixture dirs and
  FOREIGN corpora (prereq for P14-5's general corpus-health skill).
- SPECGEN004_97 step defs (`tests/step_definitions/feature37_smart_verdict.ts`) — drive the REAL
  `runSpecVerdict()` on a temp fixture. Suite: 101 scenarios, 86 passed / 0 failed (undefined 12→11).

### Done this leg #3 (2026-06-06 — WSL-обвязка + P13-1 закрыт Docker-прогоном)
- **WSL-шим** в `scripts/docker-test.sh` (issue #49, commit `e2b5145`): машины без Docker Desktop
  гоняют полный сьют через docker внутри WSL — авто-re-exec с `--cd <Windows-путь>` (Linux-форма
  даёт ERROR_PATH_NOT_FOUND), WSLENV-проброс, guard от рекурсии; `.env.test` → `required:false`.
- **P13-1 ЗАКРЫТ clean-vs-clean**: HEAD 1746/14 vs baseline `4bf8d5c` 1740/12 — 11 падений общие
  (предсуществующие, вне graph), 3 multilang были моей регрессией (cross-root bare-ребро) → закрыты
  builder-резолюцией ОДНОЗНАЧНЫХ bare-рёбер (двусмысленные честно висят). Ноль новых регрессий.
- Issues: #49 (WSL-шим), #50 (хуки мертвы без Node — из carried-черновика).

### Done this leg #2 (P13-1, 2026-06-05 — code+local-verify; Docker pending)
- Composite keys live: `qualifySlice()` in `builder.ts` + the SAME qualification in `incremental.ts`
  (watcher patches can't re-insert bare ids). Edges / `Task.refs` / `AC.parentFr` qualified; anchors
  BARE (FR-36b, Marksman untouched); outside-`.specs/` files keep bare ids.
- `specOf()` → full dir path (`.specs/backlog/<name>/` were ONE cell → 60 residual collisions).
- Numbers: **FR 47 → 574**; raw pre-map **0 collisions** (reproducible:
  `node --import tsx tools/spec-graph/collision-probe.ts`, exit 0 ⇔ clean); build 277-305ms (≤2s
  budget); cucumber **0 failed / 89 passed** (+3: _07 real linkage, _08, _62); vitest spec-graph +
  spec-mcp-server **180/180**. Leak fixed: get_trace(v4:FR-36) больше не тянет pomogator-doctor AC-36.
- **NOT closed:** full clean-HEAD Docker suite — этой машине docker недоступен; подтвердить на CI/другой
  машине, потом закрыть P13-1 чекбокс.

### Done this leg #4 (2026-06-06 — PHASE 13 ЗАКРЫТА ЦЕЛИКОМ, P13-1..4)
- **P13-2** `37cf617`: квалификация переехала В ПАРСЕРЫ (`coverage.ts::qualifySlice`); `@featureN`
  стал РЕАЛЬНЫМИ tested-by рёбрами (+268; в Scenario-узлы 0→164); tag-scan костыль удалён из
  get_trace с поведенческим доказательством (теги стёрты → сценарии всё равно приходят).
  Docker clean-worktree: ровно те же 12 предсуществующих, ноль новых.
- **P13-3** `19db813`: `resolveNodeRef()` — тулзы принимают `slug:FR-2` / `{spec, node_id}` / bare
  (unique → soft-resolve; коллизия → `AMBIGUOUS_BARE_ID` + кандидаты, live: `FR-2` → 49);
  `server.bundle.mjs` пересобран, freshness green.
- **P13-4**: skills (`spec-graph-query` таблица трёх форм, `spec-mcp-dogfood` resolved-блок)
  обновлены; dogfood-сэмплер предпочитает FR с tested-by ребром → **13/13 тулзов LIVE** (впервые);
  архив `audit-reports/fr36-dogfood-before-after.md`; SPECGEN004_95 step defs гоняют реальный
  collision-probe. BDD: 0 failed / 94 passed (undefined 12→6 за фазу).

### Next steps, in order
2. **Phase 14 P14-2/3/4** — traceability-completeness check; make the smart verdict authoritative
   (compose conformance + get_coverage + FR-8 semantic onto `runSpecVerdict()`); skill guard
   (`spec-status`/dogfood/triage may not print "valid" off validate-spec) + a `.claude/rules/` guard.
3. **Phase 14 P14-5** — the reusable GENERAL corpus-health skill (find collisions + broken edges +
   untraced atoms for ANY corpus), DEBUGGED with a live run as evidence. (User ask 2026-06-05.)
4. **Older verification debt** (pre-existing, see `final-verification` task): FR-1 AC-link P0,
   FR-20/21/24 tests, jscpd dedup, `/simplify`, CHANGELOG. Plan entry: `~/.claude/plans/fizzy-percolating-turing.md` (Wave W1).

## Open decisions (RECORDED, not yet answered — per user "пока не отвечай")
1. **Push cadence:** push each spec commit immediately vs batch. → resolved this turn: PUSH NOW.
2. **PR #32 shape:** it is a 622-file monster ("20 batches, 9 workflows, 48 artifacts"). Merge as-is
   vs split? Undecided — needs a call before any merge.

## How to resume (commands)
```bash
git fetch && git switch feat/phase-2a-mcp-server-and-hooks && git pull
# re-measure the debt (the smart verdict, the right way — handlers are async + MCP-enveloped):
node --import tsx tools/spec-mcp-server/dogfood-dataset.ts > dataset.json   # 13 tools on the real graph
npx tsx tools/specs-generator/audit-spec.ts -Path .specs/spec-generator-v4 # the 10 P0
npx tsx tools/specs-generator/validate-spec.ts -Path .specs/spec-generator-v4 # structural pre-filter only
node --import tsx node_modules/@cucumber/cucumber/bin/cucumber.js           # BDD (non-strict, exit 0)
```
**Gotchas when driving the MCP tools in a script:** the handlers are ASYNC and return the MCP envelope
`{content:[{type:'text', text: JSON}]}` — `await` then `JSON.parse(r.content[0].text)`, or you read an
unresolved Promise and see false zeros. `get_trace` links a Task to an FR only if the task's
`_Requirements:` cites the BARE `[FR-N]` (sub-ids like `[FR-36a]` alone don't link).

## Pointers
- Spec: `.specs/spec-generator-v4/` (FR / ACCEPTANCE_CRITERIA / spec-generator-v4.feature / NFR / USER_STORIES / TASKS / DESIGN).
- Reports: `audit-reports/{unified-spec-graph-design, spec-mcp-dogfood-dataset, v4-smart-verdict-and-organism-traceability}.md`.
- Memory (user home, not in repo): `feedback_never-report-valid-off-structural-check`, `feedback_verify-regressions-on-clean-checkout`.
