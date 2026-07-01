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
import { findOrphanProjectTests, type OrphanProjectTest } from '../../tools/spec-graph/project-test-trace.ts';
import { mapTestVerdictsToTasks } from '../../tools/spec-graph/test-quality-producer.ts';
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
// `.dev-pomogator/.test-quality.json` was never READ by get_spec_status (view coverage) / spec-verdict.
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

// ── SPECGEN004_140 — FR-44/GT-3: a task referencing NO requirement (reverse gap) ──
interface NoReqWorld extends F35World { noReqFindings?: Finding[]; }
Given('a task with empty refs whose Done-When names no requirement', function (this: NoReqWorld) {
  // empty refs AND a Done-When with no FR-N / SPECGEN id / @feature tag → true orphan
  this.graph = makeGraph([], [{ id: 't-noreq', status: 'todo', refs: [], doneWhen: 'implement the thing, no requirement cited' }]);
});
When('checkConformance runs for reverse traceability', function (this: NoReqWorld) {
  this.noReqFindings = checkConformance(this.graph!);
});
Then('a TASK_NO_REQUIREMENT info finding names the task', function (this: NoReqWorld) {
  const f = this.noReqFindings!.find((x) => x.code === 'TASK_NO_REQUIREMENT');
  assert.ok(f, `expected TASK_NO_REQUIREMENT, got: ${JSON.stringify(this.noReqFindings!.map((x) => x.code))}`);
  assert.equal(f.severity, 'info', 'reverse-trace gap is INFO (non-gating) to avoid legacy-debt flood');
  assert.match(f.message, /t-noreq/);
  assert.equal(f.nodeId, 't-noreq');
  // a task that DOES cite a requirement in Done-When is NOT flagged
  const okGraph = makeGraph([], [{ id: 't-ok', status: 'todo', refs: [], doneWhen: 'closes SPECGEN004_140' }]);
  assert.ok(!checkConformance(okGraph).some((x) => x.code === 'TASK_NO_REQUIREMENT' && x.nodeId === 't-ok'), 'a Done-When citing a SPECGEN id must NOT be flagged');
});

// ── SPECGEN004_141 — FR-44/GT-1: a project test with no spec scenario (headline reverse gap) ──
interface OrphanProjWorld extends F35World { orphanRepo?: string; orphans?: OrphanProjectTest[]; }
Given('a project test file with one id that has a spec scenario and one that does not', function (this: OrphanProjWorld) {
  // graph knows scenario FOO001_01 (node id SCEN-foo001-01-...); BAR002_03 has none.
  this.graph = makeGraph([{ id: 'demo:SCEN-foo001-01-covered', tags: ['@FR-1'], result: 'PASSED' }], []);
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-proj-'));
  fs.mkdirSync(path.join(repo, 'tests', 'e2e'), { recursive: true });
  fs.writeFileSync(
    path.join(repo, 'tests', 'e2e', 'demo.test.ts'),
    `it('FOO001_01: covered by a scenario', () => {});\nit('BAR002_03: described in no spec', () => {});\n`,
  );
  this.orphanRepo = repo;
});
When('the project-test reverse trace runs', function (this: OrphanProjWorld) {
  this.orphans = findOrphanProjectTests(this.graph!, this.orphanRepo!);
  fs.rmSync(this.orphanRepo!, { recursive: true, force: true });
});
Then('only the test id with no scenario is reported as an orphan project test', function (this: OrphanProjWorld) {
  const ids = this.orphans!.map((o) => o.testId);
  assert.deepEqual(ids, ['BAR002_03'], `expected only BAR002_03 orphan, got ${JSON.stringify(ids)}`);
  assert.equal(this.orphans![0].file, 'tests/e2e/demo.test.ts');
  assert.ok(this.orphans![0].line >= 1, 'orphan carries a 1-based line');
});

// ── SPECGEN004_142 — FR-35a producer: per-test verdicts → per-task (worst-wins) ──
interface ProducerWorld extends F35World { taskVerdicts?: Record<string, TestQualityVerdict>; }
Given('a task backed by a scenario with two graded tests one WEAK one FAKE-POSITIVE-RISK', function (this: ProducerWorld) {
  // task t-graded refs FR-1 → @feature1 scenario foo001-01; tests FOO001_01 + FOO001_02 grade it.
  // t-ungraded refs FR-9 → @feature9 scenario bar009-01 with NO graded test → must be absent.
  // prefix convention: ONE scenario `foo001` backed by sub-tests FOO001_01/_02 →
  // worst-wins applies across both sub-tests of the same scenario.
  this.graph = makeGraph(
    [
      { id: 'demo:SCEN-foo001-covered', tags: ['@feature1'], result: 'PASSED' },
      { id: 'demo:SCEN-bar009-untested', tags: ['@feature9'], result: 'PASSED' },
    ],
    [
      { id: 't-graded', status: 'done', refs: ['FR-1'], doneWhen: '' },
      { id: 't-ungraded', status: 'done', refs: ['FR-9'], doneWhen: '' },
    ],
  );
});
When('the test-quality producer joins the per-test verdicts', function (this: ProducerWorld) {
  this.taskVerdicts = mapTestVerdictsToTasks(this.graph!, { FOO001_01: 'WEAK', FOO001_02: 'FAKE-POSITIVE-RISK' });
});
Then('the task verdict is the worst of the two and a task with no graded test is absent', function (this: ProducerWorld) {
  assert.equal(this.taskVerdicts!['t-graded'], 'FAKE-POSITIVE-RISK', 'worst-wins: one fake-positive test drags the task down');
  assert.ok(!('t-ungraded' in this.taskVerdicts!), 'a task with no graded backing test gets no verdict (absent)');
});

