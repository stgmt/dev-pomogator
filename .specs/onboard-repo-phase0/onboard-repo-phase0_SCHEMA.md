# `.onboarding.json` Schema — v1.0

Формальная JSON Schema (Draft 2020-12) для `.specs/.onboarding.json`. Поставляется в `extensions/onboard-repo/tools/onboard-repo/schemas/onboarding.schema.json` и используется AJV validator при каждом write.

## Top-level structure (17 блоков + метаданные)

```jsonc
{
  "$schema": "string",              // URL to onboarding.schema.json
  "schema_version": "1.0",          // REQUIRED — semver, для migration detection
  "version": "1.0",                 // REQUIRED — artifact instance version
  "last_indexed_sha": "string",     // REQUIRED — git rev-parse HEAD at finalization
  "indexed_at": "ISO-8601 datetime", // REQUIRED
  "generated_by": "dev-pomogator/onboard-repo/1.0.0", // REQUIRED
  "cache_policy": { ... },          // REQUIRED
  "project": { ... },               // Block 1 — REQUIRED
  "tech_context": { ... },          // Block 2 — REQUIRED
  "commands": { ... },              // Block 3 — REQUIRED
  "system_patterns": { ... },       // Block 4 — OPTIONAL (пусто для minimalistic repos)
  "repo_map": { ... },              // Block 5 — OPTIONAL
  "rules_index": [ ... ],           // Block 6 — REQUIRED (may be empty array)
  "skills_registry": [ ... ],       // Block 7 — REQUIRED (may be empty)
  "hooks_registry": [ ... ],        // Block 8 — REQUIRED (may be empty)
  "subagents_registry": [ ... ],    // Block 9 — OPTIONAL (experimental feature)
  "mcp_servers": [ ... ],           // Block 10 — REQUIRED (may be empty)
  "boundaries": { ... },            // Block 11 — REQUIRED
  "gotchas": [ ... ],               // Block 12 — REQUIRED (may be empty)
  "env_requirements": { ... },      // Block 13 — REQUIRED
  "verification": { ... },          // Block 14 — REQUIRED
  "code_style": { ... },            // Block 15 — OPTIONAL
  "workflow": { ... },              // Block 16 — OPTIONAL
  "imports": [ ... ],               // Block 17a — OPTIONAL
  "ignore": { ... },                // Block 17b — REQUIRED
  "glossary": [ ... ],              // Block 18 — REQUIRED (may be empty)
  "archetype": "enum",              // REQUIRED
  "archetype_confidence": "enum",   // REQUIRED
  "archetype_evidence": "string",   // REQUIRED
  "archetype_specific": { ... },    // OPTIONAL — depends on archetype
  "ingestion": { ... },             // OPTIONAL — repomix metadata
  "baseline_tests": { ... },        // REQUIRED (may be null-variant)
  "active_context": { ... },        // Dynamic — updated per session
  "progress": { ... },              // Dynamic
  "warnings": [ ... ],              // OPTIONAL
  "metrics": { ... },               // OPTIONAL
  "phase0_duration_ms": "number",   // REQUIRED
  "existing_ai_configs": [ ... ]    // REQUIRED (may be empty)
}
```

---

## Block definitions

### cache_policy

```json
{
  "invalidate_on_sha_drift": true,
  "drift_threshold_commits": 5,
  "invalidate_on_file_change": [
    ".claude/rules/**",
    "extensions/**/extension.json",
    "CLAUDE.md",
    "package.json",
    "pyproject.toml"
  ]
}
```

### project (Block 1)

```json
{
  "name": "string (REQUIRED)",
  "purpose": "string (REQUIRED, 1 sentence)",
  "domain_problem": "string (REQUIRED, 2-3 sentences)",
  "audience": ["string[]"],
  "scope_boundaries": "string (OPTIONAL)"
}
```

### tech_context (Block 2)

```json
{
  "languages": [{ "name": "string", "version": "string", "usage": "string" }],
  "frameworks": [{ "name": "string", "version": "string", "role": "string" }],
  "package_managers": ["string[]"],
  "runtime_versions": { "node": "string", "python": "string", "..." : "string" },
  "technical_constraints": ["string[]"]
}
```

### commands (Block 3) — **AI-first field**

Каждая команда — объект:

