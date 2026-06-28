Feature: HSCMD001 Honest Spec Status — deterministic scripts
  The spec-status skill's deterministic pre-pass (autodetect, AC claims, recency, env blockers,
  BDD step grading, context bundle) drives an honest status verdict
  So a spec is never reported done on claimed-only evidence or a stale/blocked test run

  # Drives the REAL .claude/skills/spec-status/scripts/*.ts pure functions in-process against the real
  # tests/fixtures/spec-status/ fixtures via tests/step_definitions/feature_hscmd_spec_status.ts.
  # Each scenario is a single self-contained Then (setup + call + tight assertions incl. conservation
  # invariants). The LLM sub-agent step is the manual-verify boundary and is not migrated.

  @feature1
  Scenario: HSCMD001_01 detectActiveSpec picks the newest fresh spec
    Then detectActiveSpec picks the newest .progress.json within 7 days and excludes stale dirs

  @feature1
  Scenario: HSCMD001_01b detectActiveSpec breaks a tie by the plan-file match
    Then detectActiveSpec breaks a 60s tie in favour of the plan-file match

  @feature1
  Scenario: HSCMD001_01c detectActiveSpec returns null when nothing is fresh
    Then detectActiveSpec returns null when nothing is fresh or the dir is missing

  @feature2
  Scenario: HSCMD001_02 claimed-only AC are flagged when there is no evidence
    Then classifyAcClaims marks every AC of an evidence-less spec claimed_only, one row per AC

  @feature2
  Scenario: HSCMD001_02b a test reference flips an AC off claimed_only
    Then classifyAcClaims flips an AC off claimed_only when a test references it

  @feature3
  Scenario: HSCMD001_03 a running suite with a dead heartbeat is stale, not failed
    Then classifyTestStatus calls a running suite with a dead heartbeat stale, not failed

  @feature3
  Scenario: HSCMD001_03b fresh and completed YAML are fresh, a missing YAML is not_run
    Then classifyTestStatus calls fresh and completed YAML fresh, and a missing YAML not_run

  @feature3
  Scenario: HSCMD001_03c environmental blockers are counted, separate from failures
    Then the docker blocker and collectBlockers conserve: unreachable docker plus dead heartbeat is two, healthy is zero

  @feature4
  Scenario: HSCMD001_04 BDD step bodies are graded weak / strong / fake-positive
    Then classifyTestFile grades the weak, strong and fake-positive BDD fixtures and conserves buckets

  @feature5
  Scenario: HSCMD001_05 credential-bearing lines are redacted from the bundle
    Then filterCredentials redacts exactly the secret-bearing lines and keeps the prose

  @feature5
  Scenario: HSCMD001_05b the context bundle stays bounded and trims test paths
    Then the context bundle stays within 4KB with trimmed unique existing test paths

  @feature5
  Scenario: HSCMD001_05c precheck surfaces an active claimed-only bundle for a slug
    Then precheck with a spec slug and specs-root surfaces an active claimed_only bundle
