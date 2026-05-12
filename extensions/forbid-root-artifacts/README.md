# forbid-root-artifacts

Pre-commit hook to control files in repository root. Prevents accidental commits of temporary files, build artifacts, and maintains clean repository structure.

## Installation

### Prerequisites

```bash
# Python 3.8+ required
pip install pre-commit pyyaml
```

### Install plugin

```bash
# Install for Cursor
npx dev-pomogator --cursor --plugins=forbid-root-artifacts

# Install for Claude Code
/plugin marketplace add stgmt/dev-pomogator
/plugin install forbid-root-artifacts@dev-pomogator
```

### Setup hook

```bash
# Run setup script (creates config, adds hook, runs pre-commit install)
python .dev-pomogator/tools/forbid-root-artifacts/setup.py
```

Or manually add to `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: local
    hooks:
      - id: forbid-root-artifacts
        name: Forbid root artifacts
        entry: python .dev-pomogator/tools/forbid-root-artifacts/check.py
        language: python
        pass_filenames: false
        always_run: true
        additional_dependencies: [pyyaml]
```

Then run:

```bash
pre-commit install
```

## Configuration

Create `.root-artifacts.yaml` in repository root:

```yaml
# Mode: extend (add to defaults) or replace (replace defaults)
mode: extend

# Additional allowed files
allow:
  - Makefile
  - pyproject.toml

# Explicitly denied files (even if in defaults)
deny:
  - docker-compose.yml

# Restrict directories (if not set, all directories allowed)
allowed_directories:
  - src
  - docs
  - tests

# Ignore patterns (glob)
ignore_patterns:
  - "*.tmp"
  - "*.bak"

# ─── New in v1.1.0: classification + auto-prune (all optional) ──────────────

# User-defined trash patterns (override / extend plugin defaults).
# Files matching these are NOT offered for whitelist by configure.py.
trash_patterns:
  - "*.testsettings"
  - "*.vssscc"

# User-defined config patterns (override / extend plugin defaults).
config_patterns:
  - "*.toml"

# Disable plugin-shipped trash defaults (Visual Studio legacy + temp/log etc.).
# Default: true. Set to false if your project legitimately uses files matching
# the default list.
use_default_trash_patterns: true

# Classifier mode: 'config' (yaml only), 'llm' (Claude CLI for everything),
# 'hybrid' (yaml first, Claude CLI for unmatched). Default: hybrid.
classifier:
  mode: hybrid
  llm:
    cli: claude          # Claude Code CLI binary in PATH (uses subscription, no API key)
    timeout_seconds: 30
    cache_ttl_seconds: 86400   # 24h LLM result cache

# Auto-prune stale `allow:` entries on pre-commit.
# Default: DISABLED (opt-in). See "Auto-prune behavior" below.
auto_prune:
  enabled: true
```

## Auto-prune behavior (v1.1.0+) — opt-in

When `auto_prune.enabled: true` (**default is `false`** — opt-in), `check.py`
running as a pre-commit hook automatically removes entries from `allow:`
whose files no longer exist on disk. Workflow:

1. You delete `foo.txt` from your repo and run `git commit -m "remove foo.txt"`.
2. Pre-commit runs `check.py`. It detects `foo.txt` is in `allow:` but missing on disk.
3. `check.py` rewrites `.root-artifacts.yaml` (atomically, with file lock) without `foo.txt`.
4. Pre-commit fails with: *"forbid-root-artifacts auto-pruned 1 stale entries..."*
5. You run `git add .root-artifacts.yaml && git commit` to retry.
6. Both the file deletion and the yaml change land in the **same commit** —
   `git revert HEAD` will atomically restore both.

This follows the standard pre-commit framework "hooks that modify files"
pattern (same as `prettier --write`, `black`, `ruff format`).

### Why opt-in?

`auto_prune` modifies user yaml on every pre-commit run — semantically a
breaking behavior change vs 1.0.0. Existing downstream users who upgrade
get exactly the same `check.py` semantics they had before, unless they
explicitly enable auto-prune.

If both `auto_prune.enabled: true` AND a real whitelist violation are
detected in the same run, the hook reports BOTH in a single exit-1 — no
split-screen "fix yaml first, then see violations".

### Known limitation: inline yaml comments

The atomic save preserves your top-of-file header comment block byte-for-byte
(license / copyright / team notes), but **inline comments inside yaml
sections are lost** on auto-prune rewrite (PyYAML limitation). Work-around:
keep important comments in the file header.

## LLM classification (Claude CLI subscription)

When `classifier.mode` is `hybrid` or `llm` and a file in repo root is not
matched by any user/default trash or config pattern, the plugin invokes
the Claude Code CLI you're already logged into:

