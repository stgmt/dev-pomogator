import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { buildReadinessInventory, type ReadinessInventory } from '../../tools/spec-graph/readiness-inventory.ts';
import { localIdOf } from '../../tools/spec-graph/identity.ts';
import { parseNdjsonArtifactFile } from '../../tools/spec-graph/parsers/ndjson.ts';
import { analyzeGraphSnapshot, type SpecVerdictResult } from '../../tools/specs-generator/spec-verdict.ts';
import { specAccessLogPath } from '../../tools/spec-mcp-server/spec-access-log.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';

type Json = Record<string, unknown>;
type Tool = { name: string; handler: (args: never) => Promise<{ content?: Array<{ text?: string }> }> | { content?: Array<{ text?: string }> } };

interface Feature86World extends V4World {
  f86Root?: string;
  f86Verdict?: SpecVerdictResult;
  f86McpStatus?: Json;
  f86Inventory?: ReadinessInventory;
  f86AbsentInventory?: ReadinessInventory;
  f86StaleInventory?: ReadinessInventory;
  f86SuiteReceipt?: { state: string; reason: string | null; records: number; malformed: number };
  f86DeclaredRoot?: string;
  f86Contract?: {
    invalid: Json;
    staleProposal: Json;
    staleRefusal: Json;
    validProposal: Json;
    valid: Json;
    before: string;
    afterInvalid: string;
    concurrentContent: string;
    afterStaleRefusal: string;
    afterValid: string;
    fixtureLogPath: string;
    fixtureLog: string;
    externalLogPath: string;
    externalLogBefore: string | null;
    externalLogAfter: string | null;
  };
}

function parseToolResult(response: { content?: Array<{ text?: string }> }): Json {
  return JSON.parse(response.content?.[0]?.text ?? '{}') as Json;
}

function tool(registry: Tool[], name: string): Tool {
  const entry = registry.find((candidate) => candidate.name === name);
  assert.ok(entry, `MCP registry must expose ${name}`);
  return entry;
}

function validCliContract(): Json {
  return {
    version: 1,
    kind: 'cli',
    subject: 'demo contract proposal command',
    observables: [{ when: 'the command receives a valid request', then: 'it reports the proposed contract' }],
    negative_cases: [{ when: 'the contract is stale', then: 'it refuses without writing' }],
    verification: {
      method: 'integration',
      required_evidence: ['integration'],
      scenario: { pending: true, reason: 'scenario will be authored with implementation' },
      implementation_surface: { unknown: true, reason: 'implementation has not been selected' },
      evidence_policy: { source: 'planned', freshness: 'pending', independent: false },
    },
    command: { executable: 'dev-pomogator', args: ['propose-contract'] },
    input: [{ name: 'requirement', type: 'string', required: true }],
    output: { proposal_id: 'CAS-bound proposal identifier' },
    exit_codes: { '0': 'proposal created', '1': 'proposal refused' },
    errors: [{ code: 'CAS_MISMATCH', observable: 'no bytes are written' }],
  };
}

function stageSpec(world: Feature86World, slug: string): string {
  const root = world.tempDir;
  assert.ok(root && fs.existsSync(root), 'the Cucumber world must provide the only fixture root');
  const specDir = path.join(root, '.specs', slug);
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'FR.md'), '## FR-1: Evidence-backed readiness\n\n**Связанные AC:** [AC-1.1](ACCEPTANCE_CRITERIA.md#ac-11)\n\nThe system SHALL expose readiness evidence.\n', 'utf8');
  fs.writeFileSync(path.join(specDir, 'ACCEPTANCE_CRITERIA.md'), '## AC-1.1 (FR-1)\n\n**Требование:** [FR-1](FR.md#fr-1-evidence-backed-readiness)\n\nWHEN readiness is evaluated THEN the result SHALL be explicit.\n', 'utf8');
  fs.writeFileSync(path.join(specDir, 'USER_STORIES.md'), '### User Story 1: Readiness (Priority: P1)\n**Требование:** [FR-1](FR.md#fr-1-evidence-backed-readiness)\n\nAs a maintainer, I want readiness evidence.\n\n**Why:** keep delivery honest.\n\n**Independent Test:** @feature86.\n\n**Acceptance Scenarios:**\n\nGiven an evidence record\nWhen readiness is evaluated\nThen state is explicit\n', 'utf8');
  fs.writeFileSync(path.join(specDir, 'DESIGN.md'), '### Decision: Readiness evidence\n**Требование:** [FR-1](FR.md#fr-1-evidence-backed-readiness)\n\n**Rationale:** evidence must be explicit.\n**Trade-off:** requires artifact ingestion.\n**Alternatives considered:**\n- infer success\n- defer\n', 'utf8');
  fs.writeFileSync(path.join(specDir, 'TASKS.md'), '# Tasks\n\n## Phase 1\n\n- [x] Verify readiness — id: readiness-task — Status: DONE | Est: 15m\n  _Requirements: [FR-1](FR.md#fr-1-evidence-backed-readiness)_\n  **Done When:**\n  - [x] SPECGEN004_864 passes\n', 'utf8');
  fs.writeFileSync(path.join(specDir, `${slug}.feature`), '@feature86 @FR-1 @AC-1.1\nFeature: Evidence fixture\n\n  Scenario: SPECGEN004_864 fixture remains unrun\n    Given a canonical scenario\n    When no report exists\n    Then evidence remains honest\n', 'utf8');
  world.f86Root = root;
  return root;
}

