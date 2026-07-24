# Issue #172 — Identity Contract: smallest complete PR design

Read-only investigation of `E:\repos\dev-pomogator` @ `feat(spec-cache)` (post-#191, HEAD `fix(spec-verdict): post-merge (#190)`).
Scope: define the SMALLEST mergeable PR that delivers the #172 identity contract without pulling in #164 (ReqIF import) / #165 (LSP rename).

---

## 1. What "smallest complete" means here

#172 asks for 7 things. Three of them have **no existing surface** to hook and are greenfield speculative — they go to follow-ups:

| #172 item | Surface today? | Smallest-PR verdict |
|---|---|---|
| 1. `Identity = {namespace, localId}` + single parse/build point | partial (scattered `localIdOf`/concat) | **IN — the core** |
| 2. Qualified/local search contract, ambiguous→candidates | DONE (`resolveNodeRef`) | **IN — formalize + document only** |
| 3. Case + Unicode normalization collision detection | MISSING | **IN — the new value** |
| 4. Namespace aliasing on import | NO import exists | **OUT** (invariant + guard test only) |
| 5. Hierarchy ≠ identity, no shadowing | NO hierarchy exists | **OUT** (one testable invariant: `:` banned in localId) |
| 6. Migration with collision report | ids are DERIVED not stored | **IN — but it's a report, not a rewrite** |
| 7. Canonical serialization in graph/links | DONE (composite ids already stored) | **IN — verify only, no code** |

So the smallest complete PR = **items 1 + 3 + 6, plus formalizing 2 and verifying 7.** Items 4/5 reduced to one invariant each + a unit test, machinery deferred.

---

## 2. Current state — exact files & symbols (evidence)

**Identity is a convention in a comment, not a type.** `NodeBase.id` is the composite `<slug>:<localId>`, `node.spec?` the namespace (`tools/spec-graph/types.ts:44-63`). There is NO `localId` field on nodes and NO `Identity` type anywhere (grep: 0 hits for `type Identity`/`interface Identity`).

**The single qualification point already exists** — `qualifySlice()` + `specOf()` in `tools/spec-graph/coverage.ts:80-118`. Parsers self-qualify via it (`parsers/md.ts:418`, `parsers/tasks.ts:122`, `gherkin.ts`). It builds `${slug}:${id}` by string concat — this is the natural home to route through a `formatId()`.

**Scattered local-id strippers** (the "разрозненные `localIdOf`" the issue names):
- `conformance.ts:83-85` — private `localIdOf(node)` = `node.id.slice(node.spec.length + 1)`.
- `builder.ts:360-364` — inline `byLocalId` map, `n.id.slice(n.spec.length + 1)`.
- `readiness-inventory.ts:388` — local `localId(composite)` = `composite.slice(slug.length + 1)`.

**Collision detection today is EXACT-ONLY:**
- `builder.ts:154-162` `mergeNode` — first-writer-wins dedup; duplicates recorded in `rawCollisionList` → `SpecGraph.rawCollisions` (`builder.ts:417-421`, `types.ts:306-310`).
- `collision-probe.ts:44-75` `rawCollisionScan` — INDEPENDENT pre-map re-parse, `Map<id, file>`, exit 1 on any collision. No normalization (grep confirms plain `seen.get(n.id)`).
- `corpus-health.ts:86-89` — consumes `graph.rawCollisions`.
- `DUPLICATE_DEFINITION` — declared in `conformance.ts:40` FindingCode union but explicitly NOT emitted by the walk (`conformance.ts:571-574`): the dedup hides the second def before the checker runs. **This is the exact precedent for a normalization finding: declare in the union, emit from the probe/corpus-health, not the graph walk.**

**Qualified/local search already works** — `tools/spec-mcp-server/tools.ts:99-128` `resolveNodeRef()` + `ambiguousBareId()`. Used by `get_trace`(806), `get_node`(1014), `get_test_result`(1061), `find_refs`(1195), `resolveScenarioRef`(279). Ambiguous bare id → `error: 'AMBIGUOUS_BARE_ID'` + `candidates[]`.

**Existing BDD "feature36"** = `@feature36` scenarios `SPECGEN004_90/91/93/94/95/362/363` in `.specs/spec-generator-v4/spec-generator-v4.feature`, steps in `tests/step_definitions/feature36_composite_graph.ts` (worlds `F36World` / `F36ResolveWorld` / `F36ProbeWorld`). Pattern: build a temp fixture spec → `buildGraph({repoRoot: tempDir, skipNdjson:true})` → assert, or `buildToolRegistry(() => graph)` → call `get_node`.
- `_90`: two specs, same bare id → two distinct nodes.
- `_91`: intra-file anchor stays bare + file-local.
- `_93`: colliding bare id → candidate list (`AMBIGUOUS_BARE_ID`).
- `_94`: qualified `slug:FR-2` / `{spec,node_id}` → exact node.
- `_95`: dogfood probe on REAL corpus → exit 0, 0 collisions, ~470 FRs.
- `_362/_363`: corpus-health catches planted dup / does NOT collide two specs sharing a bare local id.
- **Max existing scenario id = `SPECGEN004_576` (507 unique) → new scenarios start at `SPECGEN004_577`.**

**Migration precedent (FR-36a):** ids were never rewritten in source — parsers self-qualified (P13-2), "no extra rewrite step" (`collision-probe.ts:3-4`). The "migration" was the probe report + the `_95` zero-collision dogfood assertion. `tools/migrate-v3-to-v4/` is the v3→v4 *format* converter, unrelated to id migration.

**Serialization already canonical:** `#191` SQLite cache stores `node.id` verbatim + `JSON.stringify(node)` (`sqlite/persist.ts:34-36`) and round-trips it (`persist.ts:69-72`). Edges/backlinks/definitions carry composite ids. → item 7 needs NO code; adding fields to the node JSON blob is automatic and needs no `schema_version` bump (id semantics unchanged).

**No import/alias surface:** grep for `reqif|importSpec|namespaceAlias` in `tools/**/*.ts` → 0 hits.

---

## 3. Collision semantics — exact / case / Unicode × same / different namespace

**Normalization function (deterministic, locale-free):**
```
norm(s) = s.normalize('NFKC').toLowerCase()
```
NFKC folds fullwidth→ASCII (`ＦＲ-３`→`FR-3`) and composes canonical equivalents (NFD `é`→NFC `é`); `toLowerCase` case-folds. NOT `toLocaleLowerCase` (locale-dependent = non-deterministic).

**Matrix — two DISTINCT raw local ids A≠B:**

| Relationship | SAME namespace | DIFFERENT namespace |
|---|---|---|
| **Exact** `FR-3`==`FR-3` | **EXISTING** collision: `rawCollisions` + `DUPLICATE_DEFINITION` class, first-writer-wins. Build-time. | **NOT a collision** — this is the whole point of namespaces. Two distinct nodes. Pinned by `SPECGEN004_90`/`_363`; must stay green. |
| **Case** `FR-3` vs `fr-3` | **NEW** `ID_NORMALIZATION_COLLISION`. Real defect: a case-insensitive consumer (Windows/macOS FS, case-folded lookup) silently merges them. Report `{ids:[…], normalized}`. | **NOT a collision** — namespace differs, so `team-a:fr-3`≠`team-b:fr-3` even after fold. |
| **Unicode** `ＦＲ-３` / NFD-vs-NFC | **NEW** `ID_NORMALIZATION_COLLISION`, same as case. | **NOT a collision.** |

**Namespace level (the slug itself) — a second, separate axis:**

| Two spec dirs whose slugs norm-equal (`team-a` vs `Team-A`, NFC vs NFD slug) | **NEW** `NAMESPACE_NORMALIZATION_COLLISION` — on a case-insensitive FS these are the SAME directory → silent corpus merge. Detect by folding `norm` over the set of slugs from `specOf()`. Reuses the same `normalizedKey()`. |
|---|---|

**Rule of thumb:** normalization is checked **per level** — across the slug set (namespace axis) and within each namespace (local axis). A local difference across two namespaces is NEVER a local collision; if the namespaces themselves norm-collide, that's reported on the namespace axis instead.

**LIVE-CORPUS EVIDENCE (decides staging):** `audit-out/issue-172-norm-scan.ts` built the real graph (5676 nodes) → `local_norm_collisions: 0`, `namespace_norm_collisions: 0`. ⇒ The probe can **exit non-zero** on same-namespace normalization collisions (parity with exact) WITHOUT turning the dogfood corpus red, and a new `SPECGEN004_95`-style "zero normalization collisions" dogfood scenario passes green on day one. **No warn-then-promote staging needed.**

---

## 4. Alias behavior (import) — smallest-PR treatment

No import mechanism exists, so building one is OUT (#164). The smallest PR encodes the **invariant** only:

- Canonical identity = `formatId({namespace, localId})` is the SOLE identity. An alias is a display-only rename of the namespace that **never** rewrites canonical output, edges, backlinks, or `definitions`.
- `identity.ts` deliberately exposes NO alias-rewrite path; a unit test pins "an alias parameter does not change `formatId` output / stored refs" (guard against a future import PR silently rewriting ids — the exact #172 fear "импорт переписывает ID").
- Full import-with-alias machinery → follow-up after #164.

## 5. Hierarchy ≠ identity, no shadowing — smallest-PR treatment

No nested namespaces exist (namespace = one flat spec slug). The one testable invariant: **`localId` must not contain the separator `:`** — otherwise `parseId(formatId(x))` round-trip is ambiguous (a `:` in the local part would be mistaken for a namespace boundary). `parseId` validates and rejects this. Deeper nested-namespace/shadowing semantics → OUT (nothing to shadow yet); documented as a rule in the `identity.ts` contract block.

---

## 6. Backward compatibility

- **Wire code `AMBIGUOUS_BARE_ID` is KEPT.** Do NOT rename to `AMBIGUOUS_LOCAL_ID` — `SPECGEN004_93` asserts the current string and external MCP consumers may match on it. Instead ADD `local_id` (= `parseId(nodeId).localId`) to the existing envelope, and document `AMBIGUOUS_LOCAL_ID` as a *synonym* in the contract, not a replacement. (Issue's "after" JSON is realized as the same envelope with `local_id` made explicit.)
- **Qualified + unique-bare resolution unchanged** (`resolveNodeRef` untouched in behavior).
- **Node shape:** no removals; `node.id` stays composite. Any new optional field rides the existing `JSON.stringify(node)` blob → no `schema_version` bump (#191 cache stays valid).
- **`rawCollisions` extended additively** with an optional `normalizationCollisions?` — existing consumers (`corpus-health.ts:86`, `readiness-inventory.ts:360`) ignore it until they opt in.
- **`DUPLICATE_DEFINITION`/exact-collision behavior unchanged.**
- Refactor of `localIdOf`/`byLocalId`/`localId()` → `identity.ts` is **behavior-preserving** (same slice math), covered by existing `builder.test.ts`/`conformance.test.ts`.

---

## 7. Exact change list

**NEW**
- `tools/spec-graph/identity.ts` — the single source of truth:
  - `export const ID_SEPARATOR = ':'`
  - `export interface Identity { namespace?: string; localId: string }`
  - `export function parseId(raw): Identity` — split on FIRST `:`; validate localId non-empty and contains no `:` (throw/`Result` on violation).
  - `export function formatId(id: Identity): string` — canonical builder.
  - `export function normalizedKey(raw): string` — `raw.normalize('NFKC').toLowerCase()`.
  - `export function localIdOf(node: {id; spec?}): string` — moved here from conformance.
  - doc block = THE qualified/local-search contract (qualified=exact; bare unique=soft-resolve; bare ambiguous=error+candidates; alias never rewrites; `:` banned in localId; hierarchy≠identity).
- `tools/spec-graph/__tests__/identity.test.ts` — parse/format round-trip; `normalizedKey` case + fullwidth + NFD; `:`-in-localId rejection; alias-does-not-change-canonical guard; cross-namespace case-difference is NOT a collision.

**MODIFY (route through identity.ts — behavior-preserving)**
- `tools/spec-graph/coverage.ts` — `qualifySlice` builds ids via `formatId({namespace: slug, localId: …})`.
- `tools/spec-graph/conformance.ts` — delete private `localIdOf`, import from identity.ts; add `ID_NORMALIZATION_COLLISION` (+ optionally `NAMESPACE_NORMALIZATION_COLLISION`) to the `FindingCode` union, documented like `DUPLICATE_DEFINITION` ("declared here, emitted by the probe/corpus-health, not this walk").
- `tools/spec-graph/builder.ts` — `byLocalId` (line 360) uses `parseId(...).localId`; in the single pass also collect normalization collisions (mirror the probe) into `rawCollisions.normalizationCollisions`.
- `tools/spec-graph/readiness-inventory.ts` — local `localId()` → `parseId`.
- `tools/spec-graph/types.ts` — extend `SpecGraph.rawCollisions` with `normalizationCollisions?: Array<{ namespace?: string; ids: string[]; normalized: string }>`; note `node.id === formatId(...)`.
- `tools/spec-graph/collision-probe.ts` — extend `CollisionScan` + `rawCollisionScan`: group raw ids by `(namespace, normalizedKey(localId))`, report groups with >1 distinct raw id (and slug-set norm groups); **exit non-zero on same-namespace normalization collisions too** (corpus is clean — §3).
- `tools/spec-graph/corpus-health.ts` — surface `normalizationCollisions` as a new disease line.
- `tools/spec-mcp-server/tools.ts` — `ambiguousBareId` adds `local_id` to the envelope (keep `error: 'AMBIGUOUS_BARE_ID'`); `resolveNodeRef` doc points at `identity.ts` contract.

**BDD** (write via MCP door — `.specs/` is access-guarded)
- `.specs/spec-generator-v4/spec-generator-v4.feature` — new `@feature36` scenarios `SPECGEN004_577+`:
  - `_577` Identity round-trip: `parseId(formatId({namespace:'team-a',localId:'FR-3'}))` restores the pair; canonical string is `team-a:FR-3`.
  - `_578` case collision same-namespace detected: plant `FR-3` + `fr-3` in one spec → `rawCollisions.normalizationCollisions` reports both, `normalized: '…:fr-3'`.
  - `_579` Unicode collision same-namespace detected: plant `FR-3` + `ＦＲ-３` (fullwidth) → reported; and an NFD-vs-NFC pair → reported.
  - `_580` case/Unicode difference across DIFFERENT namespaces is NOT a collision: `team-a:FR-3` + `team-b:fr-3` → `normalizationCollisions` empty (pins the matrix).
  - `_581` `localId` containing `:` is rejected by `parseId` (round-trip safety / no-shadowing invariant).
  - `_582` dogfood: probe on REAL corpus reports 0 normalization collisions (extends `_95`).
  - `_583` MCP `get_node('FR-3')` ambiguous envelope now carries `local_id: 'FR-3'` and still `error: 'AMBIGUOUS_BARE_ID'` (backward-compat pin, extends `_93`).
- `tests/step_definitions/feature36_composite_graph.ts` — new `F36IdentityWorld` (+ steps). Reuse the existing fixture-build + `buildToolRegistry` pattern (lines 238-286 are the model).

**Docs / manual**
- `audit-out/issue-172-manual-mcp-checks.md` — see §8.

---

## 8. Manual MCP checks (acceptance, human-runnable)

Against a scratch corpus with `team-a` defining `FR-3`+`fr-3` and `team-b` defining `FR-3`:

1. `get_node({node_id:'FR-3'})` → `ok:false, error:'AMBIGUOUS_BARE_ID', local_id:'FR-3', candidates:['team-a:FR-3','team-b:FR-3']` (NOT a single node).
2. `get_node({node_id:'team-a:FR-3'})` → `ok:true, node.id==='team-a:FR-3'` (qualified exact).
3. `get_node({node_id:'FR-3', spec:'team-b'})` → `ok:true, node.id==='team-b:FR-3'`.
4. `node --import tsx tools/spec-graph/collision-probe.ts` on the scratch corpus → exit 1, prints the `team-a` `FR-3`/`fr-3` normalization collision; on the REAL repo → exit 0, `collisions: 0`, `normalization collisions: 0`.
5. `get_trace({node_id:'FR-3'})`, `get_test_result`, `find_refs` → same `AMBIGUOUS_BARE_ID`+`local_id` envelope (contract uniform across all 5 node-ref tools).

---

## 9. Explicit OUT / follow-ups

- Import-with-alias machinery (depends on #164 ReqIF) — only the invariant + guard test ship here.
- Deep hierarchy / nested-namespace shadowing semantics — only the `:`-ban invariant ships.
- Renaming the `AMBIGUOUS_BARE_ID` wire code — deliberately NOT done (backward compat).
- LSP go-to-definition / atomic rename (#165) — consumes canonical ids, separate work.
- `schema_version` bump — not needed (id semantics unchanged; new fields ride the JSON blob).
