/**
 * Step definitions for onboard-repo-phase0.feature — Red phase.
 *
 * All steps currently throw `PENDING: <step>` — Phase 0 BDD Red state.
 * Green phase: replace PENDING throws with actual assertions against Phase 0 implementation
 * (phase0.ts orchestrator once implemented in Phase 1+).
 *
 * Mapping: each Scenario (ONBOARD001..ONBOARD034) in `.feature` invokes a subset of
 * these steps. Step definitions matched by literal prefix (Given/When/Then/And) +
 * step text. Expected to be wired into vitest BDD-style runner или manual
 * compose via helpers in each `.test.ts` file.
 */

type StepFn = (...args: unknown[]) => void | Promise<void>;


function pending(stepId: string): StepFn {
  return async () => {
    throw new Error(`PENDING: ${stepId} — Phase 0 not implemented yet (Red phase)`);
  };
}


export const stepDefinitions: Record<string, StepFn> = {
  // Background
  'dev-pomogator is installed': pending('BG-1 dev-pomogator installed'),
  'onboard-repo extension is enabled': pending('BG-2 onboard-repo enabled'),
  'specs-workflow extension is enabled': pending('BG-3 specs-workflow enabled'),
  'the target repo is a clean copy of a fake-repo fixture': pending('BG-4 clean tmpdir'),
  'managed-registry snapshot is captured': pending('BG-5 snapshot registry'),

  // @feature1
  'the target repo does not contain `.specs/.onboarding.json`': pending('ONBOARD002 G1'),
  'fake-python-api fixture is seeded in tmpdir': pending('ONBOARD002 G2'),
  'I run `/create-spec notification-throttle` in the target repo': pending('ONBOARD002 W'),
  'Phase 0 starts automatically before Phase 1 Discovery': pending('ONBOARD002 T1'),
  '`.specs/.onboarding.json` is created': pending('ONBOARD002 T2'),
  '`.specs/.onboarding.md` is created': pending('ONBOARD002 T3'),
  '`.claude/rules/onboarding-context.md` is created with managed marker': pending('ONBOARD002 T4'),
  '`.claude/settings.local.json` contains an onboarding PreToolUse hook block': pending('ONBOARD002 T5'),
  'state machine transitions to `Discovery` after `-ConfirmStop Onboarding`': pending('ONBOARD002 T6'),

  // @feature4 cache
  '`.specs/.onboarding.json` exists with `last_indexed_sha` matching git HEAD': pending('ONBOARD003 G'),
  'I run `/create-spec another-feature` in the target repo': pending('ONBOARD003 W'),
  'Phase 0 is skipped': pending('ONBOARD003 T1'),
  'a 3-line cache hit summary is shown mentioning archetype and baseline test count': pending('ONBOARD003 T2'),
  'the command proceeds directly to Phase 1 Discovery within 3 seconds': pending('ONBOARD003 T3'),

  // @feature4 SHA drift
  '`.specs/.onboarding.json` exists with stale `last_indexed_sha`': pending('ONBOARD004 G1'),
  'the git log shows at least 5 commits since `last_indexed_sha`': pending('ONBOARD004 G2'),
  'I run `/create-spec next-feature` in the target repo': pending('ONBOARD004 W'),
  'a prompt appears asking "Refresh or continue with cache?"': pending('ONBOARD004 T1'),
  'the prompt mentions the drift count in commits': pending('ONBOARD004 T2'),

  // @feature4 manual refresh
  '`.specs/.onboarding.json` exists and is valid': pending('ONBOARD005 G'),
  'I run `/create-spec feature-x --refresh-onboarding` in the target repo': pending('ONBOARD005 W'),
  'Phase 0 re-runs regardless of cache state': pending('ONBOARD005 T1'),
  'the previous `.specs/.onboarding.json` is archived in `.specs/.onboarding-history/`': pending('ONBOARD005 T2'),
  'the archive directory uses ISO-8601 timestamp format': pending('ONBOARD005 T3'),
  '`.specs/.onboarding-history/` retains at most 5 snapshots': pending('ONBOARD005 T4'),

  // @feature13
  'the target repo does not have `.dev-pomogator/` directory': pending('ONBOARD006 G'),
  'I run `/create-spec anything` in the target repo': pending('ONBOARD006 W'),
  'Phase 0 does not start': pending('ONBOARD006 T1'),
  'an actionable error message is shown pointing to `npx github:stgmt/dev-pomogator --claude`': pending('ONBOARD006 T2'),

  // @feature5
  'fake-python-api fixture has pytest installed': pending('ONBOARD007 G1'),
  'run-tests-skill-mock returns `{"passed": 145, "failed": 2, "duration_s": 47}`': pending('ONBOARD007 G2'),
  'Phase 0 Step 4 executes': pending('ONBOARD007 W'),
  '`/run-tests` skill is invoked (not raw `pytest` command)': pending('ONBOARD007 T1'),
  '`.onboarding.json.baseline_tests.passed == 145`': pending('ONBOARD007 T2'),
  '`.onboarding.json.baseline_tests.failed == 2`': pending('ONBOARD007 T3'),
  '`.onboarding.json.baseline_tests.via_skill == "run-tests"`': pending('ONBOARD007 T4'),

  // All remaining steps — summarize as generic pending
  // Final "generic" step for any other Given/When/Then not matched
  '__fallback__': pending('STEP NOT YET DEFINED — wire in Green phase'),
};


export function resolveStep(stepText: string): StepFn {
  // strict match
  if (stepDefinitions[stepText]) return stepDefinitions[stepText];
  return stepDefinitions['__fallback__'] ?? pending('unknown step');
}
