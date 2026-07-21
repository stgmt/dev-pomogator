/**
 * @feature60 step definitions — FR-60 P33-4 domain authoring helpers + feature safety.
 *
 * Drives SPECGEN004_525 (domain helpers render canonical traceable markdown and enforce
 * feature safety) against the REAL `register_incident_backlog` / `amend_requirement` /
 * `add_acceptance_criterion` / `add_backlog_task` MCP tool handlers — the very registry
 * `server.ts` boots (`buildToolRegistry`) — over an isolated CRLF corpus. No mocks, no
 * re-implementation:
 *   - the rendered TASKS blocks must satisfy the REAL form contract parser
 *     (`parseTaskBlocks` — missingFirst === null) and the REAL graph task parser
 *     (`parseTasks` — task refs carry FR-1);
 *   - the FR↔AC↔TASK traceability must exist in the REAL graph (`buildGraph`): the
 *     FR-1→AC-1.1 covers edge (from the canonical short-form AC block) + the task refs,
 *     and the FR/AC cross-links must use the exact live-heading Marksman anchors
 *     (`marksmanSlug` — the single source of truth the anchor layer resolves);
 *   - ids must be unique: re-adding the same task id is REFUSED (DUPLICATE_ID) and the
 *     doc keeps exactly one occurrence;
 *   - an executable .feature scenario whose steps have NO real step-definition is REFUSED
 *     (STEP_DEFS_MISSING, the doc left byte-identical), tasks_only:true DOWNGRADES to a
 *     TASKS-only acceptance pin (no scenario), and once matching REGEX step-defs exist the
 *     SAME scenario plants through — so the safety check is a real matcher, not a blanket
 *     refusal. If the production helpers regress, these assertions fail (no fake-green).
 *
 * REGEX steps (not cucumber-expressions) per the FR-60 authoring convention — this file
 * stays RegExp-consistent with its P33-1..P33-3 siblings.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_525
 * @see .specs/spec-generator-v4/TASKS.md p33-domain-authoring-helpers (Phase 33, P33-4)
 * @see tools/spec-mcp-server/domain-authoring.ts (the five helpers + checkStepSafety)
 * @see tools/spec-mcp-server/tools.ts (add_backlog_task / add_phase / amend_requirement / add_acceptance_criterion / register_incident_backlog)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';
import { parseTaskBlocks } from '../../tools/specs-validator/spec-form-parsers.ts';
import { parseTasks } from '../../tools/spec-graph/parsers/tasks.ts';
import { marksmanSlug } from '../../tools/anchor-integrity/marksman-slug.mjs';
import '../hooks/before-after.ts';

const SLUG = 'fr60-domain';

/** The scenario's corpus (LF source → written CRLF — the EOL the helpers must preserve). */
const DOCS: Record<string, string> = {
  'FR.md': '# Functional Requirements\n\n## FR-1: Demo requirement\n\nBody of FR-1.\n',
  'ACCEPTANCE_CRITERIA.md': '# Acceptance Criteria\n\nNo criteria yet.\n',
  'TASKS.md': '# Tasks\n\n## Phase 1: Demo\n\n- [ ] P1-1: Existing demo task — id: p1-existing — Status: DONE | Est: 60m\n  **Done When:**\n  - [x] demo done\n',
  'FILE_CHANGES.md': '# File Changes\n\nNo changes yet.\n',
  'fr60-domain.feature': 'Feature: FR-60 domain authoring demo\n\n  Scenario: DEMO_001 a demo scenario\n    Given a demo precondition\n    When a demo action\n    Then a demo outcome\n',
};

/** The feature-scenario steps the safety gate must match against real step-defs. */
const FEATURE = {
  scenario_id: 'F60D_525',
  title: 'domain incident backlog renders a canonical traced task',
  steps: [
    'Given a domain incident is captured in a CRLF corpus',
    'When the backlog helper renders it as a canonical task',
    'Then the task block keeps FR traceability',
  ],
};

/** REGEX step-defs that match FEATURE.steps — planted to prove the matcher ACCEPTS. */
const MATCHING_STEP_DEFS = [
  "import { Given, When, Then } from '@cucumber/cucumber';",
  'Given(/^a domain incident is captured in a CRLF corpus$/, function () {});',
  'When(/^the backlog helper renders it as a canonical task$/, function () {});',
  'Then(/^the task block keeps FR traceability$/, function () {});',
  '',
].join('\n');

