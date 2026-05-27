# dev-pomogator Canonical Plugin Schema

Эта спека включает несколько data contracts: marketplace catalog manifest, plugin manifest, build pipeline output, migration result. Все schemas соответствуют canonical Anthropic plugin spec (verified per plugin-marketplaces.md, plugins-reference.md, plugins.md).

## Pipeline diagram

```
[dev-pomogator developer edits skills/<name>/SKILL.md, commands/*.md, tools/<tool>/..., or a hook script]
        ↓
[Maintainer hand-edits canonical manifests in .claude-plugin/ (no build-step):]
   ├ .claude-plugin/plugin.json     ← canonical manifest (hand-authored)
   ├ .claude-plugin/marketplace.json ← marketplace catalog (hand-authored)
   └ .claude-plugin/hooks.json      ← hooks config (hand-authored; commands → tools/<tool>/ scripts)
        ↓
[Drift test: tests/e2e/canonical-plugin.test.ts]
   ├ every hooks.json command resolves to an on-disk script under tools/
   ├ every registered hook script under tools/ is present in hooks.json
   ├ plugin.json / marketplace.json / hooks.json schema-valid per Anthropic spec
   └ plugin.json.version == marketplace.json plugins[].version
        ↓ (drift test PASS — manifests in sync with disk)
[git commit + push к dev-pomogator repo]
        ↓
[User]: /plugin marketplace add stgmt/dev-pomogator
   ├ Claude Code clones repo
   ├ Validates marketplace.json schema
   └ Registers marketplace в Claude Code state
        ↓
[User]: /plugin install dev-pomogator@stgmt [--scope user|project|local]
   ├ Reads plugin.json
   ├ Copies plugin tree → ~/.claude/plugins/cache/stgmt/dev-pomogator/<version>/
   ├ Adds "dev-pomogator@stgmt": true в enabledPlugins (соответствующий scope settings.json)
   └ Triggers reload (CLI: /reload-plugins, Desktop: auto или restart)
        ↓
[Plugin active]: skills/commands/hooks/MCP visible во всех target sessions

----------- Migration v1 → v2 (independent flow, user-driven) -----------

[v1 user has project artifacts: .claude/skills/, .dev-pomogator/, .gitignore block]
        ↓
[User runs cleanup script]: npx tsx <repo>/tools/migrate-v1-to-v2.ts
        ↓
[detectV1Install(cwd)] reads <cwd>/.dev-pomogator/.claude-plugin/plugin.json
        ↓ (if version<2.0.0 AND no .migrated-to-v2 marker)
[runMigrationCleanup(info)]
   ├ backup user-modified files → .user-overrides/<rel-path>
   ├ remove .claude/skills/<managed>/, .claude/rules/<managed>/, .dev-pomogator/
   ├ remove managed marker block from .gitignore
   ├ smart-merge removal of dev-pomogator hooks/env from .claude/settings.local.json
   └ write .migrated-to-v2 marker
        ↓
[Print canonical install instructions to stdout]
```

## Canonical plugin manifest (`.claude-plugin/plugin.json`)

```json
{
  "name": "dev-pomogator",
  "version": "2.0.0",
  "description": "Team coding standards and workflows for Claude Code (skills, rules, hooks, MCP servers)",
  "author": {
    "name": "stgmt",
    "url": "https://github.com/stgmt/dev-pomogator"
  },
  "homepage": "https://github.com/stgmt/dev-pomogator",
  "repository": "https://github.com/stgmt/dev-pomogator",
  "license": "MIT",
  "keywords": ["claude-code", "rules", "standards", "tdd", "workflow", "ai-coding"]
}
```

- `name` (string, required) — unique plugin identifier; namespace для skills (`/dev-pomogator:create-spec`).
- `version` (string, semver, optional) — plugin version. Если omitted, Claude Code uses git commit SHA. Recommended: explicit semver для predictable updates.
- `description` (string, optional) — отображается в plugin list.
- `author` (object, optional) — `{ name, email?, url? }`.
- `homepage`, `repository`, `license`, `keywords` — стандартные npm-style metadata fields, supported per plugins-reference.md.

**Constraint per Anthropic spec**: `.claude-plugin/` директория содержит ТОЛЬКО `plugin.json` И (для marketplace плагинов) `marketplace.json`. Anthropic запрещает `commands/`, `agents/`, `skills/` внутри `.claude-plugin/`.

**Component path fields** (опциональные — если не указаны, Claude Code сканирует canonical sub-dirs):
- `skills` — string|array путей к skill directories (default: `skills/`)
- `commands` — string|array путей к command files (default: `commands/`, deprecated)
- `agents` — string|array путей к agent files (default: `agents/`)
- `hooks` — string|object|array путей к hooks config или inline JSON (default: `hooks/hooks.json`)
- `mcpServers` — string|object путь к MCP config или inline JSON (default: `.mcp.json`)
- `lspServers` — string|object|array (если applicable)

