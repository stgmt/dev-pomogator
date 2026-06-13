/**
 * @feature48 step definitions (lifecycle machine) — SPECGEN004_171. FR-48a: the
 * task-lifecycle transition table accepts the forward spine
 * todo→ready→in-progress→done plus the done→in-progress reopen, and rejects
 * skip-to-finish (todo→done, ready→done). Drives the real isLegalTransition.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_171
 * @see .specs/spec-generator-v4/FR.md FR-48 (FR-48a)
 * @see tools/spec-graph/task-lifecycle.ts (LEGAL_TRANSITIONS / isLegalTransition)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { V4World } from '../hooks/before-after.ts';
import { isLegalTransition } from '../../tools/spec-graph/task-lifecycle.ts';

interface MachineWorld extends V4World {
  machineReady?: boolean;
}

Given('the task-lifecycle transition table', function (this: MachineWorld) {
  this.machineReady = true;
});

When('a status transition is checked', function (this: MachineWorld) {
  // The concrete checks run in the Then against the real isLegalTransition.
  assert.ok(this.machineReady, 'transition table is loaded');
});

Then(
  'todo to ready to in-progress to done and the done to in-progress reopen are legal but todo straight to done is rejected',
  function () {
    // forward spine
    assert.ok(isLegalTransition('todo', 'ready'), 'todo→ready legal');
    assert.ok(isLegalTransition('ready', 'in-progress'), 'ready→in-progress legal');
    assert.ok(isLegalTransition('in-progress', 'done'), 'in-progress→done legal');
    // reverse/recovery
    assert.ok(isLegalTransition('done', 'in-progress'), 'done→in-progress reopen legal');
    assert.ok(isLegalTransition('blocked', 'in-progress'), 'blocked→in-progress recovery legal');
    // skip-to-finish rejected
    assert.ok(!isLegalTransition('todo', 'done'), 'todo→done rejected (no skip-to-finish)');
    assert.ok(!isLegalTransition('ready', 'done'), 'ready→done rejected (must pass in-progress)');
    // idempotent no-op allowed
    assert.ok(isLegalTransition('in-progress', 'in-progress'), 'same-status no-op allowed');
  },
);
