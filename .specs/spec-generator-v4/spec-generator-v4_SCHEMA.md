# Spec Generator v4 Schema

> Data shapes for v4 multi-layer pipeline: MD parser → Gherkin parser → NDJSON ingester → SpecGraph → MCP tools.
> See [DESIGN.md](DESIGN.md) for component algorithm + flow diagrams.

## Pipeline visual

```
.specs/**/*.md ─────────► [MdParser (unified+remark)]    ─┐
                          dual-anchor registration         │
**/*.feature ───────────► [GherkinParser (@cucumber/...)]  ├─► [GraphBuilder]
                          tag inheritance, pickles         │       │
reqnroll_report.ndjson ─► [NdjsonIngester (@cucumber/msgs)]┘       │
                          envelope joins by id                     │
                                                                    ▼
                                                         ┌──────────────────────┐
                                                         │   SpecGraph          │
                                                         │   (in-memory)        │
                                                         │   typed nodes+edges  │
                                                         └──────────┬───────────┘
                                                                    │
                                                                    ▼
                                                         ┌──────────────────────┐
                                                         │   MCP Server         │
                                                         │   11 tools           │
                                                         └──────────────────────┘
                                                                    │
                                                                    ▼
                                                                  Agent
```

## Entity 1: SpecGraph (in-memory)

```json
{
  "version": 1,
  "builtAt": "2026-05-18T12:00:00Z",
  "nodes": {
    "FR-001": {
      "id": "FR-001",
      "type": "FR",
      "title": "Login",
      "file": ".specs/auth/FR.md",
      "line": 12,
      "frontmatter": { "status": "draft", "priority": "P1" },
      "anchors": ["FR-001", "fr-001-login"],
      "body": "..."
    },
    "AC-3": {
      "id": "AC-3",
      "type": "AC",
      "parentFr": "FR-001",
      "file": ".specs/auth/ACCEPTANCE_CRITERIA.md",
      "line": 45,
      "ears": "WHEN ... THEN ... SHALL ..."
    },
    "SCEN-login-ok": {
      "id": "SCEN-login-ok",
      "type": "Scenario",
      "file": "tests/Auth.feature",
      "line": 5,
      "tags": ["@FR-001", "@AC-3"],
      "pickleId": "pickle-uuid-1",
      "steps": [
        { "keyword": "Given", "text": "..." },
        { "keyword": "When", "text": "..." },
        { "keyword": "Then", "text": "..." }
      ],
      "lastResult": "PASSED",
      "lastRunAt": "2026-05-18T10:00:00Z",
      "durationMs": 120,
      "failingStep": null
    },
    "TASK-12": {
      "id": "TASK-12",
      "type": "Task",
      "file": "TASKS.md",
      "line": 88,
      "status": "in-progress",
      "refs": ["FR-001"]
    }
  },
  "edges": [
    { "from": "FR-001", "to": "AC-3", "type": "covers" },
    { "from": "FR-001", "to": "SCEN-login-ok", "type": "tested-by" },
    { "from": "TASK-12", "to": "FR-001", "type": "implements" },
    { "from": "SCEN-login-ok", "to": "AuthSteps.cs:42", "type": "step-binding" }
  ],
  "definitions": {
    "FR-001": { "file": ".specs/auth/FR.md", "line": 12 },
    "fr-001-login": { "file": ".specs/auth/FR.md", "line": 12 }
  },
  "backlinks": {
    "FR-001": [
      { "file": "ACCEPTANCE_CRITERIA.md", "line": 45, "type": "refs" },
      { "file": "tests/Auth.feature", "line": 5, "type": "tested-by" }
    ]
  }
}
```

- `version`: Schema version (currently `1`)
- `builtAt`: ISO 8601 timestamp of last full rebuild
- `nodes`: Map of `id → Node` (type-aware payload via discriminant `type` field)
- `edges`: Array of `{ from, to, type }` edges
- `definitions`: Anchor index — `anchor_id → location`
- `backlinks`: Reverse index — `anchor_id → [citing locations with edge type]`

### Node types

