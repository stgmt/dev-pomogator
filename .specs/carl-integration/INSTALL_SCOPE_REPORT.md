# CARL install scope report

## Короткий ответ

CARL не должен быть «только глобальным» или «только проектным». Правильная модель для dev-pomogator — **двухслойная**:

1. **Глобальный слой плагина** — dev-pomogator устанавливается через canonical Claude Code plugin и приносит CARL engine, hook wrapper, doctor check, defaults, and fail-open behavior. Этот слой живёт в установленном плагине и должен работать у каждого пользователя, где dev-pomogator активен.
2. **Проектный слой `.carl/`** — конкретные rules/recall domains, project index, runtime verification status, and per-project sessions live under the current project. Этот слой зависит от `cwd` hook input and from the repository's rules/specs/content.

Иначе говоря: **код и дефолтная интеграция ставятся глобально вместе с dev-pomogator; данные CARL и проектные домены настраиваются per project.**

## Языки и русский текст

Сейчас CARL нельзя считать русскоязычным «из коробки». Поэтому языковая поддержка тоже двухслойная:

1. **Глобальный слой** приносит только механизм: Unicode-safe input handling, language/capability detector, normalized matching pipeline, common degraded-state codes, and warning wording. Он НЕ должен утверждать, что любой проект уже имеет русские CARL rules/recall.
2. **Проектный слой `.carl/`** объявляет реальные языки проекта: например `languages: ["ru", "en"]`, source hashes for Russian rule/domain inputs, generated Russian trigger aliases, and per-platform language status. Если проектный `.carl/carl.json` не содержит `ru` coverage, русский prompt получает degraded state (`language-unsupported` или `project-language-missing`), а не тихий empty/healthy recall.
3. **Doctor/reporting** показывают обе вещи отдельно: глобальный runner может быть установлен, но проектный русский индекс может отсутствовать или устареть. Repair может regenerated managed project language data from repo sources, but must not invent Russian rules that do not exist.
4. **Codex** переиспользует тот же project `.carl/` language metadata later, after Codex launcher/dispatcher prerequisites; Codex Russian support cannot be inferred from Claude Code success.

Captured fixtures already include Russian prompts (`ru-debug-root-cause`, `codex-ru-debug`) and prove that the sibling producer can match Russian trigger aliases in that captured implementation. They do **not** prove that dev-pomogator has packaged Russian support yet; implementation still must encode global language handling and project `.carl/` language metadata.

## Почему не один слой

| Вариант | Почему недостаточно |
|---------|---------------------|
| Только global | CARL recall/rules зависят от конкретного репозитория: `.claude/rules`, `CLAUDE.md`, specs, project decisions. Глобальный config не знает project-specific domains. |
| Только project | Каждый проект вынужден копировать hook engine and setup logic; `pomogator-doctor` не сможет гарантированно repair/install для всех пользователей dev-pomogator. |
| Двухслойная модель | Plugin ships the engine and hook registration; each project gets its own `.carl/carl.json` / cache / health state. |

## Evidence from current repo/spec

- [VERIFIED: `.claude-plugin/plugin.json`] dev-pomogator is packaged as a canonical Claude Code plugin and exposes hooks through `.claude-plugin/hooks.json`.
- [VERIFIED: `.claude-plugin/hooks.json`] Existing plugin hooks run from `CLAUDE_PLUGIN_ROOT || process.cwd()` through managed wrappers; CARL should follow that distributed hook pattern.
- [VERIFIED: `.specs/carl-integration/RESEARCH.md`] Current dev-pomogator repo had no tracked `.carl/`, `.claude/hooks/carl-hook.py`, or `scripts/carl/` before this spec; CARL is a new managed lifecycle here.
- [VERIFIED: `tests/fixtures/carl/manifest.json`] Captured sibling CARL uses project-local `.carl/carl.json`, Claude Code/Codex hook commands, and per-prompt `cwd` in the hook input envelope.
- [VERIFIED: `tests/fixtures/carl/smoke.stdout.txt`, `tests/fixtures/carl/bench.stdout.tsv`] Real captured CARL output has project-specific domains and benchmark rows; this supports a project-local CARL index rather than a single global static file.