```sh
claude -p "Classify the file 'weird.unknownext'..." --output-format json
```

- **Zero API keys** — uses your existing Claude Code subscription.
- **Cached** for 24h in `.dev-pomogator/.classifier-cache.json` (per-project).
- **Graceful fallback** — if `claude` is not in `PATH` (e.g. CI without Claude
  Code), classification returns `'unknown'` and the plugin emits a single
  WARN to stderr. No crashes, no exit failures.

For deprecated formats like `*.testsettings`, the plugin prints a
specialized hint with a link to Microsoft's
[SettingsMigrator](https://learn.microsoft.com/en-us/visualstudio/test/migrate-testsettings-to-runsettings).

## Default Whitelist

These files are allowed by default:

| File | Description |
|------|-------------|
| README.md | Project readme |
| LICENSE | License file |
| .gitignore | Git ignore |
| .gitattributes | Git attributes |
| package.json | Node.js manifest |
| tsconfig.json | TypeScript config |
| docker-compose.yml | Docker compose |
| Makefile | Make build |
| AGENTS.md | AI agents config |
| CLAUDE.md | Claude config |
| *.sln | .NET solution (pattern) |
| *.csproj | .NET project (pattern) |

Full list in `.dev-pomogator/tools/forbid-root-artifacts/default-whitelist.yaml`.

## AI Customization Prompts

Use these prompts in Cursor or Claude Code to customize the whitelist. Your customizations are saved in `.root-artifacts.yaml` and preserved during plugin updates.

### Add a file to whitelist

> "Add Makefile to repository root whitelist"

Creates/updates `.root-artifacts.yaml`:
```yaml
mode: extend
allow:
  - Makefile
```

### Add multiple files

> "Allow these files in root: Makefile, Taskfile.yml, pyproject.toml, justfile"

```yaml
mode: extend
allow:
  - Makefile
  - Taskfile.yml
  - pyproject.toml
  - justfile
```

### Allow files by pattern

> "Allow all .config files in repository root"

```yaml
mode: extend
ignore_patterns:
  - "*.config"
```

### Restrict directories

> "Only allow src, docs, tests, tools directories in root"

```yaml
mode: extend
allowed_directories:
  - src
  - docs
  - tests
  - tools
```

### Deny a specific file

> "Deny docker-compose.yml in root even if it's in default whitelist"

```yaml
mode: extend
deny:
  - docker-compose.yml
```

### Replace whitelist completely

> "My project is minimal. Only allow: README.md, LICENSE, .gitignore"

```yaml
mode: replace
allow:
  - README.md
  - LICENSE
  - .gitignore
```

### Ignore temporary files

> "Ignore temporary files: *.tmp, *.bak, *.swp, *~"

```yaml
mode: extend
ignore_patterns:
  - "*.tmp"
  - "*.bak"
  - "*.swp"
  - "*~"
```

### Setup for Python project

> "Configure whitelist for Python project with poetry"

```yaml
mode: extend
allow:
  - pyproject.toml
  - poetry.lock
  - setup.py
  - setup.cfg
  - MANIFEST.in
  - tox.ini
  - noxfile.py
  - .python-version
```

### Setup for Node.js project

> "Configure whitelist for Node.js project"

```yaml
mode: extend
allow:
  - package.json
  - package-lock.json
  - yarn.lock
  - pnpm-lock.yaml
  - .nvmrc
  - .npmrc
  - tsconfig.json
  - vite.config.ts
  - webpack.config.js
```

### Analyze violations

> "What files in repository root violate the whitelist?"

AI will run `python .dev-pomogator/tools/forbid-root-artifacts/check.py` and show results.

### Show current whitelist

> "Show what files are currently allowed in repository root"

AI will read `default-whitelist.yaml` and `.root-artifacts.yaml`, show merged list.

## Commands

### /configure-root-artifacts

Interactive command to analyze and configure whitelist:

```
/configure-root-artifacts
/configure-root-artifacts show
/configure-root-artifacts add Makefile
/configure-root-artifacts analyze
```

## How Updates Work

Your customizations are safe during plugin updates:

| What | Location | Updated? |
|------|----------|----------|
| Plugin code | `.dev-pomogator/tools/forbid-root-artifacts/` | Yes |
| Default whitelist | `.dev-pomogator/tools/forbid-root-artifacts/default-whitelist.yaml` | Yes |
| Your config | `.root-artifacts.yaml` | **No** |

Using `mode: extend` ensures your additions are preserved even if defaults change.

## Manual Usage

```bash
# Check for violations
python .dev-pomogator/tools/forbid-root-artifacts/check.py

# Run setup
python .dev-pomogator/tools/forbid-root-artifacts/setup.py
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | OK, no violations |
| 1 | Violations found |
| 2 | Configuration error |
