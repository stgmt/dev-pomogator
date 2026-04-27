# User Stories

### User Story 1: Context efficiency at startup (Priority: P1) @feature1

As a **dev-pomogator maintainer**, I want the specs workflow loaded only when actually working with specs, so that the 40.6k-char rule does not consume ~10k tokens of context in 95% of sessions where specs are not touched.

**Why:** measurements show `specs-management.md` is loaded as project instructions on every conversation start. Anthropic guidance is to keep CLAUDE.md-loaded content under 200 lines and push workflow content into skills (metadata-only at startup, body on trigger).

**Independent Test:** before/after measurement of startup token cost — count tokens injected into system prompt by `.claude/rules/specs-workflow/specs-management.md` vs `.claude/skills/create-spec/SKILL.md` description+name. Target: ≥95% reduction at startup for non-spec sessions.

**Acceptance Scenarios:**

Given user opens new Claude Code session not related to specs
When system prompt is constructed
Then `specs-management.md` content is NOT injected (file removed)
And `create-spec` skill metadata (~250 tokens) is the only specs-related content present

Given user types "сделай спеку для feature-x"
When skill triggers
Then SKILL.md (≤200 lines, ~2.5k tokens) is loaded
And no phase reference files are loaded yet (phase loaded only when reached)

---

### User Story 2: Progressive disclosure with discoverable naming (Priority: P1) @feature2 @feature3

As **Claude (AI agent) executing the workflow**, I want phase reference files named `phaseN[.M]_descriptive-name.md` and linked one-level-deep from SKILL.md, so that I always pick the correct file on first try without repeated reads.

**Why:** Anthropic best practice mandates references one-level deep (deeper nesting causes Claude to do `head -100` previews and miss content). User explicitly requested phase-prefixed naming so files are unambiguous when listed.

**Independent Test:** SKILL.md contains a navigation table where each phase row points to a single reference path. Verify with: `grep -E 'references/phase[0-9]' .claude/skills/create-spec/SKILL.md | wc -l` ≥ 5 phase entries.

**Acceptance Scenarios:**

Given agent is in Phase 2 (Requirements + Design)
When agent reads SKILL.md navigation table
Then table row "Phase 2" links to exactly `references/phase2_requirements-and-design.md`
And no phase reference links to another phase reference (no nesting)

Given agent enters Phase 3+ Audit category "Errors"
When agent reads `references/phase3plus_audit-overview.md`
Then it links directly to `references/phase3plus_audit-errors.md` (sibling, not nested deeper)

---

### User Story 3: Hard cutover migration via installer (Priority: P1) @feature4

As a **dev-pomogator end user with installed plugin**, I want the next update to remove the old rule and install the new skill atomically, so that I never end up in a broken intermediate state where both exist or neither exists.

**Why:** dev-pomogator distributes via installer; rules/skills are managed artifacts (see `updater-managed-cleanup.md`, `updater-sync-tools-hooks.md`). Hard cutover = single release where extension manifest changes, installer removes old managed rule + installs new managed skill in one transaction.

**Independent Test:** integration test that simulates upgrade: pre-state has `specs-management.md` rule installed; run installer update; assert post-state has rule absent + skill present + extension.json reflects new layout.

**Acceptance Scenarios:**

Given user has dev-pomogator pre-refactor installed (rule present)
When user runs `dev-pomogator update`
Then `.claude/rules/specs-workflow/specs-management.md` is removed
And `.claude/skills/create-spec/SKILL.md` contains full workflow
And `.claude/skills/create-spec/references/*.md` are all installed

Given user has user-modified `specs-management.md` (per `updater-managed-cleanup`)
When updater runs
Then user copy is backed up to `.dev-pomogator/.user-overrides/.claude/rules/specs-workflow/specs-management.md`
And rule file removed from active location
And user is informed via update report

---

### User Story 4: Skill-validation hook continues to work (Priority: P1) @feature4 @feature5

As a **dev-pomogator end user**, I want `specs-validation` hook to keep validating @featureN cross-refs after migration, so that my existing `.specs/` folders don't suddenly fail validation because a rule moved.

**Why:** `specs-validation.md` rule was acknowledged by user as "нужен hook-у". Hook implementation reads `.specs/` files (USER_STORIES, FR, AC, .feature) directly — not the rule file. Rule file is documentation FOR Claude, hook is independent code.

**Independent Test:** run `specs-validation` hook against existing spec folder before and after migration; assert identical findings (no false positives/negatives introduced).

**Acceptance Scenarios:**

Given existing `.specs/some-feature/` with valid @featureN tags
When user submits prompt that triggers UserPromptSubmit hook
Then hook generates `validation-report.md`
And report identical (modulo timestamps) before vs after migration

Given `.claude/rules/specs-workflow/specs-validation.md` is moved to `.claude/skills/create-spec/references/specs-validation.md`
When hook code runs
Then no error from missing file (hook does not depend on rule path)