## Scope model

### Scope A — global/user plugin layer

This is installed when the user installs dev-pomogator.

| Concern | Decision |
|---------|----------|
| Installed by | canonical dev-pomogator plugin install. |
| Owns | `tools/carl/*`, hook wrapper, manifest schema, default global rules, doctor check, repair logic, and fail-open warning wording. |
| Hook registration | `.claude-plugin/hooks.json` gets a `UserPromptSubmit` CARL wrapper entry. The command resolves through `CLAUDE_PLUGIN_ROOT` so it works from the installed plugin path. |
| Writes project files? | Not directly from plugin installation. Project mutation happens later from SessionStart/doctor/install flows with managed markers. |
| Runtime dependencies | Prefer bundled/builtins-only Node path. If accepted CARL runtime needs Python or other deps, the runner must detect them and report `broken-runtime`; it must not fake-green. |
| Default behavior | Enabled where supported, fail-open where unsupported/broken, with an opt-out config. |
| Doctor role | Verifies the global hook wrapper is runnable from plugin root and can bootstrap/check the current project. |

### Scope B — project CARL layer

This is created or refreshed for the active project/repository.

| Concern | Decision |
|---------|----------|
| Installed by | `tools/carl/install.ts --scope project` or `pomogator-doctor --repair`, usually triggered from SessionStart or explicit doctor repair. |
| Owns | `.carl/carl.json` plus optional `.carl/sessions/` / generated cache files. |
| Data source | Project rules/specs/docs: `CLAUDE.md`, `.claude/rules/**`, specs/features/indexes, and later accepted project memory/decisions if included. |
| Git dirtiness | Managed generation must be explicit and auditable. If `.carl/carl.json` is generated automatically, implementation must decide whether it is committed project config or gitignored cache. This is an open implementation choice; do not silently dirty user repos without doctor/report evidence. |
| Runtime state | Project file records source hashes, generated timestamp, schema version, platform status (`claude-code`, later `codex`), and whether the project index is healthy/stale/missing. |
| Failure mode | Missing/stale project CARL means `global-only` or degraded project status, not plugin failure. |

### Scope C — Codex project layer (deferred)

Codex CARL is project-local and gated.

| Concern | Decision |
|---------|----------|
| Installed by | Later Codex launcher/dispatcher path, not initial Claude Code CARL install. |
| Hook registration | `.codex/hooks.json` only after context-menu Codex launcher and deterministic dispatcher prerequisites are available. |
| Data source | Reuses project `.carl/carl.json`; does not copy a separate CARL index unless Codex needs a platform-specific cache. |
| Failure mode | `unsupported` / `deferred` for Codex must not degrade healthy Claude Code CARL. |
| Open unknown | Exact Codex context/warning transport remains `[UNVERIFIED]` until runtime proof exists. |

## Environment setup by scope

### Global plugin environment

The hook wrapper should derive environment from Claude Code/plugin runtime, not from user shell setup.

| Variable/input | Source | Purpose |
|----------------|--------|---------|
| `CLAUDE_PLUGIN_ROOT` | Claude Code plugin runtime | Locate installed dev-pomogator `tools/carl/*`. |
| hook JSON `cwd` | `UserPromptSubmit` input | Determine active project root / nearest `.carl/carl.json`. |
| hook JSON `session_id` | `UserPromptSubmit` input | Deduplicate repeated context and store per-session state. |
| hook JSON `prompt` | `UserPromptSubmit` input | Match CARL domains/rules to user prompt. |
| Node executable | Claude Code hook command runtime | Run bundled/builtins CARL wrapper. |

Recommended optional env knobs:

| Env | Meaning |
|-----|---------|
| `DEV_POMOGATOR_CARL=0` | Hard opt-out; hook returns no CARL context and doctor reports disabled. |
| `DEV_POMOGATOR_CARL_SCOPE=global-only\|project\|auto` | Debug/override scope selection. Default: `auto`. |
| `DEV_POMOGATOR_CARL_TIMEOUT_MS=<n>` | Override hook timeout budget for diagnostics. |
| `DEV_POMOGATOR_CARL_CONFIG=<path>` | Test/diagnostic override for project config path. |

