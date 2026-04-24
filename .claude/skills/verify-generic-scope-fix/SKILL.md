---
name: verify-generic-scope-fix
description: Use BEFORE commit when diff adds 2+ items to an enum/switch/array that gates a shared codepath (files matching *Service.ts / *Validator.ts / *Gate.ts / *Guard.ts / *Policy.ts). Prevents adding variants whose creation flow bypasses the gate — making the fix structurally no-op. Triggered manually by user or when hook scope-gate-guard blocks a commit.
allowed-tools: Read, Bash, Grep, Glob
disable-model-invocation: true
---

# Verify Generic Scope Fix

Mechanical verification that each added enum/switch/array variant reaches the edited code path. Prevents class of bugs where type-check passes but behavior is silently no-op.

## When to run

Run this skill BEFORE `git commit` when you've added 2+ items to an enum, switch, array, or Set that gates a shared code path. Common signals:

- File name matches `*Service.ts`, `*Validator.ts`, `*Gate.ts`, `*Guard.ts`, `*Policy.ts`, `*Filter.ts`
- Function name matches `is*`, `should*`, `can*`, `has*`, `must*`, `check*`, `validate*`, `verify*`, `allow*`, `permit*`
- Jira/ticket scope says "all X doctypes except Y" (letter-of-ticket reasoning is the exact failure mode)

The hook `scope-gate-guard` may block your commit and surface this skill in the deny message.

## Reference incident

In webapp MR !100 (PRODUCTS-20218), agent added `stocktaking` to `isOutboundDocument()` enum per "all doctypes except INBOUND" scope. Stock Taking has `StartStockTakingModal` with server-auto-generated `qty` — validation never fires. Fix was structurally no-op. Reviewer (evolkov) caught on code review.

**Lesson (H6 structural):** LLM does not "feel" domain semantics. Primary lever is mechanical code-evidence grep.

## Workflow

For each added variant, perform ALL FIVE steps. Do not skip. Do not substitute tautological checks ("enum-test passes" ≠ reach verification).

### Step 1 — Dedicated-flow grep

For each new variant `<Name>` (e.g., `stocktaking`), run:

```bash
grep -rn "Start<Name>Modal\|<Name>Form\|New<Name>\|<Name>Creator\|generate<Name>" src/
```

**If this finds a dedicated creation component** (a separate Modal/Form/Creator file for that variant) → 🚩 **red flag**. Proceed to Step 2 with heightened scrutiny. The variant likely has its own flow.

### Step 2 — Dataflow trace

Open each dedicated component found in Step 1 (or the generic form used by the variant). Find:

1. Where user input happens (form fields, button clicks)
2. Where save is triggered (`handleSave`, `onSubmit`, API call)
3. Does the save path call the gate function you're modifying?

If the save path does NOT call your gate function → **unreachable**. Your fix is no-op for this variant. Exclude it.

Record the evidence: `evidence: "grep Start<Name>Modal found src/components/<Name>Modal.tsx line N — uses DocumentOperations.generate<Name>({params}) endpoint, not DocumentForm.handleSave path"`.

### Step 3 — Value reachability

If your gate checks specific values (e.g., `qty > available`), verify those values are actually user-entered (not server-generated or auto-computed) for this variant:

```bash
grep -rn "isExpectedReadOnly\|readOnly.*<variant>\|disabled.*<variant>\|auto-generate.*<variant>" src/
```

If the field your gate checks is read-only / server-generated for this variant → **unreachable**. Exclude it.

### Step 4 — Classify

For each variant produce a verdict:

- `traced` — grep found no dedicated flow AND dataflow reaches your gate AND values are user-entered
- `unreachable` — any of (dedicated flow exists / gate not in dataflow / values auto-generated)
- `conditional` — reachable only via feature flag / edge case / config branch

### Step 5 — Write marker + report

Run the helper:

```bash
npx tsx .dev-pomogator/tools/scope-gate/analyze-diff.ts
```

The helper writes `.claude/.scope-verified/<session_id>-<shortdiffsha>.json` with per-variant classification. If ANY variant is `unreachable`, marker has `should_ship: false` and the hook will still deny commit.

Output the findings to the user. For every `unreachable` variant, output:

```
🚫 DO NOT SHIP — variant <name> structurally no-op through <gate function>
   Evidence: <grep trace>
   Action: exclude from this fix; open separate issue if variant needs different treatment
```

## Gotchas

- ❌ **Do NOT substitute Step 2 with "enum-test passes"** — unit test on the enum array is tautological; tests content you just added, not that the fix fixes anything.
- ❌ **Do NOT rely on `feedback_jira_literal_scope.md` memory as cover** — code-evidence trumps literal scope. If grep finds separate flow, the memory's "don't invent concerns" rule does NOT apply (that rule protects against unsupported bizdomain concerns; your finding is code-evidence).
- ❌ **Do NOT fill "Concerns for Review-after-Ship" section with reach questions** — those are offload. Resolve before ship or ask the user now.
- ✅ **Ask the user a short question** ("Stock Taking has separate creation flow — excluding from this fix, OK?") — cheaper than shipping wrong scope and catching on review.
- ✅ **Prefer early exit** — if Step 1 finds a dedicated component, you likely don't need Steps 2-3 — just exclude and document.

## Related

- Spec: [.specs/verify-generic-scope-fix/](../../../../.specs/verify-generic-scope-fix/README.md)
- Reference incident: memory `reference_stocktaking-incident-products-20218.md`
- Adjacent rule: `.claude/rules/plan-pomogator/cross-scope-coverage.md` (multi-scope coverage matrix — complementary)
- Trigger rule: `.claude/rules/scope-gate/when-to-verify.md`
- Escape hatch audit: `.claude/rules/scope-gate/escape-hatch-audit.md`
