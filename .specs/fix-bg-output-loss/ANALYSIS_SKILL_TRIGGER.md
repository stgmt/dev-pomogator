# ANALYSIS: Why /run-tests skill didn't auto-fire on 2026-05-10

**Spec:** [fix-bg-output-loss](README.md) v0.3.0 / FR-14
**Date:** 2026-05-11

## TL;DR

The `/run-tests` skill **failed to auto-invoke** during the 2026-05-10 incident (`dotnet test --filter MBIL001` background hang) for three independent reasons:

1. **Skills don't auto-trigger reliably** — community consensus shows ~50% trigger rate baseline; AI prioritizes task completion over skill discovery
2. **Description was misleading** — `"Auto-detects framework"` reads as auto-invoke promise but actually refers to framework detection inside the skill
3. **test_guard hook install path bug** in `wt-manual-billing` — hooks landed in `settings.json` instead of `settings.local.json` per personal-pomogator FR-2 (likely legacy installer run pre-FR-2; **FR-16 conditional fix**)

The recommended fix combination (v0.3.0): description rewrite + smart converter in `test_guard` + memory feedback. PreToolUse auto-redirect hook deferred as follow-up (risk over-blocking).

---

## Incident Timeline

| Time | Event |
|------|-------|
| t=0 | AI ran `dotnet test --filter MBIL001` via Bash tool with `run_in_background: true` in `wt-manual-billing` |
| t≈30s | Test process spawned, Testcontainers started initializing (Postgres + Mariadb pull/start) |
| t=10min | Process likely died (network timeout / container startup failure) |
| t≈12-25min | AI repeatedly checked status, saw "0 bytes captured", reported "tests still running, output буферизуется до завершения" — this was wrong assumption |
| t=25min | User asked "мб ты ждешь то чего нету?" — prompted reality check |
| t≈26min | `taskkill /F /PID` confirmed no `dotnet` process alive |

**Critical failure mode**: AI couldn't distinguish "process hung" from "capture lost" — both look identical (0 bytes stdout, status "running"). The persistent log from `test_runner_wrapper` would have provided ground-truth observability, but `/run-tests` skill wasn't invoked, raw `dotnet test` was run directly.

---

## Skill Auto-Trigger Mechanism — How It Actually Works (2026)

