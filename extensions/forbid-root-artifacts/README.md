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
python tools/forbid-root-artifacts/setup.py
```

Or manually add to `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: local
    hooks:
      - id: forbid-root-artifacts
        name: Forbid root artifacts
        entry: python tools/forbid-root-artifacts/check.py
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
```

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

Full list in `tools/forbid-root-artifacts/default-whitelist.yaml`.

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

AI will run `python tools/forbid-root-artifacts/check.py` and show results.

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
| Plugin code | `tools/forbid-root-artifacts/` | Yes |
| Default whitelist | `tools/forbid-root-artifacts/default-whitelist.yaml` | Yes |
| Your config | `.root-artifacts.yaml` | **No** |

Using `mode: extend` ensures your additions are preserved even if defaults change.

## Manual Usage

```bash
# Check for violations
python tools/forbid-root-artifacts/check.py

# Run setup
python tools/forbid-root-artifacts/setup.py
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | OK, no violations |
| 1 | Violations found |
| 2 | Configuration error |
