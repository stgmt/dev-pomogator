# WP-1 Evidence/Status Foundation — Root-Cause Map (READ-ONLY)

**Date:** 2026-07-23 · **Branch:** `fix/spec-v4-evidence-foundation` · **HEAD:** `5e4dc4a0` (= main)
**Scope:** the `spec-generator-v4` false-green — effective coverage **526 stale / 0 passed** while MCP readiness lane **EXECUTION=GREEN**, `hint`/`next_action` claim "All 526 passed", canonical coverage shows 526 passed — plus the **526/518** duplicate-key inventory split, **AC-id truncation**, `test_paths=[]`, `git_sha=null`, and the **WSL-blind Docker blocker**.
**Method:** 5 parallel read-only code traces + direct data verification (`.dev-pomogator/.test-history/`, `.task-census.json`, bundle vs source comparison).

---

## 0. TL;DR — three independent false-green generators, not one

| # | Generator | Where | State in source | State in production |
|---|-----------|-------|-----------------|---------------------|
| G1 | **Stale shipped bundle** — live MCP runs `server.bundle.mjs` built **2026-07-23 01:15**, ~15.5h before the honesty fixes landed in source (16:52–16:55). Bundle has 0 matches for the stale-aware `classifyEvidence` | `.mcp.json:8`, `tools/spec-mcp-server/server.bundle.mjs` | — | **EXECUTION lane GREEN** (old logic: canonical short-circuits before stale) |
| G2 | **`stale:false` force-strip** in the canonical coverage projection → `canonicalStatusCoverage.totals.stale==0` → `lifecycle=GREEN` → `hint: "All 526 touched scenario(s) passed at <ts>"` | `tools/spec-mcp-server/tools.ts:1408-1414` (strip), `:1440-1445` (lifecycle), `:1485/:1535` (hint) | **still false-green in source** | false-green |
| G3 | **Stale-blind `summary`** counts `canonicalResult==='PASSED'` without any staleness check → `summary.passed=526` feeds `last_run.summary`, RED/PARTIAL/GREEN hint text | `tools/spec-mcp-server/tools.ts:1392-1401` | **still false-green in source** | false-green |

