# Functional Requirements (FR)

## FR-1: Claude Code managed CARL install

**BDD coverage:** @feature1
**Linked AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Cases:** [UC-1](USE_CASES.md#uc-1-название), [UC-5](USE_CASES.md#uc-5-название)

### FR-1: Название

> Legacy scaffold anchor alias retained so existing scaffold links remain clickable; the authoritative requirement title is the `## FR-1` heading above.

The dev-pomogator plugin SHALL provide a managed Claude Code CARL integration path using a **global engine + per-project data** model.

The global plugin layer SHALL ship the CARL engine/runner, hook wrapper, manifest schema, doctor check, default fail-open warning, and default scope-selection logic through the canonical plugin distribution. The global layer SHALL resolve its own files through `CLAUDE_PLUGIN_ROOT` and SHALL NOT silently write project CARL data during marketplace/plugin installation.

The project layer SHALL create or refresh repository-specific CARL rules/recall data under `.carl/` for the active project determined from the hook input `cwd`. The project layer SHALL store source hashes, schema/version markers, generated timestamp, platform status, language coverage, and runtime verification status so a global plugin install alone cannot be reported as project CARL health.

The project install/repair flow SHALL run a deterministic CARL adaptation script that scans managed rule and skill sources (`.claude/rules/**/*.md`, `.claude/skills/*/SKILL.md`, and approved project indexes), creates or refreshes `.carl/carl.json`, and records per-source hashes so newly added rules or skills are detected rather than silently missing from Russian CARL recall.

Because CARL is not Russian-ready out of the box, the global plugin layer SHALL provide language/capability detection and Unicode-safe matching mechanics, while the project layer SHALL explicitly record whether Russian (`ru`) rules, recall domains, and trigger aliases were generated for the current project. A Russian prompt SHALL NOT be treated as a healthy empty recall when project Russian coverage is missing; the runner and doctor SHALL report a degraded language state such as `language-unsupported`, `project-language-missing`, or `project-language-stale`.

The adaptation script SHALL generate or preserve Russian trigger aliases from source headings, existing Russian prose, and curated override mappings. If a rule or skill has no safe Russian recall terms, it SHALL mark that source as `ru:needs-alias` or an equivalent partial language state rather than inventing semantics.

The installer SHALL write only dev-pomogator-managed artifacts or managed blocks, SHALL mark them with a dev-pomogator owner/version marker, and SHALL be idempotent across repeated install/repair runs.

[NEEDS_CONFIRMATION] Sibling CARL runtime layout, smoke output, and benchmark output are captured under `tests/fixtures/carl/`, including Russian prompt samples, but the final dev-pomogator source/vendor path, accepted runtime packaging, recall backend durability, language metadata schema, and hook command contract remain implementation-phase decisions before this FR can close.

## FR-2: No fake green when CARL is absent

**BDD coverage:** @feature2
**Linked AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Cases:** [UC-1](USE_CASES.md#uc-1-название), [UC-5](USE_CASES.md#uc-5-название)

### FR-2: Название

> Legacy scaffold anchor alias retained so existing scaffold links remain clickable; the authoritative requirement title is the `## FR-2` heading above.

The integration SHALL NOT report CARL as installed, healthy, active, or ready when no real CARL runtime consumer can run.

When CARL artifacts are absent, unsupported, stale, or missing a runnable runtime, the installer, doctor, and status/report surfaces SHALL return an explicit degraded state instead of a success state.

The degraded state SHALL name the missing condition and SHALL preserve the main dev-pomogator install flow without claiming CARL guidance was available.

## FR-3: Runtime consumer and end-to-end proof

**BDD coverage:** @feature3
**Linked AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Cases:** [UC-1](USE_CASES.md#uc-1-название), [UC-3](USE_CASES.md#uc-3-название), [UC-6](USE_CASES.md#uc-6-later-review-checks-install-repair-warning-and-sequencing)

### FR-3: Название

> Legacy scaffold anchor alias retained so existing scaffold links remain clickable; the authoritative requirement title is the `## FR-3` heading above.

The implementation SHALL include a runtime consumer that actually invokes the managed CARL hook path in the normal Claude Code hook flow.

Installing files alone SHALL NOT satisfy this requirement: the release gate SHALL include an end-to-end BDD scenario that drives the real hook command through the same launcher/dispatcher used by plugin users and fails if the hook is not wired.

The BDD proof SHALL use real CARL output or a fixture captured from the real CARL producer before the implementation task is marked done; synthetic producer shapes MAY be used only as temporary red-phase scaffolding and MUST remain marked [UNVERIFIED].

## FR-4: Fail-open warning injection

**BDD coverage:** @feature4
**Linked AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-3](USE_CASES.md#uc-3-название)

### FR-4: Название

> Legacy scaffold anchor alias retained so existing scaffold links remain clickable; the authoritative requirement title is the `## FR-4` heading above.

When the managed CARL hook cannot run because of a missing dependency, unsupported environment, timeout, malformed output, or runtime failure, the hook SHALL fail open so the agent session continues.

On that fail-open path, the hook SHALL inject a concise warning into agent-visible chat or context that states CARL did not run and reminds the AI agent to tell the user that CARL guidance/recall was unavailable.

[UNVERIFIED] The exact Claude Code and Codex mechanisms for agent-visible hook context injection MUST be verified before coding; this FR defines the required observable behavior, not the unverified transport.

## FR-5: Doctor health and repair

**BDD coverage:** @feature5
**Linked AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Cases:** [UC-2](USE_CASES.md#uc-2-название), [UC-6](USE_CASES.md#uc-6-later-review-checks-install-repair-warning-and-sequencing)

### FR-5: Название

> Legacy scaffold anchor alias retained so existing scaffold links remain clickable; the authoritative requirement title is the `## FR-5` heading above.

`pomogator-doctor` SHALL add a CARL check that classifies the managed integration as `healthy`, `missing`, `stale`, `broken-runtime`, `unsupported`, `user-conflict`, or `repairable`.

When invoked with repair enabled, doctor SHALL reinstall or refresh only managed CARL artifacts and managed hook registrations, SHALL leave user-owned configuration intact, and SHALL report the before/after state in its normal diagnostic output.

Doctor SHALL detect at least missing managed files, stale managed version markers, broken hook registration, unavailable runtime dependencies, and unsupported platform capability.

## FR-6: Managed markers preserve user configuration

**BDD coverage:** @feature6
**Linked AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Cases:** [UC-1](USE_CASES.md#uc-1-название), [UC-2](USE_CASES.md#uc-2-название)

Every CARL integration write to project or user configuration SHALL be bounded by explicit dev-pomogator managed markers, a machine-readable managed manifest, or a deterministic managed object key.

Installer and repair code SHALL preserve user-authored CARL files, user-authored hook entries, and unrelated configuration outside the managed region.

If a user-owned entry conflicts with the managed CARL key, the integration SHALL report `user-conflict` and require an explicit repair decision instead of overwriting the entry silently.

## FR-7: Codex path gated by launcher and dispatcher prerequisites

**BDD coverage:** @feature7
**Linked AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use Cases:** [UC-4](USE_CASES.md#uc-4-название), [UC-6](USE_CASES.md#uc-6-later-review-checks-install-repair-warning-and-sequencing)

Codex CARL support SHALL be sequenced after the dev-pomogator Codex context-menu launcher and Codex hook dispatcher path are available.

The Codex path SHALL use the existing Codex project-local artifact model, version-aware hook capability check, and deterministic dispatcher rather than copying the Claude Code hook registration blindly.

If the installed Codex version or project state lacks the required hook capability, the CARL integration SHALL mark Codex CARL as unsupported for that environment while leaving Claude Code CARL behavior unaffected.

## FR-8: Review, audit, and reporting

**BDD coverage:** @feature8
**Linked AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
**Use Case:** [UC-6](USE_CASES.md#uc-6-later-review-checks-install-repair-warning-and-sequencing)

The CARL integration SHALL include a reviewable report path that covers managed install, runtime hook consumption, fail-open warning behavior, doctor repair, user-config preservation, Codex sequencing, and benchmark evidence.

Before the feature is called ready, the review/audit SHALL identify each external CARL claim as `[VERIFIED]`, `[UNVERIFIED]`, or `[ASSUMED]`, and SHALL block fake-green claims where CARL files exist but the hook was not exercised.

The report SHALL include a Russian-language CARL self-evaluation section that runs or loads real CARL output for a curated Russian prompt matrix, compares expected vs actual loaded domains, records false positives and false negatives, measures latency/context budget when observable, and lists optimization recommendations before Russian CARL support is considered ready.

The report SHALL include enough evidence for a maintainer to distinguish implemented behavior, unsupported platform state, and external CARL research still pending.

## FR-9: Recall benchmark threshold and regression gate

**BDD coverage:** @feature9
**Linked AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
**Use Cases:** [UC-3](USE_CASES.md#uc-3-название), [UC-6](USE_CASES.md#uc-6-later-review-checks-install-repair-warning-and-sequencing)

If CARL recall is enabled by the implementation, the project SHALL add a CARL recall benchmark that runs against a real CARL recall artifact or real CARL runtime output.

The benchmark SHALL record an initial baseline and SHALL fail on regressions above the approved threshold for recall latency, token overhead, or recall quality once that threshold is derived from real CARL evidence.

[UNVERIFIED] No numeric CARL benchmark threshold is verified by the current repository inventory; the implementation MUST NOT invent one before capturing the real benchmark artifact or receiving an approved external requirement.