Per [Anthropic Claude Code Skills documentation](https://code.claude.com/docs/en/skills) and community analysis:

### Triggering algorithm
1. Claude Code pre-loads **all skill descriptions** (frontmatter `description` field) into the system prompt
2. On every user message, Claude scans loaded descriptions and matches against user intent + active context
3. If match, Claude calls `Skill("<name>")` — this is auto-invocation
4. **Limit**: total description budget ~15K chars (`SLASH_COMMAND_TOOL_CHAR_BUDGET` env var, default per [community analysis](https://dev.to/lizechengnet/why-claude-code-skills-dont-trigger-and-how-to-fix-them-in-2026-o7h))

### Three failure modes per [Lize Cheng "Why Claude Code Skills Don't Trigger 2026"](https://dev.to/lizechengnet/why-claude-code-skills-dont-trigger-and-how-to-fix-them-in-2026-o7h):

| # | Failure | Frequency | Fix |
|---|---------|-----------|-----|
| 1 | **Token budget overflow** — too many skills, descriptions truncated silently | Common in projects with 10+ skills | `SLASH_COMMAND_TOOL_CHAR_BUDGET=30000` env |
| 2 | **YAML formatting issues** — multi-line descriptions break parser | Occasional | Single logical lines, prevent auto-format |
| 3 | **Goal-focused behavior** — AI prioritizes task completion, ~50% trigger rate | Always | Directive language: "ALWAYS invoke when...", keywords in description |

### 2026 telemetry addition

Per [Claude Code Changelog 2026](https://claudefa.st/blog/guide/changelog), `claude_code.skill_activated` OTEL event fires with `invocation_trigger` attribute:
- `user-slash` — explicit `/run-tests` typed by user
- `claude-proactive` — AI's autonomous decision to invoke
- `nested-skill` — invoked by another skill

This is observability, not trigger improvement.

---

## Description Analysis — Why "Auto-detects" Was Misleading

### Original frontmatter (pre-v0.3.0)

```yaml
description: >
  Centralized test runner. Auto-detects framework (vitest/jest/pytest/dotnet/rust/go),
  runs tests through wrapper for statusline & TUI monitoring. Use instead of direct test commands.
```

### Problems identified

1. **"Auto-detects framework"** parses ambiguously:
   - Intended meaning: skill detects framework from `vitest.config.ts` etc. **inside** the skill body
   - AI's likely reading: "skill auto-fires when test commands are seen" → false expectation
2. **No explicit trigger keywords** — phrases like "запусти тесты", "run tests", "dotnet test", "long bg" missing
3. **"Use instead of direct test commands"** is passive — better phrasing "INVOKE when planning to run X" (directive language per community recommendations)
4. **No mention of bg case** — most failure mode for incident 2026-05-10 was specifically `run_in_background: true`

### v0.3.0 rewrite

Per FR-13, frontmatter now contains explicit triggers (`dotnet test`, `pytest`, `cargo test`, `vitest`, `jest`, `run tests`, `in background`, `long bg`), directive language ("INVOKE PROACTIVELY"), and Generic mode use case. Verified 8/8 keywords present in updated SKILL.md.

---

## Hook Install Path Investigation (FR-16 conditional)

### Finding from Explore agent

`wt-manual-billing/.claude/settings.json` contains test_guard PreToolUse hook:
```json
"PreToolUse": [{ "matcher": "Bash", "hooks": [{ "command": "...test_guard.ts", ... }] }]
```

`wt-manual-billing/.claude/settings.local.json` does **NOT** contain hooks key.

### Expected per personal-pomogator FR-2

> Hooks should be installed to **project's `settings.local.json`** (personal, gitignored) for target projects. Team-shared `settings.json` is never touched in target projects.

`src/installer/claude.ts:504` `isDevPomogatorRepo()` check:
```typescript
const isDogfood = await isDevPomogatorRepo(repoRoot);
const settingsPath = isDogfood
  ? '.claude/settings.json'           // dev-pomogator itself
  : '.claude/settings.local.json';    // target projects
```

### Three hypotheses

1. **Legacy installer run** — wt-manual-billing was set up before personal-pomogator FR-2 was deployed. Hooks landed in settings.json. New installer would write to settings.local.json but old hooks remain.
2. **`isDevPomogatorRepo()` false-positive** — function incorrectly returns true for wt-manual-billing. Need to read source + test.
3. **Manual edit** — someone manually added hooks to settings.json (less likely).

### Resolution (FR-16) — investigation completed 2026-05-11

**Findings:**
1. `wt-manual-billing` is a .NET project — has NO `package.json` at root
2. `isDevPomogatorRepo()` (self-guard.ts:28-57) checks `pkg.name === 'dev-pomogator'` first — FAILS (no package.json) → returns `false`
3. Therefore isDogfood=false → installer would write to `settings.local.json` per FR-2 logic (claude.ts:598-619)
4. But `wt-manual-billing/.claude/settings.json` already has test_guard hook (1 occurrence), `settings.local.json` has no hooks key

**Conclusion: Hypothesis 1 confirmed — legacy installer run pre-FR-2 deployment.**

The installer logic is correct. wt-manual-billing was set up BEFORE personal-pomogator FR-2 was deployed; hooks landed in `settings.json` at that time. New `migrateLegacySettingsJson()` function (claude.ts:612) would move them on next install — but installer hasn't been re-run.

**FR-16 status: NOT APPLICABLE** — no installer code change needed. Recommended user action: re-run `npx github:stgmt/dev-pomogator` in `wt-manual-billing` to trigger migration.

---

## WebSearch Findings — Anthropic Skills Mechanics 2026

### Sources reviewed

- [Extend Claude with skills (official docs)](https://code.claude.com/docs/en/skills)
- [Anthropic skill-creator repository](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md)
- [Equipping agents for the real world with Agent Skills (Anthropic engineering blog)](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [Claude Code Skills: A Practical Guide for 2026 (Moeed Rajpoot)](https://moeed.app/posts/claude-code-skills-complete-guide/)
- [Why Claude Code Skills Don't Trigger 2026 (Lize Cheng)](https://dev.to/lizechengnet/why-claude-code-skills-dont-trigger-and-how-to-fix-them-in-2026-o7h)
- [Claude Code Skills don't auto-activate workaround (Scott Spence)](https://scottspence.com/posts/claude-code-skills-dont-auto-activate)

### Key findings

1. **Description is the primary trigger signal** — official docs state "description does most of the heavy lifting"
2. **Spend 70% of SKILL.md iteration time on description** — Anthropic guidance
3. **Description optimization is automated** — Anthropic's skill-creator runs eval suite: 60% train / 40% test split, 3 queries per trial for reliable trigger rate, up to 5 iterations
4. **Baseline trigger rate ~50%** for typical descriptions — community measurement
5. **Directive language wins** — "ALWAYS invoke when X" outperforms "Use when X"
6. **Hooks > Descriptions** for guaranteed activation — UserPromptSubmit hook can force skill invocation

### Implications for our case

- Our updated description (FR-13) addresses #4, #5
- Smart converter hook (FR-12) addresses #6 via different mechanism (deny + suggest, not force)
- Token budget (#1 from failure modes) — not measured yet in dev-pomogator, likely OK with ~30 skills

---

## Recommendations

| Priority | Recommendation | Effort | Status |
|----------|----------------|--------|--------|
| **HIGH** | Rewrite skill description with explicit triggers + directive language (FR-13) | 30 min | ✅ Done in v0.3.0 |
| **HIGH** | Smart converter in test_guard — give AI ready-to-paste wrapper command (FR-12) | 1 hour | ✅ Done in v0.3.0 |
| **HIGH** | Feedback memory with incident + correct workflow (FR-13 supporting) | 15 min | ✅ Done in v0.2.0, updated in v0.3.0 |
| **MED** | Benchmark trigger rate (FR-15) — measure current baseline + after improvements | 2 hours | 🔲 Pending T-17 |
| **MED** | Investigate + fix installer hook path bug (FR-16 conditional) | 30 min - 2 hours | 🔲 Pending T-18 |
| **LOW** | Adjust `SLASH_COMMAND_TOOL_CHAR_BUDGET` env if benchmark shows budget overflow | 5 min | Defer until baseline measured |
| **LOW** | UserPromptSubmit hook for forced auto-invocation on detected test commands | 4 hours, high risk | Deferred (FR-9 OUT_OF_SCOPE — over-blocking concern) |

---

## Conclusion

**No single root cause** — the incident resulted from compounded weaknesses:
- Skills auto-trigger ~50% baseline (industry norm, not our bug)
- Our description was passive + misleading "Auto-detects" wording
- test_guard install path may have failed on target repo (FR-16 investigation)
- No fallback mechanism existed for raw bg test commands → 25-minute silent hang possible

**v0.3.0 introduces three layered defenses:**
1. **Better description** → higher auto-trigger rate (measured by FR-15 benchmark)
2. **Smart converter in test_guard** → if skill missed, AI gets converted command for copy-paste
3. **Feedback memory** → future sessions learn the correct workflow

If benchmark (FR-15) shows trigger rate still <70% after improvements → consider UserPromptSubmit hook in follow-up spec.

## Sources

- [Extend Claude with skills (official docs)](https://code.claude.com/docs/en/skills)
- [Why Claude Code Skills Don't Trigger 2026](https://dev.to/lizechengnet/why-claude-code-skills-dont-trigger-and-how-to-fix-them-in-2026-o7h)
- [Anthropic skill-creator repository](https://github.com/anthropics/skills)
- [Claude Code Skills: A Practical Guide for 2026 (Moeed Rajpoot)](https://moeed.app/posts/claude-code-skills-complete-guide/)
- [Claude Code Changelog 2026](https://claudefa.st/blog/guide/changelog)
- [Claude Code Skills don't auto-activate workaround](https://scottspence.com/posts/claude-code-skills-dont-auto-activate)
- [Equipping agents for the real world with Agent Skills (Anthropic engineering blog)](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