dev-pomogator использует canonical defaults (sub-dirs scanning), не overrides component paths.

## Marketplace catalog (`.claude-plugin/marketplace.json`)

```json
{
  "$schema": "https://anthropic.com/schemas/claude-code-marketplace.json",
  "name": "stgmt",
  "owner": {
    "name": "stgmt"
  },
  "description": "stgmt's Claude Code plugins",
  "plugins": [
    {
      "name": "dev-pomogator",
      "source": "./",
      "description": "Team coding standards and workflows for Claude Code (skills, rules, hooks, MCP servers)",
      "version": "2.0.0",
      "author": {
        "name": "stgmt"
      },
      "homepage": "https://github.com/stgmt/dev-pomogator",
      "repository": "https://github.com/stgmt/dev-pomogator",
      "license": "MIT",
      "keywords": ["claude-code", "rules", "standards", "tdd", "workflow", "ai-coding"]
    }
  ]
}
```

### Top-level fields (verified per plugin-marketplaces.md)

| Field | Type | Required? | Description |
|-------|------|-----------|-------------|
| `name` | string | **Yes** | Marketplace identifier (kebab-case). Public-facing; users see it в `/plugin install <plugin>@<marketplace>`. dev-pomogator uses `"stgmt"`. |
| `owner` | object | **Yes** | `{ name (required), email? }`. Marketplace maintainer info. |
| `plugins` | array | **Yes** | Список plugins ≥1 entry. |
| `$schema` | string | No | JSON Schema URL для editor autocomplete; Claude Code ignores at load time. |
| `description` | string | No | Brief marketplace description. |
| `version` | string | No | Marketplace manifest version. |
| `metadata.pluginRoot` | string | No | Base directory prepended to relative source paths. |
| `allowCrossMarketplaceDependenciesOn` | array | No | Other marketplaces dependencies allowed from. |

### Plugin entry fields (within `plugins[]`)

| Field | Type | Required? | Description |
|-------|------|-----------|-------------|
| `name` | string | **Yes** | Plugin identifier (kebab-case). dev-pomogator uses `"dev-pomogator"`. |
| `source` | string\|object | **Yes** | Where plugin source lives. dev-pomogator uses `"./"` (same repo as marketplace). |
| `description` | string | No | Plugin description. |
| `version` | string | No | Plugin version. Если specified, pinned; users get update только when changes. Если omitted — git commit SHA. |
| `author` | object | No | `{ name, email? }`. |
| `homepage` | string | No | URL. |
| `repository` | string | No | Source code URL. |
| `license` | string | No | SPDX identifier. |
| `keywords` | array | No | Discovery tags. |
| `category` | string | No | Categorization. |
| `tags` | array | No | Searchability. |
| `strict` | boolean | No | If true (default), plugin.json is authority; if false, marketplace entry can override. |

### Source field formats (verified per plugin-marketplaces.md)

| Format | Example |
|--------|---------|
| Relative path (within marketplace repo) | `"./"` или `"./plugins/my-plugin"` |
| GitHub | `{"source": "github", "repo": "owner/repo"}` |
| Git URL | `{"source": "url", "url": "https://gitlab.com/team/plugin.git"}` |
| Git subdirectory | `{"source": "git-subdir", "url": "...", "path": "tools/plugin"}` |
| npm package | `{"source": "npm", "package": "@scope/package"}` |

dev-pomogator использует **relative path `"./"`** (single-plugin marketplace, plugin source = same repo as marketplace).

## V1InstallInfo (migration script input)

```json
{
  "projectPath": "/abs/path/to/project",
  "v1Manifest": {
    "name": "dev-pomogator",
    "version": "1.5.0",
    "skills": [
      { "name": "create-spec", "path": ".claude/skills/create-spec" }
    ]
  },
  "managedFiles": [
    { "path": ".claude/skills/create-spec/SKILL.md", "expectedHash": "<sha256>", "actualHash": "<sha256>" }
  ],
  "userModifiedFiles": [
    { "path": ".claude/rules/custom-edit.md", "originalHash": "<sha256>", "modifiedHash": "<sha256>" }
  ],
  "managedDirectories": [
    ".claude/skills",
    ".claude/rules",
    ".dev-pomogator"
  ],
  "gitignoreBlockPresent": true,
  "settingsLocalHooks": [
    { "event": "Stop", "matcher": "*", "command": "node -e ..." }
  ]
}
```

