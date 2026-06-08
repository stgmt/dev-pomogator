/**
 * @feature35 step definitions — honesty hardening (FR-35), bound to the REAL
 * spec-graph honesty logic (no mocks). Built incrementally per Phase-12 WS-A:
 *   89 → FR-35c  checkConformance flags a DONE task with zero linked scenarios
 *   (85/86 → FR-35a, 87 → FR-35b drift, 88 → FR-35b Stop-gate land in later commits)
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_85..89
 * @see .specs/spec-generator-v4/FR.md FR-35
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkConformance, type Finding } from '../../tools/spec-graph/conformance.ts';
import { evaluateTestQualityGate, logEscape, readVerdicts, type GateDecision } from '../../tools/spec-graph/test-quality-gate.ts';
import { computeCoverage, type CoverageReport, type ScenarioLike, type TaskLike, type TestQualityVerdict } from '../../tools/spec-graph/coverage.ts';
import { WORKFLOW, REFERENCED_CAPABILITIES, checkFeatureMapDrift, type DriftResult } from '../../.claude/skills/spec-generator-orchestrator/scripts/feature-map.ts';
import type { SpecGraph } from '../../tools/spec-graph/types.ts';

interface ScenSpec { id: string; tags?: string[]; result?: string }
interface TaskSpec { id: string; status: 'todo' | 'done'; refs?: string[]; doneWhen: string }

/** Minimal SpecGraph from scenario + task specs (mirrors feature32's makeGraph). */
function makeGraph(scens: ScenSpec[], tasks: TaskSpec[]): SpecGraph {
  const nodes = new Map<string, any>();
  for (const s of scens) nodes.set(s.id, { id: s.id, type: 'Scenario', file: 'demo.feature', line: 1, tags: s.tags ?? [], steps: [], lastResult: s.result });
  for (const t of tasks) nodes.set(t.id, { id: t.id, type: 'Task', file: 'TASKS.md', line: 1, status: t.status, refs: t.refs ?? [], doneWhen: t.doneWhen });
  return { version: 1, builtAt: '', nodes, edges: [], definitions: new Map(), backlinks: new Map() };
}

interface F35World {
  graph?: SpecGraph;
  findings?: Finding[];
  report?: CoverageReport;
  covTasks?: TaskLike[];
  covScens?: ScenarioLike[];
  verdict?: Record<string, TestQualityVerdict>;
  taskId?: string;
  driftWithStage?: DriftResult;
  driftWithoutStage?: DriftResult;
  blockDecision?: GateDecision;
  approveDecision?: GateDecision;
  shortEscapeDecision?: GateDecision;
  escapeLog?: string;
  cappedReport?: CoverageReport;
  doneReport?: CoverageReport;
}

// ── SPECGEN004_85/86 — FR-35a: a test-quality verdict caps / clears a GREEN task ──
function setupGreenTaskWithVerdict(w: F35World, verdict: TestQualityVerdict): void {
  const taskId = 't-quality';
  w.taskId = taskId;
  // a GREEN (PASSED) scenario linked to a DONE task — so only the verdict decides DONE.
  w.covScens = [{ id: 'SCEN-specgen004-85x', tags: ['@feature85'], result: 'PASSED' }];
  w.covTasks = [{ id: taskId, doneWhen: 'SPECGEN004_85 passes', refs: [] }];
  w.verdict = { [taskId]: verdict };
  w.graph = makeGraph(
    [{ id: 'SCEN-specgen004-85x', tags: ['@feature85'], result: 'PASSED' }],
    [{ id: taskId, status: 'done', refs: [], doneWhen: 'SPECGEN004_85 passes' }],
  );
}
Given('a task whose linked scenario is GREEN but whose test body audits as FAKE-POSITIVE-RISK', function (this: F35World) {
  setupGreenTaskWithVerdict(this, 'FAKE-POSITIVE-RISK');
});
Given('a task whose linked scenario is GREEN and whose test body audits as STRONG', function (this: F35World) {
  setupGreenTaskWithVerdict(this, 'STRONG');
});
When('the honesty derivation runs with the test-quality verdict', function (this: F35World) {
  this.report = computeCoverage(this.covTasks!, this.covScens!, this.verdict);
  this.findings = checkConformance(this.graph!, { testQualityByTask: this.verdict });
});
Then('verified_status is capped below DONE', function (this: F35World) {
  assert.equal(this.report!.tasks[this.taskId!].verified_status, 'IN_PROGRESS', 'a fake-positive green test must NOT be DONE');
});
Then('a TASK_TEST_QUALITY finding names the task and the fake-positive verdict', function (this: F35World) {
  const f = this.findings!.find((x) => x.code === 'TASK_TEST_QUALITY');
  assert.ok(f, `expected TASK_TEST_QUALITY, got ${JSON.stringify(this.findings!.map((x) => x.code))}`);
  assert.match(f.message, new RegExp(this.taskId!));
  assert.match(f.message, /FAKE-POSITIVE-RISK/);
});
Then('verified_status is DONE', function (this: F35World) {
  assert.equal(this.report!.tasks[this.taskId!].verified_status, 'DONE', 'a genuinely STRONG green test must NOT be false-blocked');
});