**Already honest in source (PR #158) — only unreachable in prod because of G1:**
- `classifyEvidence` — stale canonical PASS → `outcome:'stale'`, explicitly "debt, not GREEN" (`tools/spec-graph/readiness-inventory.ts:141-154`, esp. `:146-147`)
- `deriveExecutionLane` — any outcome ≠ PASSED/not_recorded → debt → RED (`readiness-inventory.ts:544-563`)
- `evaluateReadiness` — AND over mandatory lanes, unevaluated lane blocks like red (FR-63) (`:584-613`)
- `buildReadinessInventory` dedup — Map keyed by `scenarioKey` → **518** honest count; duplicates surfaced in `duplicates[]` (`:319-333`, `:373-381`, `:456`)
- spec-verdict consumes the same inventory (`tools/specs-generator/spec-verdict.ts:440`, prints "scenario (deduplicated)" `:795`, "duplicate candidates deduplicated" `:798`)
- MCP `readiness.overall=NOT_READY` is honest (`tools.ts:1526-1532`); `inventory` field is the deduplicated one (`tools.ts:1510-1514`)

**Net:** once the bundle is rebuilt from current source, EXECUTION lane goes RED (honest); G2+G3 keep the `lifecycle`/`hint`/`canonical_coverage`/`execution_gaps` lying until `tools.ts` is fixed. WP-1 = fix G2+G3 in source + the 526/518 root + the two precheck producers + the WSL blocker + rebuild/reload the bundle + regression BDD.

---

## 1. False-green G1 — stale runtime bundle

[cmd:`stat -c %y` → bundle `2026-07-23 01:15:38`, `tools.ts` `16:55:13`, `readiness-inventory.ts` `16:52:20`]
[cmd:`grep -c "debt, not GREEN" server.bundle.mjs` → **0**; `grep -c "stale && s.canonicalResult"` → **0**; `canonicalStatusScenarios` present at bundle `:52899`]
[ref:`.mcp.json:8` — launcher spawns `tools/spec-mcp-server/server.bundle.mjs` via `CLAUDE_PLUGIN_ROOT||cwd`, never tsx source]
[ref:`package.json:45` — `build:mcp` = esbuild `server.ts → server.bundle.mjs`]

- Live MCP behavior observed today (EXECUTION GREEN / 526 passed / NOT_READY only via TASK_TRUTH) is the **pre-#158 logic** running from the bundle.
- Same class as #160 "stale-runtime": source fixed, shipped artifact not rebuilt. Any WP-1 code change is invisible to users until `npm run build:mcp` + plugin reload.

## 2. False-green G2 — canonical projection strips staleness

[ref:`tools/spec-mcp-server/tools.ts:1407-1414`]

```ts
const statusCoverage = computeCoverage(statusTasks, statusScenarios, readVerdicts(repoRoot)); // effective: 526 stale
const canonicalStatusScenarios = statusScenarios.map((scenario) => ({
  ...scenario,
  result: scenario.canonicalResult,
  stale: false,                       // ← staleness UNCONDITIONALLY erased
  source: scenario.canonicalResult ? 'canonical-full-run' : undefined,
}));
const canonicalStatusCoverage = computeCoverage(statusTasks, canonicalStatusScenarios, readVerdicts(repoRoot)); // 526 passed / 0 stale
```

- [ref:`tools.ts:1440-1445`] lifecycle: PARTIAL requires `canonicalStatusCoverage.totals.stale > 0` — **structurally unreachable** because of `:1411` ⇒ falls through to `GREEN`.
- [ref:`tools.ts:1485` + `:1535`] `hint: hints[GREEN]` = `` `All ${summary.touched} touched scenario(s) passed at ${lastAt}.` `` — the "all 526 passed" message.
- [ref:`tools.ts:1415`] `statusExecutionGaps = executionGaps(slug, canonicalStatusScenarios, …)` — `execution_gaps` (`:1517`) inherits the strip too.
- [ref:`tools.ts:1429-1431`] `taskTruthDebt` + `executionHardCount` also read the stripped projection (`executionHardCount` sums `.stale` — always 0).
- Response emits BOTH coverages side by side (`:1518-1525`) — `coverage.totals` (effective, honest) vs `canonical_coverage.totals` (stripped, lying) — nothing reconciles them.

**Minimal source fix (G2):** stop erasing — `stale: scenario.stale ?? scenario.resultStale ?? false` (pass-through) at `:1411`. Then `canonical_coverage.totals.stale=526` ⇒ lifecycle `PARTIAL` ⇒ hint `:1482-1483` "526 stale passed scenario(s) need rerun after source changes; NOT execution-complete." Canonical remains separately surfaced via `provenance:'canonical-full-run'` + `recency.canonical` + `baseline.canonical_timestamp` (`readiness-inventory.ts:149-152`, `:426-433`).

## 3. False-green G3 — stale-blind `summary`

[ref:`tools/spec-mcp-server/tools.ts:1392-1401`]

```ts
if (!s.canonicalResult) continue;
summary.touched++;
const r = s.canonicalResult.toUpperCase();
if (r === 'PASSED') summary.passed++;   // no staleness check
```

- `summary.passed=526` drives `last_run.summary` (`:1503-1506` area) and the RED/GREEN hint text.
- **Fix:** split `passed` into `passed_fresh`/`passed_stale` (or `summary.stale++` when the scenario's effective stale flag is set) and make the GREEN hint require `summary.stale===0`.

## 4. 526-vs-518 — the root is 8 source id-collisions, invisible to corpus-health

[ref:`.specs/spec-generator-v4/spec-generator-v4.feature`] — all 8 duplicated ids are in ONE file, each labeling two **different-titled** scenarios (genuine id reuse):

| id | lines | id | lines |
|----|-------|----|-------|
| SPECGEN004_471 | 2920, 3235 | SPECGEN004_531 | 252, 1531 |
| SPECGEN004_472 | 2927, 3248 | SPECGEN004_532 | 260, 1537 |
| SPECGEN004_480 | 1405, 2936 | SPECGEN004_553 | 1006, 3491 |
| SPECGEN004_507 | 3241, 3304 | SPECGEN004_560 | 1012, 3541 |

- [ref:`tools/spec-graph/parsers/gherkin.ts:135-139`] node id = `SCEN-${slugifyName(title)}`; `seenIds` disambiguates **identical titles only** (`-2` suffix). Different titles → distinct node ids.
- [ref:`tools/spec-graph/builder.ts:143-150`] `mergeNode` dedups + records `rawCollision` **by node.id only** ⇒ the 8 pairs survive as separate nodes, no collision recorded.
- [ref:`tools/spec-graph/corpus-health.ts:86-90,143,183`] reads `graph.rawCollisions` ⇒ **blind** to scenarioKey-level duplicates (collision identity ≠ dedup identity). `hardRed = collisions.length>0 || stale>0` never fires for these.
- [ref:`tools/spec-graph/coverage.ts:140-147`] `scenarioKey` re-extracts canonical `specgen004_NNN` (normalizes `[_-]`); [ref:`readiness-inventory.ts:319-333`] bundles Map keyed by it ⇒ **518** (honest unique count; the 8 surface in `duplicates[]`, `:373-381`).
- The raw 526 comes from counting graph scenario nodes (both title-distinct copies survive the builder).

[cmd:latest canonical full run `run-1784757849073-full.ndjson` → **492 distinct** `SPECGEN004_` names vs 518 unique / 526 raw in current source — source grew after the run; file-mtime staleness then invalidates the whole file (see §6)]

**Canonical fix (two-layer):**
1. **Source:** renumber the 8 pairs to unique ids (spec edit via MCP door; CRLF file ⇒ single-line `apply_spec_change` ops).
2. **Engine:** builder/parser registers `rawCollision` keyed on `scenarioKey` (not only node.id) ⇒ corpus-health goes RED on any future reuse; inventory-time dedup stays as read-side safety net.

## 5. precheck producers (`.agents` + `.claude` dual copies — importers use `.claude`)

[ref:`.agents/skills/spec-status/scripts/ac-claims.ts:25` (identical in `.claude` copy)]

```ts
const re = /^##+\s*(AC-\d+)\s*(?:\((FR-\d+)\))?/gm;   // \d+ stops at the dot ⇒ AC-1.1 → AC-1
```

- Fix: `(AC-\d+(?:\.\d+)+|AC-\d+)` and `(FR-\d+(?:\.\d+)*)` — dotted alternative first.
- [ref:`precheck.ts:65-70`] test-path whitelist `\.(test\.[tj]sx?|feature)` only — spec-generator-v4 FILE_CHANGES lists 23 plain `.ts` (step-defs/hooks/fixtures), 0 `.test.ts` ⇒ `test_paths=[]`. Fix: accept `tests/(step_definitions|e2e|features|hooks)/**/*.ts`, keep `existsSync` gate.
- [ref:`precheck.ts:157` + `:89`] `buildContextBundle(slug, specPath, testPaths)` — 4th arg `opts={gitSha?}` **never passed**; no `spawnSync('git',…)` exists anywhere in the file. `git_sha: opts.gitSha ?? null` is a permanently dead field. Fix: `git rev-parse HEAD` at `repoRoot`, pass `{ gitSha }`.
- Importers of the `.claude` copy: `tests/step_definitions/feature_hscmd_spec_status.ts:23`, `feature63_precheck_inventory.ts:30`, `feature62_root_resolution.ts:11`, `tools/spec-graph/readiness-inventory.ts`. `.agents` SKILL.md:45 invokes a stale `.Codex/...` path — fix both copies or unify.

## 6. env-blockers — host `docker ps`, zero WSL awareness

[ref:`.agents/skills/spec-status/scripts/env-blockers.ts:19-32`]

```ts
r = spawnSync(dockerCmd, ['ps'], { encoding: 'utf-8', timeout: 5000 });
if (r.error || r.status !== 0) return { kind: 'docker-unreachable', … };
```

- Unconditional blocker via `collectBlockers` (`:43-52`). On Docker-Desktop-less Windows it ALWAYS fires, though the repo's BDD route is WSL-only (`scripts/_docker-wsl.sh`, `tests/setup/ensure-docker.ts`).
- **Reusable WSL patterns already in repo:** `scripts/_docker-wsl.sh:22-31` (`command -v wsl.exe && wsl.exe -e bash -lc "docker info"`), `scripts/docker-test.sh:25-34` (host-down → WSL fallback), `tools/spec-mcp-server/lock-manager.ts:61-71` (`detectEnvironment()` via `WSL_DISTRO_NAME` + `microsoft` kernel check).
- Fix: win32 + host docker down ⇒ probe WSL route; OK ⇒ `null` (non-blocker, note `via:'wsl'`); no route ⇒ blocker as today.

## 7. Staleness granularity — why ALL 526 flip at once

[ref:`tools/spec-graph/parsers/scenario-overlay.ts:280`] `scenario.resultStale = threshold !== undefined && row.timeMs < threshold`
[ref:`scenario-overlay.ts:~219-255`] `freshnessThresholdMs` = **max(mtime of source `.feature`, mtime of mapped step-def file)**
[ref:`tools/spec-graph/incremental.ts:273-275`] any feature edit → `refreshResultFiles` re-applies overlays

- Granularity is **file-mtime, not content-hash/line** ⇒ one line-edit to `spec-generator-v4.feature` bumps the single mtime above every scenario's `row.timeMs` ⇒ all 526 stale together. (`stale-marker-scan.ts` is a different mechanism — in-progress tasks; not involved.)
- This is by design of the overlay; WP-1 does not need to change granularity, but regression BDD must pin the semantics ("stale canonical ⇒ debt, not GREEN") at whatever granularity.

## 8. SHA provenance gap — evidence is commit-unbound everywhere

[cmd:`.dev-pomogator/.test-history/index.ndjson` entries = `{ts, epoch, kind, scenarios, durationMs, exit, file}` — **no SHA field**; `grep -o '"[a-zA-Z_]*[Ss]ha…"'` → 0 matches]
[ref:`tools/spec-graph/spec-status-store.ts:15-16,25,38` — stores only `'active'|'backlog'`; no SHA, no run timestamp]
[ref:`tools/spec-mcp-server/tools.ts:1322/1412` — `runSha` is a hardcoded sentinel `'canonical-full-run'`]
[ref:`tools/spec-graph/release-inventory.ts:53,63,143,147` — `baseline_sha` exists but is **caller-supplied string-equality** validation (`INSTALLED_RUNTIME_PROVENANCE_INVALID`), never computes a git SHA]
[ref:`tools/spec-graph/root-resolution.ts` / `.mjs` — no git/SHA/spawnSync at all]
[cmd:precedent for `git rev-parse` exists: `tools/auto-commit/auto_commit_core.ts:403`, `tools/_shared/hook-runtime.sh:39`]

- "Stale" today rides entirely on the mtime boolean (§7); there is no run-SHA ↔ HEAD comparison. WP-1's "attach evidence to the resolved commit SHA" = (a) precheck binds `git_sha` (§5), (b) durable option: write `git rev-parse HEAD` into the run index at suite time and compare in `get_spec_status`.

## 9. BDD surface — where WP-1 regression lives

- Canonical SPECGEN004 source: `.specs/spec-generator-v4/spec-generator-v4.feature` (cucumber.json default `paths[0]`; **no** `tests/features/plugins/spec-generator-v4.feature`). `SPECGEN004_565` at `:3574`, driven by `tests/step_definitions/feature65_acceptance_task_coverage.ts` (Given:34 / When:44 / Then:138-161).
- Real-engine steps already exist (no mocks): `feature63_precheck_inventory.ts` (FR-63 lanes; `buildGraphFromCwd`:292, `runSpecVerdict`:27, "filtered proof cannot replace canonical full-run execution evidence":532, "FR-61 readiness taxonomy evaluates":645), `feature32_coverage.ts` (`computeCoverage`:23/210/220), `feature37_smart_verdict.ts` (:399/440/694), `feature64_release_inventory.ts` (:80-216).
- TASKS.md Phases 34–37 **all Status: TODO**: P34 = FR-61 (unified readiness UX, task-DONE truth guard, BDD/API regressions), P35 = FR-62 (cross-host root), P36 = FR-63 (graph/evidence agreement, mandatory lanes), P37 = FR-64 (all-unit release gate). WP-1 is the engine substrate for P34/P36.
- Profiles: default + docker exclude `@wip @manual @windows-only @e2e` — new scenarios must avoid all four (memory: `@windows-only` silently orphans scenarios from every run).
- **Placement:** new scenario in `.specs/spec-generator-v4/spec-generator-v4.feature` under `@feature63` (stale canonical ⇒ EXECUTION≠GREEN / next_action must say "rerun"), steps in `feature63_precheck_inventory.ts` reusing `buildGraphFromCwd` + fixture with bumped mtime; next free slug id after 565; verify `lastResult===PASSED` by slug in the Docker run, not by absence from fail-list.

## 10. Side findings (adjacent, not WP-1 scope)

1. **11,620 orphaned `.dev-pomogator/.task-census.json.*.tmp`** files (~45MB of the 6.9GB data dir) — atomic-write temp leak on Windows (rename contention/killed procs). Hygiene cleanup + a sweep on write. [cmd:`ls .dev-pomogator/ | grep -c "task-census.json.*tmp"` → 11620]
2. **Latest two canonical full runs `exit:1`** (1838 corpus scenarios, 2026-07-22 21:43/22:04) — corpus-level failures elsewhere (30 FAILED / 41 SKIPPED / 6 UNDEFINED across corpus); v4 subset green within them. Canonical "526 passed" is assembled across runs/overlay (492 distinct ids in the latest run vs 518 current) — `canonical_coverage` should expose per-scenario provenance/run-id, not a flat total. [cmd:`index.ndjson` tail]
3. `FILTERED_PROOF` lane is `blocking: false` (`tools.ts:1468-1472`) — intentional, but combined with stale canonical it flatters the surface.
4. `.agents` SKILL.md:45 stale `.Codex/...` invocation path (precheck dual-copy drift).

---

## 11. Recommended minimal coherent WP-1 patch (ordered)

1. **`tools/spec-mcp-server/tools.ts`** — (a) `:1411` pass-through staleness instead of `false`; (b) `:1392-1401` add `summary.stale` for stale canonical passes, GREEN hint requires `stale===0`; (c) `:1482-1483` PARTIAL hint then fires automatically. Single source of truth remains the shared `inventory` (`:1514`).
2. **`tools/spec-graph/parsers/gherkin.ts` + `builder.ts`** — record `rawCollision` on duplicate `scenarioKey` (not only node.id) ⇒ corpus-health RED on reuse.
3. **`.specs/spec-generator-v4/spec-generator-v4.feature`** — renumber the 8 colliding ids (§4 table), via MCP door, single-line ops (CRLF).
4. **precheck (`.claude` copy first, then `.agents`)** — dotted AC/FR regex; BDD-layout test paths; `git rev-parse HEAD` → `gitSha`.
5. **env-blockers (both copies)** — WSL-aware docker probe (§6 patterns).
6. **BDD** — `@feature63` regression: stale canonical ⇒ lifecycle≠GREEN + hint says rerun; duplicate scenarioKey ⇒ corpus-health RED; precheck dotted-AC + git_sha + WSL-blocker scenarios. No `@windows-only`.
7. **`npm run build:mcp`** — rebuild `server.bundle.mjs` (G1!) and verify the running MCP reloads; without this, items 1–2 are invisible in production.
8. **Docker reconcile** — `/run-tests --name SPECGEN004` (or `--tags @feature63`); confirm new slugs `lastResult===PASSED` by id; re-run `get_spec_status(spec-generator-v4)` and confirm: `lifecycle=PARTIAL`, `hint` mentions 526 stale, `readiness.lanes.EXECUTION=RED` with `526 stale` debt, inventory count 518 (+8 duplicates listed), `coverage`/`canonical_coverage` both show stale.

**Risks/gotchas:** CRLF feature file (multi-line `apply_spec_change` fails LF-match); `@windows-only` orphaning; filtered `docker-bdd` exits 0 on fail — verify by slug id; bundle/source drift is the #1 reason fixes "don't work" (#160 class); two precheck copies must not diverge again.
