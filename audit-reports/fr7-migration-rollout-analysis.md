# FR-7 Marksman Native-LSP — Migration & Rollout Analysis

> Synthesis of 4 worker reviews (FR-7 impl, test strength, rollout/dogfood, skills/plugin) for spec `.specs/spec-generator-v4` FR-7. All claims below are file:line-cited; the synthesis agent independently re-confirmed the load-bearing facts (`plugin.json:27`, `.mcp.json:8`, templates, migrated-spec count, `resolve-binary.ts:11`, `marksman-hashes.json` win32).

## 1. Executive Summary

The FR-7 native-LSP implementation is **solid and honest**: the launcher's stdio pipe-forwarding is correct and rationale-backed (`launch-marksman.cjs:106-121`), auto-install is non-blocking/idempotent (`ensure-marksman.ts:27-48`), the no-JS-fallback policy is honored (`launch-marksman.cjs:91-102`), the retired bridge tool `md_references` is confirmed-absent from the registry by an exact-set invariant (`tools.test.ts:75-95`), and hop-1 (`initialize`) is exercised against a **real** Marksman binary in Docker with a hard-fail-on-silent-skip guard (`Dockerfile.test:28-36`, `lsp-probe.ts:41-44`). All five Marksman slug claims were **empirically re-verified against the real binary** by two independent reviewers — including the two forms the migration actually ships (cross-file `#fr-1`, dot-dropped `#ac-11`) — so the migration is safe to proceed. **The biggest risk is not the migration that happened, but the generators and validator that did NOT change with it**: the three scaffold templates still emit the old colon form with non-resolvable anchors (`FR.md.template:3`), and ~8 colon-bound regexes in `specs-generator-core.mjs` silently false-warn on short-form ACs (measured: 7 false "no AC" warnings vs 85 real ACs in the one migrated spec). **Recommended next move:** do NOT mass-migrate the other 47 specs yet — first land the durable, form-agnostic win (a real-binary `definition`-at-link-position link-integrity test) plus a golden slug fixture, fix the validator's colon-bias and the two P0 packaging gaps (`.mcp.json` path resolution, `lspServers` shape), and only then decide the heading-form fork (Worker 3 favors reverting the single lossy spec; the task specifies forward migration — present as a decision, not a fait accompli).

## 2. Review Verdicts

| Dimension | Verdict | Top finding |
|---|---|---|
| FR-7 native-LSP impl (launcher, auto-install, no-fallback, retirement) | **solid** | Bridge/`md_references` genuinely retired (confirmed-absent via exact-set registry invariant `tools.test.ts:75-95`); stdio pipe-forwarding correct & rationale-backed |
| Migration soundness (triple-axis slug consistency on the migrated spec) | **solid-with-gaps** | Parser + validator + Marksman agree (0 broken-link findings on real corpus); but UC short form unparsed, citation/TBD phantom FRs pollute |
| Test strength (does the suite guard the migration?) | **needs-work** | E2e proves capability *advertisement* (`initialize` flags), never capability *behaviour* — no `textDocument/definition` at a link position; the slug-resolution claims all 45 specs depend on are untested |
| Rollout readiness (scaling to 47 specs) | **needs-work** | Headline flipped under measurement: the 47 un-migrated long-form specs are **already Marksman-resolvable** (1365 `#ac-N-fr-K` links resolve); short form is *lossy* for the LSP outline — nothing forces forward migration |
| Skills coverage (create-spec, migrate-spec, markdown-lsp) | **needs-work** | Validator false-warns on short-form specs; templates drift to colon form; no `migrate-spec` skill exists; markdown-lsp omits 3 measured slug traps |
| Plugin/packaging coherence (install → navigate) | **at-risk** | `.mcp.json` uses a bare relative path with no `CLAUDE_PLUGIN_ROOT`/bootstrap → spec MCP server won't load for marketplace-installed users (invisible in dogfood where cwd == plugin root) |

## 3. Critical & High Findings (deduped)

### CRITICAL