| `type` | Description |
|--------|-------------|
| `FR` | Functional requirement (`### FR-N:` heading) |
| `NFR` | Non-functional requirement |
| `AC` | Acceptance criteria (EARS format) |
| `Scenario` | Gherkin scenario (from `.feature` parsed by `@cucumber/gherkin`) |
| `Task` | Task in TASKS.md |
| `UseCase` | UC in USE_CASES.md |
| `Risk` | Risk in RESEARCH.md `## Risk Assessment` |
| `File` | Source file referenced in FILE_CHANGES.md or DESIGN.md |
| `StepBinding` | Code location bound to Gherkin step (extracted from NDJSON `stepDefinition` envelope) |

### Edge types

| `type` | Meaning |
|--------|---------|
| `refs` | Direct reference (wiki-link or inline link) |
| `covers` | AC covers FR; UC covers FR |
| `tested-by` | Scenario tagged with FR/NFR/AC id |
| `tagged-by` | Generic tag relationship |
| `implements` | Task references FR (implementation work item) |
| `last-result` | Scenario → TestResult (latest run) |
| `step-binding` | Scenario step → code file:line |
| `code-impl` | FR → code file (derived through scenario step bindings) |

## Entity 2: Cucumber Messages NDJSON envelope (canonical, from `@cucumber/messages`)

```json
{
  "gherkinDocument": {
    "uri": "tests/Auth.feature",
    "feature": {
      "name": "Authentication",
      "tags": [],
      "children": [
        {
          "scenario": {
            "id": "scenario-uuid",
            "name": "Login OK",
            "tags": [{ "name": "@FR-001" }, { "name": "@AC-3" }],
            "steps": [
              { "id": "step-1", "keyword": "Given ", "text": "a user" }
            ]
          }
        }
      ]
    }
  }
}
{
  "pickle": {
    "id": "pickle-uuid-1",
    "uri": "tests/Auth.feature",
    "name": "Login OK",
    "tags": [{ "name": "@FR-001" }, { "name": "@AC-3" }],
    "astNodeIds": ["scenario-uuid"],
    "steps": [
      { "id": "pickle-step-1", "astNodeIds": ["step-1"], "text": "a user" }
    ]
  }
}
{
  "testCase": {
    "id": "tc-1",
    "pickleId": "pickle-uuid-1",
    "testSteps": [
      { "id": "ts-1", "pickleStepId": "pickle-step-1", "stepDefinitionIds": ["sd-1"] }
    ]
  }
}
{ "testCaseStarted": { "id": "tcs-1", "testCaseId": "tc-1", "timestamp": { "seconds": 1747569600, "nanos": 0 } } }
{ "testStepStarted": { "testCaseStartedId": "tcs-1", "testStepId": "ts-1", "timestamp": {...} } }
{ "testStepFinished": {
    "testCaseStartedId": "tcs-1",
    "testStepId": "ts-1",
    "testStepResult": { "status": "PASSED", "duration": { "seconds": 0, "nanos": 120000000 } },
    "timestamp": {...}
  }
}
{ "testCaseFinished": { "testCaseStartedId": "tcs-1", "timestamp": {...}, "willBeRetried": false } }
```

Полный список 21 envelope subtypes — см. RESEARCH.md Appendix B.

JOIN keys для построения trace:
- `pickle.tags[].name == "@FR-N"` — FR ↔ Pickle
- `testCase.pickleId == pickle.id` — Pickle ↔ TestCase
- `testCaseStarted.testCaseId == testCase.id` — TestCase ↔ run instance
- `testStepFinished.testCaseStartedId == testCaseStarted.id` — run ↔ step result
- `stepDefinition.sourceReference.location.{file,line}` — step text ↔ code

## Entity 3: `.dev-pomogator/.spec-config.json`

