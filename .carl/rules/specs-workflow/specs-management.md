# Specs Management — v4 router rule

This rule is intentionally short. The detailed spec workflow lives in the `create-spec` skill and the
spec-generator-v4 tools; this file only routes the agent and keeps the non-negotiable safety rails in
one always-loaded place.

## When this rule applies

Use this rule when the user asks to create, update, view, or verify a feature specification:

- RU: «создай спеку», «сделай спеки», «обнови спеки», «покажи спеку», «статус спеки», «готова ли спека».
- EN: “create spec”, “spec out”, “update spec”, “show spec”, “spec status”, “is the spec ready”.

## Route to the right owner

| User intent | Route | Why |
|-------------|-------|-----|
| Create or update spec content | `Skill("create-spec")` | Owns the phased authoring workflow, stop points, form fillers, and final audit. |
| Check whether a spec or feature is really done | `Skill("spec-status")` or `spec-verdict.ts` | Health is evidence-based, not a formatting pass. |
| Ask graph questions: “what covers FR-7?”, “which scenarios use this tag?” | `Skill("spec-graph-query")` or the spec MCP tools | The graph knows traceability; text grep is not the source of truth. |
| Fix the generator, graph, MCP server, validator, verdict, or noisy finding | `Skill("spec-generator-dev")` | That is tooling maintenance, not spec authoring. |
| Bulk corpus health, collisions, dangling edges, untraced items | `Skill("corpus-health")` | Corpus-wide audit is separate from one spec’s workflow. |

Do not reimplement these workflows inside this rule. If a detail is missing, update the owning skill,
reference, validator, or tool instead.

## Non-negotiable rails

1. **Spec mutations go through the door.** Under spec-access enforcement, read and write spec content
   through the spec MCP tools or `scripts/spec-door.ts`; do not bypass the door with raw shell access.
   See `.claude/rules/gotchas/enforce-spec-door-bash-workflow.md`.

2. **`.progress.json` is engine-owned.** Do not create or edit it through Write/Edit/MCP or by any other manual mutation. Only the engine commands
   create or advance it: `scaffold-spec.ts` for new specs and `spec-status.ts -ConfirmStop ...` for
   stop-point confirmation.

3. **Form documents are not hand-authored wholesale.** `USER_STORIES.md`, `RESEARCH.md`,
   `REQUIREMENTS.md`, `DESIGN.md`, and `TASKS.md` must be filled by the form-filler skills:
   `discovery-forms`, `requirements-chk-matrix`, and `task-board-forms`. Manual edits are for small
   targeted fixes only. See `.claude/rules/spec-authoring-via-subskills.md`.

4. **A formatting pass is not a health verdict.** `validate-spec.ts` can prove only that the files are
   structurally readable. Before saying “ready”, “clean”, “valid”, or “done”, use the smart verdict:
   `npx tsx tools/specs-generator/spec-verdict.ts -Path .specs/<slug>` or the `spec-status` skill.
   See `.claude/rules/spec-verdict/no-structural-valid.md`.

5. **BDD scenarios need real tags.** A feature tag is a real Gherkin tag above the scenario:
   `@feature1`. Do not write `# @feature1`; that is only a comment, so the spec graph will not see it.

6. **BDD is the default test shape.** New behavioural coverage is written as real BDD scenarios and
   step definitions that drive production code. A non-BDD fallback is allowed only with an explicit
   risk explanation in the spec design, because it means the normal BDD route is genuinely impossible.

7. **Test data must have lifecycle.** If scenarios create, modify, or depend on data, the design must
   say how that data is prepared and cleaned up. Reuse existing hooks when possible; add new hooks and
   fixture notes when needed. Keep detailed lifecycle instructions in the `create-spec` references, not
   in this router rule.

8. **Jira mode is conditional.** Jira preservation rules apply only when the spec contains
   `JIRA_SOURCE.md`. In that case, the spec must preserve verbatim Jira intent through requirement,
   acceptance, scenario, and task trace lines. If there is no Jira source file, this branch is off.

