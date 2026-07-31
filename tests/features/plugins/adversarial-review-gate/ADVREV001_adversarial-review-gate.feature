@feature68
Feature: ADVREV001 Independent Adversarial Review gate (GitHub #153)
  Mandatory, fail-closed readiness precondition for ConfirmStop Finalization.
  The gate is engine-owned (.progress.json required flag + ADVERSARIAL_REVIEW.md
  artifact validation in specs-generator-core.mjs): a missing, stale,
  self-authored, or blocking review cannot pass, and the gate cannot be
  bypassed by deleting the artifact, reusing the author identity, changing the
  spec after review, or relabeling blocking findings.

  Scenario: ADVREV001_01 evidence-backed blocking findings keep readiness RED
    Given a valid fixture spec "adv-block" with the adversarial review gate required
    And the review metadata of "adv-block" is: reviewer "reviewer-run-1" author "author-run-0" round 1 verdict "BLOCKED" residual "yes" noFindings "no"
    And the review of "adv-block" has findings:
      | severity | id   | status | evidence            |
      | P0       | P0-1 | OPEN   | src/api.ts:42       |
      | P1       | P1-1 | OPEN   | src/db.ts:17        |
      | P2       | P2-1 | OPEN   | src/run.ts:8        |
      | P3       | P3-1 | OPEN   | src/misc.ts:3       |
    When ConfirmStop Finalization runs for "adv-block"
    Then the gate exit code should be 1
    And the gate stderr should mention "independent adversarial review"
    And the gate stderr should mention "P0-1"
    And the gate stderr should mention "P1-1"

  Scenario: ADVREV001_02 the authoring run identity cannot produce the accepted verdict
    Given a valid fixture spec "adv-self" with the adversarial review gate required
    And the review metadata of "adv-self" is: reviewer "author-run-0" author "author-run-0" round 1 verdict "PASS" residual "yes" noFindings "yes"
    When ConfirmStop Finalization runs for "adv-self"
    Then the gate exit code should be 1
    And the gate stderr should mention "self-authored"

  Scenario: ADVREV001_03 a missing artifact fails closed with an actionable reason
    Given a valid fixture spec "adv-missing" with the adversarial review gate required
    When ConfirmStop Finalization runs for "adv-missing"
    Then the gate exit code should be 1
    And the gate stderr should mention "ADVERSARIAL_REVIEW.md is missing"
    And the gate stderr should mention "spec-phase-review"

  Scenario: ADVREV001_04 a changed spec invalidates a stale verdict and revokes the STOP
    Given a valid fixture spec "adv-stale" with the adversarial review gate required
    And the review metadata of "adv-stale" is: reviewer "reviewer-run-1" author "author-run-0" round 1 verdict "PASS" residual "yes" noFindings "yes"
    And "adv-stale" previously confirmed the Finalization STOP
    When the spec "adv-stale" changes after the review
    And plain spec-status runs for "adv-stale"
    Then the progress of "adv-stale" should show Finalization stopConfirmed false
    When ConfirmStop Finalization runs for "adv-stale"
    Then the gate exit code should be 1
    And the gate stderr should mention "stale"

  Scenario: ADVREV001_05 a P2 finding passes with an explicit user waiver and rationale
    Given a valid fixture spec "adv-waiver" with the adversarial review gate required
    And the review metadata of "adv-waiver" is: reviewer "reviewer-run-1" author "author-run-0" round 2 verdict "PASS_WITH_WAIVERS" residual "yes" noFindings "no"
    And the review of "adv-waiver" has findings:
      | severity | id   | status | evidence      | resolutionEvidence | waiverRationale                 | waiverApprover |
      | P2       | P2-1 | WAIVED | src/run.ts:8  |                    | Owner accepted the perf tradeoff | user-owner     |
    When ConfirmStop Finalization runs for "adv-waiver"
    Then the gate exit code should be 0

  Scenario: ADVREV001_06 a fresh independent rerun resolves findings and unblocks readiness
    Given a valid fixture spec "adv-resolve" with the adversarial review gate required
    And the review metadata of "adv-resolve" is: reviewer "reviewer-run-1" author "author-run-0" round 2 verdict "PASS" residual "yes" noFindings "no"
    And the review of "adv-resolve" has findings:
      | severity | id   | status   | evidence      | resolutionEvidence                  |
      | P1       | P1-1 | RESOLVED | src/api.ts:42 | src/api.ts:55 [VERIFIED] rerun pass |
    When ConfirmStop Finalization runs for "adv-resolve"
    Then the gate exit code should be 0

  Scenario: ADVREV001_07 the bounded loop escalates after 3 rounds instead of downgrading
    Given a valid fixture spec "adv-escalate" with the adversarial review gate required
    And the review metadata of "adv-escalate" is: reviewer "reviewer-run-1" author "author-run-0" round 4 verdict "ESCALATED" residual "yes" noFindings "no"
    And the review of "adv-escalate" has findings:
      | severity | id   | status | evidence      |
      | P0       | P0-1 | OPEN   | src/api.ts:42 |
    When ConfirmStop Finalization runs for "adv-escalate"
    Then the gate exit code should be 1
    And the gate stderr should mention "escalate"

  Scenario: ADVREV001_08 deleting the artifact cannot bypass an engine-owned gate
    Given a valid fixture spec "adv-delete" with the adversarial review gate required
    And the review metadata of "adv-delete" is: reviewer "reviewer-run-1" author "author-run-0" round 1 verdict "PASS" residual "yes" noFindings "yes"
    And the review artifact of "adv-delete" is deleted
    When ConfirmStop Finalization runs for "adv-delete"
    Then the gate exit code should be 1
    And the gate stderr should mention "ADVERSARIAL_REVIEW.md is missing"

  Scenario: ADVREV001_09 a clean spec passes without fabricated findings and unblocks the STOP
    Given a valid fixture spec "adv-clean" with the adversarial review gate required
    And the review metadata of "adv-clean" is: reviewer "reviewer-run-1" author "author-run-0" round 1 verdict "PASS" residual "yes" noFindings "yes"
    When ConfirmStop Finalization runs for "adv-clean"
    Then the gate exit code should be 0
    And the gate stderr should not mention "independent adversarial review"
    Then the progress of "adv-clean" should show Finalization stopConfirmed true

  Scenario: ADVREV001_10 a repository claim without file/line evidence fails closed
    Given a valid fixture spec "adv-evidence" with the adversarial review gate required
    And the review metadata of "adv-evidence" is: reviewer "reviewer-run-1" author "author-run-0" round 1 verdict "BLOCKED" residual "yes" noFindings "no"
    And the review of "adv-evidence" has findings:
      | severity | id   | status | evidence                            |
      | P0       | P0-1 | OPEN   | the code seems to drop the envelope |
    When ConfirmStop Finalization runs for "adv-evidence"
    Then the gate exit code should be 1
    And the gate stderr should mention "file/line"

  Scenario: ADVREV001_11 relabeling findings away is detected via id gaps
    Given a valid fixture spec "adv-relabel" with the adversarial review gate required
    And the review metadata of "adv-relabel" is: reviewer "reviewer-run-1" author "author-run-0" round 2 verdict "PASS" residual "yes" noFindings "no"
    And the review of "adv-relabel" has findings:
      | severity | id   | status | evidence      |
      | P0       | P0-1 | OPEN   | src/api.ts:42 |
      | P0       | P0-3 | OPEN   | src/api.ts:99 |
    When ConfirmStop Finalization runs for "adv-relabel"
    Then the gate exit code should be 1
    And the gate stderr should mention "P0-2"

  Scenario: ADVREV001_12 findings out of code-review order are rejected
    Given a valid fixture spec "adv-order" with the adversarial review gate required
    And the review metadata of "adv-order" is: reviewer "reviewer-run-1" author "author-run-0" round 1 verdict "BLOCKED" residual "yes" noFindings "no"
    And the review of "adv-order" has findings:
      | severity | id   | status | evidence      |
      | P2       | P2-1 | OPEN   | src/run.ts:8  |
      | P0       | P0-1 | OPEN   | src/api.ts:42 |
    When ConfirmStop Finalization runs for "adv-order"
    Then the gate exit code should be 1
    And the gate stderr should mention "code-review order"

  Scenario: ADVREV001_13 P0/P1 findings can never be waived
    Given a valid fixture spec "adv-nowaive" with the adversarial review gate required
    And the review metadata of "adv-nowaive" is: reviewer "reviewer-run-1" author "author-run-0" round 1 verdict "BLOCKED" residual "yes" noFindings "no"
    And the review of "adv-nowaive" has findings:
      | severity | id   | status | evidence      | waiverRationale      | waiverApprover |
      | P1       | P1-1 | WAIVED | src/api.ts:42 | we will fix it later | someone        |
    When ConfirmStop Finalization runs for "adv-nowaive"
    Then the gate exit code should be 1
    And the gate stderr should mention "cannot be waived"

  Scenario: ADVREV001_15 a review without residual risks is rejected even when clean
    Given a valid fixture spec "adv-noresidual" with the adversarial review gate required
    And the review metadata of "adv-noresidual" is: reviewer "reviewer-run-1" author "author-run-0" round 1 verdict "PASS" residual "no" noFindings "yes"
    When ConfirmStop Finalization runs for "adv-noresidual"
    Then the gate exit code should be 1
    And the gate stderr should mention "Residual Risks"

  Scenario: ADVREV001_14 a P2 waiver without rationale is rejected
    Given a valid fixture spec "adv-emptywaiver" with the adversarial review gate required
    And the review metadata of "adv-emptywaiver" is: reviewer "reviewer-run-1" author "author-run-0" round 1 verdict "BLOCKED" residual "yes" noFindings "no"
    And the review of "adv-emptywaiver" has findings:
      | severity | id   | status | evidence     | waiverRationale | waiverApprover |
      | P2       | P2-1 | WAIVED | src/run.ts:8 |                 |                |
    When ConfirmStop Finalization runs for "adv-emptywaiver"
    Then the gate exit code should be 1
    And the gate stderr should mention "waiver"
