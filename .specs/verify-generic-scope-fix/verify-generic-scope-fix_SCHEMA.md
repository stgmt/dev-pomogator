# verify-generic-scope-fix Schema

## Marker File

**Path:** `{cwd}/.claude/.scope-verified/<session_id>-<shortdiffsha12>.json`

Where:
- `cwd` — absolute path to git repo root (from hook's stdin `data.cwd`)
- `session_id` — Claude Code session UUID (from stdin `data.session_id`)
- `shortdiffsha12` — first 12 hex chars of `sha256(git diff --cached)` for filename uniqueness

```json
{
  "timestamp": "number (Date.now() ms since epoch)",
  "diff_sha256": "string (64 hex chars, full sha256 of git diff --cached unified diff)",
  "session_id": "string (UUID matching stdin session_id)",
  "variants": [
    {
      "file": "string (path relative to cwd)",
      "kind": "enum-item | switch-case | array-entry",
      "name": "string (variant name, e.g. 'stocktaking')",
      "lineNumber": "number (1-based line in file)",
      "reach": "traced | unreachable | conditional",
      "evidence": "string (short human-readable trace — which grep/dataflow proof)"
    }
  ],
  "should_ship": "boolean"
}
```

**Field descriptions:**

- `timestamp`: Unix milliseconds at marker write time. Used for TTL invalidation (>30min → stale).
- `diff_sha256`: Full sha256 of unified diff. Used for diff-hash pin invalidation (any change → stale).
- `session_id`: Claude Code session UUID. Prevents cross-session marker use.
- `variants[]`: One entry per added variant detected by skill's `parseAddedVariants()`.
  - `file`: Relative path (not absolute) for reproducibility.
  - `kind`: Variant type classifier. Used by skill for context-specific grep patterns.
  - `name`: String literal value being added.
  - `lineNumber`: For debugging / user navigation.
  - `reach`: Classification from skill's reach analysis.
    - `traced` — dedicated-flow grep finds no separate component AND dataflow reaches gate function AND values are user-entered
    - `unreachable` — any of (separate create flow / gate not in dataflow / values auto-generated)
    - `conditional` — reachable only через feature flag / edge case / config branch
  - `evidence`: Short proof string, e.g., `"grep StartStockTakingModal → found src/components/StartStockTakingModal.tsx"`.
- `should_ship`: Boolean decision. `false` IFF any variant has `reach: "unreachable"`; otherwise `true`.

---

## PreToolUse Hook Input (subset we depend on)

Claude Code sends this JSON on stdin to PreToolUse hooks. Full schema defined in https://code.claude.com/docs/en/hooks — below is subset used by `scope-gate-guard.ts`.

```json
{
  "tool_name": "string (e.g. 'Bash', 'Edit', 'Write')",
  "tool_input": {
    "command": "string (for Bash tool — the shell command)"
  },
  "cwd": "string (absolute path to current working directory)",
  "session_id": "string (UUID of current Claude Code session)"
}
```

**Fields used:**
- `tool_name`: filtered first (`"Bash"` only).
- `tool_input.command`: parsed for `git (commit|push)` prefix + escape-hatch regex.
- `cwd`: root for marker store (`{cwd}/.claude/.scope-verified/`) AND escape log (`{cwd}/.claude/logs/scope-gate-escapes.jsonl`).
- `session_id`: embedded в marker filename + marker body для session scoping.

**Fields ignored:** hook payload may include additional fields (permissions, transcript, etc.); hook reads ONLY the above to minimize coupling to Claude Code API.

---

## PreToolUse Hook Output (deny form)

On deny, hook writes JSON to stdout (single line) AND calls `process.exit(2)`.

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "string (≤1000 chars, actionable)"
  }
}
```

**`permissionDecisionReason` content format:**

```
[scope-gate] Detected {N} suspicious patterns in staged diff:
  • {reason1}
  • {reason2}
  ...

Score: {score} (threshold: 2)

To proceed:
  1. Run: /verify-generic-scope-fix
     (creates marker, unblocks if all variants traced)
  2. OR add escape hatch to commit message:
     [skip-scope-verify: <reason ≥8 chars>]