```json
{
  "version": 1,
  "anchor_patterns": {
    "FR": "^FR-(\\d+):",
    "NFR": "^NFR-([A-Za-z]+)-(\\d+):",
    "AC": "^AC-(\\d+(?:\\.\\d+)?):",
    "SCEN": "^Scenario:\\s+(SCEN-[\\w-]+)",
    "UC": "^UC-(\\d+):",
    "TASK": "^TASK-(\\d+)"
  },
  "orphan_policy": {
    "scenario_tag_orphan": "warn",
    "untagged_scenario": "warn",
    "orphan_task": "warn",
    "orphan_ac": "warn",
    "exempt_paths": ["tests/infrastructure/**"],
    "exempt_scenarios": ["@no-fr-required"]
  },
  "bdd_runner": {
    "tool": "cucumber-js",
    "ndjson_master_path": ".dev-pomogator/.last-test-run.ndjson",
    "per_spec_split": true,
    "per_spec_path_template": ".specs/{slug}/.test-results.ndjson"
  },
  "post_tool_use": {
    "enabled": true,
    "throttle_ms": 3000,
    "severity_filter": ["error", "warning", "info"]
  },
  "conformance_checks": {
    "enabled": [
      "UNCOVERED_FR", "ORPHAN_TASK", "ORPHAN_AC",
      "SCENARIO_TAG_ORPHAN", "UNTAGGED_SCENARIO",
      "BROKEN_REF", "DUPLICATE_DEFINITION",
      "FR_REGRESSION", "STALE_NDJSON",
      "MALFORMED_FRONTMATTER", "MALFORMED_GHERKIN"
    ],
    "disabled": [],
    "semantic_drift": {
      "enabled": false,
      "comment": "Phase 3+ opt-in; requires claude CLI subprocess"
    }
  },
  "mcp": {
    "scope": "per-worktree",
    "lock_file": ".dev-pomogator/.mcp-lock.json"
  },
  "marksman": {
    "enabled": true,
    "binary_path": ".dev-pomogator/bin/marksman",
    "auto_install": true
  },
  "frontmatter": {
    "spec_required_fields": ["id", "type"],
    "spec_optional_fields": ["status", "priority", "owner", "_draft", "_no_push_check"]
  },
  "watcher": {
    "polling_auto_detect": true,
    "polling_interval_ms": 1000,
    "await_write_finish": true
  },
  "storage": {
    "sqlite_enabled": false,
    "sqlite_path": ".dev-pomogator/.spec-index.sqlite",
    "comment": "Phase 4 opt-in"
  }
}
```

## Entity 4: `.dev-pomogator/.mcp-lock.json`

```json
{
  "pid": 12345,
  "env": "container:devcontainer-abc123",
  "started_at": "2026-05-18T10:00:00Z",
  "session_id": "claude-code-session-uuid",
  "worktree_root": "/workspace",
  "spec_index_path": ".dev-pomogator/.spec-index.sqlite",
  "mcp_server_version": "4.0.0"
}
```

- `pid`: Process ID for `process.kill(pid, 0)` alive-check
- `env`: One of `host`, `container:<id>`, `wsl:<distro>`, `codespaces:<machine-id>`, `hyperv-vm:<name>`
- `session_id`: Claude Code session UUID
- `worktree_root`: Output of `git rev-parse --show-toplevel`
- `spec_index_path`: Phase 4 SQLite path (null if not used)

## Entity 5: MCP `TraceResponse` (output of `get_trace`)

```json
{
  "node": {
    "id": "FR-001",
    "type": "FR",
    "title": "Login",
    "file": ".specs/auth/FR.md",
    "line": 12
  },
  "explanation_for_agent": "FR-001 (Login) — 2 AC, 3 scenarios in Auth.feature, 2 pending tasks. Last run 2h ago: 2 PASSED, 1 FAILED (SCEN-login-locked — NullReferenceException at AuthService.cs:88). Related: FR-005 (password reset), NFR-Security-1 (lockout compliance).",
  "tree": {
    "acceptance_criteria": [
      { "id": "AC-3", "file": ".specs/auth/ACCEPTANCE_CRITERIA.md", "line": 45, "text": "..." }
    ],
    "scenarios": [
      {
        "id": "SCEN-login-ok",
        "file": "tests/Auth.feature",
        "line": 5,
        "tags": ["@FR-001"],
        "lastResult": "PASSED",
        "step_bindings": [
          { "step": "When user logs in", "code": "tests/AuthSteps.cs:42" }
        ]
      }
    ],
    "tasks": [
      { "id": "TASK-12", "file": "TASKS.md", "line": 88, "status": "in-progress" }
    ],
    "code_impl": [
      { "file": "src/auth/AuthService.cs", "lines": "42-78", "via": "step binding SCEN-login-ok" }
    ],
    "related_nodes": [
      { "id": "FR-005", "reason": "shares tag @auth-flow" },
      { "id": "NFR-Security-1", "reason": "blast_radius dependency" }
    ]
  },
  "meta": {
    "graph_built_at": "2026-05-18T10:00:00Z",
    "scope_depth": 3
  }
}
```

## Entity 6: MCP `Finding` (output of `conformance_check`)

