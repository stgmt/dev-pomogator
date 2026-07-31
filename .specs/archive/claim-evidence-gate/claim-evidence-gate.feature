@claim-evidence-gate @pinator
Feature: Pinator judges only active current-session work
  Pinator protects explicit unfinished work without interfering with ordinary dialogue.

  @feature1 @FR-1 @AC-1
  Scenario: CEGATE001_66 Ordinary dialogue has no active work context
    Given the current session has no authoritative Pinator work source
    When the real claim-evidence Stop hook evaluates the turn
    Then it approves silently without fire state

  @feature1 @FR-1 @FR-10 @AC-1 @AC-10
  Scenario: CEGATE001_67 Inactive evaluation has zero side effects
    Given an inactive Stop in enforce mode and shadow mode
    When the real claim-evidence Stop hook evaluates both turns
    Then neither turn creates judge marker fire or plan-ledger state

  @feature1 @FR-1 @FR-11 @AC-1 @AC-11
  Scenario: CEGATE001_68 Completion prose does not arm Pinator
    Given ordinary dialogue contains works-done, not-found, verified, and PASS or FAIL claims without an active source
    When the real claim-evidence Stop hook evaluates each turn
    Then every turn approves without entering active-work enforcement

  @feature2 @FR-2 @AC-2
  Scenario: CEGATE001_69 Open and closed Claude task lifecycle controls eligibility
    Given the current session creates an open Claude task
    When the task is completed
    Then Pinator is inactive on the next Stop

  @feature2 @FR-2 @AC-2
  Scenario: CEGATE001_70 Failed and unrelated task records do not create work
    Given failed sidechain and unrelated task records plus one owned open task
    When the task collector reconstructs current-session ownership
    Then only the successfully created main-chain task activates Pinator

  @feature3 @FR-3 @AC-3
  Scenario: CEGATE001_71 Both approved plan result shapes activate the correlated plan
    Given a successful correlated ExitPlanMode approval
    When the real claim-evidence Stop hook evaluates the turn
    Then the approved plan activates Pinator

  @feature4 @FR-4 @AC-4
  Scenario: CEGATE001_72 Plan completion is per commitment and ALL not ANY
    Given an approved plan ledger has two open commitments and two confirmed result ids
    When each commitment is completed through the ledger
    Then the plan is inactive only after every commitment is complete

  @feature3 @feature4 @FR-3 @FR-4 @AC-3 @AC-4
  Scenario: CEGATE001_73 A newer plan supersedes the old plan
    Given the session approves two different plans in order
    When both approvals are collected into plan ledgers
    Then only the newer plan remains active and the old ledger records supersession

  @feature5 @FR-5 @AC-5
  Scenario: CEGATE001_74 Active spec requires session activity and mapped open work
    Given the current session successfully mutates a spec with open scoped work
    When the real claim-evidence Stop hook evaluates the turn
    Then the active spec activates Pinator

  @feature5 @FR-5 @AC-5
  Scenario: CEGATE001_75 Feature authoring requires an open mapped spec task
    Given the session mutates a spec feature with and without an open mapped task
    When the spec collector evaluates both feature mutations
    Then only the feature mutation with mapped open work activates the spec source

  @feature5 @FR-5 @AC-5
  Scenario: CEGATE001_76 All simultaneously active specs are preserved
    Given the current session actively works two specs with open mapped work
    When one spec closes and the spec collector reevaluates the same session
    Then both initially appear with provenance and the remaining spec is never hidden by first-spec selection

  @feature6 @FR-6 @AC-6
  Scenario: CEGATE001_77 Native goal set and achieved artifacts control eligibility
    Given a native goal_status met false event
    When a matching met true event occurs
    Then the goal source deactivates

  @feature6 @FR-6 @AC-6
  Scenario: CEGATE001_78 Goal clear and resume parsers require real artifacts
    Given goal clear and resume prose around native active and met goal artifacts
    When the goal collector evaluates the lifecycle evidence
    Then only structured native goal status changes eligibility and prose does not

  @feature6 @FR-6 @AC-6
  Scenario: CEGATE001_79 Native goal and Pinator remain independent Stop evaluators
    Given Pinator receives active native goal context without a Pinator completion verdict
    When the judge packet and ledger state are inspected
    Then Pinator does not persist native goal completion

  @feature7 @FR-7 @AC-7
  Scenario: CEGATE001_80 Task plan spec and goal merge into one packet
    Given all four authoritative source kinds are active with one shared commitment title
    When Pinator assembles the judge packet
    Then every source appears in deterministic order with provenance lifecycle revision and explicit conflicts

  @feature8 @FR-8 @AC-8
  Scenario: CEGATE001_81 Stop final message overrides lagging transcript text
    Given transcript assistant text differs from Stop last_assistant_message
    When the active hook evaluates the Stop payload
    Then the judge request uses last_assistant_message as the final response

  @feature8 @FR-8 @AC-8
  Scenario: CEGATE001_82 Attempted tools are not completion evidence
    Given the transcript has successful failed and result-less tool uses
    When result-confirmed evidence is collected
    Then only the exact successful tool use id is admissible

  @feature8 @FR-8 @AC-8
  Scenario: CEGATE001_83 Judge packet is bounded and redacted
    Given an active context contains long source fields and secret-like tool output
    When Pinator builds the bounded judge packet
    Then the packet truncates source fields and excludes tool result content

  @feature9 @FR-9 @AC-9
  Scenario: CEGATE001_84 One actionable commitment blocks the ALL rollup
    Given a plan ledger has two commitments and one completion verdict
    When the structured completion proposal is reconciled
    Then one remaining actionable commitment keeps the plan active

  @feature4 @feature9 @FR-4 @FR-9 @AC-4 @AC-9
  Scenario: CEGATE001_85 Blocked awaiting and malformed verdicts never close plan commitments
    Given a plan ledger receives blocked awaiting and malformed commitment verdicts
    When non-completing and invalid verdicts are reconciled
    Then every rejected verdict leaves the exact persisted ledger active and unchanged

  @feature8 @FR-8 @AC-8
  Scenario: CEGATE001_86 Async activity is evidence but not a work source
    Given only official background task and cron state is active
    When Pinator collects work context
    Then the session remains inactive

  @feature10 @FR-10 @AC-10
  Scenario: CEGATE001_87 Missing judge token warns only for active context
    Given judge credentials are missing for one active and one inactive Stop
    When the real Stop hook evaluates both credential cases
    Then only the active Stop emits the credential demand

  @feature10 @FR-10 @AC-10
  Scenario: CEGATE001_88 Anti-loop state is scoped to context revision
    Given two active contexts have different lifecycle revisions
    When their marker scopes are compared
    Then the context revisions are different and stale state cannot match

  @feature12 @FR-12 @AC-12
  Scenario: CEGATE001_89 Transcript events are parsed once
    Given all four source kinds share one parsed transcript event set
    When Pinator collects the merged context from that set
    Then every source is present without rereading the transcript file

  @feature12 @FR-12 @AC-12
  Scenario: CEGATE001_90 Shipped bundle works without repository dependencies
    Given an isolated plugin fixture contains only the shipped claim gate bundle
    When the fixture evaluates an inactive Stop without node_modules
    Then the bundle approves without a missing import

  @feature12 @FR-12 @AC-12
  Scenario: CEGATE001_91 Codex never inherits Claude lifecycle assumptions
    Given the Codex hook manifest is loaded
    When its Stop registrations are inspected
    Then no Codex Stop hook invokes the Claude claim evidence gate