// ── SPECGEN004_87 — FR-35b: the feature-map carries an ENFORCED test-quality stage ──
Given('the orchestrator feature-map', function (this: F35World) {
  // WORKFLOW + REFERENCED_CAPABILITIES are module constants — nothing to set up.
});
When('the drift guard evaluates it', function (this: F35World) {
  // The live capability set includes the test-quality workers (they are real skills).
  const actual = [...REFERENCED_CAPABILITIES];
  this.driftWithStage = checkFeatureMapDrift(actual, REFERENCED_CAPABILITIES);
  // Simulate the stage being dropped from the map: referenced loses its workers.
  const referencedWithout = REFERENCED_CAPABILITIES.filter((c) => c !== 'strong-tests' && c !== 'spec-status');
  this.driftWithoutStage = checkFeatureMapDrift(actual, referencedWithout);
});
Then('a test-quality stage exists between coverage and honesty-gate routing to strong-tests and spec-status', function () {
  const idx = (step: string) => WORKFLOW.findIndex((w) => w.step === step);
  const tq = WORKFLOW.filter((w) => w.step === 'test-quality');
  assert.equal(tq.length, 2, 'test-quality stage must route to two workers');
  assert.deepEqual(tq.map((w) => w.worker).sort(), ['spec-status', 'strong-tests']);
  const tqIdx = idx('test-quality');
  assert.ok(tqIdx > idx('coverage'), 'test-quality must come after coverage');
  assert.ok(tqIdx < idx('honesty-gate'), 'test-quality must come before honesty-gate');
});
Then('the drift guard fails when that stage is removed', function (this: F35World) {
  assert.equal(this.driftWithStage!.ok, true, 'with the stage referenced there is no drift');
  assert.equal(this.driftWithoutStage!.ok, false, 'dropping the stage must trip the drift guard');
  assert.ok(this.driftWithoutStage!.unreferenced.includes('strong-tests'));
  assert.ok(this.driftWithoutStage!.unreferenced.includes('spec-status'));
});

// ── SPECGEN004_88 — FR-35b: the pre-DONE Stop-gate blocks a weak test ────────
Given('a session-touched task whose test audits as WEAK', function (this: F35World) {
  const graph = makeGraph(
    [{ id: 'SCEN-specgen004-88x', tags: ['@feature88'], result: 'PASSED' }],
    [{ id: 't-weak', status: 'done', refs: [], doneWhen: 'SPECGEN004_88 passes' }],
  );
  // a real TASK_TEST_QUALITY finding (green scenario + WEAK verdict).
  this.findings = checkConformance(graph, { testQualityByTask: { 't-weak': 'WEAK' } });
});
When('the pre-DONE Stop-gate runs', function (this: F35World) {
  this.blockDecision = evaluateTestQualityGate(this.findings!, {});
  const audited = 'deliberate placeholder weak test, tracked in JIRA-123';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tqg-'));
  this.escapeLog = logEscape(dir, audited);
  this.approveDecision = evaluateTestQualityGate(this.findings!, { escape: audited });
  this.shortEscapeDecision = evaluateTestQualityGate(this.findings!, { escape: 'no' });
});
Then('it blocks the done claim', function (this: F35World) {
  assert.equal(this.blockDecision!.decision, 'block', 'a WEAK test must block the done claim');
  assert.match(this.blockDecision!.reason!, /t-weak/);
});
// `\/` escapes the slash — in a Cucumber Expression a bare `/` is the alternative
// operator, so `.claude/logs` would never match the literal feature text.
Then('it allows the claim only with an audited skip-test-quality escape logged to .claude\\/logs', function (this: F35World) {
  assert.equal(this.approveDecision!.decision, 'approve', 'an audited escape lets the claim through');
  assert.ok(this.approveDecision!.escapeUsed, 'the escape reason is recorded on the decision');
  // anti-gaming: a too-short escape (<8 chars) does NOT let it through.
  assert.equal(this.shortEscapeDecision!.decision, 'block', 'a trivial escape must NOT bypass the gate');
  // the escape was append-logged to .claude/logs/test-quality-escapes.jsonl.
  assert.match(this.escapeLog!.replace(/\\/g, '/'), /\.claude\/logs\/test-quality-escapes\.jsonl/);
  assert.ok(fs.existsSync(this.escapeLog!), 'escape log file written');
  assert.match(fs.readFileSync(this.escapeLog!, 'utf8'), /JIRA-123/);
  fs.rmSync(path.dirname(path.dirname(path.dirname(this.escapeLog!))), { recursive: true, force: true });
});

