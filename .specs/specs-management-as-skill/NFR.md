# Non-Functional Requirements

## Performance

- **NFR-P1:** SKILL.md body ≤200 lines (Anthropic guidance: <500 lines optimal; we target stricter for navigation clarity)
- **NFR-P2:** Each `references/*.md` file ≤300 lines; files >100 lines SHALL include a Table of Contents at top per Anthropic best-practices
- **NFR-P3:** Token cost on session start (when no spec work referenced) ≤500 tokens for combined specs-related skill metadata (5 skills: `create-spec`, `research-workflow`, `discovery-forms`, `requirements-chk-matrix`, `task-board-forms`)
- **NFR-P4:** Token cost when active in a single phase ≤4000 tokens (SKILL.md ~2.5k + one phase reference ~1.5k)
- **NFR-P5:** Phase 3+ Audit total token cost ≤5500 tokens (overview + relevant category file)

## Security

- **NFR-S1:** No secrets, credentials, or API keys SHALL appear in any skill or reference file (verified by `assertNoSecretsInObject` pattern at file-write time, where applicable)
- **NFR-S2:** Skill `description` SHALL NOT contain XML tags (Anthropic frontmatter constraint)
- **NFR-S3:** Skill `name` SHALL be `create-spec` (existing) — lowercase + hyphens only, no reserved words ("anthropic", "claude")

## Reliability

- **NFR-R1:** Migration commit SHALL be atomic — either all 6 source rules deleted + skill installed + manifest updated + CLAUDE.md updated, or none. Partial state on disk SHALL fail integration tests.
- **NFR-R2:** `extension-json-meta-guard` PreToolUse hook SHALL pass on the post-migration `extension.json` (no manifest integrity errors)
- **NFR-R3:** specs-validator (UserPromptSubmit) hook SHALL produce identical findings on identical inputs before vs after migration
- **NFR-R4:** Skill triggering reliability ≥95% across 20 representative trigger prompts (RU+EN, terse + verbose), measured manually during validation
- **NFR-R5:** Forward-slash paths only in skill files (Windows + Unix compatibility per Anthropic guidance)

## Usability

- **NFR-U1:** Naming convention `phaseN[.M]_descriptive-name.md` SHALL be self-documenting — reader can identify phase and topic from filename without opening file
- **NFR-U2:** `SKILL.md` SHALL contain a phase navigation table (Phase | Reference path | One-liner) so agent picks correct file in one read
- **NFR-U3:** `phase3plus_audit-overview.md` SHALL list all 7 audit categories with one-liner each plus link, so agent loads only relevant category file
- **NFR-U4:** Skill `description` SHALL be in third person (Anthropic guidance: "Processes Excel files" not "I can help you")
- **NFR-U5:** Skill description SHALL include "pushy" trigger language with concrete phrases per Anthropic best practice (improves activation rate on terse prompts)

## Maintainability

- **NFR-M1:** Linter or test SHALL detect violations of FR-2 naming convention (regex check on `references/*.md` filenames)
- **NFR-M2:** Linter or test SHALL detect violations of FR-1 one-level-deep references (grep for `references/` in any reference file other than `phase3plus_audit-overview.md`)
- **NFR-M3:** When a new phase reference is added in future, updating `SKILL.md` navigation table SHALL be the only required cross-file edit (no other reference file needs updating)

## Migration

- **NFR-MG1:** Hard cutover happens in a single git commit (atomic from version control standpoint)
- **NFR-MG2:** dev-pomogator `version` in package.json bumped (semver minor) — installer detects new version and triggers update
- **NFR-MG3:** Pre-existing user modifications to managed rule files SHALL be preserved in `.dev-pomogator/.user-overrides/` per `updater-managed-cleanup` (no modification to existing updater behavior required)