These env names are proposed contract for implementation; final names must be encoded in `tools/carl/manifest.ts` and tested.

### Project environment

Project setup is based on the hook `cwd`, not current shell assumptions.

| Project artifact | Purpose |
|------------------|---------|
| `.carl/carl.json` | Project CARL domain index, source hashes, schema/version marker, platform status, generated timestamp. |
| `.carl/sessions/` | Optional per-session dedupe/status cache; should be gitignored if used. |
| managed marker | Identifies dev-pomogator-owned blocks/files and prevents overwrite of user-owned CARL config. |
| `.gitignore` entry | Required if generated session/cache files are written inside `.carl/`. |

Project bootstrap flow:

1. Determine project root from hook input `cwd`.
2. Search for existing `.carl/carl.json` in project/ancestor scopes if the final CARL runtime keeps ancestor-scope semantics.
3. If missing and auto-project mode is enabled, generate managed `.carl/carl.json` from project sources.
4. If stale, mark `stale` and let doctor/session repair refresh managed data.
5. If user-owned conflict exists, mark `user-conflict` and stop automatic overwrite.
6. If runtime cannot run, mark `broken-runtime` and inject fail-open warning instead of claiming healthy.

### Codex environment

Codex setup must not be inferred from Claude Code success.

| Artifact/input | Purpose |
|----------------|---------|
| `.codex/hooks.json` | Project-local dispatcher registration after prerequisites. |
| Codex version/capability check | Proves required hook event/context behavior is available. |
| `.carl/carl.json` | Shared project CARL domains and state. |
| Codex hook input contract | `[UNVERIFIED]` until runtime proof exists. |

Codex bootstrap flow:

1. Check context-menu Codex launcher/trust path exists.
2. Check deterministic Codex hook dispatcher exists.
3. Check installed Codex version supports the needed hook capability.
4. If any check fails, report Codex CARL `deferred`/`unsupported` and do not mutate `.codex/hooks.json`.
5. If all pass, register CARL through the dispatcher and run Codex-specific hook proof.

## Doctor behavior

`pomogator-doctor` should report both layers separately:

| Layer | Example states |
|-------|----------------|
| Plugin layer | `global-ready`, `plugin-hook-missing`, `wrapper-broken`, `unsupported-platform` |
| Project layer | `project-ready`, `project-missing`, `project-stale`, `global-only`, `broken-runtime`, `user-conflict` |
| Codex layer | `deferred`, `unsupported`, `dispatcher-missing`, `codex-ready` |

Repair policy:

- Global/plugin layer: repair only managed plugin/dogfood registrations that dev-pomogator owns.
- Project layer: create/refresh `.carl/carl.json` and managed blocks only; preserve user-owned CARL content.
- Codex layer: no positive install until prerequisites are satisfied.
- Runtime failures: never repair by rewriting config; report dependency/runtime diagnostics.

## Required spec/design updates

Current spec already points in this direction but was ambiguous. Implementation should update CARL docs/tasks to make these decisions explicit:

1. `DESIGN.md` needs an `Install scopes` section with global plugin layer, project `.carl` layer, and deferred Codex layer.
2. `FR-1` should clarify that plugin installation ships the CARL engine/hook wrapper, while project CARL data is generated per active repo.
3. `FR-5` doctor states should include split reporting for plugin/project/Codex layers or equivalent fields.
4. `FILE_CHANGES.md` should include whichever config surface is chosen for user opt-out / scope settings.
5. BDD should cover both cases:
   - dev-pomogator installed, no project `.carl` yet → bootstrap/degraded/global-only behavior is explicit.
   - project `.carl` exists/stale/conflicting → project repair behavior is explicit.

## Final recommendation

Ship CARL as **global engine + per-project data**:

- Global plugin install makes CARL capability available everywhere dev-pomogator is active.
- Per-project `.carl/carl.json` makes recall/rules accurate for the current repo.
- Doctor owns the repair boundary and reports both layers separately.
- Codex remains gated until the context-menu launcher and dispatcher path are real.

This satisfies the user requirement “чтобы у всех кто dev-pomogator поставит — заводилось where supported” without pretending one global CARL file can represent every project.