```jsonc
{
  "<command-name>": {
    "via_skill": "string | null",               // skill name если есть wrapper, null если нет
    "preferred_invocation": "string",            // то что AI должен использовать ("/run-tests" или "npm run build")
    "fallback_cmd": "string",                    // raw command для degraded mode
    "raw_pattern_to_block": "string (regex)",    // regex для PreToolUse hook; null если блокировка не нужна
    "forbidden_if_skill_present": "boolean",     // true → hook deny-ит raw pattern
    "reason": "string",                          // объяснение зачем wrapper — попадает в hook decision reason
    "enforces": "string (OPTIONAL)"              // описание hook enforcement mechanism
  }
}
```

**Стандартные keys:** `test`, `test_single`, `build`, `lint`, `typecheck`, `format`, `dev`, `commit`, `dockerize`, `deploy`, `doctor`. Feature может добавить свои. Keys lowercase kebab-case.

**Validation rule:** IF `via_skill != null` AND `forbidden_if_skill_present == true` AND `raw_pattern_to_block == ""` → schema violation.

### system_patterns (Block 4)

```json
{
  "architecture": "string",
  "key_decisions": ["string[]"],
  "design_patterns": ["string[]"],
  "component_relationships": ["string[]"],
  "critical_paths": ["string[]"]
}
```

### repo_map (Block 5) — Aider-style signatures

```json
{
  "entry_points": [{ "file": "string", "role": "string" }],
  "key_symbols": [
    {
      "file": "string",
      "symbol": "string",
      "signature": "string",
      "why_important": "string"
    }
  ]
}
```

### rules_index (Block 6) — **AI-first field**

```json
[
  {
    "name": "string (REQUIRED)",
    "trigger": "string (REQUIRED, когда правило применяется)",
    "enforces": "string (REQUIRED, 1 sentence)",
    "path": "string (REQUIRED, relative from project root)",
    "always_loaded": "boolean"
  }
]
```

### skills_registry (Block 7) — **AI-first field**

```json
[
  {
    "name": "string (REQUIRED)",
    "trigger": "string (REQUIRED)",
    "description": "string (REQUIRED)",
    "invocation_example": "string (REQUIRED, e.g. /run-tests или natural language)",
    "path": "string"
  }
]
```

### hooks_registry (Block 8) — **AI-first field**

```json
[
  {
    "event": "enum (SessionStart|Stop|PreToolUse|PostToolUse|UserPromptSubmit)",
    "matcher": "string",
    "action": "string",
    "path": "string (settings.json или settings.local.json)",
    "managed_by": "string (extension name если установлен через dev-pomogator)"
  }
]
```

### subagents_registry (Block 9) — OPTIONAL

```json
[
  {
    "name": "string",
    "description": "string",
    "tools": ["string[]"],
    "path": "string"
  }
]
```

### mcp_servers (Block 10) — **AI-first field**

```json
[
  {
    "name": "string",
    "capabilities": ["string[]"],
    "auth_required": "string | null (env var name или null)",
    "url_or_path": "string"
  }
]
```

### boundaries (Block 11) — **AI-first field, AGENTS.md 3-tier pattern**

```json
{
  "always": ["string[] (список обязательных действий)"],
  "ask_first": ["string[] (действия требующие подтверждения user)"],
  "never": ["string[] (запрещённые действия)"]
}
```

**Validation:** каждый массив ≥ 1 item recommended. Empty → warning в validation output.

### gotchas (Block 12) — **AI-first field**

```json
[
  {
    "symptom": "string (что видит разработчик)",
    "cause": "string (root cause)",
    "fix": "string (actionable step)",
    "severity": "enum (low|medium|high|critical)"
  }
]
```

### env_requirements (Block 13)

```json
{
  "required": [
    {
      "var": "string (env var name)",
      "purpose": "string",
      "found_in": ["string[] (.env, .env.example, etc.)"],
      "example_value_format": "string (OPTIONAL, e.g. 'sk-...' pattern)"
    }
  ],
  "optional": [
    { "var": "string", "purpose": "string", "default": "string" }
  ],
  "secrets_never_in_code": ["string[]"]
}
```

### verification (Block 14) — **Anthropic "give Claude a way to verify"**

```json
{
  "primary_command": "string",
  "success_criteria": "string",
  "screenshot_workflow": "string (OPTIONAL)",
  "manual_checks": ["string[]"]
}
```

### code_style (Block 15)

```json
{
  "rules": ["string[]"],
  "examples": [
    {
      "pattern": "string",
      "path": "string",
      "snippet": "string"
    }
  ]
}
```

