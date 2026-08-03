import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import {
  applyDiscoveryProposal,
  createDiscoverySnapshot,
  deterministicChildTaskId,
  discoveryProposalDigest,
  discoverTasks,
  restoreDiscoverySnapshot,
  serializeDiscoverySnapshot,
  type DiscoveryCandidate,
  type DiscoveryProposal,
  type DiscoverySnapshot,
} from '../../tools/spec-graph/task-discovery.ts';
import { parseTaskContract, type CanonicalTask } from '../../tools/spec-graph/task-contract.ts';
import { V4World } from '../hooks/before-after.ts';

interface DiscoveryWorld extends V4World {
  parent?: CanonicalTask;
  proposal?: DiscoveryProposal;
  snapshot?: DiscoverySnapshot;
  applied?: ReturnType<typeof applyDiscoveryProposal>;
  restored?: DiscoverySnapshot;
  modifiedApply?: ReturnType<typeof applyDiscoveryProposal>;
}

function parent(id = 'fixture:parent'): CanonicalTask {
  return parseTaskContract({
    qualifiedId: id,
    title: 'Parent task',
    kind: 'implementation',
    definitionRevision: 1,
    declaredStatus: 'READY',
    estimateMinutes: 10,
    requirementLinks: [{ id: 'FR-78', kind: 'requirement' }],
    acceptanceCriteriaLinks: [{ id: 'AC-78.1', kind: 'acceptance-criterion' }],
    doneWhen: [{ text: 'parent evidence passes', order: 1, required: true }],
    dependencies: [],
    surfaces: [{ kind: 'file', access: 'write', locator: 'fixture/parent.ts', scope: 'repository', rationale: 'parent fixture' }],
    artifacts: [{ path: 'fixture/parent.json', required: true }],
    evidencePolicy: { scope: 'full-suite', commands: ['docker-bdd'], requiresFresh: true, allowFiltered: false },
    sourceSpan: { file: 'fixture/TASKS.md', startLine: 1, endLine: 10 },
  });
}

function candidate(semanticKey: string, overrides: Record<string, unknown> = {}): DiscoveryCandidate {
  return {
    semanticKey,
    title: `Child ${semanticKey}`,
    scope: [`fixture/${semanticKey}.ts`],
    writes: [`fixture/${semanticKey}.ts`],
    task: {
      doneWhen: [{ text: 'child evidence passes', order: 1, required: true }],
      surfaces: [{ kind: 'file', access: 'write', locator: `fixture/${semanticKey}.ts`, scope: 'repository', rationale: 'child fixture' }],
      artifacts: [{ path: `fixture/${semanticKey}.json`, required: true }],
      ...overrides,
    },
  };
}

Given('discovery finds candidate child task', function (this: DiscoveryWorld) {
  this.parent = parent();
  this.proposal = discoverTasks({ parent: this.parent, candidates: [candidate('first')] });
});

When('it finishes', function (this: DiscoveryWorld) {
  assert.equal(this.proposal!.state, 'proposed');
});

Then('schema-valid proposal returns and graph waits for apply', function (this: DiscoveryWorld) {
  assert.equal(this.proposal!.schemaVersion, 'discovery/v1');
  assert.equal(this.proposal!.children.length, 1);
  assert.equal(this.proposal!.edges.length, 1);
  assert.equal(this.proposal!.replayNoOp, false);
  assert.equal(this.proposal!.digest.length, 64);
});

Given('stable semantic key and child scope write limits', function (this: DiscoveryWorld) {
  this.parent = parent();
  this.proposal = discoverTasks({ parent: this.parent, candidates: [candidate('within'), candidate('too-many')], limits: { maxChildren: 1, maxWrites: 1, maxScopeUnits: 1 } });
});

When('proposal exceeds limit', function (this: DiscoveryWorld) {
  assert.equal(this.proposal!.children.length, 1);
});

Then('child ID derives from parent key and excess is rejected', function (this: DiscoveryWorld) {
  assert.equal(this.proposal!.children[0].qualifiedId, deterministicChildTaskId('fixture:parent', 'within'));
  assert.equal(this.proposal!.rejected.length, 1);
  assert.ok(this.proposal!.rejected[0].reasons.some((reason) => reason.includes('ceiling')));
});

Given('accepted discovery output digest', function (this: DiscoveryWorld) {
  this.parent = parent();
  const first = discoverTasks({ parent: this.parent, candidates: [candidate('replay')] });
  this.proposal = discoverTasks({ parent: this.parent, candidates: [candidate('replay')], acceptedDigests: [first.digest] });
  this.snapshot = createDiscoverySnapshot([this.parent], [], [first.digest]);
});

