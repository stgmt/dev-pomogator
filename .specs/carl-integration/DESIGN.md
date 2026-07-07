# Design

## Реализуемые требования

- [FR-1: Claude Code managed CARL install](FR.md#fr-1-claude-code-managed-carl-install)
- [FR-2: No fake green when CARL is absent](FR.md#fr-2-no-fake-green-when-carl-is-absent)
- [FR-3: Runtime consumer and end-to-end proof](FR.md#fr-3-runtime-consumer-and-end-to-end-proof)
- [FR-4: Fail-open warning injection](FR.md#fr-4-fail-open-warning-injection)
- [FR-5: Doctor health and repair](FR.md#fr-5-doctor-health-and-repair)
- [FR-6: Managed markers preserve user configuration](FR.md#fr-6-managed-markers-preserve-user-configuration)
- [FR-7: Codex path gated by launcher and dispatcher prerequisites](FR.md#fr-7-codex-path-gated-by-launcher-and-dispatcher-prerequisites)
- [FR-8: Review, audit, and reporting](FR.md#fr-8-review-audit-and-reporting)
- [FR-9: Recall benchmark threshold and regression gate](FR.md#fr-9-recall-benchmark-threshold-and-regression-gate)

## Компоненты

- `tools/carl/manifest.ts` — planned source of truth for the dev-pomogator-managed CARL artifact manifest, including owner marker, schema version, managed paths, platform support, and expected hook command. [ASSUMED]
- `tools/carl/install.ts` — planned idempotent installer/repair helper that writes only managed CARL blocks/artifacts and preserves user-owned config. [ASSUMED]
- `tools/carl/adapt-rules.ts` — planned deterministic adapter that scans project rules and skills, builds `.carl/carl.json`, records source hashes, and maintains Russian trigger alias coverage for newly added rules/skills. [VERIFIED_PATTERN: sibling `presentation-reels/scripts/carl/generate-carl-rules.mjs` scans `.claude/rules` and writes `.carl/carl.json`; dev-pomogator implementation still pending]
- `tools/carl/runner.ts` — planned hook runner invoked by the distributed Claude Code hook entry; it wraps the real CARL runtime when verified and produces fail-open warning payloads on failure. [ASSUMED]
- `.claude/hooks/carl-hook.py` or `tools/carl/hook-wrapper.ts` — planned managed hook entrypoint; final language depends on verified Claude Code hook context and CARL runtime requirements. [UNVERIFIED]
- `.claude-plugin/hooks.json` — distributed Claude Code hook registration for canonical plugin users.
- `.claude/settings.json` — dogfood project hook registration if the repo needs the CARL hook active during development.
- `.carl/carl.json` — planned managed CARL project configuration and status metadata; exact schema remains [UNVERIFIED] until CARL runtime details are researched.
- `.claude/skills/pomogator-doctor/scripts/engine/checks/carl.ts` — planned doctor check that classifies CARL health states.
- `.claude/skills/pomogator-doctor/scripts/engine/checks/index.ts` and `.claude/skills/pomogator-doctor/scripts/engine/types.ts` — planned doctor wiring for the new CARL check and state fields.
- `.codex/hooks.json` — planned Codex dispatcher registration after Codex launcher/dispatcher prerequisites are available.
- `tools/carl/bench.ts` — planned real-artifact benchmark harness if CARL recall is enabled.
- `tests/features/carl-integration.feature` and `tests/step_definitions/feature_carl_integration.ts` — planned BDD proof for install, hook runtime consumption, fail-open warning, doctor repair, Codex gating, review, and benchmark behavior.

## Где лежит реализация

- Claude Code installer/runner: `tools/carl/` plus one managed hook entrypoint under `.claude/hooks/` or a distributed hook wrapper under `tools/carl/`.
- Plugin hook wiring: `.claude-plugin/hooks.json` for canonical distribution and `.claude/settings.json` for dogfood if enabled.
- Managed project state: `.carl/carl.json` plus managed blocks in hook/config files where required.
- Doctor integration: `.claude/skills/pomogator-doctor/scripts/engine/checks/carl.ts`, check index, and shared doctor result types.
- Codex integration: `.codex/hooks.json` only after the context-menu Codex launcher and deterministic hook dispatcher path are available.
- Verification: `.specs/carl-integration/carl-integration.feature` for spec coverage and later `tests/features/carl-integration.feature` plus `tests/step_definitions/feature_carl_integration.ts` for executable BDD.

## Директории и файлы

- `tools/carl/` — new managed CARL generator, installer, runner, manifest, repair helpers, and optional benchmark harness.
- `.carl/` — managed CARL metadata/config directory; current repo inventory found no existing `.carl/`, so implementation starts from create semantics.
- `.claude/hooks/` — possible hook entrypoint location; current repo inventory found no `.claude/hooks/carl-hook.py`.
- `.claude-plugin/hooks.json` — canonical plugin hook registration.
- `.claude/settings.json` — dogfood hook registration if the project should run CARL locally.
- `.codex/` — existing project-local Codex artifact baseline; CARL Codex edits are gated and must preserve the current dispatcher model.
- `.claude/skills/pomogator-doctor/scripts/engine/checks/` — doctor check implementation and registration.
- `tests/features/`, `tests/step_definitions/`, `tests/fixtures/carl/` — BDD and real-artifact fixtures for implementation evidence.

## Install scopes

CARL installation uses a **global engine + per-project data** model.

### Global/user plugin layer

When a user installs dev-pomogator as a canonical Claude Code plugin, the plugin ships the CARL engine/runner, hook wrapper, manifest schema, doctor check, default fail-open warning, and default scope-selection logic. This layer resolves files through `CLAUDE_PLUGIN_ROOT` and is shared across projects where dev-pomogator is active.

The global layer does not silently write project CARL data during marketplace/plugin installation. Project mutation happens later through a managed install/check/repair flow using the active hook `cwd`, SessionStart/doctor checks, or an explicit install command.

### Project `.carl/` layer

Each repository gets its own CARL project state under `.carl/` when CARL is enabled for that project. The project layer stores generated domain/rule indexes, source hashes, schema/version marker, generated timestamp, platform status, and optional per-session cache/dedupe state.

The runner determines the project layer from the `UserPromptSubmit` hook input `cwd`, not from the shell's current directory. If project `.carl/carl.json` is missing, stale, conflicting, or broken, the hook reports a degraded state such as `project-missing`, `project-stale`, `user-conflict`, or `broken-runtime`; it does not claim CARL is healthy from global plugin presence alone.

### Codex project layer

Codex CARL remains a deferred project-local layer. It reuses the accepted project CARL state only after the context-menu Codex launcher, deterministic Codex dispatcher, and version-aware Codex hook capability checks are available. Until then, Codex CARL reports `deferred` or `unsupported` without affecting Claude Code CARL.

### Environment knobs

The implementation should support a small explicit environment surface for diagnostics and opt-out:

| Env | Meaning |
|-----|---------|
| `DEV_POMOGATOR_CARL=0` | Hard opt-out; hook returns no CARL context and doctor reports disabled. |
| `DEV_POMOGATOR_CARL_SCOPE=global-only\|project\|auto` | Debug/override scope selection. Default: `auto`. |
| `DEV_POMOGATOR_CARL_TIMEOUT_MS=<n>` | Override hook timeout budget for diagnostics. |
| `DEV_POMOGATOR_CARL_CONFIG=<path>` | Test/diagnostic override for project config path. |

Final names must be encoded in `tools/carl/manifest.ts` and BDD-tested before becoming stable public contract.

## Language support model

CARL language support is explicit state, not an assumption. The current real fixture proves that one sibling producer can match Russian trigger aliases in `ru-debug-root-cause` and `codex-ru-debug`, but dev-pomogator must still implement its own language contract.

### Global language layer

The global plugin layer owns only reusable mechanics:

| Concern | Global behavior |
|---------|-----------------|
| Unicode input | Preserve Russian prompt text end-to-end; no lossy transliteration before matching. |
| Prompt language detection | Classify prompt language or mixed-language state for diagnostics and matching decisions. |
| Normalization | Apply shared case/whitespace/punctuation normalization that is safe for Cyrillic and Latin text. |
| Degraded states | Define `language-unsupported`, `project-language-missing`, and `project-language-stale` states shared by runner, doctor, and report surfaces. |
| Defaults | Ship generic global rules only where verified; do not claim project Russian recall coverage from global install alone. |

### Project `.carl/` language layer

The project layer records actual supported languages and source evidence. A managed `.carl/carl.json` should include language metadata equivalent to:

```json
{
  "languages": ["ru", "en"],
  "languageStatus": {
    "ru": {
      "status": "ready",
      "sourceHashes": ["..."],
      "generatedAliases": ["инфра", "че за ошибка"],
      "lastGeneratedAt": "..."
    }
  }
}
```

Exact schema remains implementation-phase, but the semantics are fixed: a Russian prompt can be healthy only when the project layer says Russian coverage is ready. Missing metadata, stale hashes, or absent Russian aliases produce a degraded language state and the same fail-open visibility discipline as a broken runtime.

### Rule/skill adaptation script

`tools/carl/adapt-rules.ts` is the planned bridge between dev-pomogator's rule/skill corpus and project CARL recall. It runs during project install/repair and as a standalone diagnostic command.

Evidence from the sibling Russian CARL implementation shows the shape to port, not copy blindly: `presentation-reels/scripts/carl/generate-carl-rules.mjs` scans `.claude/rules`, extracts headings and curated `recallOverrides`, adds a `GLOBAL` Russian prompt rule, optionally adds a feature index domain, and writes `.carl/carl.json`. dev-pomogator should generalize that pattern to both rules and skills.

The adapter responsibilities are:

| Step | Behavior |
|------|----------|
| Source scan | Read `.claude/rules/**/*.md`, `.claude/skills/*/SKILL.md`, and approved generated indexes without using git-only assumptions so Docker tests can pass without `.git`. |
| Domain build | Create stable domain IDs from source path/category/slug and include source path in each rule payload. |
| Russian alias extraction | Use existing Cyrillic text, headings, known trigger phrases, and curated override maps for safe aliases. |
| New rule/skill detection | Compare source hashes against `.carl/carl.json`; changed or new sources refresh their domains. |
| Partial coverage | Mark sources with no safe Russian aliases as `ru:needs-alias` or equivalent rather than inventing semantics. |
| Output | Atomically write managed `.carl/carl.json` with `languages`, `languageStatus`, source hashes, generated aliases, and timestamp. |
| Verification | Emit a report listing ready/partial/missing Russian coverage and domains affected by newly added rules or skills. |

The adapter must be deterministic: the same source tree produces byte-stable output except for approved timestamp/version fields. It must also be safe in Docker BDD tests where `.git` is absent; source-change detection uses file hashes, not `git diff`.

### Doctor and report behavior for languages

`pomogator-doctor` reports plugin runtime health separately from project language health. A valid global hook with missing project Russian metadata is not `healthy`; it is a partial/degraded install. Repair may regenerate managed language indexes from project sources, but it must not invent Russian rules when no source rule exists.

Reports and benchmarks must name language coverage explicitly. Russian benchmark rows such as `ru-debug-root-cause` and `codex-ru-debug` can be used only as captured sibling evidence until dev-pomogator owns the corresponding project language metadata and runtime path.

## Managed artifact model

### Decision: Preserve user-owned CARL configuration through managed boundaries

**Требование:** [FR-6](FR.md#fr-6-managed-markers-preserve-user-configuration)

**Rationale:** Doctor repair must be safe to run repeatedly, so CARL writes are limited to managed files, managed blocks, or reserved managed object keys while user-owned config remains untouched.

**Trade-off:** Conflict handling becomes stricter because ambiguous ownership blocks automatic repair and requires an explicit `user-conflict` state.

**Alternatives considered:**
- Rewrite the whole CARL config on repair — rejected because it could erase user aliases or custom hooks.
- Ignore user conflicts and continue — rejected because silent overwrite would make doctor unsafe.

Managed writes use one of three forms:

1. **Managed file:** a whole file generated by dev-pomogator, containing owner/version/schema metadata near the top.
2. **Managed block:** a bounded section inside a shared config file, with begin/end markers and stable key names.
3. **Managed object key:** a deterministic JSON/TOML object key reserved for dev-pomogator CARL integration.

User-owned content outside those boundaries is read-only from the CARL installer/repair perspective. If a user-owned entry conflicts with a managed key, the state becomes `user-conflict` and repair does not overwrite it silently.

## Hook flow

1. Claude Code loads the distributed or dogfood hook registration.
2. The registration invokes the managed CARL hook wrapper/runner.
3. The runner checks platform support, managed manifest consistency, and runtime availability.
4. If healthy, the runner invokes the verified CARL runtime command and converts its result into the verified agent-visible context format. [UNVERIFIED: exact CARL output and exact Claude Code context transport]
5. If the runner cannot complete, it returns fail-open and injects a short agent-visible warning: `CARL did not run; tell the user CARL guidance/recall was unavailable.`
6. The runner logs structured diagnostics for doctor/reporting without dumping raw private recall data into chat context.

## Doctor check states

| State | Meaning | Repair behavior |
|-------|---------|-----------------|
| `healthy` | Managed artifacts, hook registration, version marker, runtime, and platform support are all valid. | No mutation. |
| `missing` | Required managed files or hook registration are absent. | Recreate missing managed artifacts when repair is enabled. |
| `stale` | Managed version/schema marker does not match installed dev-pomogator expectations. | Refresh managed artifacts while preserving user-owned content. |
| `broken-runtime` | Managed config exists but the CARL runtime command or dependency cannot run. | Report actionable dependency/runtime hint; do not overwrite config as a fix. |
| `unsupported` | Platform or version lacks required hook capability. | Report unsupported state and leave platform disabled. |
| `user-conflict` | User-owned entry conflicts with reserved CARL managed key. | Stop automatic repair and require explicit conflict resolution. |
| `repairable` | Drift is limited to managed artifacts and can be safely repaired. | Reinstall/refresh managed artifacts and report before/after. |

## Repair semantics

- Repair is idempotent: repeated repair converges to the same managed state.
- Repair is selective: only managed files, blocks, or object keys are rewritten.
- Repair is auditable: before/after state appears in doctor output and can be reviewed later.
- Repair is conservative: runtime dependency failures are not treated as config corruption.
- Repair is platform-scoped: Codex unsupported state cannot break a healthy Claude Code path.

## Codex sequencing

Codex CARL support is not a parallel ad-hoc launcher. It is gated by:

1. Context-menu Codex launcher/trust support being available.
2. Codex hook dispatcher support being available in the project-local artifact model.
3. Version-aware hook capability detection confirming the installed Codex version supports the required hook behavior.

Before those prerequisites are true, Codex CARL reports `unsupported` or `deferred`, while Claude Code CARL remains independently installable.

`tools/context-menu/postinstall.ts` is a planned edit only if implementation needs to expose CARL through the existing context-menu sequencing or validation path; it is not a CARL installer by itself.

## Real-artifact verification

The implementation must prove two separate things:

- **Runtime consumer proof:** the same hook launcher/dispatcher used by plugin users invokes the managed CARL runner.
- **Producer-shape proof:** CARL output, recall data, or benchmark fixtures match real CARL output captured from the real runtime or an approved external artifact.

Synthetic fixtures may exist only for red-phase scaffolding and must stay marked [UNVERIFIED]. Final done evidence cannot rely on synthetic CARL producer shapes.

## Benchmark design

If CARL recall is implemented, `tools/carl/bench.ts` will:

1. Load a real CARL recall artifact or execute the verified CARL recall runtime.
2. Measure only metrics the real runtime exposes or that can be computed reproducibly: candidate metrics are latency, token overhead, and recall result stability. [UNVERIFIED]
3. Write a baseline record that names the artifact/source and threshold status.
4. Refuse to enforce numeric thresholds until the baseline comes from real CARL evidence or an approved external requirement.

## Russian CARL self-evaluation report

**Требование:** [FR-8](FR.md#fr-8-review-audit-and-reporting)

Russian support is not complete merely because `.carl/carl.json` contains Cyrillic aliases. The implementation must evaluate CARL itself with Russian prompts and produce a report before Russian CARL support can be called ready.

Planned evaluator: `tools/carl/evaluate-russian.ts`.

The evaluator uses a curated prompt matrix that starts from captured sibling evidence and grows with dev-pomogator rules/skills:

| Case | Prompt intent | Expected domain behavior | Optimization signal |
|------|---------------|--------------------------|---------------------|
| `neutral-continue` | ordinary continuation without a domain-specific request | Only global baseline rules load; no noisy project domains. | false-positive domains or context budget too high |
| `ru-debug-root-cause` | Russian debugging/root-cause request such as "че за ошибка", "исследуй", "инфра" | Root-cause/reproduce and don't-blame-infra domains load together. | missing alias, weak stemming, or ranking gap |
| `ru-spec-workflow` | Russian specs request such as "спеки", "требования", "сценарии" | Specs/create-spec related domains load without unrelated test or deploy domains. | alias gap or over-broad "спек" match |
| `ru-rule-added` | newly added Russian/English rule or skill after adapter generation | The changed source's domain appears after `adapt-rules` refresh. | stale source hash or missing `ru:needs-alias` marker |
| `ru-render-legibility` | Russian UI/readability request such as "текст не виден" | Render/readability or UI verification domain loads when present. | missing project-specific alias |
| `codex-ru-debug` | later Codex Russian debug prompt | Codex-specific report stays fixture-backed/deferred until dispatcher prerequisites exist. | platform sequencing or unsupported-state gap |

For each case the report records:

- prompt text and language classification;
- expected loaded domains and actual loaded domains;
- false positives and false negatives;
- context chars / estimated tokens / latency when real runtime output exposes them;
- source hash state for matched domains;
- optimization recommendation: alias addition, normalization/stemming tweak, rank weighting, domain splitting, context budget cap, or explicit deferral.

The evaluator must work in Docker BDD without `.git`; it compares source hashes and fixture manifests, not `git diff`. If it uses the captured `presentation-reels` fixture, the report must label that row as fixture-backed sibling evidence and must not claim dev-pomogator runtime readiness.

## API

No public HTTP API is planned in this phase.

Internal command surfaces are planned:

- `node tools/carl/install.ts --platform claude-code --mode install|repair|check` [ASSUMED command shape]
- `node tools/carl/runner.ts --hook-event <event>` [ASSUMED command shape]
- `node tools/carl/bench.ts --artifact <path>` [ASSUMED command shape]

The exact command names and flags remain [UNVERIFIED] until CARL runtime details and existing dev-pomogator command conventions are validated during implementation planning.

## Key Decisions

### Decision: Implement Claude Code CARL as a managed plugin integration first

**Требование:** [FR-1](FR.md#fr-1-claude-code-managed-carl-install)
**Требование:** [FR-2](FR.md#fr-2-no-fake-green-when-carl-is-absent)

**Rationale:** Claude Code is the current canonical dev-pomogator plugin distribution target, and Discovery verified canonical plugin constraints plus no existing CARL artifacts. A managed integration gives users a repairable, reviewable path instead of undocumented dotfile setup.

**Trade-off:** Codex users wait for the later gated path, and the implementation must maintain clear platform-specific status instead of claiming simultaneous platform support.

**Alternatives considered:**
- Manual CARL setup instructions only — rejected because doctor could not detect or repair drift reliably.
- Codex and Claude Code in one first release — rejected because Codex CARL is explicitly sequenced after launcher and dispatcher prerequisites.

### Decision: Treat installed files as insufficient until the hook runtime is exercised

**Требование:** [FR-2](FR.md#fr-2-no-fake-green-when-carl-is-absent)
**Требование:** [FR-3](FR.md#fr-3-runtime-consumer-and-end-to-end-proof)

**Rationale:** The repo's dead-integration rule requires a runtime consumer; CARL's value depends on the agent actually receiving rules/recall context, not on files being present.

**Trade-off:** The release gate is heavier because it must drive the real hook path and capture real CARL output before done.

**Alternatives considered:**
- File-existence checks in doctor only — rejected because they would fake-green a dead hook.
- Unit tests around the installer only — rejected because they do not prove plugin users exercise CARL during sessions.

### Decision: Require executable BDD proof for the CARL runtime consumer

**Требование:** [FR-3](FR.md#fr-3-runtime-consumer-and-end-to-end-proof)

**Rationale:** The integration is not trusted until the same hook command path that plugin users receive invokes the managed CARL runner and produces agent-visible output or an evidence-backed red failure.

**Trade-off:** The red/green loop must drive Docker BDD and hook registration surfaces, so implementation cannot be closed by static file checks alone.

**Alternatives considered:**
- Treat managed file creation as enough — rejected because it would allow a dead CARL install with no runtime consumer.
- Verify only with a synthetic helper — rejected because it would not prove the plugin hook launcher path.

### Decision: Use fail-open warning injection for CARL hook failures

**Требование:** [FR-4](FR.md#fr-4-fail-open-warning-injection)

**Rationale:** CARL is support context, not the main task runner; a broken CARL path should not block the agent session, but silent degradation would mislead the user and the AI agent.

**Trade-off:** The warning adds small context noise in failure cases and requires careful wording to avoid exposing sensitive diagnostics.

**Alternatives considered:**
- Fail closed on any CARL error — rejected because a CARL outage would prevent unrelated dev-pomogator work.
- Log-only failure handling — rejected because the agent and user would not know CARL did not run.

### Decision: Put health and repair in pomogator-doctor

**Требование:** [FR-5](FR.md#fr-5-doctor-health-and-repair)
**Требование:** [FR-6](FR.md#fr-6-managed-markers-preserve-user-configuration)

**Rationale:** Doctor already owns managed structure, hook registry, version, and repair patterns; adding CARL there keeps repair discoverable through an existing user-facing command.

**Trade-off:** Doctor gains another platform-specific check and must keep CARL states concise enough for the report UI.

**Alternatives considered:**
- A separate CARL-only doctor command — rejected because it fragments diagnostics and duplicates repair mechanics.
- Repair only during install — rejected because users need a way to recover drift after install.

### Decision: Gate Codex CARL behind existing Codex launcher and dispatcher prerequisites

**Требование:** [FR-7](FR.md#fr-7-codex-path-gated-by-launcher-and-dispatcher-prerequisites)

**Rationale:** Existing Codex specs require project-local artifacts, version-aware capability checks, and deterministic dispatch; CARL should extend that model instead of bypassing it.

**Trade-off:** Codex support is intentionally deferred even if some CARL pieces are reusable from Claude Code.

**Alternatives considered:**
- Copy Claude Code hook files into Codex config — rejected because Codex has separate capabilities and artifact semantics.
- Build a new CARL-specific Codex launcher — rejected because it would duplicate the context-menu launcher path and create inconsistent trust handling.

### Decision: Keep CARL benchmark thresholds draft until real evidence exists

**Требование:** [FR-9](FR.md#fr-9-recall-benchmark-threshold-and-regression-gate)

**Rationale:** Current repo research has no verified CARL benchmark issue content or runtime artifact, so numeric thresholds would be invented. The benchmark should first capture a real baseline.

**Trade-off:** The first implementation may ship with benchmark scaffolding in draft or blocked state until CARL evidence is captured.

**Alternatives considered:**
- Hard-code an estimated threshold now — rejected because it would violate the real-artifact verification rule.
- Skip benchmark planning entirely — rejected because recall performance/token budget is a core CARL risk if recall is enabled.

### Decision: Treat Russian CARL readiness as an evidence report, not a label

**Требование:** [FR-8](FR.md#fr-8-review-audit-and-reporting)

**Rationale:** Russian CARL support can be wrong in several ways: missing aliases, noisy domain matches, excessive context, or fixture-only evidence. A separate evidence report makes those gaps visible before readiness is claimed.

**Trade-off:** The release gate gains one more report and prompt matrix, but the output gives maintainers concrete optimization work instead of a vague ready/not-ready label.

**Alternatives considered:**
- Treat Cyrillic aliases in `.carl/carl.json` as readiness proof — rejected because aliases do not prove matching quality or context budget.
- Fold Russian checks into the generic benchmark only — rejected because benchmark rows alone do not explain false positives, false negatives, or alias/ranking fixes.

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**TEST_DATA:** TEST_DATA_ACTIVE
**TEST_FORMAT:** BDD
**Framework:** Cucumber.js
**Install Command:** already installed for this repository's BDD suite
**Evidence:** Existing repository BDD structure includes `cucumber.json`, `tests/features/*.feature`, `tests/step_definitions/*.ts`, and `tests/hooks/before-after.ts`; CARL implementation will add a new feature and step definitions rather than new vitest files.
**Verdict:** CARL tests need real filesystem/project fixtures for managed artifacts and induced hook failure; no persistent external service fixture is verified yet. Additional cleanup uses existing Cucumber.js hooks plus per-scenario temp directories.

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/hooks/before-after.ts` | Before/After | per-scenario | Provides existing scenario isolation and cleanup hooks for the BDD suite. | Yes — use temp project directories and cleanup through existing world lifecycle. |
| `tests/hooks/ensure-docker-bdd.ts` | startup guard | global | Ensures BDD runs in Docker, matching repo policy. | Yes — CARL BDD scenarios run through the same Docker-only profile. |

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| N/A | N/A | N/A | No new global hook is planned; CARL scenario cleanup should use temp dirs in step definitions and existing hooks. | `tests/hooks/before-after.ts` |

### Cleanup Strategy

Each CARL BDD scenario creates a temporary project root containing only the managed files needed by that scenario. Step definitions remove the temp root after the scenario through the existing world cleanup path. Tests must not mutate real user-level CARL config or persistent `.codex` state.

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| Managed CARL temp project | generated under scenario temp dir | Simulates supported project config for install/repair flows without touching the repository root. | per-scenario |
| Broken CARL runtime fixture | `tests/fixtures/carl/broken-runtime/` | Forces fail-open warning behavior without depending on real external CARL runtime. | per-scenario; remains [UNVERIFIED] for producer-shape claims |
| Real CARL output fixture | `tests/fixtures/carl/real-output/` | Captured real CARL output required before final done for producer-shape and benchmark claims. | shared once captured; currently [UNVERIFIED] |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `carlProjectDir` | path | Given steps | install/doctor/hook steps | Isolated temp project root for managed artifact checks. |
| `carlHookResult` | object | When hook runner executes | Then warning assertions | Captures fail-open status, warning text, and diagnostics. |
| `carlDoctorReport` | object | When doctor check runs | Then doctor assertions | Captures state classification and repair outcome. |
| `carlBenchmarkResult` | object | When benchmark runs | Then benchmark assertions | Captures baseline/threshold status for real-artifact verification. |
