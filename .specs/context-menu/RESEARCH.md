# Research

## Контекст

{Описание контекста исследования}

## Источники

- {Источник 1}
- {Источник 2}

## Технические находки

### Claude Code workspace-trust gate × `--dangerously-skip-permissions` (G8)

- Claude Code refuses to apply `permissions.allow` and exits non-zero on a directory whose workspace-trust dialog has never been interactively accepted; the exact message and the `hasTrustDialogAccepted` config key are official documented behavior [src:https://code.claude.com/docs/en/permissions].
- `hasTrustDialogAccepted` lives per-project under `~/.claude.json` → `projects["<dir>"]` and can be pre-populated by a caller (no interactive dialog needed) to skip future trust prompts for that directory [src:https://github.com/anthropics/claude-code/issues/9113] [src:https://github.com/anthropics/claude-code/issues/36403].
- [cmd: `claude --dangerously-skip-permissions -p "say hi"` run in a guaranteed-fresh untrusted directory → exit 0, normal response] — confirms headless `-p` mode is NOT subject to the same hard-fail; the failure is specific to the interactive launch path our `wt.exe`-based NSS entries use.
- The "press Enter to restart" text seen closing the terminal on failure is native Windows Terminal `closeOnExit` pane-exit chrome, not anything this repo prints — confirmed by grepping the whole repo for the phrase (no hits) and by Windows Terminal's own issue tracker [src:https://github.com/microsoft/terminal/issues/16363] [src:https://github.com/microsoft/terminal/issues/16608]. Consistent with — not contradicting — the `wt.exe`-spawned NSS entries [ref:tools/context-menu/postinstall.ts:70].

### {Тема 1}

### {Тема 1}

{Описание находки}

### {Тема 2}

{Описание находки}

## Где лежит реализация

- App-код: `{путь/к/коду}`
- Конфигурация: `{путь/к/конфигу}`

## Выводы

{Краткие выводы исследования}

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| {rule-name} | `.claude/rules/{rule-name}.md` | {1-line summary} | {keywords} | {FR-N / NFR-Category} |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| {source} | `{path}` | {description} | {relevance} |

### Architectural Constraints Summary

{Краткое описание: какие правила/паттерны ограничивают какие требования.}

## Risk Assessment

> Auto-populated by Skill `discovery-forms` during Phase 1. Hook `risk-assessment-guard` enforces:
> when `## Risk Assessment` heading is present, the table below must have ≥2 non-placeholder rows
> with Likelihood ∈ {Low, Medium, High}, Impact ∈ {Low, Medium, High}, and non-empty Mitigation.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Auto-granting `hasTrustDialogAccepted` could be read as silently weakening Claude Code's workspace-trust safety boundary | Low | Medium | Scoped strictly to the exact directory the user right-clicked with an already-maximally-permissive "YOLO" entry (`--dangerously-skip-permissions`); plain (non-YOLO) entries never touch `~/.claude.json` — see FR-7, DESIGN.md Decision |
| Concurrent right-clicks on different directories could race-corrupt `~/.claude.json` | Low | High | Atomic temp-file + rename per `atomic-config-save` rule (FR-7) — never a direct in-place `writeJson` |
