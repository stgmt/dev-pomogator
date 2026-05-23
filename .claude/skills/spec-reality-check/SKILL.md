---
name: spec-reality-check
description: |
  Verify spec docs against repository reality. Auto-trigger when the user asks to create, modify, supplement, or implement a spec, or explicitly asks to verify spec readiness.

  EN triggers — create: "create spec", "scaffold spec", "new spec for". Modify: "modify spec", "update spec", "change spec for". Supplement: "supplement spec", "extend spec", "add FR to spec", "add AC to spec". Implement: "implement spec", "implement feature spec", "verify spec ready", "ready to ship spec".
  EN general: "verify spec ready", "spec reality check", "check spec drift", "spec drift", "spec docs vs reality".

  RU триггеры — создать: "создай спеку", "новая спека", "сделай спеку для". Изменить: "измени спеку", "обнови спеку", "поменяй спеку". Дополнить: "дополни спеку", "добавь FR", "добавь AC", "расширь спеку". Реализовать: "реализуй спеку", "имплементируй спеку", "запили фичу по спеке", "сверь спеку с кодом".
  RU общие: "проверь спеку", "сверить с реальностью", "drift в спеке", "файлы из спеки существуют?".

  Skill detects six classes of spec-vs-reality drift via `scripts/verify.ts` and supports JSON/human/markdown output formats. Pairs with PreToolUse hook on ExitPlanMode (mechanical backup). Outputs `AuditFinding[]` shape (same as audit-spec.ts).
allowed-tools: Read, Glob, Grep, Bash, Skill
---

# spec-reality-check — Verify spec docs against repository reality

## Mission

Detect drift between spec docs (`.specs/{slug}/`) and reality of the codebase + filesystem + git history. Six checks cover FILE_CHANGES path actuality (create/edit/delete), narrative path references, code-drift via git pickaxe, and TASKS↔FILE_CHANGES consistency.

Closes the gap that `audit-spec.ts` does NOT cover (internal consistency vs external reality).

## When this skill fires

Two mechanisms — model invocation via description matching + PreToolUse hook on `ExitPlanMode`. Either one triggers verification; together they form mechanical redundancy.

Use cases:
- User invokes one of four spec lifecycle operations (create / modify / supplement / implement).
- User explicitly asks "проверь спеку" / "verify spec".
- AI is about to ExitPlanMode with a plan referencing `.specs/{slug}/`.

## Workflow

### Step 1 — Resolve target spec

If user invokes the skill explicitly (e.g. "проверь спеку canonical-plugin"), the spec slug is in the prompt. Otherwise — look in the conversation for `.specs/{slug}/` references; if multiple, run against each.

If no spec can be resolved, ask the user: "На какой спеке проверить drift? Укажи slug или путь."

### Step 2 — Run verify.ts

```bash
npx tsx .claude/skills/spec-reality-check/scripts/verify.ts .specs/{slug} --format human
```

Default `--format human` for interactive read. For machine consumption (CI, hook aggregation) use `--format json`. For commit-able report files use `--format markdown` + redirect to `REALITY_CHECK_REPORT.md`.

### Step 3 — Report findings

Present findings ordered by severity (ERROR → WARNING → INFO). For each ERROR:
- Quote the finding shape (`file`, `message`, `details`).
- Identify the spec file and section that needs editing.
- Suggest a concrete edit (path correction, action change, scope marker).

### Step 4 — Iterate

If user fixes spec docs based on findings — re-run verify.ts; confirm 0 ERRORs before proceeding. If user disagrees with a finding (e.g. file genuinely planned not yet created) — accept the override but log a note.

### Step 5 — Hand off

Once verify.ts reports 0 ERRORs (≤ cosmetic WARNs allowed with rationale), hand back control to caller for the original operation (implementation / spec modification / etc).

## Output severity scale

| Severity | Meaning | Default response |
|----------|---------|------------------|
| ERROR | Drift that blocks: claimed file is wrong about its existence | Must be fixed in spec docs before proceeding |
| WARNING | Drift that warrants attention: narrative ref to missing file, code-drift signal, TASKS↔FC inconsistency | Should be acknowledged or fixed; not blocking |
| INFO | Informational: skipped check, unparseable row, empty FILE_CHANGES (scaffold) | No action required |

## Six checks reference

See [references/checks.md](references/checks.md) for full reference: check IDs, severity rules, root causes, fix recipes.

## Integration points

- **spec-review category 15** — curative: `Skill("spec-review")` calls this skill in pre-stop pipeline; severity maps ERROR→P0, WARNING→P1, INFO→P2.
- **create-spec Phase 3 Finalization** — preventative: workflow invokes this skill before `ConfirmStop Finalization`; ERRORs block the confirmation.
- **PreToolUse hook on ExitPlanMode** — mechanical: `scripts/verify-hook.ts` parses `tool_input.plan`, extracts spec refs, runs verify.ts, denies on ERROR with findings in `permissionDecisionReason`. Fail-open on internal exception.

## Limits

- Does NOT replace `audit-spec.ts` — that one checks internal consistency, this checks external reality. Both complement.
- Does NOT auto-fix drift — only detects and reports.
- LLM-driven semantic drift (narrative text claims behavior the code does not have) is out of scope for v0.1.0.
- Cross-spec drift (one spec references another that moved) is out of scope for v0.1.0.