```json
{
  "code": "ORPHAN_TASK",
  "severity": "warning",
  "node_id": "TASK-12",
  "location": { "file": "TASKS.md", "line": 88 },
  "message": "Task references FR-99 which doesn't exist",
  "evidence": {
    "refs_field": "FR-99",
    "available_frs": ["FR-1", "FR-2", "FR-9"]
  },
  "suggestions": [
    {
      "action": "rename_ref",
      "from": "FR-99",
      "to": "FR-9",
      "confidence": 0.7,
      "reason": "Closest by Levenshtein; FR-9 text mentions OAuth"
    },
    {
      "action": "remove_ref",
      "reason": "If task no longer needed"
    },
    {
      "action": "create_fr",
      "draft_id": "FR-10",
      "reason": "If TASK-12 implements new requirement"
    }
  ],
  "auto_fixable": false
}
```

### Finding `code` enum

| Code | Severity (default) | Description |
|------|---------------------|-------------|
| `UNCOVERED_FR` | warning | FR has no @FR-N tagged Scenario |
| `ORPHAN_TASK` | warning | Task references non-existent FR |
| `ORPHAN_AC` | warning | AC parent FR doesn't exist |
| `SCENARIO_TAG_ORPHAN` | warning | Scenario tagged @FR-N, FR-N doesn't exist |
| `UNTAGGED_SCENARIO` | warning | Scenario has no @FR-/@NFR-/@AC- tags |
| `BROKEN_REF` | error | Wiki-link or inline-link points nowhere |
| `DUPLICATE_DEFINITION` | error | Same ID in two locations (HARD-deny) |
| `MALFORMED_FRONTMATTER` | error | YAML frontmatter syntax error (HARD-deny) |
| `MALFORMED_GHERKIN` | error | `.feature` file parse error (HARD-deny) |
| `INVALID_ANCHOR_PATTERN` | error | Heading matches `anchor_patterns` regex but produces empty anchor |
| `FR_REGRESSION` | error | Scenario was PASSED, now FAILED after FR edit |
| `STALE_NDJSON` | info | Test results older than configurable threshold (default 24h) |
| `NO_TEST_RUN_DATA` | info | No NDJSON file present at all |
| `SEMANTIC_DRIFT` | warning | (Phase 3 opt-in) LLM judges Scenario doesn't match FR text |
| `ARCHIVED_REF` | info | Wiki-link points to spec in `.specs/archive/` |

## Entity 7: MCP `BlastResponse` (output of `blast_radius`)

```json
{
  "node": { "id": "FR-001", "type": "FR" },
  "change_type": "modify",
  "blast": {
    "scenarios": [
      { "id": "SCEN-login-ok", "tags_used": ["@FR-001"] }
    ],
    "tasks": [
      { "id": "TASK-12", "ref_type": "implements" }
    ],
    "code_files": [
      { "path": "src/auth/AuthService.cs", "lines": "42-78", "confidence": "high" }
    ],
    "last_passing_tests": [
      { "scenario_id": "SCEN-login-ok", "lastResult": "PASSED", "at_risk": true }
    ],
    "related_nodes": [
      { "id": "FR-005", "reason": "shares tag" }
    ],
    "cycle_detected": null,
    "max_depth_reached": false
  }
}
```

## Правила валидации

### General invariants
- Каждый `node.id` уникален в рамках workspace (DUPLICATE_DEFINITION enforced via PreToolUse hook)
- Каждый edge `from`/`to` ОБЯЗАН ссылаться на existing node (orphan edges не допускаются)
- `anchor_patterns` regex MUST produce non-empty capture group (validated at config load)

### Node validation
- `Scenario.pickleId` MUST match a pickle in NDJSON if NDJSON present
- `AC.parentFr` MUST resolve to existing FR node
- `Task.refs[]` MUST resolve to existing FR nodes (else ORPHAN_TASK finding)

### Frontmatter
- `_no_push_check: true` — valid only in spec MD frontmatter (not config)
- `_draft: true` — FR/NFR with this flag NOT included в conformance_check by default (configurable)

### NDJSON validation
- Each envelope JSON-validated against `@cucumber/messages` schema
- Truncated NDJSON (missing `testRunFinished`) — partial parse + mark `incomplete_run: true`
- Empty NDJSON or invalid JSON — emit `NO_TEST_RUN_DATA` finding, don't crash

