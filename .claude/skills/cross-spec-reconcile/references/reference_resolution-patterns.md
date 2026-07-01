# Resolution Patterns — Reference Catalog

Recurring patterns observed across batch-26+ remediation passes on the
`.specs/` corpus. Each pattern documents:

1. **Trigger** — finding-code + state of the world that activates it
2. **Decision rule** — when to apply this pattern vs an alternative
3. **Before / After** — concrete diff illustrating the transformation
4. **Audit footprint** — what the resolver leaves behind for future
   reviewers so the choice is not lost

These patterns are consumed by `cross-spec-resolve` (Path A/B/C dispatch
inside the 7-step loop) and by the agent body when it handles
mechanical findings directly. The classification is deliberately
narrower than the 28-class finding matrix — these are the *response*
shapes, not the *detection* shapes.

---

## Pattern 1 — WRAP-deprecated

**Trigger conditions**

- Finding code: `impl-drift/missing-file`, `impl-drift/missing-symbol`
- Referenced path no longer exists on disk
- No canonical replacement exists (file was removed in a major
  migration / rewrite — e.g. `v1 → v2`)
- The reference lives in a **spec / ownership / traceability artifact**
  (FR, AC, README ownership table, glossary) where pure deletion would
  destroy historical context

**Decision rule**

Prefer WRAP over DELETE when:

