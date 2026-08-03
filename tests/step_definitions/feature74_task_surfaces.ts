import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { createPlanningTask, buildDependencyGraph } from '../../tools/spec-graph/task-dependencies.ts';
import { calculateBlastRadius, reconcileArtifacts, validateSurfaceClaims, type ArtifactReconciliationReport, type BlastRadiusReport, type SurfaceFindingCode, type SurfaceValidationReport } from '../../tools/spec-graph/task-surfaces.ts';
import type { CanonicalTask } from '../../tools/spec-graph/task-contract.ts';
import { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';

interface SurfaceWorld extends V4World {
  tasks?: CanonicalTask[];
  validation?: SurfaceValidationReport;
  reconciliation?: ArtifactReconciliationReport;
  blastRadius?: BlastRadiusReport;
}

function task(id: string, overrides: Partial<CanonicalTask> = {}): CanonicalTask {
  return createPlanningTask(`spec-generator-v4:${id}`, overrides);
}

Given('a task declares file write locator scope and rationale', function (this: SurfaceWorld) {
  this.tasks = [task('surface-626', {
    surfaces: [{ kind: 'file', access: 'write', locator: 'src/planner.ts', scope: 'repository', rationale: 'planner output is owned by this task' }],
  })];
});

When('validation runs', function (this: SurfaceWorld) {
  assert.ok(this.tasks);
  this.validation = validateSurfaceClaims(this.tasks!);
});

Then('permitted kind access normalized locator scope and rationale persist', function (this: SurfaceWorld) {
  assert.ok(this.validation);
  assert.equal(this.validation!.executedCommands, 0);
  assert.equal(this.validation!.safe, true);
  assert.deepEqual(this.validation!.claims, [{ taskId: 'spec-generator-v4:surface-626', kind: 'file', access: 'write', locator: 'src/planner.ts', normalizedLocator: 'src/planner.ts', scope: 'repository', rationale: 'planner output is owned by this task' }]);
});

Given(/^task claims \.\.\/outside\.ts and an unbounded glob$/, function (this: SurfaceWorld) {
  this.tasks = [task('unsafe-627', {
    surfaces: [
      { kind: 'file', access: 'write', locator: '../outside.ts', scope: 'repository', rationale: 'unsafe traversal test' },
      { kind: 'file', access: 'write', locator: 'C:\\outside.ts', scope: 'repository', rationale: 'unsafe absolute test' },
      { kind: 'file', access: 'write', locator: '\\\\server\\share\\outside.ts', scope: 'repository', rationale: 'unsafe UNC test' },
      { kind: 'glob', access: 'read', locator: 'src/**', scope: 'repository', rationale: 'unsafe unbounded glob test' },
      { kind: 'file', access: 'read', locator: 'src/./normalized.ts', scope: 'repository', rationale: 'normalization test' },
      { kind: 'file', access: 'read', locator: 'src/link.ts', scope: 'repository', rationale: 'symlink test' },
    ],
  })];
});

When('planner validates surfaces', function (this: SurfaceWorld) {
  assert.ok(this.tasks);
  this.validation = validateSurfaceClaims(this.tasks!, { pathFacts: { 'src/link.ts': { isSymlink: true } } });
});

Then(/^named redacted finding for traversal, absolute\/UNC, normalization, realpath symlink\/junction, or bounded-glob breach prevents safe scheduling without command execution$/, function (this: SurfaceWorld) {
  assert.ok(this.validation);
  const codes = new Set(this.validation!.findings.map((finding) => finding.code));
  const expectedCodes: SurfaceFindingCode[] = ['TRAVERSAL', 'ABSOLUTE_PATH', 'UNC_PATH', 'NORMALIZATION_MISMATCH', 'SYMLINK_OR_JUNCTION', 'UNBOUNDED_GLOB'];
  for (const code of expectedCodes) assert.equal(codes.has(code), true, `missing finding ${code}`);
  assert.equal(this.validation!.safe, false);
  assert.equal(this.validation!.executedCommands, 0);
  for (const finding of this.validation!.findings) assert.equal(finding.redacted, true);
});

Given(/^task declares only src\/planner\.ts$/, function (this: SurfaceWorld) {
  this.tasks = [task('artifact-628', { artifacts: [{ path: 'src/planner.ts', kind: 'source', required: true }] })];
});

When(/^execution records src\/planner\.ts and config\/runtime\.json$/, function (this: SurfaceWorld) {
  assert.ok(this.tasks);
  this.reconciliation = reconcileArtifacts(this.tasks!, [
    { taskId: 'spec-generator-v4:artifact-628', path: 'src/planner.ts' },
    { taskId: 'spec-generator-v4:artifact-628', path: 'config/runtime.json' },
  ]);
});

Then('report identifies undeclared actual artifact', function (this: SurfaceWorld) {
  assert.ok(this.reconciliation);
  assert.deepEqual(this.reconciliation!.matched, ['src/planner.ts']);
  assert.deepEqual(this.reconciliation!.undeclaredActual, ['config/runtime.json']);
  assert.equal(this.reconciliation!.byTask['spec-generator-v4:artifact-628'].undeclared[0], 'config/runtime.json');
});

Given('a task writes schema consumed by two dependent tasks', function (this: SurfaceWorld) {
  this.tasks = [
    task('schema-629', { surfaces: [{ kind: 'schema', access: 'write', locator: 'schema/billing.v2', scope: 'repository', rationale: 'publish billing schema' }] }),
    task('consumer-a-629', { dependencies: [{ targetId: 'spec-generator-v4:schema-629', relation: 'consumes', strength: 'hard', reason: 'consume published schema' }] }),
    task('consumer-b-629', { dependencies: [{ targetId: 'spec-generator-v4:consumer-a-629', relation: 'depends-on', strength: 'hard', reason: 'consume validated consumer' }] }),
  ];
});

When('MCP queries blast radius', function (this: SurfaceWorld) {
  assert.ok(this.tasks);
  this.blastRadius = calculateBlastRadius(this.tasks!, 'schema/billing.v2', buildDependencyGraph(this.tasks!));
});

Then('direct claim and transitive tasks include explanations', function (this: SurfaceWorld) {
  assert.ok(this.blastRadius);
  assert.deepEqual(this.blastRadius!.directTaskIds, ['spec-generator-v4:schema-629']);
  assert.deepEqual(this.blastRadius!.transitiveTaskIds, ['spec-generator-v4:consumer-a-629', 'spec-generator-v4:consumer-b-629']);
  assert.equal(this.blastRadius!.entries.length, 3);
  for (const entry of this.blastRadius!.entries) assert.match(entry.explanation, /schema\/billing\.v2|typed dependencies/);
});

Given('a task declares shell-like external-contract locator', function (this: SurfaceWorld) {
  this.tasks = [task('external-630', { surfaces: [{ kind: 'external-contract', access: 'read', locator: 'https://api.example.invalid/contracts/billing.v2', scope: 'external', rationale: 'external contract boundary only' }] })];
});

When('planner validates it', function (this: SurfaceWorld) {
  assert.ok(this.tasks);
  this.validation = validateSurfaceClaims(this.tasks!);
});

Then('boundary remains typed data without command execution', function (this: SurfaceWorld) {
  assert.ok(this.validation);
  assert.equal(this.validation!.safe, true);
  assert.equal(this.validation!.executedCommands, 0);
  assert.equal(this.validation!.claims[0].kind, 'external-contract');
  assert.equal(this.validation!.claims[0].locator, 'https://api.example.invalid/contracts/billing.v2');
});