### Lock file
- `pid` MUST be alive (`process.kill(pid, 0)` returns true) — stale = pid not found, lock deleted + recreated
- `env` MUST match current environment — mismatch = DENY second MCP start
- Atomic create via `flag: 'wx'` (O_EXCL) — pattern from `atomic-update-lock` rule

### SQLite (Phase 4)
- `PRAGMA integrity_check` MUST return `ok` at startup — failure = corrupt, fallback to in-memory
- File mode `0600` — owner read/write only (NFR-Security-5)
- WAL mode mandatory — `PRAGMA journal_mode=WAL`
- Schema version tracked in `meta.schema_version` table; mismatch = migration required

---

## Consistency Report YAML (Phase 7)

Written by `cross-spec-reconcile` skill to `.specs/{slug}/consistency-report.yaml`. Read by `cross-spec-resolve` skill. Atomic temp-file+rename writes per `.claude/rules/atomic-config-save.md`. Merge writes preserve `acknowledged_by` / `resolution_status` / `override_*` / `resolved_at` / `defer_reason` fields across runs.

### Schema version policy

- **Current version: 1** (introduced 2026-05-20 with FR-17/FR-18 spec-only update). All v0.2.0 producers write `version: 1`.
- **Reader behavior on unknown version** — `cross-spec-resolve` skill MUST refuse to consume a YAML report whose `version` field is missing OR greater than the highest version the reader understands. Resolve emits hint «Report schema version <N> unsupported; upgrade dev-pomogator or run reconcile to regenerate.» and exits non-zero. This prevents silent misinterpretation of future field additions/removals.
- **Reader behavior on older known version** — Reader MAY consume an older version if it can still satisfy contract (e.g. v1 reader consuming hypothetical v0 by populating defaults). In practice for v1 there is no v0; this clause is forward-looking.
- **Writer behavior on existing YAML with mismatching version** — When merging fields (preserving `acknowledged_by` etc.), if existing YAML `version` differs from writer's current version, writer MUST treat existing file as opaque and overwrite cleanly without merge (preserving only fields the writer knows). User-visible effect: a resolve-session's progress in an older-version YAML may be discarded by a newer reconcile run — implementation SHOULD warn in stderr before overwriting.
- **Migration policy for future v2** — When v2 introduces breaking field changes, dev-pomogator ships an in-place migration helper (mirror of `migrate-v3-to-v4` pattern in FR-11): `dev-pomogator migrate-consistency-report` reads v1 YAMLs and rewrites them as v2 with field renames/restructuring. Helper runs interactively per file (default `skip` if no input within 30s) per `NFR-Usability-4`. Migration must be invoked explicitly by user; reconcile never auto-migrates on read.
- **Out of scope for v0.2.0** — Concurrent multi-version producers (e.g., one tool writing v1 while another writes v2 against same file). Mitigation: lock file pattern deferred per (j) Concurrency semantics in `DESIGN.md`.

### Top-level fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | integer | yes | Schema version, currently `1` |
| `generated_at` | ISO 8601 string | yes | Timestamp of reconcile invocation that produced this report |
| `spec_slug` | string | yes | Current spec slug invoking reconcile (corresponds to `.specs/{slug}/`) |
| `mode` | `"light"` \| `"full"` | yes | Reconcile mode that was run |
| `dry_run` | boolean | yes | True if this run was `--dry-run` (file not written to disk in that case; field included only on stdout dump) |
| `partial` | boolean | yes | True if Agent subagent failed on some pairs and findings are partial |
| `scope` | object | yes | `{specs_compared: string[], impl_paths_checked: string[]}` — what reconcile actually scanned |
| `summary` | object | yes | Dashboard block (see below) |
| `findings` | Finding[] | yes | Array of finding objects (may be empty); see below |
| `recommendations` | Recommendation[] | no | Prioritized action items per case-study format (priority + action + impact) |
| `acknowledged` | string[] | no | Finding-code IDs that user has acknowledge-and-override'd; redundant index for fast filter |
| `warnings` | string[] | no | When `partial: true`, human-readable list of failed pair signatures + reason |

### `summary` object

| Field | Type | Description |
|-------|------|-------------|
| `by_severity` | `{CRITICAL: int, WARNING: int, INFO: int}` | Count of findings per severity tier |
| `by_class` | `{covered: int, uncovered: int, orphaned: int, outdated: int}` | OpenFastTrace 4-class grouping count |
| `by_namespace` | `{cross-spec: int, impl-drift: int}` | Count of findings per top-level namespace |
| `totals` | `{findings: int, specs_compared: int, impl_paths_checked: int}` | Scalar totals |
| `top_3_recommendations` | Recommendation[] (length ≤3) | Highest-impact actions, mirror of first 3 entries in top-level `recommendations[]` |