9. **Feature scenarios are based on existing language.** Before writing or changing a `.feature` file,
   inspect existing project scenarios and the step dictionary via `analyze-features.ts`; reuse real step
   wording instead of inventing new phrases.

10. **Final audit happens before “done”.** After final spec authoring, run the v4 audit path owned by
    `create-spec` / `spec-phase-audit` / `spec-review`, then use the smart verdict. Do not hand-roll a
    separate ad-hoc audit checklist in this rule.

## Canonical commands and paths

Use the canonical repo paths, not the retired `.dev-pomogator/tools/...` or `extensions/...` layout:

```bash
npx tsx tools/specs-generator/scaffold-spec.ts -Name "my-feature"
npx tsx tools/specs-generator/validate-spec.ts -Path ".specs/my-feature"
npx tsx tools/specs-generator/spec-status.ts -Path ".specs/my-feature"
npx tsx tools/specs-generator/spec-status.ts -Path ".specs/my-feature" -ConfirmStop Discovery
npx tsx tools/specs-generator/audit-spec.ts -Path ".specs/my-feature"
npx tsx tools/specs-generator/spec-verdict.ts -Path ".specs/my-feature"
npx tsx tools/specs-generator/analyze-features.ts -Format text -FeatureSlug "my-feature"
```

When `SPEC_ACCESS_ENFORCE=true`, run engine commands as standalone commands. Do not wrap them in
pipes that also mention `.specs/`; redirect long output to a temp file outside `.specs/` if needed.

## What moved out of this rule

The previous version of this file was a 40k-character monolith. These details now belong elsewhere:

| Detail | New owner |
|--------|-----------|
| Full multi-step spec creation workflow | `.claude/skills/create-spec/SKILL.md` |
| Discovery story/risk forms | `.claude/skills/discovery-forms/SKILL.md` |
| Requirements matrix and design decisions | `.claude/skills/requirements-chk-matrix/SKILL.md` |
| Task board fields and task summary table | `.claude/skills/task-board-forms/SKILL.md` |
| Smart health verdict | `.claude/rules/spec-verdict/no-structural-valid.md` and `spec-verdict.ts` |
| MCP/spec-door workflow | `.claude/rules/gotchas/enforce-spec-door-bash-workflow.md` |
| BDD-only policy and strong test quality | `.claude/rules/bdd-only/bdd-only-tests.md`, `strong-tests`, `tests-create-update` |
| Literal Cucumber special-character gotchas | `.claude/rules/testing/cucumber-expression-parens.md` |
| Spec-generator principles map | `.claude/spec-generator-discipline.md` |

## Minimal progress display

When `create-spec` is actively authoring a spec, progress updates should be short and human-readable:

```text
Spec progress: <slug> — <current stage>
Files complete: <done>/<total>
Next: <next concrete action>
```

At stop points, show a short summary of decisions first, then ask for confirmation. The full generated
files are evidence; do not paste the whole spec into chat unless the user asks.

## Read/update/status shortcuts

- **Read/view:** prefer the spec MCP read tools or `spec-graph-query`; do not grep raw `.specs/` unless
  the door is unavailable and enforcement allows it.
- **Update:** use `create-spec` for workflow-level updates; use targeted spec-door changes for small
  fixes.
- **Status:** use `spec-status` / `spec-verdict`; never infer readiness from checked boxes alone.

## Related references

- `.claude/skills/create-spec/SKILL.md`
- `.claude/spec-generator-discipline.md`
- `.claude/rules/spec-authoring-via-subskills.md`
- `.claude/rules/spec-verdict/no-structural-valid.md`
- `.claude/rules/gotchas/enforce-spec-door-bash-workflow.md`
- `.claude/rules/bdd-only/bdd-only-tests.md`
- `.claude/rules/testing/cucumber-expression-parens.md`
- `.claude/rules/extension-test-quality.md`