Docs: .claude/rules/scope-gate/when-to-verify.md
```

---

## Escape Log Entry (JSONL append-only)

**Path:** `{cwd}/.claude/logs/scope-gate-escapes.jsonl`

Format: **newline-delimited JSON** (JSONL) — one complete JSON object per line, terminated с `\n` after each object. No arrays, no nested outer wrapper.

**Schema per line:**
```json
{"ts": "ISO8601 string", "diff_sha256": "string", "reason": "string", "session_id": "string", "cwd": "string"}
```

**Concrete example (3 consecutive lines в файле):**
```jsonl
{"ts":"2026-04-23T12:00:00.000Z","diff_sha256":"abc123def456...","reason":"dead-code path confirmed with reviewer","session_id":"uuid-1","cwd":"/repo/webapp"}
{"ts":"2026-04-23T13:15:22.417Z","diff_sha256":"789def456abc...","reason":"presentation enum, no runtime gate","session_id":"uuid-2","cwd":"/repo/webapp"}
{"ts":"2026-04-23T14:22:10.088Z","diff_sha256":"fedcba987654...","reason":"refactor only, semantically equivalent","session_id":"uuid-3","cwd":"/repo/webapp"}
```

**Write method:** `fs.appendFileSync(path, JSON.stringify(entry) + "\n", {encoding: "utf-8", flag: "a"})`.

**Fields:**
- `ts`: ISO 8601 timestamp (`new Date().toISOString()`).
- `diff_sha256`: sha256 of staged diff at escape time (для audit — what was skipped).
- `reason`: captured regex group 1 OR env `SCOPE_GATE_SKIP` value.
- `session_id`: from stdin.
- `cwd`: for cross-project audit aggregation (if user greps jsonl across multiple projects).

---

## Block Log Entry (JSONL, for tuning)

**Path:** `{cwd}/.claude/logs/scope-gate-blocks.jsonl` (optional, tunable via env `SCOPE_GATE_AUDIT_BLOCKS=1`)

```json
{"ts": "ISO8601 string", "diff_sha256": "string", "score": "number", "reasons": ["string"], "session_id": "string", "cwd": "string"}
```

Used only during v0.x tuning period. Allows maintainers to grep for genuine false positives and adjust `scoreDiff()` weights.

---

## extension.json Schema (subset)

```json
{
  "name": "scope-gate",
  "version": "0.1.0",
  "description": "string",
  "platforms": ["claude"],
  "category": "verification",
  "skills": { "verify-generic-scope-fix": ".claude/skills/verify-generic-scope-fix" },
  "skillFiles": {
    "verify-generic-scope-fix": [
      ".claude/skills/verify-generic-scope-fix/SKILL.md",
      ".claude/skills/verify-generic-scope-fix/scripts/analyze-diff.ts"
    ]
  },
  "tools": { "scope-gate": "tools/scope-gate" },
  "toolFiles": {
    "scope-gate": [
      ".dev-pomogator/tools/scope-gate/scope-gate-guard.ts",
      ".dev-pomogator/tools/scope-gate/score-diff.ts",
      ".dev-pomogator/tools/scope-gate/marker-store.ts"
    ]
  },
  "ruleFiles": {
    "claude": [
      ".claude/rules/scope-gate/when-to-verify.md",
      ".claude/rules/scope-gate/escape-hatch-audit.md"
    ]
  },
  "hooks": {
    "claude": {
      "PreToolUse": {
        "matcher": "Bash",
        "command": "npx tsx .dev-pomogator/tools/scope-gate/scope-gate-guard.ts",
        "timeout": 5
      }
    }
  }
}
```

---

## Правила валидации

- **V-1:** Marker file `diff_sha256` MUST be exactly 64 hex chars (full sha256 output). Filename uses first 12 chars for filesystem-friendly length.
- **V-2:** `timestamp` MUST be numeric (not string) — enables arithmetic TTL check.
- **V-3:** `session_id` MUST be non-empty string. Empty → treat marker as corrupt, return null.
- **V-4:** `variants` array MAY be empty (if skill found no addable variants — edge case, skill should `exit` with warning; marker empty is invalid).
- **V-5:** `should_ship === false` iff (`variants.length === 0` OR any `variant.reach === "unreachable"`).
- **V-6:** Escape log entries MUST have `reason.length >= 8` for audit validity (but hook still writes entries with shorter reasons + WARN to stderr — audit reader should filter).
- **V-7:** Hook input JSON: missing `cwd` → fallback to `process.cwd()`. Missing `session_id` → treat marker as absent (cannot validate session scoping).
- **V-8:** extension.json SHALL pass `extension-manifest-integrity.md` rule checks (all toolFiles/skillFiles paths exist).

## Compatibility

- Hook stdin schema version: follows Claude Code PreToolUse contract as of 2026-04 docs. Breaking changes → bump `extension.json` version and update this schema.
- Marker schema version: v1 (this document). If future versions add fields, hook SHOULD accept forward-compatible (`m.version ?? 1` default). Current version field implied from structure, not stored explicitly (YAGNI until v2 shipped).