interface DomainReply {
  ok?: boolean;
  error?: string;
  hint?: string;
  downgraded?: string;
  missing_steps?: string[];
  ids?: string[];
  rendered?: Record<string, string>;
  findings?: unknown[];
}

interface F60DWorld extends V4World {
  specSlug?: string;
  docAbs?: Record<string, string>;
  incidentPayload?: DomainReply;
  amendPayload?: DomainReply;
  acPayload?: DomainReply;
  taskPayload?: DomainReply;
  dupPayload?: DomainReply;
  refusedPayload?: DomainReply;
  pinPayload?: DomainReply;
  plantedPayload?: DomainReply;
  featureBytesBeforeRefuse?: string;
  featureBytesAfterRefuse?: string;
  featureBytesAfterPin?: string;
}

/** Build a CRLF document — the "known EOL style" the helpers must preserve. */
function toCrlf(s: string): string {
  return s.replace(/\n/g, '\r\n');
}

/**
 * Drive a REAL FR-60 P33-4 MCP tool over the scenario's isolated corpus. The door resolves
 * `.specs/` against `process.cwd()`, so we chdir into the temp workspace for the call and
 * ALWAYS restore it. Building the registry per call mirrors the sibling P33-1..3 step-defs.
 */
async function callTool(world: F60DWorld, name: string, args: Record<string, unknown>): Promise<DomainReply> {
  const prev = process.cwd();
  process.chdir(world.tempDir);
  try {
    const tools = buildToolRegistry(() => buildGraph({ repoRoot: world.tempDir, skipNdjson: true }));
    const tool = tools.find((t) => t.name === name) as
      | { handler: (a: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }
      | undefined;
    assert.ok(tool, `${name} must be registered in the MCP tool registry (FR-60 P33-4)`);
    const res = await tool!.handler(args);
    return JSON.parse(res.content[0].text) as DomainReply;
  } finally {
    process.chdir(prev);
  }
}

Given(/^an agent registers incident-driven backlog or amends a requirement through a domain helper$/, function (this: F60DWorld) {
  const dir = path.join(this.tempDir, '.specs', SLUG);
  fs.mkdirSync(dir, { recursive: true });
  const docAbs: Record<string, string> = {};
  for (const [name, content] of Object.entries(DOCS)) {
    const abs = path.join(dir, name);
    fs.writeFileSync(abs, toCrlf(content));
    docAbs[name] = abs;
  }
  this.specSlug = SLUG;
  this.docAbs = docAbs;
  // No step-defs exist in this corpus yet — the feature-safety gate must see an empty set.
  assert.ok(!fs.existsSync(path.join(this.tempDir, 'tests', 'step_definitions')), 'the corpus starts with NO step-defs (the refusal baseline)');
});

When(/^the helper renders FR, AC, TASK, and optional feature changes$/, async function (this: F60DWorld) {
  // (1) incident-driven backlog — the Given's "registers incident-driven backlog".
  this.incidentPayload = await callTool(this, 'register_incident_backlog', {
    spec: SLUG, summary: 'CAS storm on CRLF docs', date: '2026-07-09', requirements: ['FR-1'],
    reason: 'SPECGEN004_525 incident backlog',
  });
  // (2) …or amends a requirement — the Given's alternative, body append.
  this.amendPayload = await callTool(this, 'amend_requirement', {
    spec: SLUG, fr: 'FR-1', text: '- Amended through the domain helper (SPECGEN004_525).',
    reason: 'SPECGEN004_525 amend',
  });
  // (3) the AC leg of FR→AC→TASK — canonical short-form AC block + FR-side link.
  this.acPayload = await callTool(this, 'add_acceptance_criterion', {
    spec: SLUG, fr: 'FR-1', title: 'Domain helpers render canonical markdown',
    body: 'When a domain helper renders FR, AC, or TASK content, the block satisfies the form contracts and keeps FR to AC to TASK traceability links.',
    reason: 'SPECGEN004_525 add AC',
  });
  // (4) the TASK leg — a canonical, FR-traced task under the phase.
  this.taskPayload = await callTool(this, 'add_backlog_task', {
    spec: SLUG, phase: 'Phase 1: Demo', title: 'Ship domain authoring helpers', id: 'p33-4-helper-task',
    requirements: ['FR-1'], done_when: ['domain helpers render canonical markdown', 'feature safety enforced'],
    reason: 'SPECGEN004_525 add task',
  });
  // (5) the feature-safety probes — REFUSAL (no step-defs), then the explicit DOWNGRADE.
  this.featureBytesBeforeRefuse = fs.readFileSync(this.docAbs!['fr60-domain.feature'], 'utf-8');
  this.refusedPayload = await callTool(this, 'add_backlog_task', {
    spec: SLUG, phase: 'Phase 1: Demo', title: 'task with an orphan scenario', id: 'p33-4-orphan-task',
    requirements: ['FR-1'], feature: FEATURE,
    reason: 'SPECGEN004_525 feature refusal probe',
  });
  this.featureBytesAfterRefuse = fs.readFileSync(this.docAbs!['fr60-domain.feature'], 'utf-8');
  this.pinPayload = await callTool(this, 'add_backlog_task', {
    spec: SLUG, phase: 'Phase 1: Demo', title: 'task with an acceptance pin', id: 'p33-4-pin-task',
    requirements: ['FR-1'], feature: FEATURE, tasks_only: true,
    reason: 'SPECGEN004_525 tasks_only downgrade probe',
  });
  this.featureBytesAfterPin = fs.readFileSync(this.docAbs!['fr60-domain.feature'], 'utf-8');
});

Then(/^the generated markdown follows the canonical form contracts and keeps FR to AC to TASK traceability links$/, function (this: F60DWorld) {
  // Every domain call applied.
  for (const [name, p] of Object.entries({ incident: this.incidentPayload, amend: this.amendPayload, ac: this.acPayload, task: this.taskPayload })) {
    assert.equal(p?.ok, true, `${name} helper must apply cleanly; findings=${JSON.stringify(p?.findings)} hint=${p?.hint}`);
  }
  const tasksAfter = fs.readFileSync(this.docAbs!['TASKS.md'], 'utf-8');
  const frAfter = fs.readFileSync(this.docAbs!['FR.md'], 'utf-8');
  const acAfter = fs.readFileSync(this.docAbs!['ACCEPTANCE_CRITERIA.md'], 'utf-8');

  // CANONICAL FORM — the REAL form-contract parser: no rendered task block may miss a field.
  const blocks = parseTaskBlocks(tasksAfter);
  assert.ok(blocks.length >= 3, `TASKS.md carries the pre-existing + new task blocks, got ${blocks.length}`);
  for (const b of blocks) {
    assert.equal(b.missingFirst, null, `task "${b.title}" must satisfy the canonical form contract (missing: ${b.missingFirst})`);
  }
  // EOL PRESERVED — the CRLF corpus stays fully CRLF after every helper write.
  assert.ok(!tasksAfter.replace(/\r\n/g, '').includes('\n'), 'TASKS.md keeps its CRLF EOL (no bare LF smuggled in)');
  assert.ok(!frAfter.replace(/\r\n/g, '').includes('\n'), 'FR.md keeps its CRLF EOL');

  // FR→TASK trace — the REAL graph task parser sees the new task with its FR-1 ref.
  const taskNodes = parseTasks(tasksAfter, `.specs/${SLUG}/TASKS.md`);
  const helperTask = taskNodes.find((t) => t.id === 'p33-4-helper-task');
  assert.ok(helperTask, 'the p33-4-helper-task node is parsed from the rendered block');
  assert.ok(helperTask!.refs.includes('FR-1'), `the rendered task traces to FR-1, got refs ${JSON.stringify(helperTask!.refs)}`);
  const incidentTask = taskNodes.find((t) => t.id.startsWith('incident-2026-07-09'));
  assert.ok(incidentTask, 'the incident backlog task is parsed from the rendered block');
  assert.ok(incidentTask!.refs.includes('FR-1'), 'the incident task traces to FR-1');

  // FR→AC trace — the REAL graph builder: the covers edge comes from the canonical AC block.
  const graph = buildGraph({ repoRoot: this.tempDir, skipNdjson: true });
  const covers = graph.edges.find((e) => e.from === `${SLUG}:FR-1` && e.to === `${SLUG}:AC-1.1` && e.type === 'covers');
  assert.ok(covers, `the graph carries the FR-1→AC-1.1 covers edge (FR→AC traceability)`);
  assert.ok(acAfter.includes('## AC-1.1'), 'the AC block uses the canonical short-form heading');
  const frAnchor = marksmanSlug('FR-1: Demo requirement');
  assert.ok(acAfter.includes(`**Требование:** [FR-1](FR.md#${frAnchor})`), `the AC block links FR-1 by its exact live-heading anchor (#${frAnchor})`);
  const acAnchor = marksmanSlug('AC-1.1');
  assert.ok(frAfter.includes(`[AC-1.1](ACCEPTANCE_CRITERIA.md#${acAnchor})`), `FR.md links the AC by its exact live-heading anchor (#${acAnchor})`);
  assert.ok(frAfter.includes('- Amended through the domain helper (SPECGEN004_525).'), 'the amend text landed in the FR-1 section');
});

Then(/^ids are unique within the affected spec documents$/, async function (this: F60DWorld) {
  // Re-adding the SAME task id is refused — ids must stay unique within TASKS.md.
  this.dupPayload = await callTool(this, 'add_backlog_task', {
    spec: SLUG, phase: 'Phase 1: Demo', title: 'duplicate id probe', id: 'p33-4-helper-task',
    requirements: ['FR-1'],
    reason: 'SPECGEN004_525 duplicate id probe',
  });
  assert.equal(this.dupPayload.ok, false, 're-adding an existing task id must be refused');
  assert.equal(this.dupPayload.error, 'DUPLICATE_ID', `the refusal names DUPLICATE_ID, got ${this.dupPayload.error}`);
  const tasksAfter = fs.readFileSync(this.docAbs!['TASKS.md'], 'utf-8');
  const occurrences = tasksAfter.split('id: p33-4-helper-task').length - 1;
  assert.equal(occurrences, 1, `exactly ONE task carries id p33-4-helper-task, got ${occurrences}`);
});

Then(/^executable feature scenarios are refused unless matching step-definition work is included or the caller explicitly selects a TASKS-only acceptance pin$/, async function (this: F60DWorld) {
  // REFUSED — the scenario's steps had no real step-definition, and the .feature is untouched.
  const r = this.refusedPayload!;
  assert.equal(r.ok, false, 'a scenario with step-def-less steps must be refused');
  assert.equal(r.error, 'STEP_DEFS_MISSING', `the refusal names STEP_DEFS_MISSING, got ${r.error}`);
  assert.equal(r.missing_steps?.length, 3, `all three steps are reported missing, got ${JSON.stringify(r.missing_steps)}`);
  assert.equal(this.featureBytesAfterRefuse, this.featureBytesBeforeRefuse, 'the refused scenario left the .feature byte-identical');
  assert.ok(!this.featureBytesAfterRefuse.includes('F60D_525'), 'no orphan scenario was planted');

  // DOWNGRADED — tasks_only:true plants a TASKS-only acceptance pin, still no scenario.
  const pin = this.pinPayload!;
  assert.equal(pin.ok, true, `the explicit tasks_only downgrade applies; findings=${JSON.stringify(pin.findings)}`);
  assert.equal(pin.downgraded, 'tasks_only', 'the reply reports the tasks_only downgrade');
  assert.equal(this.featureBytesAfterPin, this.featureBytesBeforeRefuse, 'the downgrade plants NO scenario');
  const tasksAfterPin = fs.readFileSync(this.docAbs!['TASKS.md'], 'utf-8');
  assert.ok(tasksAfterPin.includes('acceptance pin: F60D_525'), 'the downgraded task carries the acceptance pin in its Done-When');

  // INCLUDED — once matching REGEX step-defs exist, the SAME scenario plants through.
  const stepDefsDir = path.join(this.tempDir, 'tests', 'step_definitions');
  fs.mkdirSync(stepDefsDir, { recursive: true });
  fs.writeFileSync(path.join(stepDefsDir, 'fr60_domain_demo.ts'), MATCHING_STEP_DEFS);
  this.plantedPayload = await callTool(this, 'add_backlog_task', {
    spec: SLUG, phase: 'Phase 1: Demo', title: 'task with a real scenario', id: 'p33-4-feat-task',
    requirements: ['FR-1'], feature: FEATURE,
    reason: 'SPECGEN004_525 scenario with step-defs',
  });
  assert.equal(this.plantedPayload.ok, true, `with matching step-defs the scenario applies; hint=${this.plantedPayload.hint}`);
  const featureAfterPlant = fs.readFileSync(this.docAbs!['fr60-domain.feature'], 'utf-8');
  assert.ok(featureAfterPlant.includes('Scenario: F60D_525'), 'the scenario landed in the .feature');
  assert.ok(featureAfterPlant.includes('@feature1'), 'the planted scenario is tagged to its FR (@feature1)');
  assert.ok(featureAfterPlant.includes('Given a domain incident is captured in a CRLF corpus'), 'the planted scenario carries its real steps');
});