**C1 — `.mcp.json` relative path → spec MCP server silently won't load for installed users.** *(Worker 4 B1, P0)*
`.mcp.json:8` launches `tools/spec-mcp-server/server.ts` as a bare relative path with `--import tsx`, no `${CLAUDE_PLUGIN_ROOT}` prefix and none of the `bootstrap.cjs` multi-strategy fallback the hooks and `.lsp.json` use. For a marketplace install the plugin lives in a cache dir, not the user's project; if the harness launches plugin MCP servers with `cwd=project`, the path resolves to a nonexistent file → MCP server never loads. Invisible in dogfooding because here `cwd == plugin root`. This is the textbook `dead-integration-guard` failure (installed ≠ integrated).
- **Evidence:** `.mcp.json:8` (bare path) vs `.lsp.json:4` (`${CLAUDE_PLUGIN_ROOT}/...`), `hooks.json` (all hooks use `process.env.CLAUDE_PLUGIN_ROOT` + `bootstrap.cjs`). *Confirmed independently by synthesis: `.mcp.json:8` has no `CLAUDE_PLUGIN_ROOT`; `.lsp.json:4` does.*
- **Recommendation:** Route `.mcp.json` through the same `CLAUDE_PLUGIN_ROOT` + bootstrap launcher pattern as `.lsp.json`/hooks. Effort M.

### HIGH