### workflow (Block 16)

```json
{
  "git_workflow": "string",
  "commit_style": "string",
  "branch_naming": "string",
  "pr_conventions": "string"
}
```

### imports (Block 17a)

```json
["@README.md", "@CLAUDE.md", "@.claude/rules/plan-pomogator/plan-pomogator.md"]
```

### ignore (Block 17b)

```json
{
  "ai_excluded_paths": ["string[] (из .cursorignore + sensitive always)"],
  "index_only_excluded": ["string[] (из .cursorindexingignore + .gitignore)"],
  "external_configs_found": ["string[] (.cursorignore, .aiderignore, .gitignore)"]
}
```

### glossary (Block 18)

```json
[
  {
    "term": "string",
    "definition": "string",
    "example": "string (OPTIONAL)"
  }
]
```

### archetype + archetype_specific

```jsonc
{
  "archetype": "enum[python-api|nodejs-backend|nodejs-frontend|fullstack-monorepo|dotnet-service|cli-tool|library|infra|ml-research|unknown]",
  "archetype_confidence": "enum[high|medium|low]",
  "archetype_evidence": "string (manifests/paths quoted)",
  "archetype_specific": {
    // python-api:
    "routes"?: [{ "path": "string", "method": "string", "handler_file": "string" }],
    "orm"?: "string",
    // nodejs-frontend:
    "routes"?: ["string[]"],
    "state_management"?: "string (redux/zustand/context)",
    // monorepo:
    "sub_archetypes"?: [{ "path": "string", "archetype": "string" }]
  }
}
```

### ingestion

```json
{
  "method": "enum[repomix|fallback]",
  "output_path": "string (/tmp/... или null)",
  "compression_ratio": "number (0.0-1.0, если repomix)",
  "files_included": "number",
  "total_tokens_estimate": "number"
}
```

### baseline_tests

```jsonc
{
  "framework": "string | null",
  "command": "string",
  "via_skill": "string (e.g. 'run-tests')",
  "passed": "number",
  "failed": "number",
  "skipped": "number",
  "duration_s": "number",
  "failed_test_ids": ["string[]"],
  "reason_if_null": "string",            // если framework == null
  "skipped_by_user": "boolean"           // --skip-baseline-tests flag
}
```

### active_context (Dynamic, updated per session — Cline activeContext.md pattern)

```json
{
  "current_focus": "string",
  "recent_changes": ["string[] (last 5 commits or notable changes)"],
  "next_steps": ["string[]"],
  "active_decisions_considerations": ["string[]"]
}
```

### progress (Dynamic — Cline progress.md pattern)

```json
{
  "works": ["string[] (features currently working)"],
  "pending": ["string[]"],
  "known_issues": ["string[]"]
}
```

### warnings (OPTIONAL)

```json
[
  {
    "step": "enum[archetype|recon|ingestion|baseline|scratch|gate|finalize]",
    "severity": "enum[info|warning|error]",
    "message": "string",
    "context": "object (OPTIONAL)"
  }
]
```

### metrics (OPTIONAL — NFR-O2)

```json
{
  "total_duration_ms": "number",
  "per_step_duration_ms": {
    "archetype_triage": "number",
    "parallel_recon": "number",
    "ingestion": "number",
    "baseline_tests": "number",
    "text_gate": "number",
    "finalize": "number"
  },
  "files_scanned": "number",
  "subagent_retries": "number",
  "tokens_consumed_estimate": "number"
}
```

### existing_ai_configs

```json
[
  "CLAUDE.md",
  ".cursor/rules/workflow.mdc",
  "AGENTS.md",
  ".github/copilot-instructions.md"
]
```

## Правила валидации (formal constraints)

1. **Required top-level fields:** `schema_version`, `version`, `last_indexed_sha`, `indexed_at`, `generated_by`, `cache_policy`, `project`, `tech_context`, `commands`, `rules_index`, `skills_registry`, `hooks_registry`, `mcp_servers`, `boundaries`, `gotchas`, `env_requirements`, `verification`, `ignore`, `glossary`, `archetype`, `archetype_confidence`, `archetype_evidence`, `baseline_tests`, `phase0_duration_ms`, `existing_ai_configs`.

2. **SHA format:** `last_indexed_sha` SHALL match regex `^[a-f0-9]{40}$` (full git SHA-1) OR empty string (для non-git repos — EC-1).

