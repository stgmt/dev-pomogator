import { Given, Then, When } from '@cucumber/cucumber';
import { expect } from 'chai';
import { createGhCheck, type GhCommandResult } from '../../.claude/skills/pomogator-doctor/scripts/engine/checks/gh.ts';
import type { CheckResult } from '../../.claude/skills/pomogator-doctor/scripts/engine/types.ts';

type GhOutcome = 'authenticated' | 'missing' | 'unauthenticated' | 'timeout';

type GhWorld = {
  ghPlatform?: NodeJS.Platform;
  ghOutcome?: GhOutcome;
  ghCalls?: string[];
  ghResult?: CheckResult;
};

function ghWorld(context: object): GhWorld {
  return context as GhWorld;
}

function probeResult(outcome: GhOutcome, args: string[]): GhCommandResult {
  if (outcome === 'missing') {
    return { status: null, errorCode: 'ENOENT', timedOut: false };
  }
  if (outcome === 'timeout' && args.join(' ') === 'auth status') {
    return { status: null, errorCode: 'ETIMEDOUT', timedOut: true };
  }
  if (outcome === 'unauthenticated' && args.join(' ') === 'auth status') {
    return { status: 1, timedOut: false };
  }
  return { status: 0, timedOut: false };
}

Given(
  /^an injectable GitHub CLI probe for platform "(win32|linux|darwin)" returns "(authenticated|missing|unauthenticated|timeout)"$/,
  function (this: object, platform: NodeJS.Platform, outcome: GhOutcome) {
    const state = ghWorld(this);
    state.ghPlatform = platform;
    state.ghOutcome = outcome;
    state.ghCalls = [];
    state.ghResult = undefined;
  },
);

When(/^I run the injectable GitHub CLI doctor check$/, async function (this: object) {
  const state = ghWorld(this);
  expect(state.ghPlatform, 'GitHub CLI platform fixture').to.not.be.undefined;
  expect(state.ghOutcome, 'GitHub CLI outcome fixture').to.not.be.undefined;

  const check = createGhCheck((args) => {
    state.ghCalls!.push(args.join(' '));
    return probeResult(state.ghOutcome!, args);
  }, state.ghPlatform!);
  state.ghResult = await check.run();
});

Then(/^the GitHub CLI doctor result severity is "(ok|warning|critical)"$/, function (this: object, severity: string) {
  expect(ghWorld(this).ghResult, 'GitHub CLI doctor result').to.include({ severity });
});

Then(/^the GitHub CLI doctor result hint contains "([^"]*)"$/, function (this: object, hint: string) {
  expect(ghWorld(this).ghResult?.hint ?? '').to.contain(hint);
});

Then(/^the GitHub CLI doctor result contains no raw auth output$/, function (this: object) {
  const result = ghWorld(this).ghResult;
  expect(result, 'GitHub CLI doctor result').to.not.be.undefined;
  expect(JSON.stringify(result)).to.not.contain('ghp_secret_auth_output');
  expect(result).to.not.have.property('stdout');
  expect(result).to.not.have.property('stderr');
});

Then(/^the GitHub CLI probe calls are "([^"]*)"$/, function (this: object, calls: string) {
  expect(ghWorld(this).ghCalls).to.deep.equal(calls.split(','));
});
