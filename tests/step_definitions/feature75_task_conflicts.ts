import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { createPlanningTask } from '../../tools/spec-graph/task-dependencies.ts';
import { applyConflictOverrides, createConflictOverride, deriveConflicts, partitionConflictFreeTasks, queryConflict, type ConflictClass, type ConflictOverride, type ConflictReport } from '../../tools/spec-graph/task-conflicts.ts';
import type { CanonicalTask } from '../../tools/spec-graph/task-contract.ts';
import { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';

interface ConflictWorld extends V4World {
  tasks?: CanonicalTask[];
  report?: ConflictReport;
  overrides?: ConflictOverride[];
  query?: ReturnType<typeof queryConflict>;
  batches?: string[][];
}

function task(id: string, surfaces: CanonicalTask['surfaces']): CanonicalTask {
  return createPlanningTask(`spec-generator-v4:${id}`, { surfaces });
}

Given(/^ready tasks with write\/write read\/write and exclusive overlap$/, function (this: ConflictWorld) {
  this.tasks = [
    task('write-left-631', [{ kind: 'file', access: 'write', locator: 'src/shared.ts', scope: 'repository', rationale: 'write shared implementation' }]),
    task('write-right-631', [{ kind: 'file', access: 'write', locator: 'src/shared.ts', scope: 'repository', rationale: 'write shared implementation independently' }]),
    task('read-631', [{ kind: 'file', access: 'read', locator: 'src/shared.ts', scope: 'repository', rationale: 'read shared implementation' }]),
    task('exclusive-631', [{ kind: 'file', access: 'exclusive', locator: 'src/shared.ts', scope: 'repository', rationale: 'exclusive migration' }]),
  ];
});

When('conflicts are derived', function (this: ConflictWorld) {
  assert.ok(this.tasks);
  this.report = deriveConflicts(this.tasks!);
});

Then('each unsafe pair has applicable class', function (this: ConflictWorld) {
  assert.ok(this.report);
  const classes = new Set(this.report!.conflicts.flatMap((conflict) => conflict.classes));
  const expectedClasses: ConflictClass[] = ['write-write', 'read-write', 'exclusive-overlap'];
  for (const expected of expectedClasses) assert.equal(classes.has(expected), true, `missing ${expected}`);
  assert.equal(new Set(this.report!.conflicts.map((conflict) => conflict.id)).size, this.report!.conflicts.length);
  assert.ok(this.report!.conflicts.every((conflict) => conflict.claims.length === 2 && conflict.derivationRule.length > 0));
});

Given('two tasks edit different files but write API contract billing.v2', function (this: ConflictWorld) {
  this.tasks = [
    task('api-left-632', [{ kind: 'api-contract', access: 'write', locator: 'billing.v2', scope: 'api', rationale: 'publish API contract from endpoint file' }, { kind: 'file', access: 'write', locator: 'src/billing.ts', scope: 'repository', rationale: 'endpoint implementation' }]),
    task('api-right-632', [{ kind: 'api-contract', access: 'write', locator: 'billing.v2', scope: 'api', rationale: 'publish API contract from schema file' }, { kind: 'file', access: 'write', locator: 'src/schema.ts', scope: 'repository', rationale: 'schema implementation' }]),
  ];
});

Then('semantic API conflict is returned', function (this: ConflictWorld) {
  assert.ok(this.report);
  const semantic = this.report!.conflicts.filter((conflict) => conflict.classes.includes('semantic-resource'));
  assert.equal(semantic.length, 1);
  assert.deepEqual(semantic[0].classes, ['semantic-resource', 'write-write']);
  assert.equal(semantic[0].claims.every((claim) => claim.normalizedLocator === 'billing.v2'), true);
});

Given('two tasks conflict on normalized schema', function (this: ConflictWorld) {
  this.tasks = [
    task('schema-left-633', [{ kind: 'schema', access: 'write', locator: 'schema/./billing.v2', scope: 'repository', rationale: 'normalized schema producer left' }]),
    task('schema-right-633', [{ kind: 'schema', access: 'exclusive', locator: 'schema/billing.v2', scope: 'repository', rationale: 'normalized schema producer right' }]),
  ];
});

When('MCP queries conflict', function (this: ConflictWorld) {
  assert.ok(this.tasks);
  this.report = deriveConflicts(this.tasks!);
  assert.equal(this.report.conflicts.length > 0, true);
  this.query = queryConflict(this.report, this.report.conflicts[0].id);
});

Then('tasks claims overlap and derivation rule are shown', function (this: ConflictWorld) {
  assert.ok(this.query?.conflict);
  const conflict = this.query!.conflict!;
  assert.equal(conflict.leftTaskId, 'spec-generator-v4:schema-left-633');
  assert.equal(conflict.rightTaskId, 'spec-generator-v4:schema-right-633');
  assert.equal(conflict.claims.length, 2);
  assert.equal(conflict.claims[0].normalizedLocator, 'schema/billing.v2');
  assert.equal(conflict.claims[1].normalizedLocator, 'schema/billing.v2');
  assert.match(conflict.derivationRule, /normalized locator|semantic resource/);
});

Given('scoped audited conflict override with expiry', function (this: ConflictWorld) {
  this.tasks = [
    task('override-left-634', [{ kind: 'file', access: 'write', locator: 'src/override.ts', scope: 'repository', rationale: 'left write' }]),
    task('override-right-634', [{ kind: 'file', access: 'write', locator: 'src/override.ts', scope: 'repository', rationale: 'right write' }]),
  ];
  this.report = deriveConflicts(this.tasks);
  this.overrides = [createConflictOverride({ id: 'override-634', conflictId: this.report.conflicts[0].id, scope: 'scenario:634', rationale: 'sequenced migration window', actor: 'planner', createdAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-02T00:00:00.000Z' })];
});

When('time advances past expiry', function (this: ConflictWorld) {
  assert.ok(this.report && this.overrides);
  this.report = applyConflictOverrides(this.report!, this.overrides!, '2026-01-03T00:00:00.000Z');
  this.query = queryConflict(this.report, this.overrides![0].conflictId, this.overrides!, '2026-01-03T00:00:00.000Z');
});

Then('it no longer suppresses conflict and audit remains visible', function (this: ConflictWorld) {
  assert.ok(this.report && this.query);
  assert.equal(this.query!.suppressed, false);
  assert.equal(this.report!.conflicts.length, 1);
  assert.deepEqual(this.report!.expiredOverrides, ['override-634']);
  assert.match(this.overrides![0].auditEventId, /^audit:override-634:/);
});

Given('two ready tasks conflict in a wave', function (this: ConflictWorld) {
  this.tasks = [
    task('batch-left-635', [{ kind: 'file', access: 'write', locator: 'src/batch.ts', scope: 'repository', rationale: 'batch left' }]),
    task('batch-right-635', [{ kind: 'file', access: 'write', locator: 'src/batch.ts', scope: 'repository', rationale: 'batch right' }]),
    task('batch-independent-635', [{ kind: 'file', access: 'write', locator: 'src/other.ts', scope: 'repository', rationale: 'independent batch' }]),
  ];
});

When('batches are planned', function (this: ConflictWorld) {
  assert.ok(this.tasks);
  this.report = deriveConflicts(this.tasks!);
  this.batches = partitionConflictFreeTasks(this.tasks!.map((task) => task.qualifiedId), this.report);
});

Then('they separate without adding DAG edge', function (this: ConflictWorld) {
  assert.ok(this.batches && this.report);
  const all = this.batches!.flat();
  assert.equal(new Set(all).size, this.tasks!.length);
  assert.deepEqual([...all].sort(), this.tasks!.map((task) => task.qualifiedId).sort());
  const pair = this.report!.conflicts.find((conflict) => conflict.leftTaskId.includes('batch-left') && conflict.rightTaskId.includes('batch-right'));
  assert.ok(pair);
  assert.notEqual(this.batches!.findIndex((batch) => batch.includes(pair!.leftTaskId)), this.batches!.findIndex((batch) => batch.includes(pair!.rightTaskId)));
  assert.equal(this.report!.conflicts.length > 0, true);
});