**H1 — Scaffold templates bake the OLD colon form + non-resolvable anchors → every new spec is born violating FR-7c.** *(Worker 1 finding #1 "CRITICAL for at-scale"; Worker 4 A2; agreement across reviewers)*
The migration fixed `.specs/spec-generator-v4/` but not the generators. New specs get `## FR-1: {Название}` and links like `#ac-1-fr-1` / `#fr-1-{название}` — long composite anchors that Marksman does NOT resolve to an H2 (only the heading's own full slug or bare id resolves). FR-7c's whole point — and `dead-integration-guard` — is that "picking a form that does NOT resolve is forbidden."
- **Evidence:** `tools/specs-generator/templates/FR.md.template:3` (`## FR-1: {Название}`), `ACCEPTANCE_CRITERIA.md.template:3,5` (`## AC-1 (FR-1)` + `[FR-1](FR.md#fr-1-{название})`), `USE_CASES.md.template:3`. *Synthesis confirmed templates emit colon form with long anchors.*
- **Recommendation:** Decide the heading-form fork first (see §4), then make the templates emit whichever form wins. If short form wins, **fix the validator regexes (H2) before flipping templates** — otherwise every new spec audits vacuously. Add a fixture test asserting a freshly-scaffolded spec's links resolve via `toAnchorSlug`. Effort S–L.

**H2 — Validator (`specs-generator-core.mjs`) is colon-biased → silently false-warns on short-form specs.** *(Worker 4 A1, P1; Worker 3 §"per-spec verify gate" step 3 FR_AC_COVERAGE gap)*
The structural gate accepts both forms (`core.mjs:948-956`), but ~8 downstream checks hard-match `## FR-N:` / `## AC-N (FR-K)`. Measured: `audit-spec.ts -Path .specs/spec-generator-v4` exits 0 but emits **7 false "FR-N has no matching Acceptance Criteria" warnings** while that spec has **85 real `## AC-N.M` headings** — coverage is computed against zero ACs. All delegating skills (requirements-chk-matrix, cross-spec-reconcile, spec-reality-check) inherit this false coverage transitively.
- **Evidence:** `core.mjs:1124` (`/^##\s+FR-\d+:/i`), `core.mjs:1771` FR_AC_COVERAGE regex `## AC-\d+\s*\(FR-(\d+)\)`, plus `matchAll(/## FR-(\d+):/g)` at `1857,1878,1901,2045,2063,2082,2270,2318,2384,2704`; audit run EXIT=0 + 7 false warns.
- **Recommendation:** Mirror `md.ts`'s dual-form matching in the ~8 colon-bound regexes. This is a prerequisite for both forward migration AND for H1's template flip. Effort L.

**H3 — The migration's actual cross-file link form was never in the measured set or any test.** *(Worker 2 B1; Worker 3 "headline flipped"; the one place reviewers initially diverge — see Conflicts)*
Every FR-7c/AC-7.5 example *measured in the spec* is same-file FR (`[x](#fr-7)`) or **wiki** cross-file (`[[doc#FR-1]]`) — but FR-7c:99 says the migration uses markdown links, not wiki-links. The forms all 45 specs actually depend on — cross-file markdown `[FR-1](FR.md#fr-1)` and dot-dropped `[AC-1.1](…#ac-11)` — appeared in **no measured example and no test**. Worker 2 drove the **real binary** and confirmed both resolve, so the as-shipped risk is **retired empirically** — but the spec records zero durable evidence, and the test suite cannot catch a future Marksman version regressing the slug rule.
- **Evidence:** `ACCEPTANCE_CRITERIA.md:94` (`[FR-1](FR.md#fr-1)`), `FR.md:11` (`#ac-11`), `FR-7c:99-105`; Worker 2 real-binary probe: `[FR-1](FR.md#fr-1)` → `FR.md:3` ✓, `[AC](…#ac-11)` → `ACCEPTANCE_CRITERIA.md:3` ✓; Worker 3 confirms the same against `## AC-N.M`.
- **Recommendation:** Convert the manual proof into a real-binary `definition`-at-link-position e2e (§5 P0/P3) with fixtures (b)+(c); update AC-7.5's "MEASURED" list to include cross-file-markdown + dot-dropped-AC forms. Effort M (test) + S (spec wording).

**H4 — `lspServers` is a bare string while all siblings are arrays; the guard test that exists for this exact gotcha doesn't cover it.** *(Worker 4 B3, P1)*
`plugin.json:27` has `"lspServers": "./.lsp.json"` (string), while `skills`/`commands`/`hooks`/`mcpServers` are arrays. The `verify-plugin-install` skill exists *specifically* to catch the "bare string → Zod `Invalid input`" gotcha (`verify-plugin-install/SKILL.md:35-46`) but enumerates only the original four fields, and `canonical-plugin.test.ts` has **zero** `lspServers` assertions. If Claude Code's schema rejects a string, LSP silently fails to register for users.
- **Evidence:** `plugin.json:27`; `canonical-plugin.test.ts` (no `lspServers` match). *Synthesis confirmed `plugin.json:27` is a bare string.*
- **Recommendation:** Verify against the Anthropic plugin schema; make `lspServers` an array `["./.lsp.json"]` if siblings match, and add an `lspServers`-shape assertion to `canonical-plugin.test.ts` + the skill's field list. Effort S.

**H5 — Nothing proves the MCP server or LSP tool actually *responds* after install.** *(Worker 4 B2, P0/P1)*
`verify-plugin-install/SKILL.md:61,85-86` sets the e2e PASS bar at "install rc=0 + skills listed + no MODULE_NOT_FOUND." It never probes the spec MCP server (`get_coverage`/`get_trace` responding) or LSP activation. So both C1 and the LSP hop-2 ship unverified.
- **Evidence:** `verify-plugin-install/SKILL.md:61,85-86`.
- **Recommendation:** Extend the Docker e2e to assert the spec MCP server answers `get_coverage` and the `LSP` tool is active (reuse `lsp-probe.ts` for the latter). Silent-skip in Docker = FAIL. Effort M.

### MEDIUM (carried for completeness)

- **M1 — `## UC-N` short form has no parser support → UC nodes silently dropped from the graph.** `md.ts:51-62` has no UC regex; `USE_CASES.md:3` migrated to `## UC-1` produces zero nodes. No broken-link error (so audit is green), but SpecGraph loses UseCase traceability. May be intentional Phase-1 scope (`md.ts:28`) — **confirm intent**. *(Worker 1 #2)*
- **M2 — Phantom FR nodes from citation/`[TBD title]` pollution.** Real parser run on `spec-generator-v4/FR.md` → 42 FR nodes (33 real + 9 phantom: `FR-001, FR-999, …` from `FR.md:583-700`). **Pre-existing, NOT migration-caused** (git `aada0cf` shows they were phantom under the colon parser too); pollutes coverage %, the FR-32 honesty gate, `get_trace`. Corpus-wide: 4 specs (`answer-simple, install-diagnostics, spec-generator-v4, spec-workflow-vmodel`). *(Worker 1 #3)*
- **M3 — `marksman-hashes.json` has no `win32 arm64` → managed install aborts for Windows-ARM users.** `marksman-hashes.json` win32 block is x64-only; per FR-27 install aborts on missing hash. *(Worker 4 B4)* *Synthesis confirmed win32 block has only x64.*

### LOW (notable)

- **L1 — AC-7.3 "proven end-to-end" hop-2 claim has no durable artifact.** `ACCEPTANCE_CRITERIA.md:96` asserts a `claude -p` session "matched ground-truth exactly" but no transcript is committed; per `verify-against-real-artifact` either commit the transcript or downgrade to "spot-checked, not retained." *(Worker 1 #4)*
- **L2 — `resolve-binary.ts:11` header comment still claims js-fallback**, contradicting FR-7a (code is correct, comment lies). *Synthesis confirmed `resolve-binary.ts:11` says "caller uses the graph-backed js-fallback."* *(Worker 1 #6)*
- **L3 — Stale validator docs + prose examples teach old colon form** (`validation-rules.md:9` doc-only; `phase2_…:133`, `jira-mode.md:103`). *(Worker 1 #5)*
- **L4 — AC-7.5 not back-referenced from FR-7's related-AC line** (`FR.md:111` lists only 7.1–7.4). *(Worker 1 #7)*
- **L5 — Marksman version pinned in 2 places** (`marksman-hashes.json:3`, `Dockerfile.test:28`) — matched now, but dedupe to prevent desync. *(Worker 4 B5)*

## 4. All-Specs Rollout Plan

### The decision fork (Worker 3 — present, don't refuse)
Measurement flipped the premise: the 47 un-migrated long-form specs are **already Marksman-resolvable** (1365 `#ac-N-fr-K` + 2667 `#fr-N-title` links all resolve; `toAnchorSlug` is byte-identical to Marksman's GitHub-style slug). The short form is **lossy** for the LSP outline (`documentSymbol` shows bare `FR-7` instead of `FR-7: Title`).
- **Option A — migrate 47 forward to short headings** (task-specified). ~1100 headings + ~4440 links rewritten; parser stays permanently dual-form; outline degrades.
- **Option B — revert the 1 migrated spec back to long form.** Smallest blast radius; restores titled outline; **evidence-favored** (v4 was migrated under the now-corrected false premise that titled headings don't resolve).
- **Option C — keep dual-form parser permanent + ship link-integrity CI.** Zero heading churn; the durable win ships regardless of A/B.
- **Worker 3 recommendation: B + C.** Worker 1/4 design A in full because the task requires it. **Synthesis position:** the link-integrity test (§5 P0) and validator fix (H2) are required under *every* option, so land those first; treat A-vs-B as a reversible, low-urgency call to make *after* the form-agnostic infrastructure is green.

### Quantified scope (census, evidence in hand)
- `.specs/`: 52 dirs, **48 real specs** (exclude 4 empty: `backlog`, `claim-evidence-gate`, `local-dev-environment`, `skill-rule-customization`). 821 `.md`, 70 `.feature`.
- Headings: FR 573 (507 long / 42 short, v4-only), AC 603 (490 long / 85 short, v4-only), NFR 64 (28 long / 36 short), UC 312 (all long).
- Link surface: **4440 cross-file + 7 same-file** anchor links. **Migrated specs: exactly 1** (`spec-generator-v4`). **Dotted ACs (`## AC-N.M`): v4-only** (`grep` = 0 elsewhere) → dot-drop logic is **out of scope** for the 47-spec rollout. *Synthesis confirmed only `spec-generator-v4/FR.md` has `^## FR-N$` short headings.*

### Option-A migration script (`tools/specs-generator/migrate-to-short-headings.ts`, `--suggest-only` / `--apply`)
1. **Heading shorten + relocate.** `## FR-N: Title` → `## FR-N` + `**Title**` body line (matches `md.ts:104` `relocatedTitleAfter`); `## AC-N (FR-K)` → `## AC-N` + `**Требование:** [FR-K](FR.md#fr-K)` line (matches `md.ts:121` `parentFrAfter`); same for NFR/UC.
2. **Anchor collapse in links.** `#fr-N-title` → `#fr-N`, `#ac-N-fr-K` → `#ac-N`; compute the **old** slug from the captured Marksman fixture (not recall) for exact find/replace.
3. **Skip-list guard (leave untouched):** literal placeholders `## FR-N: {Название}` (claim-sanity-check, fixtures-test, onboard-repo-phase0), `[TBD title]` blocks (answer-simple, install-diagnostics, spec-workflow-vmodel), zero-padded `FR-006`, `FR-OUT-*` non-digit ids.
4. **No USER_STORIES rewrite** (no anchors).

### Per-spec verify gate (all must pass to advance)
1. **Node-id invariance** (load-bearing): parse FR/AC/NFR/UC before+after; assert identical `{id, type, parentFr}` sets + identical `covers` edges (node id is form-invariant — measured; only `anchors[]` changes). Drift = **hard stop**, never auto-fix by deleting a node.
2. **`validate-spec` 0 errors** (after H2 fix — otherwise false warns).
3. **0 broken links — NEW resolver check** (NOT validate-spec, whose `linkPattern` at `core.mjs:1209` requires `\.md` and never checks same-file `#anchor`): compute each heading's slug via the captured Marksman fixture, check every same-file AND cross-file `#anchor`.
4. **Marksman resolution spot-check:** ≥3 sampled links per spec via real-binary `textDocument/definition`, assert target heading line.

### Batching / ordering / rollback
- **Order:** smallest specs first (cursor-dead-code-cleanup, fixtures-test, skill-listing-budget) to shake out the script → mid → giants last (**pomogator-doctor 36 FR/36 AC**, session-pilot 27, onboard-repo-phase0). Hard specs (placeholder/TBD/zero-pad/FR-OUT) in a final manual-review batch.
- **Batch unit:** one spec = one commit = one gate pass (clean per-spec `git revert`).
- **Rollback:** per-spec revert; node-id drift (gate step 1) is a non-negotiable hard stop. `verify-status-against-code` + `dead-integration-guard` forbid declaring a batch done without the real-binary spot-check.

## 5. Dogfood Test Plan

All tests reuse the existing real-artifact harness (`tools/marksman-installer/lsp-probe.ts`: `probeInitialize`, `decideE2e`, `createMarksmanWorkspace`, `isInDocker`) and the `decideE2e` skip-policy (present⇒run; absent-in-Docker⇒**hard FAIL** per `dead-integration-guard`; absent on dev host⇒honest skip).

| Pri | Test | Lives in | Asserts | Effort |
|---|---|---|---|---|
| **P0** | Cross-spec link-integrity (durable win, ships under any fork) | `tools/spec-graph/__tests__/link-integrity.test.ts` + `/run-tests` CI step | Every 4440 cross-file + 7 same-file `#anchor` resolves to a heading whose **Marksman slug** matches; expected slugs from the captured binary fixture (P1), never the in-memory rule. Closes validate-spec gaps (same-file unchecked; `linkPattern` requires `.md`). | M |
| **P1** | Golden slug fixture + test (single source of truth) | `tools/marksman-installer/__tests__/marksman-slug.golden.test.ts` + `tests/fixtures/marksman/slug-rule.json` (captured from real binary) | Per id-shape: `FR-1: Title`→`fr-1-title`, `FR-7`→`fr-7`, `AC-1 (FR-1)`→`ac-1-fr-1`, `AC-27.1 (FR-27)`→`ac-271-fr-27`, `AC-1.1`→`ac-11`, bare `#ac-1` ❌, `{#id}` ❌. **Flag: extract a shared `marksmanSlug()`** — the rule is duplicated inline (`md.ts:331` `replace(/\./g,'')`) and approximated (`core.mjs:424` `toAnchorSlug`). | S |
| **P2** | Migration idempotence / node-id stability | `tools/specs-generator/__tests__/migrate-to-short-headings.test.ts` | `parse(spec) ≡ parse(migrate(spec))` on `{id,type,parentFr}` + `covers` edges (only anchors differ); `migrate(migrate(x)) == migrate(x)`; skip-list headings untouched. Pure parser, always runs. | M |
| **P3** | Real-artifact `definition`-at-link-position e2e (codifies H3 manual proof) | extend `tools/marksman-installer/__tests__/launch-marksman-e2e.test.ts`; add `probeDefinition` to `lsp-probe.ts` | Over a migrated spec dir in `createMarksmanWorkspace()`, `definition` at `[..](#fr-7)` / `[..](#ac-11)` returns the expected heading line. **Includes Worker 2's fixtures (b) cross-file `#fr-1` + (c) dot-dropped `#ac-11`** — the forms the migration ships. `decideE2e`⇒run/hard-FAIL-if-absent. | L |
| **P3b** | `decideE2e` 3-branch table test | `tools/marksman-installer/__tests__/lsp-probe.test.ts` | Pin the hard-FAIL-in-Docker contract independently of a binary being present (currently only exercised transitively). | S |

## 6. Skills & Plugin Backlog (prioritized)

| Pri | Item | Effort | Evidence |
|---|---|---|---|
| **P0** | `.mcp.json` → route through `CLAUDE_PLUGIN_ROOT` + bootstrap (C1) | M | `.mcp.json:8` vs `.lsp.json:4`, `hooks.json` |
| **P0** | Extend `verify-plugin-install` e2e to probe MCP `get_coverage` + LSP activation (H5) | M | `verify-plugin-install/SKILL.md:61,85-86` |
| **P1** | Fix ~8 colon-bound regexes in `core.mjs` to accept both forms (H2) — **prereq for template flip** | L | `core.mjs:1124,1771,1857,2270,2318,2384,2704` |
| **P1** | Decide heading-form fork, then align `FR/AC/USE_CASES.md.template` (H1) | S–L | `FR.md.template:3`, `ACCEPTANCE_CRITERIA.md.template:3,5` |
| **P1** | New `migrate-spec` skill (heading migration + before/after coverage verify gate + Marksman `references` check) | M | no `.claude/skills/migrate-spec/` exists |
| **P1** | `lspServers` → array `["./.lsp.json"]` if schema matches; add assertion to `canonical-plugin.test.ts` + skill field list (H4) | S | `plugin.json:27` |
| **P2** | markdown-lsp: add "Measured slug rules" subsection — dot-drop (`AC-1.1`→`ac-11`), `{#id}` does NOT resolve, `[[X]]` targets a DOCUMENT not an H2 | S | `md.ts:322-329`, `markdown-lsp/SKILL.md:60-71` |
| **P2** | Add `win32 arm64` marksman asset+sha (or document PATH-fallback gap in markdown-lsp troubleshooting) (M3) | S | `marksman-hashes.json` win32 = x64-only |
| **P2** | Confirm UC parser intent; if UC belongs in the graph, add UC heading recognition to `md.ts` (M1) | S–M | `md.ts:51-62` (no UC regex) |
| **P3** | Strip citation/`[TBD title]` phantom-FR blocks corpus-wide (4 specs); optionally have parser ignore `[TBD …]` FR bodies (M2) | M | `FR.md:583-700`; `grep -lE '### Citations\|\[TBD title\]' .specs/*/FR.md` |
| **P3** | Commit AC-7.3 hop-2 transcript or downgrade wording (L1); fix `resolve-binary.ts:11` comment (L2); update stale colon-form docs (L3); add AC-7.5 back-ref to FR-7 (L4); dedupe Marksman version pin (L5) | S each | as cited |

## 7. Do Next (single ordered list)

1. **Land P0 link-integrity test** (`tools/spec-graph/__tests__/link-integrity.test.ts`) over all 4440+7 links with slugs from a captured real-binary fixture — the durable win, required under every rollout fork.
2. **Add the golden slug fixture + test** (`marksman-slug.golden.test.ts`) and **extract a shared `marksmanSlug()`** consumed by both `md.ts` and `core.mjs` (kills the duplicated/approximated slug rule).
3. **Fix `.mcp.json`** to resolve via `CLAUDE_PLUGIN_ROOT` + `bootstrap.cjs` (C1) — installed-user MCP server is currently dead.
4. **Extend `verify-plugin-install` Docker e2e** to probe `get_coverage` + LSP activation (H5), and **convert H3's manual proof into a real-binary `definition`-at-link-position e2e** (P3) with cross-file `#fr-1` + dot-dropped `#ac-11` fixtures.
5. **Fix the ~8 colon-bound regexes in `specs-generator-core.mjs`** (H2) so short-form specs stop false-warning — prerequisite for any template/rollout change.
6. **Verify `lspServers` against the Anthropic schema**; normalize to an array if siblings match and add a `canonical-plugin.test.ts` assertion (H4).
7. **Decide the heading-form fork** (revert the 1 lossy spec + keep dual-form, vs forward-migrate 47): align the three scaffold templates to the chosen form (H1) only *after* step 5.
8. **Create the `migrate-spec` skill** with a before/after coverage verify gate; if forward-migrating, run it smallest-spec-first, one-spec-per-commit, with the §4 per-spec gate (node-id invariance = hard stop).
9. **Teach markdown-lsp the 3 measured slug traps** and **add the `win32 arm64` marksman hash** (or document the PATH fallback).
10. **Sweep the LOW backlog:** commit/downgrade AC-7.3 hop-2 evidence, fix `resolve-binary.ts:11` comment, update stale colon-form docs, add AC-7.5↔FR-7 back-ref, dedupe the Marksman version pin; separately strip citation/TBD phantom-FR blocks across the 4 polluted specs.
