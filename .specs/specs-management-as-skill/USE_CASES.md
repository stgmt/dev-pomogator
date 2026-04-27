# Use Cases

## UC-1: Trigger via natural-language scaffolding request @feature1 @feature5

User wants to start a new spec via creation phrase ("сделай спеку для X", "create spec for X", "набросай спеки по фиче Y").

- User types creation phrase in conversation (no `/` slash needed)
- Claude Code matches phrase against `create-spec` skill description (which contains all trigger variants verbatim)
- Skill triggers, SKILL.md body loaded into context
- Skill runs `scaffold-spec.ts -Name "{slug}"`
- Skill loads `references/phase1_discovery.md` for the rest of Phase 1
- Result: spec folder created, agent ready to fill USER_STORIES.md

## UC-2: Resume existing spec at correct phase @feature1 @feature2

User asks to continue or update spec mid-flight ("продолжи спеку X", "update specs for Y").

- User sends update phrase
- Skill triggers
- SKILL.md instructs agent to read `.specs/{slug}/.progress.json`
- Based on `currentPhase`, SKILL.md navigation table tells agent to load only the matching `references/phaseN_*.md`
- No other phase references loaded (token efficient)
- Result: agent continues from correct phase without re-reading earlier ones

## UC-3: Phase 3+ Audit with category-specific reference files @feature3

After STOP #3, audit runs over 6+ semantic categories (Errors, Logic Gaps, Inconsistency, Rudiments, Fantasies, Undefined Behavior, Jira Drift).

- SKILL.md instructs agent to load `references/phase3plus_audit-overview.md`
- Overview lists categories with one-liner each + link to per-category reference
- Agent loads each `references/phase3plus_audit-{category}.md` only when working that category
- Result: 7 small files instead of one 112-line block; only loaded categories consume tokens

## UC-4: Hard-cutover migration via installer update @feature4

User runs `npm install -g dev-pomogator@latest` (or installer's update command).

- Installer reads new `extension.json` for `specs-workflow`
- Old `ruleFiles.claude` entry for `specs-management.md` is missing → installer cleans up via `updater-managed-cleanup` (file removed from `.claude/rules/specs-workflow/`)
- New `skills.create-spec` entry → installer copies `.claude/skills/create-spec/` (SKILL.md + references/) to target project
- Hooks for `specs-validation` validator continue to work (point to `.specs/` data, not rule file)
- Result: clean state — no orphaned rule file, fully-formed skill installed

## UC-5: research-workflow split — separate skill, separate trigger @feature5

User asks "исследуй best practices для X" (NOT in spec context).

- `research-workflow` skill triggers (its own description has "исследуй/найди/погугли/ресерч" trigger phrases)
- It does NOT trigger `create-spec` skill
- Workflow runs autonomously, reports back
- Result: research workflow accessible without dragging spec workflow into context

## UC-6: specs-validation hook validates without rule-file dependency @feature4

User submits prompt that triggers UserPromptSubmit hook.

- Hook code (a `.ts` file in installer-managed location) scans `.specs/` folders
- Hook reads `.feature` files, FR.md, AC.md from each spec folder — NOT the rule file
- Hook generates `validation-report.md` per spec folder
- Hook never reads `.claude/rules/specs-workflow/specs-validation.md` (rule was documentation for Claude, not data for hook)
- Result: hook unaffected by migration, continues to enforce @featureN sync
