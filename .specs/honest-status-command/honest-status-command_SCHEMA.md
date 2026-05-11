# Honest Status Command Schema

JSON schemas для (a) context bundle main→sub-agent, (b) sub-agent return value, (c) full skill output structured JSON.

## 1. Context Bundle (main skill → sub-agent)

Passed inline в Agent prompt. Size ≤4KB. NFR-Security: credentials filtered before embedding.

```json
{
  "spec_slug": "string",
  "spec_path": "string",
  "plan_path": "string | null",
  "test_paths": ["string"],
  "ac_ids": ["string"],
  "git_sha": "string | null",
  "redacted": true
}
```

- `spec_slug`: kebab-case slug (regex `^[a-zA-Z0-9_-]+$`)
- `spec_path`: absolute path к `.specs/{slug}/`
- `plan_path`: absolute path к `~/.claude/plans/{slug}.md` если exists, иначе null
- `test_paths`: array путей test files в scope спеки (resolved из FILE_CHANGES.md `tests/**` entries)
- `ac_ids`: list AC identifiers (extracted из ACCEPTANCE_CRITERIA.md `## AC-N` headings + sub-bullets `AC-N.M`)
- `git_sha`: current HEAD SHA (для evidence traceability), null если не в git repo
- `redacted`: всегда `true` — sentinel что credentials filter applied (defense in depth)

## 2. Sub-Agent Return JSON

Sub-agent ОБЯЗАН возвращать ТОЛЬКО valid JSON conforming to:

```json
{
  "spec": "string",
  "phase": "Discovery | Context | Requirements | Finalization | Audit | Complete",
  "ac": [
    {
      "id": "string",
      "status": "verified | blocked | claimed_only",
      "evidence": "string | null",
      "reason": "string | null"
    }
  ],
  "tests": {
    "results": {
      "state": "fresh | stale | not_run",
      "total": "number",
      "passed": "number",
      "failed": "number",
      "skipped": "number",
      "mtime_ago_minutes": "number | null"
    },
    "quality": [
      {
        "file": "string",
        "line": "number",
        "name": "string",
        "classification": "STRONG | WEAK | FAKE-POSITIVE-RISK",
        "reason": "string"
      }
    ]
  }
}
```

- `ac[].status`:
  - `verified` → `evidence` ОБЯЗАТЕЛЬНО non-null (path:line OR commit SHA OR command output reference)
  - `blocked` → `reason` ОБЯЗАТЕЛЬНО non-null (e.g. "Docker daemon unreachable")
  - `claimed_only` → no evidence, no reason — AC marked done в TASKS.md без verification artifact
- `tests.results.state`:
  - `fresh` — YAML mtime <5 min AND state ∈ {passed, failed}
  - `stale` — YAML mtime ≥5 min AND state=running (heartbeat dead)
  - `not_run` — no YAML found
- `tests.quality[].classification`:
  - `STRONG` — value-level assertion (toEqual/toMatchObject) + integration или edge case coverage
  - `WEAK` — only presence-level assertion (toBeDefined/toBeTruthy) OR missing edge cases
  - `FAKE-POSITIVE-RISK` — `vi.mock()` для production path OR tautology assertion (`expect(true).toBe(true)`)

## 3. Skill Full Output (combined)

Skill renders combined report (sub-agent output + parent-computed sections). Markdown + JSON-in-comment-block.

```json
{
  "spec": "string",
  "phase": "string",
  "ac": [/* same as Sub-Agent ac[] */],
  "tests": {/* same as Sub-Agent tests */},
  "git": {
    "modified": "number",
    "staged": "number",
    "committed_unpushed": "number",
    "pushed": "number",
    "scope_overlap": "number"
  },
  "environmental_blockers": [
    {
      "type": "docker | wsl | network | yaml_stale",
      "message": "string",
      "actionable_hint": "string"
    }
  ]
}
```

- `git.scope_overlap`: count files в spec scope (overlap с `.specs/{slug}/` + FILE_CHANGES.md paths) modified/staged
- `environmental_blockers`: empty array если no issues; non-empty array → markdown render conditionally adds `## Environmental Blockers` section
- `environmental_blockers[].type`:
  - `docker` — docker ps non-zero / connection error
  - `wsl` — Windows WSL connection failure
  - `network` — connectivity probe failed (если spec requires external service)
  - `yaml_stale` — .test-status YAML stale heartbeat (cross-referenced с tests.results.state=stale)

## Правила валидации

- Sub-agent output ОБЯЗАН быть valid JSON; parse failure → fail-open skeleton report
- `ac[].evidence` non-null IFF `status: verified` (mutual exclusivity с `reason`)
- `ac[].reason` non-null IFF `status: blocked`
- `tests.quality[].line` 1-based (matches editor / grep convention)
- Schema versioning: implicit v1; future changes должны increment `schema_version` field
- Context bundle ≤4KB after serialization (`JSON.stringify(bundle).length ≤ 4096`)
- Spec slug regex `^[a-zA-Z0-9_-]+$` enforced ПЕРЕД любой file system operation