function graphAt(root: string) {
  return buildGraph({ repoRoot: root });
}

function registryAt(root: string, declaredWorktree = root): Tool[] {
  return buildToolRegistry(() => graphAt(root), { repoRoot: root, declaredWorktree }) as Tool[];
}

Given('an isolated readiness fixture has a real graph and unrun canonical scenario', function (this: Feature86World) {
  stageSpec(this, 'readiness-demo');
});

When('the canonical verdict and MCP status are evaluated from that graph', async function (this: Feature86World) {
  const root = this.f86Root!;
  const graph = graphAt(root);
  this.f86Verdict = await analyzeGraphSnapshot('.specs/readiness-demo', graph, { cwd: root, semantic: false });
  this.f86McpStatus = parseToolResult(await tool(registryAt(root), 'get_spec_status').handler({ spec: 'readiness-demo', view: 'status' } as never));
});

Then('the canonical action groups completely and deterministically represent every blocking readiness lane', function (this: Feature86World) {
  const verdict = this.f86Verdict!;
  const mcp = this.f86McpStatus!;
  const mcpReadiness = mcp.readiness as Json;
  const blockingLanes = Object.entries(verdict.readiness.lanes)
    .filter(([, lane]) => lane.blocking)
    .map(([name]) => name)
    .sort();
  const actionLanes = verdict.readiness.action_center.map((group) => group.lane).sort();
  assert.equal(verdict.verdict, 'NOT_READY');
  assert.equal(verdict.readiness.overall, 'NOT_READY');
  assert.equal(mcp.verdict, verdict.verdict);
  assert.deepEqual(mcp.blocking, verdict.blocking);
  assert.deepEqual(mcpReadiness.overall, verdict.readiness.overall);
  assert.ok(blockingLanes.length > 0, 'the unrun fixture must have blocking readiness lanes');
  assert.deepEqual(actionLanes, blockingLanes, 'every and only blocking lane must receive one action group');
  assert.deepEqual(mcpReadiness.action_center, verdict.readiness.action_center);
  assert.equal(verdict.readiness.nextAction, verdict.readiness.action_center[0]!.action.message);
  assert.equal(mcpReadiness.next_action, verdict.readiness.action_center[0]!.action.message);
  for (const group of verdict.readiness.action_center) {
    assert.ok(group.count > 0, `${group.lane} must count affected atoms`);
    assert.ok(group.reasons.length > 0, `${group.lane} must explain its blocker`);
    assert.match(group.action.code, /^[A-Z_]+$/);
    assert.ok(group.action.message.length > 0, `${group.lane} must offer a remediation`);
  }
});
Given('an isolated evidence fixture contains untagged and implemented requirements', function (this: Feature86World) {
  const root = stageSpec(this, 'evidence-demo');
  const specDir = path.join(root, '.specs', 'evidence-demo');
  fs.writeFileSync(path.join(specDir, 'FR.md'), [
    '## FR-1: Evidence-backed readiness',
    '',
    '**Связанные AC:** [AC-1.1](ACCEPTANCE_CRITERIA.md#ac-11)',
    '',
    'The system SHALL expose readiness evidence.',
    '',
    '## FR-2: Untagged readiness debt',
    '',
    'The system SHALL retain requirements without a scenario as untagged.',
    '',
    '## FR-3: Implemented readiness debt',
    '',
    'The system SHALL distinguish an implementation from fresh proof.',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(specDir, 'TASKS.md'), [
    '# Tasks',
    '',
    '## Phase 1',
    '',
    '- [x] Verify readiness — id: evidence-task — Status: DONE | Est: 15m',
    '  _Requirements: [FR-1](FR.md#fr-1-evidence-backed-readiness)_',
    '  **Done When:**',
    '  - [x] SPECGEN004_864 passes',
    '- [x] Implement readiness only — id: implementation-task — Status: DONE | Est: 15m',
    '  _Requirements: [FR-3](FR.md#fr-3-implemented-readiness-debt)_',
    '  **Done When:**',
    '  - [x] implementation exists without a fresh scenario receipt',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(specDir, 'FILE_CHANGES.md'), [
    '# File Changes',
    '',
    '| Path | Action | Reason |',
    '| --- | --- | --- |',
    '| `tools/readiness-implementation.ts` | create | Implementation of FR-3 |',
    '',
  ].join('\n'), 'utf8');
  const implementation = path.join(root, 'tools', 'readiness-implementation.ts');
  fs.mkdirSync(path.dirname(implementation), { recursive: true });
  fs.writeFileSync(implementation, 'export const readinessImplementation = true;\n', 'utf8');
});

When('the real inventory classifies absent, suite-only, and producer-generated evidence before a stale weak-evidence projection', function (this: Feature86World) {
  const root = this.f86Root!;
  this.f86AbsentInventory = buildReadinessInventory(graphAt(root), { spec: 'evidence-demo' });

  const cucumberFixture = path.resolve(process.cwd(), 'tests/fixtures/ndjson/real-cucumber-sample.ndjson');
  const receiptRows = fs.readFileSync(cucumberFixture, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => {
      const envelope = JSON.parse(line) as { meta?: unknown; testRunStarted?: unknown; testRunFinished?: unknown };
      return envelope.meta !== undefined || envelope.testRunStarted !== undefined || envelope.testRunFinished !== undefined;
    });
  assert.equal(receiptRows.length, 3, 'the real Cucumber fixture must contain meta plus suite start/finish receipt envelopes');
  const receiptPath = path.join(root, '.dev-pomogator', 'suite-only.ndjson');
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, `${receiptRows.join('\n')}\n`, 'utf8');
  const receipt = parseNdjsonArtifactFile(receiptPath);
  this.f86SuiteReceipt = {
    state: receipt.state,
    reason: receipt.reason,
    records: receipt.patch.records,
    malformed: receipt.patch.malformed,
  };

  const fixtureRoot = path.resolve(process.cwd(), 'tests/fixtures/pytest-bdd-sample');
  const producerDir = path.join(root, '.specs', 'producer-demo');
  fs.mkdirSync(producerDir, { recursive: true });
  const producerFeature = `@FR-1\n${fs.readFileSync(path.join(fixtureRoot, 'features', 'issue_230.feature'), 'utf8')}`;
  fs.writeFileSync(path.join(producerDir, 'producer-demo.feature'), producerFeature, 'utf8');
  const reportPath = path.join(root, '.dev-pomogator', 'pytest-bdd-report.json');
  fs.copyFileSync(path.join(fixtureRoot, 'cucumber-report.json'), reportPath);
  const reportTime = new Date(Date.now() + 60_000);
  fs.utimesSync(reportPath, reportTime, reportTime);
  fs.writeFileSync(path.join(producerDir, 'FR.md'), '## FR-1: Producer-backed freshness\n\nThe system SHALL reject stale producer proof.\n', 'utf8');
  fs.writeFileSync(path.join(producerDir, 'TASKS.md'), '# Tasks\n\n## Phase 1\n\n- [x] Verify producer freshness — id: producer-task — Status: DONE | Est: 15m\n  _Requirements: [FR-1](FR.md#fr-1-producer-backed-freshness)_\n  **Done When:**\n  - [x] Executed scenario 01 passes\n', 'utf8');

  const freshGraph = graphAt(root);
  this.f86Inventory = buildReadinessInventory(freshGraph, { spec: 'producer-demo' });
  const producerTask = [...freshGraph.nodes.values()].find(
    (node) => node.type === 'Task' && node.spec === 'producer-demo' && node.refs.includes('producer-demo:FR-1'),
  );
  assert.ok(producerTask, 'the real task parser must qualify the evidence-owning task before quality projection');
  const producerFeaturePath = path.join(producerDir, 'producer-demo.feature');
  const staleTime = new Date(reportTime.getTime() + 60_000);
  fs.utimesSync(producerFeaturePath, staleTime, staleTime);
  const staleGraph = graphAt(root);
  this.f86StaleInventory = buildReadinessInventory(staleGraph, {
    spec: 'producer-demo',
    testQualityByTask: { [producerTask.id]: 'WEAK' },
  });
});

Then('per-FR evidence states, ingestion diagnostics, and producer provenance remain honest', function (this: Feature86World) {
  const absent = this.f86AbsentInventory!;
  const untagged = absent.frs.find((fr) => fr.id === 'FR-2');
  const implementationOnly = absent.frs.find((fr) => fr.id === 'FR-3');
  assert.equal(untagged?.evidence_state, 'untagged');
  assert.equal(implementationOnly?.evidence_state, 'impl-only');
  assert.equal(implementationOnly?.canonical_evidence_state, 'NOT_INGESTED');
  assert.ok(implementationOnly?.evidence_demotion_reasons.includes('CANONICAL_ARTIFACT_NOT_INGESTED'));

  assert.deepEqual(this.f86SuiteReceipt, {
    state: 'NOT_INGESTED',
    reason: 'MISSING_SCENARIO_RESULTS',
    records: 0,
    malformed: 0,
  });

  const fresh = this.f86Inventory!;
  const pytest = fresh.artifacts.find((artifact) => artifact.kind === 'pytest-bdd-cucumber-json');
  assert.deepEqual(pytest && {
    canonical: pytest.canonical,
    state: pytest.state,
    reason: pytest.reason,
    provenance: pytest.provenance,
    path: pytest.path,
    counts: pytest.counts,
  }, {
    canonical: true,
    state: 'INGESTED',
    reason: null,
    provenance: 'pytest-bdd:cucumber-json',
    path: '.dev-pomogator/pytest-bdd-report.json',
    counts: { parsed: 11, matched: 11, unmatched: 0, malformed: 0 },
  });
  assert.match(String(pytest?.run_id), /^pytest-bdd-\d+$/);
  assert.match(String(pytest?.timestamp), /^\d{4}-\d{2}-\d{2}T/);
  const freshFr = fresh.frs.find((fr) => fr.id === 'FR-1');
  assert.equal(freshFr?.evidence_state, 'exercised');
  assert.equal(freshFr?.canonical_evidence_state, 'PARTIAL');
  assert.equal(fresh.scenarios.filter((record) => record.outcome === 'not_recorded').length, 11);

  const staleWeak = this.f86StaleInventory!;
  const staleFr = staleWeak.frs.find((fr) => fr.id === 'FR-1');
  assert.equal(staleFr?.evidence_state, 'exercised');
  assert.equal(staleFr?.canonical_evidence_state, 'PARTIAL');
  assert.deepEqual(staleFr?.evidence_demotion_reasons, ['SCENARIO_NOT_RUN', 'STALE_EVIDENCE', 'TEST_QUALITY_WEAK']);
  const staleScenario = staleWeak.scenarios.find((record) => record.outcome === 'stale');
  assert.deepEqual(staleScenario && {
    result: staleScenario.result,
    source: staleScenario.source,
    recency: staleScenario.recency,
    provenance: staleScenario.provenance,
  }, {
    result: 'PASSED',
    source: 'pytest-bdd:cucumber-json',
    recency: { stale: true, canonical: true },
    provenance: 'pytest-bdd-report',
  });
});
Given('a valid spec document is rooted outside its declared worktree', function (this: Feature86World) {
  const root = stageSpec(this, 'demo');
  fs.writeFileSync(path.join(root, '.specs', 'demo', 'FR.md'), '## FR-1: Original\n', 'utf8');
  const declared = path.join(root, 'declared-worktree');
  fs.mkdirSync(declared);
  this.f86DeclaredRoot = declared;
});
When('the real MCP preflight and mutation boundary receive that mismatch', async function (this: Feature86World) {
  const root = this.f86Root!;
  const declared = this.f86DeclaredRoot!;
  const registry = registryAt(root, declared);
  const preflight = parseToolResult(await tool(registry, 'mcp_preflight').handler({} as never));
  const refused = parseToolResult(await tool(registry, 'apply_spec_change').handler({ spec: 'demo', doc: 'FR.md', content: '## FR-1: Changed\n', reason: 'BDD root admission' } as never));
  this.f86RootRefusal = { preflight, refused, content: fs.readFileSync(path.join(root, '.specs', 'demo', 'FR.md'), 'utf8'), lockExists: fs.existsSync(path.join(root, '.dev-pomogator')) };
});

Then('preflight redacts identities and the mismatch refuses before any document lock or audit write', function (this: Feature86World) {
  const result = this.f86RootRefusal!;
  const preflight = result.preflight as Json;
  const worktree = preflight.worktree as Json;
  assert.equal(preflight.ok, true);
  assert.equal(worktree.matches_resolved_root, false);
  assert.match(String((preflight.resolved_root as Json).id), /^[a-f0-9]{16}$/);
  assert.equal((result.refused as Json).error, 'ROOT_WORKTREE_MISMATCH');
  assert.equal(result.content, '## FR-1: Original\n');
  assert.equal(result.lockExists, false);
});

Given('a guided contract fixture exposes the real proposal and atomic apply doors', function (this: Feature86World) {
  stageSpec(this, 'demo');
  fs.writeFileSync(path.join(this.f86Root!, '.specs', 'demo', 'FR.md'), '## FR-1: Guided proposal\n\nThe CLI proposes a contract.\n', 'utf8');
});

When('an invalid card and then a valid CLI card are proposed and applied through the real MCP registry', async function (this: Feature86World) {
  const root = this.f86Root!;
  const frPath = path.join(root, '.specs', 'demo', 'FR.md');
  const before = fs.readFileSync(frPath, 'utf8');
  const externalLogPath = specAccessLogPath(process.cwd());
  const externalLogBefore = fs.existsSync(externalLogPath) ? fs.readFileSync(externalLogPath, 'utf8') : null;
  const registry = registryAt(root);
  const proposalTool = tool(registry, 'propose_requirement_contract');
  const invalid = parseToolResult(await proposalTool.handler({ spec: 'demo', requirement: 'FR-1', contract: { kind: 'cli' } } as never));
  const afterInvalid = fs.readFileSync(frPath, 'utf8');
  const staleProposal = parseToolResult(await proposalTool.handler({ spec: 'demo', requirement: 'FR-1', contract: validCliContract() } as never));
  assert.equal(staleProposal.ok, true, 'a real valid contract must mint the proposal that will become stale');
  const concurrentContent = afterInvalid.replace(
    'The CLI proposes a contract.',
    'The CLI proposes a refreshed contract.',
  );
  assert.notEqual(concurrentContent, afterInvalid, 'concurrent edit must preserve a valid FR while changing its SHA');
  fs.writeFileSync(frPath, concurrentContent, 'utf8');
  const staleRefusal = parseToolResult(await tool(registry, 'apply_proposed_patch').handler({
    proposal_id: staleProposal.proposal_id,
    reason: 'refuse stale guided contract',
  } as never));
  const afterStaleRefusal = fs.readFileSync(frPath, 'utf8');
  const validProposal = parseToolResult(await proposalTool.handler({ spec: 'demo', requirement: 'FR-1', contract: validCliContract() } as never));
  assert.equal(validProposal.ok, true, 'a fresh real contract must mint a replacement proposal');
  const applied = parseToolResult(await tool(registry, 'apply_proposed_patch').handler({
    proposal_id: validProposal.proposal_id,
    reason: 'apply fresh guided contract',
  } as never));
  const fixtureLogPath = specAccessLogPath(root);
  assert.ok(fs.existsSync(fixtureLogPath), 'registry access audit must stay inside its fixture root');
  this.f86Contract = {
    invalid,
    staleProposal,
    staleRefusal,
    validProposal,
    valid: applied,
    before,
    afterInvalid,
    concurrentContent,
    afterStaleRefusal,
    afterValid: fs.readFileSync(frPath, 'utf8'),
    fixtureLogPath,
    fixtureLog: fs.readFileSync(fixtureLogPath, 'utf8'),
    externalLogPath,
    externalLogBefore,
    externalLogAfter: fs.existsSync(externalLogPath) ? fs.readFileSync(externalLogPath, 'utf8') : null,
  };
});

Then('guided proposal payloads are exact, invalid or stale proposals write zero target spec document bytes and create no proposal or state mutation, while the required append-only spec-access audit entry remains permitted', function (this: Feature86World) {
  const contract = this.f86Contract!;
  assert.equal(contract.invalid.ok, false);
  assert.equal(contract.invalid.error, 'FR_METADATA_INVALID');
  assert.deepEqual(contract.invalid.required_fields, [
    'version', 'kind', 'subject', 'observables', 'negative_cases', 'verification',
    'command.executable', 'command.args', 'input', 'output', 'exit_codes', 'errors',
  ]);
  assert.deepEqual(contract.invalid.missing_fields, [
    'contract.version', 'contract.subject', 'contract.observables', 'contract.negative_cases',
    'contract.verification', 'contract.command', 'contract.input', 'contract.output',
    'contract.exit_codes', 'contract.errors',
  ]);
  const cli = (contract.invalid.kind_candidates as Json[]).find((candidate) => candidate.kind === 'cli');
  assert.deepEqual(cli, { kind: 'cli', score: 1, signals: ['cli'] });
  const graph = graphAt(this.f86Root!);
  const expectedEvidence = {
    requirement: { title: 'Guided proposal', line: 1, has_metadata: false },
    acceptance_criteria: [...graph.nodes.values()]
      .filter((node) => node.type === 'AC' && node.spec === 'demo')
      .map((node) => localIdOf(node.id))
      .sort(),
    tasks: [...graph.nodes.values()]
      .filter((node) => node.type === 'Task' && node.spec === 'demo' && node.refs.includes('demo:FR-1'))
      .map((node) => localIdOf(node.id))
      .sort(),
    scenarios: [...graph.nodes.values()]
      .filter((node) => node.type === 'Scenario' && node.spec === 'demo' && node.tags.includes('@FR-1'))
      .map((node) => node.id)
      .sort(),
  };
  assert.deepEqual(contract.invalid.evidence, expectedEvidence);
  assert.deepEqual(contract.invalid.provenance, {
    resolved_root: { id: createHash('sha256').update(path.resolve(this.f86Root!)).digest('hex').slice(0, 16) },
    worktree: { id: createHash('sha256').update(path.resolve(this.f86Root!)).digest('hex').slice(0, 16) },
    document_sha: createHash('sha256').update(contract.before).digest('hex'),
  });
  assert.equal(contract.invalid.proposal_id, undefined);
  assert.equal(contract.afterInvalid, contract.before);
  assert.equal(contract.staleProposal.ok, true);
  assert.equal(contract.staleRefusal.ok, false);
  assert.ok(['CAS_MISMATCH', 'VALIDATION_FAILED'].includes(String(contract.staleRefusal.error)));
  assert.ok(
    ((contract.staleRefusal.edits as Array<{ error?: string }> | undefined) ?? [])
      .some((edit) => edit.error === 'CAS_MISMATCH'),
    'the stale proposal must expose its CAS mismatch in the per-edit findings',
  );
  assert.equal(contract.afterStaleRefusal, contract.concurrentContent);
  assert.equal(contract.valid.ok, true);
  assert.equal(contract.valid.written, true);
  const preview = contract.validProposal.preview as Json;
  assert.equal(preview.requirement_section, contract.afterValid);
  assert.equal(preview.metadata_block, `\`\`\`yaml metadata\n${preview.metadata_yaml}\n\`\`\``);
  assert.match(String(preview.metadata_yaml), /^schemaVersion: 1\nrisks: \[\]\ndemands: \[\]\ncontract:/);
  assert.deepEqual(contract.fixtureLog.split('\n').filter(Boolean).map((line) => {
    const event = JSON.parse(line) as Json;
    return { tool: event.tool, decision: event.decision };
  }), [
    { tool: 'propose_requirement_contract', decision: 'denied' },
    { tool: 'propose_requirement_contract', decision: 'ok' },
    { tool: 'apply_proposed_patch', decision: 'denied' },
    { tool: 'propose_requirement_contract', decision: 'ok' },
    { tool: 'apply_proposed_patch', decision: 'ok' },
  ]);
  assert.equal(contract.externalLogAfter, contract.externalLogBefore, `fixture registry must not write ${contract.externalLogPath}`);
  assert.equal(path.dirname(path.dirname(path.dirname(contract.fixtureLogPath))), this.f86Root);
});