- The reference is load-bearing for traceability ("this used to be a
  module — proof of why FR-N exists today")
- A reviewer reading the spec a year later still needs to understand
  the migration; pure deletion makes the FR look unmotivated
- There is no equivalent test/file to redirect to (otherwise use
  Pattern 2)

**Before / After**

```diff
- The installer wires up `src/installer/claude.ts` on first run.
+ The installer wires up ~~`src/installer/claude.ts`~~ *(removed in v2 — no canonical replacement)* on first run.
```

```diff
- | install hook | `src/installer/claude.ts` | bootstrap |
+ | install hook | ~~`src/installer/claude.ts`~~ *(removed in v2)* | bootstrap |
```

**Audit footprint**

- Strikethrough survives in git blame — the original reference is
  recoverable
- Inline italic note documents *why* it was wrapped, not just *that*
  it was wrapped
- The finding in `consistency-report.yaml` is stamped
  `resolution_status: resolved` with `resolution_pattern: WRAP-deprecated`

---

## Pattern 2 — DELETE-if-alternative-exists

**Trigger conditions**

- Finding code: `impl-drift/missing-test`, `impl-drift/missing-file`
- Referenced file is missing AND a working equivalent exists under a
  different name (split layout, renamed extension, alternate
  implementation)
- The alternative is verifiably **the same coverage** — same
  scenarios, same BDD ↔ test mapping, just renamed/restructured

**Decision rule**

Prefer DELETE+REDIRECT over WRAP when:

- A working alternative exists and is reachable
- Keeping the old reference adds zero historical value (no migration
  story worth preserving)
- The reviewer would only be confused by seeing two spellings

Examples of legitimate alternatives:

- **Split layout** — one aggregate test became N domain-specific tests
  (e.g. `pomogator-doctor.test.ts` → `doctor-core.test.ts`,
  `doctor-entry.test.ts`, ...)
- **Renamed extension** — `*.spec.ts` → `*.test.ts` per project
  convention
- **Module move** — `tools/foo/bar.ts` → `tools/_shared/foo-bar.ts`

**Before / After**

```diff
- Tests live in `tests/e2e/pomogator-doctor.test.ts`.
+ Tests live in `tests/e2e/doctor-{core,entry,hooks,mcp,...}.test.ts` (split layout).
```

```diff
- | tests | `tests/e2e/pomogator-doctor.test.ts` |
+ | tests | `tests/e2e/doctor-*.test.ts` (split per concern) |
```

**Audit footprint**

- New reference points at a *reachable* file — `cross-spec-reconcile`
  re-run drops the finding instead of re-firing
- Glob form (`doctor-*.test.ts`) acceptable when N files share a
  prefix; literal enumeration acceptable when N ≤ 5
- The finding is stamped `resolution_status: resolved` with
  `resolution_pattern: DELETE-redirect-to-alternative` and
  `redirect_target: <new-path>`

---

## Pattern 3 — RECREATE-as-skip

**Trigger conditions**

- Finding code: `impl-drift/missing-test`
- Referenced test file is missing
- The spec / `.feature` file carries **load-bearing requirements**
  (not abandoned, not deferred)
- No working alternative exists (otherwise use Pattern 2)
- Per `extension-test-quality` rule, BDD 1:1 mapping must be preserved
  (every `Scenario` needs a paired `it()`)

**Decision rule**

Prefer RECREATE-as-skip over DELETE when:

- The FR / AC is alive — someone will implement it
- A future agent picking up the work needs the test skeleton so they
  do not re-derive scenario shapes from the `.feature`
- Skipping (not deleting) preserves CI visibility — `it.skip` is
  counted, deleted code is invisible

**Before / After**

```diff
+ // settings-protection.test.ts
+ //
+ // BDD: tests/e2e/settings-protection.feature (SETPROT001)
+ // STATUS: stub — implementation deferred per .specs/settings-protection/TASKS.md
+ //
+ // TODO: drop the `.skip` once the production code lands.
+
+ import { describe, it } from 'vitest';
+
+ describe('SETPROT001: Settings protection', () => {
+   it.skip('SETPROT001_01: rejects write to managed key', () => {
+     // TODO: spawnSync installer + assert managed key untouched
+   });
+
+   it.skip('SETPROT001_02: allows write to user key', () => {
+     // TODO: spawnSync installer + assert user key updated
+   });
+ });
```

**Audit footprint**

- Stub file exists on disk → missing-file finding clears
- Every `it.skip()` carries a TODO comment + reference to the
  `.feature` Scenario so the next agent has zero guess-work
- BDD 1:1 mapping intact — `validate-spec.ts` Scenario↔it audit
  passes
- The finding is stamped `resolution_status: resolved` with
  `resolution_pattern: RECREATE-as-skip` and
  `tracking_marker: TODO:<scenario-id>`

---

## Pattern 4 — DEFER-spec

**Trigger conditions**

- The spec as a whole is effectively shelved:
  - No paired skill in `.claude/skills/`
  - No paired test files
  - No `.feature` written (or `.feature` exists but only as a
    placeholder)
  - Multiple `- [ ]` checkboxes in `TASKS.md` with no recent activity
- The slug is not actively cited from another live spec
- Deletion would lose the design context, but pretending it is alive
  generates an unbounded stream of `impl-drift/*` findings each run

**Decision rule**

Prefer DEFER-spec over per-finding resolution when:

- Resolving each finding individually would produce N stub files +
  N `WRAP-deprecated` notes — high churn, low signal
- The spec is genuinely on the back-burner, not in-flight
- A clear "do not implement yet" signal helps future agents skip the
  slug instead of pinging the user for direction

**Before / After**

Add a banner at the very top of `README.md` (or create `README.md`
if absent):

```diff
+ > **Status: DEFERRED (2026-06-01)** — this spec is shelved pending
+ > re-evaluation. No skill / tests / feature exists. Do NOT attempt
+ > implementation without first confirming priority with the user.
+ >
+ > Findings against this slug are suppressed by
+ > `cross-spec-reconcile` until the banner is removed.
```

In `TASKS.md`, prepend the marker to every open task:

```diff
- - [ ] Implement <thing>
+ - [DEFERRED] Implement <thing>
```

**Audit footprint**

- `cross-spec-reconcile` reads the banner regex (`> \*\*Status:
  DEFERRED`) and lowers severity of every finding in the slug from
  WARNING/CRITICAL to INFO with a `class: deferred-spec` annotation
- Banner carries a date → easy to spot stale deferrals during
  quarterly review
- The whole-spec decision is stamped once in
  `consistency-report.yaml` as `spec_status: deferred` rather than N
  per-finding entries

---

## Pattern 5 — MCP-method-name false-positive exclusion (and other JSON-RPC contexts)

**Trigger conditions**

- Finding code candidate: `impl-drift/missing-file`
- Reference inside backticks matches the path-ref regex
  (`(?:src|tools|tests|lib)\/[\w./-]+`)
- The reference is actually a **protocol method name**, not a
  filesystem path

**Decision rule**

This is a **detection-side** exclusion, not a resolution choice — the
finding never fires. Documented here so future contributors do not
attempt to "fix" non-existent files.

Recognised JSON-RPC method name families (extend the
`MCP_METHOD_NAMES` set in `scripts/reconcile.ts` when new ones
appear):

| Family | Examples |
|--------|----------|
| MCP — tools | `tools/list`, `tools/call` |
| MCP — resources | `resources/list`, `resources/read`, `resources/templates/list` |
| MCP — prompts | `prompts/list`, `prompts/get` |
| MCP — roots | `roots/list` |
| MCP — sampling | `sampling/createMessage` |
| MCP — lifecycle | `ping`, `initialize` |
| MCP — notifications | `notifications/initialized`, `notifications/cancelled` |

**Extension procedure for other JSON-RPC contexts**

When a new protocol appears (LSP, JSON-RPC custom, Anthropic tools
namespace, etc.):

1. Identify the family of `<noun>/<verb>` method names in the
   protocol spec
2. Add the literal method names to `MCP_METHOD_NAMES` (consider
   renaming the constant to `JSON_RPC_METHOD_NAMES` once a second
   family is added)
3. Add a regression test in
   `scripts/__tests__/reconcile.test.ts` mirroring the
   `does NOT fire missing-file for MCP JSON-RPC method names in
   spec prose` test
4. Document the new family in this table

**Before / After (no diff — exclusion is in detection)**

```ts
// scripts/reconcile.ts
const MCP_METHOD_NAMES = new Set<string>([
  'tools/list',
  'tools/call',
  // ... extend here when a new protocol family appears
]);

// Inside the path-ref scanner:
if (MCP_METHOD_NAMES.has(cleanRef)) continue; // not a filesystem path
```

**Audit footprint**

- Zero findings emitted for the recognised method names
- Regression test in `__tests__/reconcile.test.ts` pins the
  behaviour so a future refactor cannot accidentally re-introduce
  the false positive

---

## Pattern selection cheat-sheet

| Situation | Pattern |
|-----------|---------|
| File gone, no replacement, traceability matters | **WRAP-deprecated** |
| File gone, equivalent exists under different name | **DELETE-if-alternative-exists** |
| Test gone, FR alive, no equivalent | **RECREATE-as-skip** |
| Whole spec shelved, multiple findings, no activity | **DEFER-spec** |
| Reference is a protocol method, not a path | **MCP-method-name exclusion** (detection-side) |

If two patterns seem applicable, prefer the one that **preserves the
most context** for the next agent. Order from richest to leanest
context: WRAP-deprecated > RECREATE-as-skip > DELETE-redirect >
DEFER-spec. MCP-exclusion is orthogonal — it suppresses detection
before pattern selection happens.

## See also

- `../SKILL.md` — the analyzer that produces the findings these
  patterns resolve
- `../../cross-spec-resolve/SKILL.md` — the interactive walker that
  applies the patterns
- `../scripts/reconcile.ts` — detection logic including
  `MCP_METHOD_NAMES`
- `.claude/rules/extension-test-quality.md` — BDD 1:1 mapping rule
  that motivates Pattern 3 (RECREATE-as-skip)