// ── SPECGEN004_137 — FR-35a: the side-channel FILE is read by the consumer surfaces ──
// _85/_86 feed the verdict in directly; this binds the actual gap P19-5 closed —
// `.dev-pomogator/.test-quality.json` was never READ by get_coverage / spec-verdict.
// Drives the REAL shared reader (readVerdicts) over a real tmp file, then the real
// computeCoverage — proving the file path → cap chain end-to-end.
Given('a side-channel test-quality file recording a WEAK verdict for a green DONE task', function (this: F35World) {
  const taskId = 't-sidechannel';
  this.taskId = taskId;
  this.covScens = [{ id: 'SCEN-specgen004-137x', tags: ['@feature137'], result: 'PASSED' }];
  this.covTasks = [{ id: taskId, doneWhen: 'SPECGEN004_137 passes', refs: [] }];
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tq-sidechannel-'));
  fs.mkdirSync(path.join(repoRoot, '.dev-pomogator'), { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, '.dev-pomogator', '.test-quality.json'),
    JSON.stringify({ [taskId]: 'WEAK' }),
  );
  this.escapeLog = repoRoot; // reuse field to carry the tmp root for cleanup
});
When('the honesty read surfaces load the side-channel file', function (this: F35World) {
  const repoRoot = this.escapeLog!;
  // 1) WITH the file present — the real reader returns the WEAK verdict.
  const verdict = readVerdicts(repoRoot);
  this.cappedReport = computeCoverage(this.covTasks!, this.covScens!, verdict);
  // 2) WITHOUT a file — an empty dir → readVerdicts returns {} → no cap.
  const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tq-nofile-'));
  this.doneReport = computeCoverage(this.covTasks!, this.covScens!, readVerdicts(emptyRoot));
  fs.rmSync(emptyRoot, { recursive: true, force: true });
  fs.rmSync(repoRoot, { recursive: true, force: true });
});
Then('the verdict read from the file caps the task below DONE', function (this: F35World) {
  const t = this.cappedReport!.tasks[this.taskId!];
  assert.equal(t.verified_status, 'IN_PROGRESS', 'a WEAK verdict read from the side-channel file must cap a green DONE task');
  assert.equal(t.test_quality, 'WEAK', 'the verdict from the file is surfaced on the task');
});
Then('with no side-channel file present the same green task reads DONE', function (this: F35World) {
  assert.equal(this.doneReport!.tasks[this.taskId!].verified_status, 'DONE', 'absent file → {} → no cap → the green task stays DONE');
});

// ── SPECGEN004_89 — FR-35c: DONE with zero linked scenarios is not silent ────
Given('a task marked DONE with no linked scenario at all', function (this: F35World) {
  // doneWhen names no SPECGEN id / @feature tag and refs map to nothing → zero scenarios.
  this.graph = makeGraph([], [{ id: 't-untested', status: 'done', refs: [], doneWhen: 'implements the thing (no test referenced)' }]);
});
When('checkConformance runs', function (this: F35World) {
  this.findings = checkConformance(this.graph!);
});
Then('it emits a finding naming the task', function (this: F35World) {
  const f = this.findings!.find((x) => x.code === 'TASK_UNTESTED');
  assert.ok(f, `expected a TASK_UNTESTED finding, got: ${JSON.stringify(this.findings!.map((x) => x.code))}`);
  assert.match(f.message, /t-untested/);
  assert.equal(f.nodeId, 't-untested');
});
Then('the returned finding set is not empty', function (this: F35World) {
  assert.ok(this.findings!.length > 0, 'a DONE task with no test must not yield an empty finding set');
});