- `projectPath` — absolute path to v1 project install root.
- `v1Manifest` — content of `<projectPath>/.dev-pomogator/.claude-plugin/plugin.json`.
- `managedFiles[]` — files где `actualHash == expectedHash` (safe to remove).
- `userModifiedFiles[]` — files где hash mismatch (backup required).
- `managedDirectories[]` — top-level dirs to remove after copy.
- `gitignoreBlockPresent` — whether managed marker exists в `<projectPath>/.gitignore`.
- `settingsLocalHooks[]` — dev-pomogator hooks в `.claude/settings.local.json` для smart-merge removal.

## MigrationResult

```json
{
  "detectedV1Version": "1.5.0",
  "removedFiles": [".claude/skills/create-spec/SKILL.md", ".dev-pomogator/tools/..."],
  "backupFiles": [".dev-pomogator/.user-overrides/.claude/rules/custom-edit.md"],
  "gitignoreBlockRemoved": true,
  "settingsLocalUpdated": true,
  "markerWrittenAt": "2026-05-06T10:23:45Z",
  "exitCode": 0,
  "warnings": [],
  "nextSteps": [
    "/plugin marketplace add stgmt/dev-pomogator",
    "/plugin install dev-pomogator@stgmt",
    "/reload-plugins (CLI) или restart Claude Desktop"
  ]
}
```

- `detectedV1Version` — version из v1 manifest. Null если no v1 detected.
- `removedFiles[]` — paths removed после успешного backup (если был needed).
- `backupFiles[]` — paths backed up в `.user-overrides/`.
- `gitignoreBlockRemoved` — true если managed block был удалён.
- `settingsLocalUpdated` — true если из `.claude/settings.local.json` были удалены managed entries.
- `markerWrittenAt` — ISO timestamp `.dev-pomogator/.migrated-to-v2`.
- `exitCode` — 0 success или informational (no v1 detected); 1 если error.
- `nextSteps[]` — printed instructions для user.

## ManifestSet (drift-test parsed view of on-disk hand-maintained manifests)

Drift test (`tests/e2e/canonical-plugin.test.ts`) parses the three hand-authored manifests + scans on-disk `tools/` to assert sync. There is no build aggregator and no source→target mapping — manifests are authored directly.

```json
{
  "manifest": {
    "name": "dev-pomogator",
    "version": "2.0.0",
    "description": "...",
    "author": { "name": "stgmt" }
  },
  "marketplaceManifest": {
    "name": "stgmt",
    "owner": { "name": "stgmt" },
    "plugins": [{ "name": "dev-pomogator", "source": "./", "version": "2.0.0" }]
  },
  "hooks": [
    { "event": "PreToolUse", "matcher": "Bash", "command": "tools/tui-test-runner/centralized-test-runner-guard.ts", "resolvedOnDisk": true }
  ],
  "toolScriptsOnDisk": [
    "tools/tui-test-runner/centralized-test-runner-guard.ts"
  ]
}
```

- `hooks[].command` ОБЯЗАН резолвиться в путь присутствующий в `toolScriptsOnDisk` (drift assertion).
- `toolScriptsOnDisk[]` — фактический скан `tools/` дерева; каждый зарегистрированный hook-скрипт ОБЯЗАН иметь соответствующую запись в `hooks[]` (vice-versa assertion).

## enabledPlugins entry format (managed by Claude Code, not dev-pomogator)

В `~/.claude/settings.json` или `<cwd>/.claude/settings.json` или `<cwd>/.claude/settings.local.json`:

```json
{
  "enabledPlugins": {
    "dev-pomogator@stgmt": true
  }
}
```

dev-pomogator NEVER пишет это поле directly — Anthropic-managed через `/plugin install`/`/plugin enable`/`/plugin disable`.

## Правила валидации

- `plugin.json.name` ОБЯЗАН matching marketplace.json `plugins[].name` для same plugin.
- `plugin.json.version` ОБЯЗАН matching marketplace.json `plugins[].version` если оба specified — иначе users get unpredictable updates.
- `plugin.json.name` ОБЯЗАН matching directory name в `~/.claude/plugins/cache/<marketplace>/<plugin-name>/` (canonical Anthropic constraint).
- `marketplace.json.name` ОБЯЗАН быть unique cross marketplace catalogs — collision если user adds 2 marketplaces с same name.
- `source: "./"` resolves к **marketplace repo root**, не к `.claude-plugin/` директории.
- `V1InstallInfo.userModifiedFiles[]` paths ОБЯЗАНЫ проходить `resolveWithinProject()` guard (no path traversal). Backup paths ОБЯЗАНЫ остаться внутри `<projectPath>/.dev-pomogator/.user-overrides/`.
- `MigrationResult.markerWrittenAt` записывается ТОЛЬКО после успешного завершения всех steps. Partial migration не пишет marker → idempotent retry possible.