3. **ISO-8601:** `indexed_at` SHALL match `YYYY-MM-DDTHH:MM:SSZ` pattern.

4. **Semver:** `schema_version` SHALL match `^\d+\.\d+(\.\d+)?$`.

5. **Archetype enum:** archetype SHALL be one of 10 values listed.

6. **AI-first rule (FR-10):** `boundaries.always`, `boundaries.ask_first`, `boundaries.never` SHALL be arrays (may be empty for `[]` but keys MUST exist).

7. **Skill reference consistency (FR-18):** FOR each `commands.<k>` WHERE `via_skill != null`: `forbidden_if_skill_present == true` REQUIRES `raw_pattern_to_block != ""`.

8. **Path validation:** все `path` fields в nested objects SHALL be relative paths (no absolute, no `..` outside project root).

9. **Regex safety:** `commands.<k>.raw_pattern_to_block` SHALL compile as valid regex AND SHALL NOT contain ReDoS patterns (e.g., nested quantifiers `(a+)+`). Validator runs `safe-regex` check.

10. **Secret leakage protection:** string fields SHALL NOT match известные secret patterns (sk-, ghp_, xoxb-, AKIA, eyJ...) — NFR-S1 check в pre-write validator. Violation → redaction + warning.

## Example — минимальный valid .onboarding.json

```json
{
  "$schema": "./onboarding.schema.json",
  "schema_version": "1.0",
  "version": "1.0",
  "last_indexed_sha": "abc1234567890abcdef1234567890abcdef12345",
  "indexed_at": "2026-04-21T10:30:00Z",
  "generated_by": "dev-pomogator/onboard-repo/1.0.0",
  "cache_policy": {
    "invalidate_on_sha_drift": true,
    "drift_threshold_commits": 5,
    "invalidate_on_file_change": ["package.json"]
  },
  "project": {
    "name": "my-project",
    "purpose": "Educational coding sandbox",
    "domain_problem": "Playground for trying new frameworks.",
    "audience": ["student"],
    "scope_boundaries": "Not for production use"
  },
  "tech_context": {
    "languages": [{ "name": "typescript", "version": "5.0", "usage": "all" }],
    "frameworks": [],
    "package_managers": ["npm"],
    "runtime_versions": { "node": "20" },
    "technical_constraints": []
  },
  "commands": {
    "test": {
      "via_skill": null,
      "preferred_invocation": "npm test",
      "fallback_cmd": "npm test",
      "raw_pattern_to_block": "",
      "forbidden_if_skill_present": false,
      "reason": "No wrapper; npm script is entry point"
    }
  },
  "rules_index": [],
  "skills_registry": [],
  "hooks_registry": [],
  "mcp_servers": [],
  "boundaries": {
    "always": ["Format code before commit"],
    "ask_first": [],
    "never": ["Commit secrets"]
  },
  "gotchas": [],
  "env_requirements": {
    "required": [],
    "optional": [],
    "secrets_never_in_code": ["API keys", "tokens"]
  },
  "verification": {
    "primary_command": "npm test",
    "success_criteria": "Exit 0",
    "manual_checks": []
  },
  "ignore": {
    "ai_excluded_paths": [".env"],
    "index_only_excluded": ["node_modules/"],
    "external_configs_found": []
  },
  "glossary": [],
  "archetype": "library",
  "archetype_confidence": "medium",
  "archetype_evidence": "package.json has no start script, no Dockerfile",
  "baseline_tests": {
    "framework": "vitest",
    "command": "npm test",
    "via_skill": null,
    "passed": 0,
    "failed": 0,
    "skipped": 0,
    "duration_s": 0.5,
    "failed_test_ids": []
  },
  "phase0_duration_ms": 180000,
  "existing_ai_configs": []
}
```

## Migration Strategy

- **v1.0 → v1.1 (minor):** additive fields only. Existing `.onboarding.json` остаётся valid. Consumers читают до targeted version.
- **v1.x → v2.0 (major):** breaking change. Auto-migration script `extensions/onboard-repo/tools/onboard-repo/migrate-schema.ts {input-json} {output-json}`. Если migration невозможна — user prompt `--refresh-onboarding`.
- **Version detection:** consumers check `schema_version` field при read. If `schema_version > consumer's supported version` — warning `"Onboarding schema newer than tool; upgrade dev-pomogator"`.
