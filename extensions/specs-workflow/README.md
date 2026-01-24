# specs-workflow Plugin

Comprehensive specs management workflow for Cursor and Claude Code.

## What Gets Installed

### Rules

| Platform | Location | Files |
|----------|----------|-------|
| Cursor | `.cursor/rules/` | `specs-management.mdc`, `dev-plan.mdc`, `research-workflow.mdc` |
| Claude Code | `.claude/rules/` | `specs-management.md`, `dev-plan.md`, `research-workflow.md` |

### Tools

| Location | Contents |
|----------|----------|
| `tools/specs-generator/` | 5 PowerShell scripts + 13 templates |

### Commands

| Command | Description |
|---------|-------------|
| `/create-spec <name>` | Create new specification folder structure |

## Rules Description

### specs-management

Main workflow rule for creating and managing specifications. Features:
- 13-file structure in `.specs/{feature}/`
- 3-phase workflow (Discovery → Requirements + Design → Finalization)
- 3 STOP points for user confirmation
- Integration with PowerShell automation scripts

### dev-plan

Standard format for development plans:
- User Stories
- Use Cases
- Requirements (FR + NFR + EARS acceptance criteria)
- Implementation Plan with Leverage
- Atomic Todos with traceability
- Definition of Done with Verification Plan
- File Changes table

### research-workflow

Complete research cycle:
- 4 phases: Clarification → Research → Verification → Report
- MCP tools integration (Context7, octocode)
- Hypothesis verification with proofs
- Integration with RESEARCH.md in specs

## PowerShell Scripts

| Script | Description |
|--------|-------------|
| `scaffold-spec.ps1` | Create spec folder structure |
| `validate-spec.ps1` | Validate spec formats |
| `spec-status.ps1` | Show progress report |
| `fill-template.ps1` | Fill template placeholders |
| `list-specs.ps1` | List all specs in project |

## Usage

### Create new spec

```
/create-spec my-feature
```

This will create `.specs/my-feature/` with all 13 template files.

### Check spec status

```powershell
.\tools\specs-generator\spec-status.ps1 -Path ".specs/my-feature"
```

### Validate spec

```powershell
.\tools\specs-generator\validate-spec.ps1 -Path ".specs/my-feature"
```

## Installation

### All plugins (default)

```bash
npx dev-pomogator --cursor
npx dev-pomogator --claude
```

### Only this plugin

```bash
npx dev-pomogator --cursor --plugins=specs-workflow
npx dev-pomogator --claude --plugins=specs-workflow
```
