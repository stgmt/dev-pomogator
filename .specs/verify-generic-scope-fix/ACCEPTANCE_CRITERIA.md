# Acceptance Criteria (EARS)

## AC-1 (FR-1) @feature1

**Требование:** [FR-1](FR.md#fr-1-skill-workflow--mechanical-reach-analysis-per-variant)

WHEN user invokes `/verify-generic-scope-fix` AND staged diff содержит added variants в enum/switch/array
THEN skill SHALL execute 5-step workflow (parseAddedVariants → reach analysis per variant → classify traced/unreachable/conditional → write marker → output report)
AND skill SHALL write marker файл `{cwd}/.claude/.scope-verified/<session_id>-<shortdiffsha>.json` с полями `{timestamp, diff_sha256, session_id, variants: [...], should_ship: boolean}`.

IF any variant classified `unreachable` THEN skill SHALL set `should_ship: false` AND output SHALL содержать "DO NOT SHIP — variant X structurally no-op" в plain text.

---

## AC-2 (FR-2) @feature1

**Требование:** [FR-2](FR.md#fr-2-pretooluse-hook--block-commit-without-fresh-verification)

WHEN `tool_name === "Bash"` AND `tool_input.command` matches `/^\s*git\s+commit\b/` AND `suspicionScore(git diff --cached) >= 2` AND no fresh matching marker exists AND no escape-hatch в commit message
THEN hook SHALL emit to stdout JSON `{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: <string>}}` where `permissionDecisionReason` follows format specified в [SCHEMA.md "PreToolUse Hook Output (deny form)"](verify-generic-scope-fix_SCHEMA.md#pretooluse-hook-output-deny-form)
AND hook SHALL call `process.exit(2)`.

IF `process.stdin.isTTY === true` OR stdin input empty OR JSON parse fails THEN hook SHALL `process.exit(0)` (fail-open per plan-gate.ts:209-226 precedent).

IF `tool_name !== "Bash"` OR command не matches git commit/push pattern THEN hook SHALL `process.exit(0)` (early out, no further analysis).

---

## AC-3 (FR-3) @feature3

**Требование:** [FR-3](FR.md#fr-3-escape-hatch-with-audit-trail)

WHEN commit message содержит regex match `/\[skip-scope-verify:\s*([^\]]+)\]/i` OR environment variable `SCOPE_GATE_SKIP === "1"`
THEN hook SHALL append line to `{cwd}/.claude/logs/scope-gate-escapes.jsonl` в формате `{"ts": ISO8601, "diff_sha256": <string>, "reason": <captured reason>, "session_id": <string>, "cwd": <string>}`
AND hook SHALL `process.exit(0)` (bypass verification).

IF extracted reason length < 8 chars THEN hook SHALL дополнительно write WARN line к stderr ("scope-gate: escape reason too short for audit, но allowed") BUT still proceed с exit 0.

---

## AC-4 (FR-4) @feature4

**Требование:** [FR-4](FR.md#fr-4-docstest-dampening--anti-over-application)

WHEN `git diff --cached --name-only` возвращает только files matching `/\.(md|txt|rst)$/i` OR только files под `/(docs?|tests?|__tests__|spec)\//i`
THEN hook SHALL `process.exit(0)` сразу после name-only check (short-circuit, без score computation).

WHEN score computation выполняется AND diff содержит mixed files (some docs, some code)
THEN hook SHALL subtract 2 points per `.md/.txt/.rst` file AND subtract 1 point per docs/tests path file FROM total score BEFORE threshold comparison.

---

## AC-5 (FR-5) @feature2

**Требование:** [FR-5](FR.md#fr-5-marker-invalidation--diff-hash-pin--ttl)

IF marker file существует AND (`marker.diff_sha256 !== sha256(current git diff --cached)` OR `Date.now() - marker.timestamp > 1800000` (30 minutes in ms) OR `marker.session_id !== data.session_id`)
THEN hook SHALL treat marker as absent AND proceed с verification check (leading to either escape hatch check OR deny per AC-2).

WHEN hook invoked THEN hook SHALL delete все marker files с `Date.now() - stat.mtimeMs > 86400000` (24h) в `{cwd}/.claude/.scope-verified/` (GC), UNLESS GC was выполнен в последний hour (tracked via marker-dir `.last-gc` file mtime).

---

## AC-6 (FR-6) @feature1

**Требование:** [FR-6](FR.md#fr-6-weighted-suspicionscore-heuristic)

WHEN `scoreDiff(unifiedDiff)` вызван
THEN function SHALL возвращать `{score: number, reasons: string[]}` computed additively per rule table в [FR-6](FR.md#fr-6-weighted-suspicionscore-heuristic) (R-filename, R-enum, R-case, R-predicate).

IF diff empty OR diff parse fails THEN function SHALL return `{score: 0, reasons: ["empty/unparseable diff"]}`.

---

## AC-7 (FR-7) @feature1

**Требование:** [FR-7](FR.md#fr-7-fail-loud-on-unreachable-variant--explicit-counter-h3)

WHEN skill reach-analysis classifies any variant как `unreachable`
THEN skill SHALL write marker с `should_ship: false` AND skill output SHALL explicitly say "DO NOT SHIP — variant <name> structurally no-op through <gate function>".

WHEN hook reads marker с `should_ship: false` AND matches current diff
THEN hook SHALL deny commit с permissionDecisionReason "Previous skill run classified variant as structurally no-op; do not ship — re-verify or escape explicitly".

---

## AC-8 (FR-8) @feature5

**Требование:** [FR-8](FR.md#fr-8-skill-frontmatter--disable-model-invocation-pattern)

WHEN SKILL.md parsed by Claude Code skill loader
THEN frontmatter SHALL содержать field `disable-model-invocation: true`
AND frontmatter SHALL содержать fields `name: verify-generic-scope-fix`, `description: <≥50 char trigger description>`, `allowed-tools: Read, Bash, Grep, Glob`.

WHEN agent in conversation без explicit `/verify-generic-scope-fix` invocation
THEN skill SHALL NOT self-trigger (model-initiated invocation disabled).

---

## AC-9 (FR-9) @feature5

**Требование:** [FR-9](FR.md#fr-9-integration-with-dev-pomogator-extension-system)

WHEN `extensions/scope-gate/extension.json` is loaded by dev-pomogator installer
THEN file SHALL содержать keys `name`, `version`, `description`, `platforms: ["claude"]`, `skills`, `skillFiles`, `tools`, `toolFiles`, `hooks.claude.PreToolUse`, `ruleFiles.claude`.

WHEN `npx dev-pomogator install --extension scope-gate` executed в target project
THEN installer SHALL copy SKILL.md + scripts to `.claude/skills/verify-generic-scope-fix/` AND hook scripts to `.dev-pomogator/tools/scope-gate/` AND rules to `.claude/rules/scope-gate/` AND register hook в target `.claude/settings.local.json`.