// ── SPECGEN004_144 — FR-44/GT-2: FR citing no RESEARCH.md finding (reverse gap) ──
// Binds the REAL findFrsWithoutResearch over a tmp corpus: spec-with-research
// contributes its uncited FR (the citing one is clean); spec-without-research is
// skipped entirely (you cannot cite what does not exist).
interface ResearchWorld extends F35World { researchRepo?: string; frGaps?: Array<{ nodeId: string }>; }
Given('two specs where only one has a research file and each has an FR without a research citation', function (this: ResearchWorld) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-research-'));
  const mk = (slug: string, fr: string, withResearch: boolean): void => {
    const dir = path.join(repo, '.specs', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'FR.md'), fr);
    if (withResearch) fs.writeFileSync(path.join(dir, 'RESEARCH.md'), '# Research\n\n## Findings\n\n- finding one\n');
  };
  mk('with-research', '## FR-1\n\ngrounded — see [research](RESEARCH.md#findings).\n\n## FR-2\n\nno citation here.\n', true);
  mk('no-research', '## FR-1\n\nno citation and no research file either.\n', false);
  this.researchRepo = repo;
});
When('the FR-to-research reverse trace runs', async function (this: ResearchWorld) {
  const { findFrsWithoutResearch } = await import('../../tools/spec-graph/research-trace.ts');
  this.frGaps = findFrsWithoutResearch(this.researchRepo!);
  fs.rmSync(this.researchRepo!, { recursive: true, force: true });
});
Then('only the uncited FR of the spec with the research file is flagged and a citing FR is not', function (this: ResearchWorld) {
  const ids = this.frGaps!.map((g) => g.nodeId);
  assert.deepEqual(ids, ['with-research:FR-2'], `expected only with-research:FR-2, got ${JSON.stringify(ids)}`);
});

// ── SPECGEN004_145 — FR-44/GT-4: upstream artifacts wired to no requirement ──
// Binds the REAL findUnlinkedUpstream over a tmp corpus. Per kind: a linked and
// an unlinked sibling — only the unlinked ones flag; a decision grounded in
// RESEARCH.md (no FR) counts as linked.
interface UpstreamWorld extends F35World { upRepo?: string; upGaps?: Array<{ kind: string; nodeId: string }>; }
Given('a spec whose story and use-case and decision variously cite or omit a requirement', function (this: UpstreamWorld) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'upstream-'));
  const dir = path.join(repo, '.specs', 'demo');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'USER_STORIES.md'),
    '## User Story 1: linked\n\nrealized by FR-1.\n\n## User Story 2: unlinked\n\nno requirement cited.\n');
  fs.writeFileSync(path.join(dir, 'USE_CASES.md'),
    '## UC-1 linked\n\ncovers FR-2.\n\n## UC-2 unlinked\n\nnothing here.\n');
  fs.writeFileSync(path.join(dir, 'DESIGN.md'),
    '### Decision: research-grounded\n\nrests on RESEARCH.md#finding.\n\n### Decision: groundless\n\nneither requirement nor research.\n');
  this.upRepo = repo;
});
When('the upstream reverse trace runs', async function (this: UpstreamWorld) {
  const { findUnlinkedUpstream } = await import('../../tools/spec-graph/upstream-trace.ts');
  this.upGaps = findUnlinkedUpstream(this.upRepo!);
  fs.rmSync(this.upRepo!, { recursive: true, force: true });
});
Then('only the unlinked story use-case and research-less decision are flagged with their kinds', function (this: UpstreamWorld) {
  const got = this.upGaps!.map((g) => `${g.kind}|${g.nodeId}`).sort();
  assert.deepEqual(got, [
    'decision|demo:Decision: groundless',
    'story|demo:User Story 2: unlinked',
    'use-case|demo:UC-2 unlinked',
  ], `unexpected gap set: ${JSON.stringify(got)}`);
});
