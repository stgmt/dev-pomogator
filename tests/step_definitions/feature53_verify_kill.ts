/**
 * @feature53 step definitions (FR-53 — deterministic inject+restore kill-gate).
 * SPECGEN004_377..383: drive the REAL `verifyKill` / `verifyBatch` in-process with injected
 * fake runners — no cucumber spawn, no network, no real mutation of production files.
 * Fake "sensing" runners read the actual temp file on disk, proving injection (mutant
 * present mid-run) and restore (original present again after) against the live filesystem.
 *
 * Step patterns are ALL prefixed with "verifyKill" or "verifyBatch" so they are scoped to
 * this spec's vocabulary and cannot accidentally collide with another feature's generic steps.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_377..383
 * @see .specs/spec-generator-v4/FR.md FR-53
 * @see tools/stryker-mutation/verify-kill.ts
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  verifyKill,
  verifyBatch,
  type KillSpec,
  type KillVerdict,
  type BatchResult,
  type ScenarioRun,
} from '../../tools/stryker-mutation/verify-kill.ts';
import { V4World } from '../hooks/before-after.ts';

interface VerifyKillWorld extends V4World {
  vkFile?: string;
  vkSpec?: KillSpec;
  vkVerdict?: KillVerdict;
  vkBatch?: BatchResult;
  vkThrownError?: Error;
}

// ─── Fake runners ─────────────────────────────────────────────────────────────

/** PASS unless the file currently contains `sense` — simulates a covering scenario that catches the mutant. */
const sensedRunner =
  (file: string, sense: string) =>
  (_config: string, _name: string): ScenarioRun => {
    const passed = !fs.readFileSync(file, 'utf-8').includes(sense);
    return { passed, ran: 1, summary: passed ? '1 scenario (1 passed)' : '1 scenario (1 failed)' };
  };

const alwaysPassRunner = (_config: string, _name: string): ScenarioRun => ({
  passed: true,
  ran: 1,
  summary: '1 scenario (1 passed)',
});

const alwaysFailRunner = (_config: string, _name: string): ScenarioRun => ({
  passed: false,
  ran: 1,
  summary: '1 scenario (1 failed)',
});

// ─── Given ────────────────────────────────────────────────────────────────────

Given(
  /^a verifyKill temp source file with original "([^"]+)" and mutant "([^"]+)"$/,
  function (this: VerifyKillWorld, original: string, mutant: string) {
    this.vkFile = path.join(this.tempDir, 'src.ts');
    fs.writeFileSync(this.vkFile, `export const v = ${original};\n`, 'utf-8');
    this.vkSpec = { file: this.vkFile, original, mutant, config: 'throwaway.json', name: 'S' };
  },
);

// ─── When (non-throwing scenarios) ───────────────────────────────────────────

When(
  /^verifyKill is called with a sensing runner that detects "([^"]+)"$/,
  function (this: VerifyKillWorld, sense: string) {
    this.vkVerdict = verifyKill(this.vkSpec!, sensedRunner(this.vkFile!, sense));
  },
);

When(/^verifyKill is called with an always-passing runner$/, function (this: VerifyKillWorld) {
  this.vkVerdict = verifyKill(this.vkSpec!, alwaysPassRunner);
});

// ─── When (throwing scenarios — catch and store, do not throw from step) ─────

When(
  /^verifyKill is called with a runner that throws on the second invocation$/,
  function (this: VerifyKillWorld) {
    let calls = 0;
    const throwOnSecond = (_config: string, _name: string): ScenarioRun => {
      calls += 1;
      if (calls === 1) return { passed: true, ran: 1, summary: 'baseline' };
      throw new Error('boom');
    };
    try {
      verifyKill(this.vkSpec!, throwOnSecond);
    } catch (e) {
      this.vkThrownError = e as Error;
    }
  },
);

When(
  /^verifyKill is called with original "([^"]+)" and an always-passing runner$/,
  function (this: VerifyKillWorld, original: string) {
    try {
      verifyKill({ ...this.vkSpec!, original }, alwaysPassRunner);
    } catch (e) {
      this.vkThrownError = e as Error;
    }
  },
);

