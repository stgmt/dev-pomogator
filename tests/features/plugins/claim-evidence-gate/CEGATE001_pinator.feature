@plugin @claim-evidence-gate
Feature: CEGATE001 Pinator judges only active current-session work
  Pinator protects explicit unfinished work without interfering with ordinary dialogue.

  @feature1 @eligibility
  Scenario: CEGATE001_66 Ordinary dialogue has no active work context
    Given the current session has no authoritative Pinator work source
    And the final message asserts "всё работает"
    When the gate evaluates the turn
    Then it approves the stop
    And it does not append a fire record to the log

  @feature1 @eligibility
  Scenario: CEGATE001_67 Inactive evaluation has zero side effects
    Given an inactive Stop in enforce mode and shadow mode
    When the real claim-evidence Stop hook evaluates both turns
    Then neither turn creates judge marker fire or plan-ledger state

  @feature1 @eligibility
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

  @feature2 @eligibility
  Scenario: CEGATE001_69 Open and closed Claude task lifecycle controls eligibility
    Given the current session has one open Claude task
    And the final message asserts "всё работает"
    When the gate evaluates the turn
    Then it blocks the stop
    When that Claude task is completed and the gate evaluates the next turn
    Then it approves the stop

  @feature2 @eligibility
  Scenario: CEGATE001_70 Failed and unrelated task records do not create work
    Given failed sidechain and unrelated task records plus one owned open task
    When the task collector reconstructs current-session ownership
    Then only the successfully created main-chain task activates Pinator

  @feature3 @eligibility
  Scenario: CEGATE001_71 Both approved plan result shapes activate the correlated plan
    Given the current session has a successful approved plan result
    And the final message asserts "всё работает"
    When the gate evaluates the turn
    Then it blocks the stop

  @feature4 @plan-ledger
  Scenario: CEGATE001_72 Plan completion is per commitment and ALL not ANY
    Given an approved plan ledger has two open commitments and two confirmed result ids
    When the first commitment alone is completed through the ledger
    Then the plan remains active with exactly one open commitment
    When the second commitment is completed through the ledger
    Then the plan ledger is inactive only after every commitment is complete

  @feature3 @feature4 @plan-ledger
  Scenario: CEGATE001_73 A newer plan supersedes the old plan
    Given the session approves two different plans in order
    When both approvals are collected into plan ledgers
    Then only the newer plan remains active and the old ledger records supersession

  @feature5 @eligibility
  Scenario: CEGATE001_74 Active spec requires session activity and mapped open work
    Given the current session successfully mutates a spec with open scoped work
    And the final message asserts "всё работает"
    When the gate evaluates the turn
    Then it blocks the stop

  @feature5 @eligibility
  Scenario: CEGATE001_75 Feature authoring requires an open mapped spec task
    Given the session mutates a spec feature with and without an open mapped task
    When the spec collector evaluates both feature mutations
    Then only the feature mutation with mapped open work activates the spec source

  @feature5 @eligibility
  Scenario: CEGATE001_76 All simultaneously active specs are preserved
    Given the current session actively works two specs with open mapped work
    When one spec closes and the spec collector reevaluates the same session
    Then both initially appear with provenance and the remaining spec is never hidden by first-spec selection

  @feature6 @eligibility
  Scenario: CEGATE001_77 Native goal set and achieved artifacts control eligibility
    Given the current session has a native active goal
    And the final message asserts "всё работает"
    When the gate evaluates the turn
    Then it blocks the stop
    When the native goal becomes met and the gate evaluates the next turn
    Then it approves the stop

  @feature6 @eligibility
  Scenario: CEGATE001_78 Goal clear and resume parsers require real artifacts
    Given goal clear and resume prose around native active and met goal artifacts
    When the goal collector evaluates the lifecycle evidence
    Then only structured native goal status changes eligibility and prose does not

  @feature6 @eligibility
  Scenario: CEGATE001_79 Native goal and Pinator remain independent Stop evaluators
    Given Pinator receives active native goal context without a Pinator completion verdict
    When the judge packet and ledger state are inspected
    Then Pinator does not persist native goal completion

  @feature7 @merge
  Scenario: CEGATE001_80 Task plan spec and goal merge into one packet
    Given all four authoritative source kinds are active with one shared commitment title
    When Pinator assembles the judge packet
    Then every source appears in deterministic order with provenance lifecycle revision and explicit conflicts

  @feature8 @evidence
  Scenario: CEGATE001_81 Stop final message overrides lagging transcript text
    Given transcript assistant text differs from Stop last_assistant_message
    When the active hook evaluates the Stop payload
    Then the judge request uses last_assistant_message as the final response

  @feature8 @evidence
  Scenario: CEGATE001_82 Attempted tools are not completion evidence
    Given the transcript has successful failed and result-less tool uses
    When result-confirmed evidence is collected
    Then only the exact successful tool use id is admissible

  @feature8 @privacy
  Scenario: CEGATE001_83 Judge packet is bounded and redacted
    Given an active context contains long source fields and secret-like tool output
    When Pinator builds the bounded judge packet
    Then the packet truncates source fields and excludes tool result content

  @feature9 @judge
  Scenario: CEGATE001_84 One actionable commitment blocks the ALL rollup
    Given a plan ledger has two commitments and one completion verdict
    When the structured completion proposal is reconciled
    Then one remaining actionable commitment keeps the plan active

  @feature4 @feature9 @judge
  Scenario: CEGATE001_85 Blocked awaiting and malformed verdicts never close plan commitments
    Given a plan ledger receives blocked awaiting and malformed commitment verdicts
    When non-completing and invalid verdicts are reconciled
    Then every rejected verdict leaves the exact persisted ledger active and unchanged

  @feature8 @async
  Scenario: CEGATE001_86 Async activity is evidence but not a work source
    Given only official background task and cron state is active
    When Pinator collects work context
    Then the session remains inactive

  @feature10 @credentials
  Scenario: CEGATE001_87 Missing judge token warns only for active context
    Given judge credentials are missing for one active and one inactive Stop
    When the real Stop hook evaluates both credential cases
    Then only the active Stop emits the credential demand

  @feature10 @state
  Scenario: CEGATE001_88 Anti-loop state is scoped to context revision
    Given two active contexts have different lifecycle revisions
    When their marker scopes are compared
    Then the context revisions are different and stale state cannot match

  @feature12 @performance
  Scenario: CEGATE001_89 Transcript events are parsed once
    Given all four source kinds share one parsed transcript event set
    When Pinator collects the merged context from that set
    Then every source is present without rereading the transcript file

  @feature12 @distribution
  Scenario: CEGATE001_90 Shipped bundle works without repository dependencies
    Given an isolated plugin fixture contains only the shipped claim gate bundle
    When the fixture evaluates an inactive Stop without node_modules
    Then the bundle approves without a missing import

  @feature12 @distribution
  Scenario: CEGATE001_91 Codex never inherits Claude lifecycle assumptions
    Given the Codex hook manifest is loaded
    When its Stop registrations are inspected
    Then no Codex Stop hook invokes the Claude claim evidence gate
