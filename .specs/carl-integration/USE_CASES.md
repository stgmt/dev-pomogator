# Use Cases

## UC-1: Название

**Managed Claude Code project deployment.**

A user installs or starts the canonical dev-pomogator plugin in a supported project. The plugin's SessionStart/bootstrap flow must deploy project data; plugin registration alone is not enough.

- SessionStart selects the event project and runs the existing bootstrap/deployment path.
- The project receives `.carl/carl.json` with `managedBy=dev-pomogator`, version/schema metadata, runtime status, platform state, and language metadata.
- User-owned `.claude/settings.json` content outside the reserved managed key remains unchanged.
- A subsequent UserPromptSubmit event resolves the same project-local manifest.
- Initial deployment is awaited; it must not be lost to a hook timeout or an unrelated bundled-module CLI guard.
- Result: project-local CARL state is available or the session receives a visible degraded state rather than silent absence.

## UC-2: Название

**Root selection and missing-state diagnosis.**

A user works across Windows drives, nested repositories, worktrees, or multiple sessions while a stale `CARL_PROJECT_DIR` may be present.

- The runner receives `input.cwd` from the hook event and records the selected root source in diagnostics.
- An explicit override is accepted only according to a documented, validated precedence; a stale override must not silently redirect a different project's request.
- The runner does not walk to an unrelated parent merely because another `.carl/carl.json` exists there.
- Missing, stale, or wrong-root state is reported as `project-missing` or another degraded diagnostic.
- Result: CARL never claims healthy guidance for the wrong project, and cross-drive paths such as `C:\` versus `E:\` remain distinct.

**Evidence basis:** GitHub issues #128, #130, #203, #205, and #206.

## UC-3: Название

**Real hook consumer and fail-open warning.**

A plugin user has the canonical hooks installed, but the runtime may be absent, malformed, timed out, unsupported, or exceptional.

- `.claude-plugin/hooks.json` starts the SessionStart bootstrap.
- The hook-service registry routes `UserPromptSubmit` to `tools/carl/runner.ts`; registration is checked through the registry, not only through the transport manifest.
- The runtime-consumer scenario executes the registered path and records project runtime proof; file presence alone is insufficient.
- On controlled failure, the runner emits `hookSpecificOutput.additionalContext`, exits fail-open, and includes the instruction that the AI agent must tell the user CARL guidance/recall was unavailable.
- On success, the runner emits normal context without a false failure warning.
- Result: unrelated agent work continues while CARL degradation remains visible.

**Evidence basis:** merged PR #202 and the current runner/registry contract.

## UC-4: Название

**Doctor repair and ownership boundary.**

A user runs `pomogator-doctor` after CARL becomes missing, stale, unsupported, or broken.

- Doctor distinguishes managed project state, runtime-consumer verification, language coverage, platform support, and ownership conflict.
- Repair refreshes only managed files/keys and reports before/after evidence.
- User-owned settings, aliases, hook entries, and other content outside the managed boundary remain byte-equivalent.
- A conflicting reserved key returns `user-conflict` and refuses overwrite.
- Runtime dependency failure is reported as `broken-runtime`, not “fixed” by rewriting configuration.
- Result: repair is idempotent, auditable, and conservative.

## UC-5: Название

**Independent Codex prerequisite gate.**

A user has Claude Code CARL available while Codex launcher, plugin manifest, dispatcher, or version capability may be absent.

- The evaluator checks context-menu Codex launcher, project/plugin artifact model, deterministic hook dispatcher, and required version capability.
- Missing prerequisites produce `codex-deferred-prerequisite` or an equivalent unsupported state.
- Codex does not copy Claude Code hook files or change Claude Code health.
- When prerequisites are complete, registration uses the deterministic Codex dispatcher and project-local artifact model.
- Result: Codex support is staged without weakening the already supported Claude Code path.

**Evidence basis:** existing Codex/context-menu contracts, current CARL manifest gate, and issue #173.

## UC-6: Later review checks install, repair, warning, and sequencing

**Provenance-bound review and benchmark.**

A maintainer evaluates whether CARL can be called ready and whether recall/performance thresholds are justified.

- The review report covers install, runtime consumer, fail-open warning, doctor repair, user preservation, Codex sequencing, and benchmark evidence.
- Local source/registration evidence is marked separately from project runtime-consumer execution.
- Sibling CARL fixture output is identified as fixture-backed unless source/vendor provenance proves it belongs to dev-pomogator.
- Missing real artifact keeps benchmark status draft/blocked and prevents invented numeric thresholds.
- A provenance-complete real artifact records source hashes, producer ground truth, supported latency/context/recall metrics, and a baseline for future regression checks.
- Russian evaluation compares expected and actual domains and records false positives, false negatives, and concrete optimization recommendations without upgrading runtime readiness.
- Result: readiness is an evidence decision, not a file inventory.

**Evidence basis:** repository fixture ledger, benchmark contract, current review report, and the external producer evidence marked [UNVERIFIED]/[NEEDS_CONFIRMATION].

## UC-7: SessionStart race and bundled-module guard regression

**Bootstrap completes reliably under the real launcher.**

A clean project triggers SessionStart while the plugin uses bundled doctor modules and a bounded hook lifecycle.

- Bootstrap completes initial project deployment before its lifecycle ends.
- The completion/result is not replaced by usage output from an inlined module.
- Renamed installer copies still run their intended CLI because guards do not depend on a basename.
- A mutation check catches the old extra `node` token and early timeout behavior.
- Result: initial CARL deployment is deterministic under the plugin launcher.

**Evidence basis:** merged PR #202, including the 1871-scenario Docker run and CARL regression scenarios.

## Discovery boundary

This phase defines the use-case system but does not close the remaining evidence gaps: clean dependency-absent installed-plugin proof, a dev-pomogator-owned external CARL producer/source contract, final event-root precedence semantics, and benchmark thresholds. Those are implementation/audit gates.
