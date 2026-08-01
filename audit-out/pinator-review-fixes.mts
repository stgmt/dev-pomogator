/**
 * Fix review findings: sync pinator.feature to executable steps + FR/AC tags;
 * AC-49.4; FR-49 turtle; pinator README honesty.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildToolRegistry } from '../tools/spec-mcp-server/tools.ts';
import { buildGraph } from '../tools/spec-graph/builder.ts';

const root = process.cwd();

const SYNCED_FEATURE = `@pinator @claim-evidence-gate
Feature: Pinator judges only active current-session work
  Contract mirror of tests/features/plugins/claim-evidence-gate/CEGATE001_pinator.feature — steps MUST stay identical; FR/AC tags live here for traceability.

  @feature1 @eligibility @FR-1 @AC-1
  Scenario: CEGATE001_66 Ordinary dialogue has no active work context
    Given the current session has no authoritative Pinator work source
    And the final message asserts "всё работает"
    When the gate evaluates the turn
    Then it approves the stop
    And it does not append a fire record to the log

  @feature1 @eligibility @FR-1 @FR-10 @AC-1 @AC-10
  Scenario: CEGATE001_67 Inactive evaluation has zero side effects
    Given an inactive Stop in enforce mode and shadow mode
    When the real claim-evidence Stop hook evaluates both turns
    Then neither turn creates judge marker fire or plan-ledger state

  @feature1 @eligibility @FR-1 @FR-11 @AC-1 @AC-11
  Scenario Outline: CEGATE001_68 Completion prose does not arm Pinator
    Given the current session has no authoritative Pinator work source
    And the final message asserts <claim>
    When the gate evaluates the turn
    Then it approves the stop
    And it does not append a fire record to the log

    Examples:
      | claim                      |
      | "всё работает"            |
      | "не существует"           |
      | "[VERIFIED via npm test]" |
      | "PASS FAIL"               |

  @feature2 @eligibility @FR-2 @AC-2
  Scenario: CEGATE001_69 Open and closed Claude task lifecycle controls eligibility
    Given the current session has one open Claude task
    And the final message asserts "всё работает"
    When the gate evaluates the turn
    Then it blocks the stop
    When that Claude task is completed and the gate evaluates the next turn
    Then it approves the stop

  @feature2 @eligibility @FR-2 @AC-2
  Scenario: CEGATE001_70 Failed and unrelated task records do not create work
    Given failed sidechain and unrelated task records plus one owned open task
    When the task collector reconstructs current-session ownership
    Then only the successfully created main-chain task activates Pinator

  @feature3 @eligibility @FR-3 @AC-3
  Scenario: CEGATE001_71 Both approved plan result shapes activate the correlated plan
    Given the current session has a successful approved plan result
    And the final message asserts "всё работает"
    When the gate evaluates the turn
    Then it blocks the stop

  @feature4 @plan-ledger @FR-4 @AC-4
  Scenario: CEGATE001_72 Plan completion is per commitment and ALL not ANY
    Given an approved plan ledger has two open commitments and two confirmed result ids
    When the first commitment alone is completed through the ledger
    Then the plan remains active with exactly one open commitment
    When the second commitment is completed through the ledger
    Then the plan ledger is inactive only after every commitment is complete

  @feature3 @feature4 @plan-ledger @FR-3 @FR-4 @AC-3 @AC-4
  Scenario: CEGATE001_73 A newer plan supersedes the old plan
    Given the session approves two different plans in order
    When both approvals are collected into plan ledgers
    Then only the newer plan remains active and the old ledger records supersession

  @feature5 @eligibility @FR-5 @AC-5
  Scenario: CEGATE001_74 Active spec requires session activity and mapped open work
    Given the current session successfully mutates a spec with open scoped work
    And the final message asserts "всё работает"
    When the gate evaluates the turn
    Then it blocks the stop

  @feature5 @eligibility @FR-5 @AC-5
  Scenario: CEGATE001_75 Feature authoring requires an open mapped spec task
    Given the session mutates a spec feature with and without an open mapped task
    When the spec collector evaluates both feature mutations
    Then only the feature mutation with mapped open work activates the spec source

  @feature5 @eligibility @FR-5 @AC-5
  Scenario: CEGATE001_76 All simultaneously active specs are preserved
    Given the current session actively works two specs with open mapped work
    When one spec closes and the spec collector reevaluates the same session
    Then both initially appear with provenance and the remaining spec is never hidden by first-spec selection

  @feature6 @eligibility @FR-6 @AC-6
  Scenario: CEGATE001_77 Native goal set and achieved artifacts control eligibility
    Given the current session has a native active goal
    And the final message asserts "всё работает"
    When the gate evaluates the turn
    Then it blocks the stop
    When the native goal becomes met and the gate evaluates the next turn
    Then it approves the stop

  @feature6 @eligibility @FR-6 @AC-6
  Scenario: CEGATE001_78 Goal clear and resume parsers require real artifacts
    Given goal clear and resume prose around native active and met goal artifacts
    When the goal collector evaluates the lifecycle evidence
    Then only structured native goal status changes eligibility and prose does not

  @feature6 @eligibility @FR-6 @AC-6
  Scenario: CEGATE001_79 Native goal and Pinator remain independent Stop evaluators
    Given Pinator receives active native goal context without a Pinator completion verdict
    When the judge packet and ledger state are inspected
    Then Pinator does not persist native goal completion

  @feature7 @merge @FR-7 @AC-7
  Scenario: CEGATE001_80 Task plan spec and goal merge into one packet
    Given all four authoritative source kinds are active with one shared commitment title
    When Pinator assembles the judge packet
    Then every source appears in deterministic order with provenance lifecycle revision and explicit conflicts

  @feature8 @evidence @FR-8 @AC-8
  Scenario: CEGATE001_81 Stop final message overrides lagging transcript text
    Given transcript assistant text differs from Stop last_assistant_message
    When the active hook evaluates the Stop payload
    Then the judge request uses last_assistant_message as the final response

  @feature8 @evidence @FR-8 @AC-8
  Scenario: CEGATE001_82 Attempted tools are not completion evidence
    Given the transcript has successful failed and result-less tool uses
    When result-confirmed evidence is collected
    Then only the exact successful tool use id is admissible

  @feature8 @privacy @FR-8 @AC-8
  Scenario: CEGATE001_83 Judge packet is bounded and redacted
    Given an active context contains long source fields and secret-like tool output
    When Pinator builds the bounded judge packet
    Then the packet truncates source fields and excludes tool result content

  @feature9 @judge @FR-9 @AC-9
  Scenario: CEGATE001_84 One actionable commitment blocks the ALL rollup
    Given a plan ledger has two commitments and one completion verdict
    When the structured completion proposal is reconciled
    Then one remaining actionable commitment keeps the plan active

  @feature4 @feature9 @judge @FR-4 @FR-9 @AC-4 @AC-9
  Scenario: CEGATE001_85 Blocked awaiting and malformed verdicts never close plan commitments
    Given a plan ledger receives blocked awaiting and malformed commitment verdicts
    When non-completing and invalid verdicts are reconciled
    Then every rejected verdict leaves the exact persisted ledger active and unchanged

  @feature8 @async @FR-8 @AC-8
  Scenario: CEGATE001_86 Async activity is evidence but not a work source
    Given only official background task and cron state is active
    When Pinator collects work context
    Then the session remains inactive

  @feature10 @credentials @FR-10 @AC-10
  Scenario: CEGATE001_87 Missing judge token warns only for active context
    Given judge credentials are missing for one active and one inactive Stop
    When the real Stop hook evaluates both credential cases
    Then only the active Stop emits the credential demand

  @feature10 @state @FR-10 @AC-10
  Scenario: CEGATE001_88 Anti-loop state is scoped to context revision
    Given two active contexts have different lifecycle revisions
    When their marker scopes are compared
    Then the context revisions are different and stale state cannot match

  @feature12 @performance @FR-12 @AC-12
  Scenario: CEGATE001_89 Transcript events are parsed once
    Given all four source kinds share one parsed transcript event set
    When Pinator collects the merged context from that set
    Then every source is present without rereading the transcript file

  @feature12 @distribution @FR-12 @AC-12
  Scenario: CEGATE001_90 Shipped bundle works without repository dependencies
    Given an isolated plugin fixture contains only the shipped claim gate bundle
    When the fixture evaluates an inactive Stop without node_modules
    Then the bundle approves without a missing import

  @feature12 @distribution @FR-12 @AC-12
  Scenario: CEGATE001_91 Codex never inherits Claude lifecycle assumptions
    Given the Codex hook manifest is loaded
    When its Stop registrations are inspected
    Then no Codex Stop hook invokes the Claude claim evidence gate
`;

const README = `# Pinator (canonical)

Stop-time drive-loop: while the session has authoritative unfinished work, the agent must not lazy-stop. Pinator evaluates Stop (eligibility + judge + evidence) and contracts next-step / async carve-outs.

**Canonical name:** Pinator = this spec.
**Runtime path (this wave):** \`tools/claim-evidence-gate/\` (not renamed yet).
**Not Pinator:** \`prompt-suggest\` / former npm script \`build:pinator\` (use \`build:prompt-suggest\`).

**Honesty:** \`spec-verdict\` OVERALL READY ≠ product COMPLETE. M0/M6/M7 and inherited redesign TASKS remain open debt.

## Module map

| Module | Content | Status |
|--------|---------|--------|
| M0 Intent | goal once / drive until genuine decision (#63) | open backlog |
| M1 Eligibility | task/plan/spec/\`/goal\` | contract migrated (CEGATE001); redesign TASKS below still open where unfinished |
| M2 Judge+evidence | classifier, Meridian, carry-over, normative (#149/#161/#193) | contract migrated + issue links; follow-ups open |
| M3 Next-step contract | packet \`next*\`; census owned by spec-generator-v4 FR-49 | migrated boundary |
| M4 Async | bg in-flight via [bg-task-guard](../bg-task-guard/README.md) | dependency link |
| M5 User suggest | optional [prompt-suggest](../prompt-suggest/README.md) | link only |
| M6 Polarity flip | #74 referent carve-out | open backlog |
| M7 Orchestration | #212/#215 Dynamic Workflow | open / OUT_OF_SCOPE impl this wave |

## Where code lives

\`tools/claim-evidence-gate/\` (\`claim_evidence_gate_stop.ts\`, \`meridian-judge.ts\`, …); bundle \`claim_evidence_gate_stop.bundle.mjs\`. Hooks: Claude Stop route. Executable BDD: \`tests/features/plugins/claim-evidence-gate/CEGATE001_pinator.feature\` (steps mirrored in \`pinator.feature\`).

## Related

- Supersedes archived \`claim-evidence-gate\`.
- Census/router infra: [spec-generator-v4 FR-49](../spec-generator-v4/FR.md) (generic only; Pinator policy lives here).
- Inbound-ref inventory: \`audit-out/pinator-inbound-refs.json\`.
`;

function patchAc(ac: string): string {
  return ac.replace(
    '**Требование:** [FR-49e](FR.md#fr-49)',
    '**Требование:** [FR-49b](FR.md#fr-49), [FR-49a](FR.md#fr-49)',
  );
}

function patchFr(fr: string): string {
  return fr.replace(
    /\*\*Self-exemption \(turtle\):\*\*[^\n]+/,
    '**Self-exemption (turtle):** historical while FR-49b lived as an in-v4 Stop block; Pinator ([.specs/pinator/](../pinator/FR.md)) now owns self-markers / judge exemptions. FR-49 no longer defines that block.',
  );
}

function patchTasks(t: string): string {
  if (t.includes('Phase 1–N below are inherited redesign')) return t;
  return t.replace(
    'Inherited redesign tasks below remain open where still valid. Wave section records migrate DoD + GH debt (M0/M6/M7 open → overall NOT COMPLETE).',
    'Wave section = migrate DoD + GH debt (M0/M6/M7 open → product NOT COMPLETE). Phase 1–N below are inherited eligibility-first redesign tasks — still open where unfinished; do not read “contract migrated” as those checkboxes done.',
  );
}

let cached: ReturnType<typeof buildGraph> | undefined;
const tools = buildToolRegistry(
  () => (cached ??= buildGraph({ repoRoot: root, skipNdjson: true })),
  { refreshGraph: () => { cached = undefined; } },
);
const txn = tools.find((t) => t.name === 'apply_spec_transaction')!;

const v4Ac = fs.readFileSync(path.join(root, '.specs/spec-generator-v4/ACCEPTANCE_CRITERIA.md'), 'utf8');
const v4Fr = fs.readFileSync(path.join(root, '.specs/spec-generator-v4/FR.md'), 'utf8');
const pinTasks = fs.readFileSync(path.join(root, '.specs/pinator/TASKS.md'), 'utf8');

const result = await txn.handler({
  edits: [
    { spec: 'pinator', doc: 'pinator.feature', content: SYNCED_FEATURE },
    { spec: 'pinator', doc: 'README.md', content: README },
    { spec: 'pinator', doc: 'TASKS.md', content: patchTasks(pinTasks) },
    { spec: 'spec-generator-v4', doc: 'ACCEPTANCE_CRITERIA.md', content: patchAc(v4Ac) },
    { spec: 'spec-generator-v4', doc: 'FR.md', content: patchFr(v4Fr) },
  ],
  reason: 'pinator review fixes: sync feature mirror; AC-49.4; turtle; honesty README/TASKS',
});
const text = result.content[0].text;
fs.writeFileSync(path.join(root, 'audit-out/pinator-review-fixes.json'), text);
const j = JSON.parse(text);
console.log(JSON.stringify({ ok: j.ok, findings: (j.findings || []).slice(0, 15), error: j.error }, null, 2));
if (!j.ok) process.exit(1);