When('same output replays', function (this: DiscoveryWorld) {
  this.applied = applyDiscoveryProposal(this.snapshot!, this.proposal!);
});

Then('no-op returns without duplicate task or edge', function (this: DiscoveryWorld) {
  assert.equal(this.applied!.ok, true);
  assert.equal(this.applied!.noOp, true);
  assert.equal(this.applied!.committed, false);
  assert.equal(this.applied!.snapshot.tasks.length, 1);
  assert.equal(this.applied!.snapshot.edges.length, 0);
});

Given('patch has valid child and cyclic dependency', function (this: DiscoveryWorld) {
  this.parent = parent();
  const proposal = discoverTasks({ parent: this.parent, candidates: [candidate('cycle')] });
  const child = proposal.children[0];
  const cyclicChild = parseTaskContract({ ...child, qualifiedId: 'fixture:cycle-extra', dependencies: [{ targetId: child.qualifiedId, relation: 'depends-on', strength: 'hard', reason: 'cycle edge' }] });
  this.proposal = {
    ...proposal,
    children: [child, cyclicChild],
    edges: [...proposal.edges, { from: cyclicChild.qualifiedId, to: child.qualifiedId, relation: 'depends-on' }, { from: child.qualifiedId, to: cyclicChild.qualifiedId, relation: 'depends-on' }],
  };
  this.proposal = { ...this.proposal, digest: discoveryProposalDigest(this.proposal) };
  this.snapshot = createDiscoverySnapshot([this.parent]);
});

When('dry-run and apply run', function (this: DiscoveryWorld) {
  const dry = applyDiscoveryProposal(this.snapshot!, this.proposal!, { dryRun: true });
  const applied = applyDiscoveryProposal(this.snapshot!, this.proposal!);
  assert.equal(dry.committed, false);
  assert.equal(applied.committed, false);
  this.applied = applied;
});

Then('both report cycle and persist no patch part', function (this: DiscoveryWorld) {
  assert.ok(this.applied!.findings.some((finding) => finding.code === 'DISCOVERY_CYCLE'));
  assert.equal(this.applied!.snapshot.tasks.length, 1);
  assert.equal(this.applied!.snapshot.edges.length, 0);
});

Given('one discovery is empty and another is high impact', function (this: DiscoveryWorld) {
  this.parent = parent();
  const empty = discoverTasks({ parent: this.parent, candidates: [] });
  const high = discoverTasks({ parent: this.parent, candidates: [{ ...candidate('danger'), impact: 'high' }] });
  this.proposal = { ...empty, digest: `${empty.digest}:${high.digest}` };
  this.snapshot = createDiscoverySnapshot([this.parent]);
  this.applied = applyDiscoveryProposal(this.snapshot, high);
});

When('proposals evaluate', function (this: DiscoveryWorld) {
  assert.equal(this.proposal!.state, 'no_children');
});

Then('first records no_children and second awaits approval', function (this: DiscoveryWorld) {
  assert.equal(this.proposal!.noChildren, true);
  assert.equal(this.applied!.ok, false);
  assert.ok(this.applied!.findings.some((finding) => finding.code === 'DISCOVERY_APPROVAL_REQUIRED'));
  const high = discoverTasks({ parent: this.parent!, candidates: [{ ...candidate('danger'), impact: 'high' }] });
  const approved = applyDiscoveryProposal(this.snapshot!, high, { approve: true });
  assert.equal(approved.committed, true);
  const restored = restoreDiscoverySnapshot(serializeDiscoverySnapshot(approved.snapshot));
  assert.equal(restored.tasks.length, 2);
});

Given('a high impact discovery proposal requires approval', function (this: DiscoveryWorld) {
  this.parent = parent('fixture:approval-parent');
  this.snapshot = createDiscoverySnapshot([this.parent]);
  this.proposal = discoverTasks({
    parent: this.parent,
    candidates: [{ ...candidate('approval-child'), impact: 'high' }],
  });
  assert.equal(this.proposal.state, 'approval-required');
});

When('its caller changes approval state without changing the digest', function (this: DiscoveryWorld) {
  const modified = { ...this.proposal!, state: 'proposed' as const };
  assert.equal(modified.digest, this.proposal!.digest);
  this.modifiedApply = applyDiscoveryProposal(this.snapshot!, modified, { approve: false });
});

Then('proposal integrity fails and no graph mutation commits', function (this: DiscoveryWorld) {
  assert.equal(this.modifiedApply!.ok, false);
  assert.equal(this.modifiedApply!.committed, false);
  assert.equal(this.modifiedApply!.snapshot.tasks.length, 1);
  assert.ok(this.modifiedApply!.findings.some((finding) => finding.code === 'DISCOVERY_INVALID'));
});