When(/^verifyKill is called with an always-failing runner$/, function (this: VerifyKillWorld) {
  try {
    verifyKill(this.vkSpec!, alwaysFailRunner);
  } catch (e) {
    this.vkThrownError = e as Error;
  }
});

// ─── When (verifyBatch) ───────────────────────────────────────────────────────

When(
  /^verifyBatch is called with a killable spec "([^"]+)" and a surviving spec "([^"]+)" sensing "([^"]+)"$/,
  function (this: VerifyKillWorld, killLabel: string, surviveLabel: string, sense: string) {
    const specs: KillSpec[] = [
      { ...this.vkSpec!, label: killLabel },
      // 'never_sensed' is injected but the sensing runner only looks for `sense` ("mutant_value"),
      // so the scenario passes → SURVIVED
      { ...this.vkSpec!, label: surviveLabel, mutant: 'never_sensed' },
    ];
    this.vkBatch = verifyBatch(specs, sensedRunner(this.vkFile!, sense));
  },
);

When(
  /^verifyBatch is called with a spec whose original is "([^"]+)"$/,
  function (this: VerifyKillWorld, original: string) {
    this.vkBatch = verifyBatch([{ ...this.vkSpec!, label: 'bad', original }], alwaysPassRunner);
  },
);

// ─── Then (verifyKill verdict) ────────────────────────────────────────────────

Then(
  /^the verifyKill verdict is "([^"]+)"$/,
  function (this: VerifyKillWorld, expected: string) {
    assert.ok(this.vkVerdict, 'expected vkVerdict to be set — did the When step throw unexpectedly?');
    assert.equal(this.vkVerdict.verdict, expected);
  },
);

Then(
  /^the verifyKill killed flag is (true|false)$/,
  function (this: VerifyKillWorld, expected: string) {
    assert.equal(this.vkVerdict!.killed, expected === 'true');
  },
);

Then(
  /^the verifyKill restored flag is (true|false)$/,
  function (this: VerifyKillWorld, expected: string) {
    assert.equal(this.vkVerdict!.restored, expected === 'true');
  },
);

Then(
  /^the verifyKill source file still contains "([^"]+)"$/,
  function (this: VerifyKillWorld, text: string) {
    const content = fs.readFileSync(this.vkFile!, 'utf-8');
    assert.ok(content.includes(text), `verifyKill source file should contain "${text}". Got: ${content.slice(0, 200)}`);
  },
);

Then(
  /^the verifyKill source file does not contain "([^"]+)"$/,
  function (this: VerifyKillWorld, text: string) {
    const content = fs.readFileSync(this.vkFile!, 'utf-8');
    assert.ok(
      !content.includes(text),
      `verifyKill source file should NOT contain "${text}". Got: ${content.slice(0, 200)}`,
    );
  },
);

Then(
  /^the verifyKill call threw an exception matching "([^"]+)"$/,
  function (this: VerifyKillWorld, pattern: string) {
    assert.ok(
      this.vkThrownError,
      `expected verifyKill to throw matching /${pattern}/ but it did not throw`,
    );
    assert.match(this.vkThrownError.message, new RegExp(pattern));
  },
);

// ─── Then (verifyBatch) ───────────────────────────────────────────────────────

Then(/^the verifyBatch total is (\d+)$/, function (this: VerifyKillWorld, total: string) {
  assert.equal(this.vkBatch!.total, parseInt(total, 10));
});

Then(/^the verifyBatch killed count is (\d+)$/, function (this: VerifyKillWorld, count: string) {
  assert.equal(this.vkBatch!.killed, parseInt(count, 10));
});

Then(/^the verifyBatch survived count is (\d+)$/, function (this: VerifyKillWorld, count: string) {
  assert.equal(this.vkBatch!.survived, parseInt(count, 10));
});

Then(/^the verifyBatch error count is (\d+)$/, function (this: VerifyKillWorld, count: string) {
  assert.equal(this.vkBatch!.errors, parseInt(count, 10));
});

Then(
  /^the first verifyBatch result verdict is "([^"]+)"$/,
  function (this: VerifyKillWorld, verdict: string) {
    assert.ok(this.vkBatch!.results.length > 0, 'expected at least one batch result');
    assert.equal(this.vkBatch!.results[0].verdict, verdict);
  },
);