### `Finding` object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | yes | Spectral-namespaced finding code, e.g. `cross-spec/fr-overlap` |
| `severity` | `"CRITICAL"` \| `"WARNING"` \| `"INFO"` | yes | Severity tier |
| `class` | `"covered"` \| `"uncovered"` \| `"orphaned"` \| `"outdated"` | yes | OpenFastTrace 4-class |
| `spec_a` | string | yes | Primary spec slug involved (current spec for impl-drift codes) |
| `spec_b` | string | no | Second spec slug (only for cross-spec/* codes) |
| `location` | string | yes | File path + line number reference, e.g. `DESIGN.md:142` |
| `message` | string | yes | Human-readable description of the drift/conflict |
| `suggested_fix` | string | yes | Actionable remediation hint consumed by resolve skill |
| `confidence` | number 0..1 | no | Subagent confidence (full mode only) |
| `snippets` | string[] | no | Quoted excerpts from sources (for LLM-detected findings) |
| `referenced_in` | string | no | Specific file:line where the claim originates (impl-drift/* codes) |
| `expected_path` | string | no | File path that was expected (impl-drift/missing-file etc.) |
| `expected_symbol` | string | no | Symbol name expected to exist (impl-drift/missing-symbol) |
| `expected_tool` | string | no | MCP tool name expected (impl-drift/mcp-tool-drift) |
| `path_alternatives` | PathAlt[] | no | Path A/B/C alternatives for architectural-decision-vs-reality findings |
| `resolution_status` | `"resolved"` \| `"deferred"` \| `"acknowledged"` \| `"still_present"` \| `"transformed"` | no | Set by resolve skill after applying / deferring / acknowledging |
| `resolved_at` | ISO 8601 string | no | Timestamp resolve skill applied the fix |
| `defer_reason` | string | no | Text reason when `resolution_status: deferred` |
| `acknowledged_by` | string | no | `"user"` when user overrode CRITICAL gate |
| `override_reason` | string | no | Text reason supplied at acknowledge prompt |
| `override_timestamp` | ISO 8601 string | no | Time of acknowledge action |

### `PathAlt` object (architectural fork)

| Field | Type | Description |
|-------|------|-------------|
| `label` | string | Short label, e.g. `"Path A: Evaluator in existing agents/eval"` |
| `recommended` | boolean | True for one option max |
| `pros` | string[] | Bullet list of benefits |
| `cons` | string[] | Bullet list of trade-offs |
| `impacted_files` | string[] | File paths the patch would touch (used by resolve to generate per-file confirms) |

### `Recommendation` object

| Field | Type | Description |
|-------|------|-------------|
| `priority` | integer | 1-based rank |
| `action` | string | What to do |
| `impact` | string | Why it matters (closes which finding code / unblocks what) |

### Cross-Spec Finding Codes (28 codes)

Naming convention: `namespace/kebab-case-rule` (Spectral). Severity map below; class assignment is computed at runtime per code rule.

#### `cross-spec/*` (15 codes)

| Code | Severity | Class | Description |
|------|----------|-------|-------------|
| `cross-spec/runtime-identifier-drift` | CRITICAL | uncovered | Two specs (or one spec + code) use different runtime identifiers (feedback key, event name, state field, metric name) for the same concept; breaks downstream consumer scopes |
| `cross-spec/module-ownership-conflict` | CRITICAL | uncovered | Two specs both claim ownership of the same source file/module |
| `cross-spec/contradictory-fr` | CRITICAL | uncovered | Two FRs in different specs make semantically opposite claims about the same behavior |
| `cross-spec/fr-overlap` | WARNING | covered | Two FRs cover overlapping functionality without explicit boundary; potential duplication of owner |
| `cross-spec/nfr-conflict` | WARNING | uncovered | Conflicting NFR budgets between specs targeting the same component (e.g., latency <100ms vs <50ms) |
| `cross-spec/duty-delegation-ambiguity` | WARNING | uncovered | Two specs both claim to handle the same runtime event with no clear delegation contract |
| `cross-spec/integration-contract-drift` | WARNING | uncovered | One spec describes an API endpoint; another spec calls it but signatures diverge |
| `cross-spec/schema-drift` | WARNING | uncovered | Pairwise SCHEMA.md files describe overlapping types differently |
| `cross-spec/terminology-drift` | WARNING | covered | Same concept under different names across specs (PascalCase vs camelCase vs kebab-case) — soft variant of runtime-identifier-drift |
| `cross-spec/naming-convention-drift` | INFO | covered | Different stylistic conventions for the same artifact type across specs (file naming, ID naming) |
| `cross-spec/priority-inversion` | WARNING | outdated | Spec A marks feature as blocker; dependent Spec B marks it as optional |
| `cross-spec/skill-trigger-collision` | WARNING | covered | Two skills auto-route on overlapping trigger phrases (per CLAUDE.md auto-routing table) |
| `cross-spec/cascading-interaction` | INFO | covered | Feature A combined with Feature B produces poor combined UX (e.g., multi-metric interrupt cascade) |
| `cross-spec/stale-spec-outstanding-but-done` | WARNING | outdated | One spec lists a gap as outstanding while code in another sprint already implements it |
| `cross-spec/stale-spec-roadmap-drift` | INFO | outdated | Spec describes future work that has since become past; roadmap section needs trim |

#### `impl-drift/*` (13 codes)

| Code | Severity | Class | Description |
|------|----------|-------|-------------|
| `impl-drift/missing-file` | WARNING | uncovered | Path declared in DESIGN.md does not exist on disk |
| `impl-drift/missing-symbol` | WARNING | uncovered | FR references a function/class/type not exported by any code module |
| `impl-drift/stale-reference` | WARNING | outdated | Path used to exist; renamed/deleted/moved; spec link is dead |
| `impl-drift/mcp-tool-drift` | WARNING | uncovered | SCHEMA.md or DESIGN.md lists an MCP tool that is not exported by any `*-mcp-server/index.ts` |
| `impl-drift/hook-registration-drift` | WARNING | uncovered | Spec declares a hook (PreToolUse/PostToolUse) that is not registered in any `extension.json` `hooks` block |
| `impl-drift/scenario-no-step-def` | WARNING | uncovered | Gherkin scenario step has no binding in any Cucumber Steps file |
| `impl-drift/test-missing` | INFO | uncovered | TASKS.md references a test file path that does not exist in `tests/` |
| `impl-drift/type-drift` | WARNING | outdated | SCHEMA.md JSON shape diverges from the corresponding TypeScript/Python type definition in code |
| `impl-drift/output-not-exposed` | WARNING | uncovered | Spec uses a value from `state.X` or `run.outputs.Y` but the producer code never propagates that field |
| `impl-drift/data-shape-incompatible` | CRITICAL | uncovered | Proposed data shape violates an external API constraint (e.g. LangSmith `score: float` but spec proposes object) |
| `impl-drift/architectural-decision-vs-reality` | CRITICAL | orphaned | User-confirmed architecture choice in spec contradicts shape of existing code (subagent verdict=contradiction) |
| `impl-drift/duplicate-infrastructure` | CRITICAL | orphaned | Two parallel implementations of the same concern exist in code or are proposed across specs |
| `impl-drift/cold-start-ux-gap` | INFO | uncovered | New feature relies on baseline that does not exist yet → silent degradation for first N runs |

### SARIF 2.1.0 mapping

Each finding code maps 1:1 to a SARIF rule object under `runs[0].tool.driver.rules[]`:

```json
{
  "id": "cross-spec/runtime-identifier-drift",
  "name": "RuntimeIdentifierDrift",
  "shortDescription": { "text": "Same concept under different runtime identifiers across specs" },
  "defaultConfiguration": { "level": "error" },
  "helpUri": "https://github.com/.../spec-generator-v4_SCHEMA.md#cross-spec-finding-codes-28-codes"
}
```

Severity mapping: CRITICAL → `level: "error"`, WARNING → `level: "warning"`, INFO → `level: "note"`.

Each finding emitted as `runs[0].results[]` entry referencing the rule via `ruleId`, with `locations[]` populated from finding `location` field (`physicalLocation.artifactLocation.uri` + `region.startLine`).

This mapping enables GitHub Code Scanning ingestion (PR annotations) and VS Code SARIF Viewer extension display with zero additional schema work.
