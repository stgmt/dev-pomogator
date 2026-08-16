/**
 * @feature60 step definitions — FR-60 P33-3 multi-document proposal + atomic transaction.
 *
 * Drives SPECGEN004_523 (multi-document proposal previews graph impact and applies
 * atomically) against the REAL `propose_patch` / `apply_spec_transaction` MCP tool
 * handlers — the very registry `server.ts` boots (`buildToolRegistry`) — over an isolated
 * CRLF corpus spanning FR.md + ACCEPTANCE_CRITERIA.md + TASKS.md + the .feature +
 * FILE_CHANGES.md. No mocks, no re-implementation: the proposal must preview the resolved
 * anchors, a diff, the affected graph nodes, the conformance/form findings, the resulting
 * shas + a proposal_id; the apply must write ALL documents or NONE (a single failed edit
 * leaves every doc byte-identical — no partial write); and the audit log must record the
 * transaction as ONE event (not one per doc). If the production code regresses, these
 * assertions fail (no fake-green).
 *
 * REGEX steps (not cucumber-expressions) per the FR-60 authoring convention — the literal
 * dots in the scenario's doc names need escaping, so this file stays RegExp-consistent.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_523
 * @see .specs/spec-generator-v4/TASKS.md p33-proposal-transaction (Phase 33, P33-3)
 * @see tools/spec-mcp-server/section-ops.ts (proposePatch / applySpecTransactionCore / applyProposedPatch)
 * @see tools/spec-mcp-server/tools.ts (propose_patch / apply_spec_transaction / apply_proposed_patch)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';
import { specAccessLogPath } from '../../tools/spec-mcp-server/spec-access-log.ts';
import { applySpecTransactionCore } from '../../tools/spec-mcp-server/section-ops.ts';
import { writeDocAtomic } from '../../tools/spec-mcp-server/mutations.ts';
import '../hooks/before-after.ts';

const SLUG = 'fr60-txn';

/** The five docs the scenario spans (LF source → written CRLF, the "known EOL" the txn preserves). */
const DOCS: Record<string, string> = {
  'FR.md': '# Functional Requirements\n\n## FR-1: Demo requirement\n\nBody of FR-1.\n',
  'ACCEPTANCE_CRITERIA.md': '# Acceptance Criteria\n\n## AC-1.1: Demo acceptance\n\n- AC body line.\n',
  'TASKS.md': '# Tasks\n\n## Phase 1: Demo\n\n- [ ] P1-1: Demo task — id: p1-demo — Status: TODO | Est: 60m\n  **Done When:**\n  - [ ] demo done\n',
  'FILE_CHANGES.md': '# File Changes\n\nNo changes yet.\n',
  'fr60-txn.feature': 'Feature: FR-60 transaction demo\n\n  Scenario: DEMO_001 a demo scenario\n    Given a demo precondition\n    When a demo action\n    Then a demo outcome\n',
};

/** The clean multi-document patch: one section edit per doc, all validation-clean. */
const CLEAN_EDITS = [
  {
    spec: SLUG,
    doc: 'FR.md',
    section: {
      kind: 'append_to_section',
      heading: 'FR-1: Demo requirement',
      text: '- transaction touched FR-1\n\n### Transaction FR proof\n\n[Mutual AC target](ACCEPTANCE_CRITERIA.md#transaction-ac-proof)',
    },
  },
  {
    spec: SLUG,
    doc: 'ACCEPTANCE_CRITERIA.md',
    section: {
      kind: 'append_to_section',
      heading: 'AC-1.1: Demo acceptance',
      text: '- transaction touched AC-1.1\n\n### Transaction AC proof\n\n[Mutual FR target](FR.md#transaction-fr-proof)',
    },
  },
  { spec: SLUG, doc: 'TASKS.md', section: { kind: 'insert_at_eof', text: '- transaction touched TASKS' } },
  { spec: SLUG, doc: 'fr60-txn.feature', section: { kind: 'insert_at_eof', text: '# touched by transaction' } },
  { spec: SLUG, doc: 'FILE_CHANGES.md', section: { kind: 'insert_at_eof', text: '- transaction touched FILE_CHANGES' } },
];

/** The rollback patch: the FR.md edit breaks an anchor (validation fails) → NOTHING may write. */
const BAD_EDITS = [
  { spec: SLUG, doc: 'FR.md', section: { kind: 'append_to_section', heading: 'FR-1: Demo requirement', text: '- [bad](FR.md#zzz-not-real-999)' } },
  { spec: SLUG, doc: 'ACCEPTANCE_CRITERIA.md', section: { kind: 'append_to_section', heading: 'AC-1.1: Demo acceptance', text: '- BAD TXN touched AC' } },
  { spec: SLUG, doc: 'TASKS.md', section: { kind: 'insert_at_eof', text: '- BAD TXN touched TASKS' } },
  { spec: SLUG, doc: 'fr60-txn.feature', section: { kind: 'insert_at_eof', text: '# BAD TXN touched feature' } },
  { spec: SLUG, doc: 'FILE_CHANGES.md', section: { kind: 'insert_at_eof', text: '- BAD TXN touched FILE_CHANGES' } },
];

interface EditPreview {
  doc: string;
  ok?: boolean;
  heading_anchor?: string | null;
  sha?: string | null;
  append_token?: string;
  insert_token?: string;
  diff?: { added: string[]; removed: string[] };
  findings?: unknown[];
  error?: string;
}
interface TxnReply {
  ok?: boolean;
  written?: boolean;
  error?: string;
  proposal_id?: string;
  affected_nodes?: string[];
  findings?: unknown[];
  shas?: Record<string, string>;
  edits?: EditPreview[];
}

interface F60TWorld extends V4World {
  specSlug?: string;
  docAbs?: Record<string, string>;
  origBytes?: Record<string, string>;
  successBytes?: Record<string, string>;
  rollbackBytes?: Record<string, string>;
  proposePayload?: TxnReply;
  txnPayload?: TxnReply;
  rollbackPayload?: TxnReply;
  destructivePayload?: TxnReply;
  ioFailurePayload?: TxnReply;
  ioRollbackBytes?: Record<string, string>;
}

/** Build a CRLF document — the "known EOL style" the transaction must preserve. */
function toCrlf(s: string): string {
  return s.replace(/\n/g, '\r\n');
}

/**
 * Drive a REAL FR-60 P33-3 MCP tool over the scenario's isolated corpus. The door resolves
 * `.specs/` against `process.cwd()`, so we chdir into the temp workspace for the call and ALWAYS
 * restore it. Building the registry per call mirrors the sibling P33-1/P33-2 step-defs.
 */
async function callTool(world: F60TWorld, name: string, args: Record<string, unknown>): Promise<TxnReply> {
  const prev = process.cwd();
  process.chdir(world.tempDir);
  try {
    const tools = buildToolRegistry(() => buildGraph({ repoRoot: world.tempDir, skipNdjson: true }));
    const tool = tools.find((t) => t.name === name) as
      | { handler: (a: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }
      | undefined;
    assert.ok(tool, `${name} must be registered in the MCP tool registry (FR-60 P33-3)`);
    const res = await tool!.handler(args);
    return JSON.parse(res.content[0].text) as TxnReply;
  } finally {
    process.chdir(prev);
  }
}

function readDocs(world: F60TWorld): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, abs] of Object.entries(world.docAbs!)) out[name] = fs.readFileSync(abs, 'utf-8');
  return out;
}

Given(/^a proposed spec change spans FR\.md, ACCEPTANCE_CRITERIA\.md, TASKS\.md, the feature file, and FILE_CHANGES\.md$/, function (this: F60TWorld) {
  const dir = path.join(this.tempDir, '.specs', SLUG);
  fs.mkdirSync(dir, { recursive: true });
  const docAbs: Record<string, string> = {};
  const origBytes: Record<string, string> = {};
  for (const [name, content] of Object.entries(DOCS)) {
    const crlf = toCrlf(content);
    const abs = path.join(dir, name);
    fs.writeFileSync(abs, crlf);
    docAbs[name] = abs;
    origBytes[name] = crlf;
  }
  this.specSlug = SLUG;
  this.docAbs = docAbs;
  this.origBytes = origBytes;
});

When(/^the agent calls propose_patch and then apply_spec_transaction$/, async function (this: F60TWorld) {
  // (1) the dry-run preview the scenario names.
  this.proposePayload = await callTool(this, 'propose_patch', { edits: CLEAN_EDITS, reason: 'SPECGEN004_523 preview' });
  // (2) the all-or-nothing apply of the SAME clean patch.
  this.txnPayload = await callTool(this, 'apply_spec_transaction', { edits: CLEAN_EDITS, reason: 'SPECGEN004_523 apply' });
  this.successBytes = readDocs(this);
  // (3) a patch whose FR.md edit breaks an anchor — the atomicity probe (must write NOTHING).
  this.rollbackPayload = await callTool(this, 'apply_spec_transaction', { edits: BAD_EDITS, reason: 'SPECGEN004_523 rollback probe' });
  this.rollbackBytes = readDocs(this);

  // (4) Full-document replacement with empty content must retain the single-document
  // destructive-write guard even though the batch validator stages the whole graph.
  this.destructivePayload = await callTool(this, 'apply_spec_transaction', {
    edits: [{ spec: SLUG, doc: 'FR.md', content: '' }],
    reason: 'SPECGEN004_523 destructive replace parity probe',
  });

  // (5) A real first write followed by a deterministic second-write I/O failure must
  // restore the first document. The injected writer delegates every non-failing call
  // to the production atomic writer, including rollback; only call #2 throws.
  let writeCall = 0;
  this.ioFailurePayload = applySpecTransactionCore(this.tempDir, [
    { spec: SLUG, doc: 'FR.md', section: { kind: 'append_to_section', heading: 'FR-1: Demo requirement', text: '- IO FAILURE MUST ROLLBACK FR' } },
    { spec: SLUG, doc: 'ACCEPTANCE_CRITERIA.md', section: { kind: 'append_to_section', heading: 'AC-1.1: Demo acceptance', text: '- IO FAILURE MUST ROLLBACK AC' } },
  ], {
    writeDocument: (repoRoot, spec, doc, content) => {
      writeCall += 1;
      if (writeCall === 2) throw new Error('synthetic second-write I/O failure');
      return writeDocAtomic(repoRoot, spec, doc, content);
    },
  });
  this.ioRollbackBytes = readDocs(this);
});

Then(/^the preview includes anchors found, a diff, affected graph nodes, conformance findings, resulting shas, and a proposal_id$/, function (this: F60TWorld) {
  const p = this.proposePayload!;
  assert.equal(p.ok, true, `the clean proposal must validate; findings=${JSON.stringify(p.findings)}`);
  // proposal_id — the handle apply_proposed_patch replays.
  assert.equal(typeof p.proposal_id, 'string', 'the preview mints a proposal_id');
  assert.ok((p.proposal_id as string).length > 0, 'proposal_id is non-empty');
  // affected graph nodes — the union of nodes defined across the target docs.
  assert.ok(Array.isArray(p.affected_nodes) && p.affected_nodes!.length > 0, 'the preview lists the affected graph nodes');
  assert.ok(p.affected_nodes!.some((id) => id.includes('FR-1')), 'the FR.md FR-1 node is among the affected nodes');
  // conformance/form findings — empty for a clean patch (an array either way).
  assert.deepEqual(p.findings, [], 'a clean proposal reports no findings');
  // per-edit: anchors found + a diff + resulting sha/tokens.
  const edits = p.edits!;
  assert.equal(edits.length, 5, 'one preview per document in the patch');
  for (const e of edits) {
    assert.equal(e.ok, true, `edit ${e.doc} validates clean`);
    assert.equal(typeof e.sha, 'string', `edit ${e.doc} carries the resulting whole-doc sha`);
    assert.ok(e.diff && Array.isArray(e.diff.added) && e.diff.added.length > 0, `edit ${e.doc} carries a diff with the added line(s)`);
    assert.deepEqual(e.findings, [], `edit ${e.doc} has no findings`);
    assert.ok(typeof e.append_token === 'string' && typeof e.insert_token === 'string', `edit ${e.doc} carries append/insert section tokens`);
  }
  // anchors FOUND — the two section-targeted edits resolved their stable heading anchors.
  const fr = edits.find((e) => e.doc === 'FR.md')!;
  assert.equal(fr.heading_anchor, 'fr-1-demo-requirement', 'the FR.md edit resolves its heading anchor (no exact old_string)');
  const ac = edits.find((e) => e.doc === 'ACCEPTANCE_CRITERIA.md')!;
  assert.equal(ac.heading_anchor, 'ac-11-demo-acceptance', 'the AC edit resolves its heading anchor');
  assert.ok(fr.diff!.added.includes('- transaction touched FR-1'), 'the FR.md diff shows the appended line');
});

Then(/^applying the proposal writes all documents atomically or leaves every document unchanged$/, function (this: F60TWorld) {
  const t = this.txnPayload!;
  // ALL — the clean patch wrote every one of the five documents.
  assert.equal(t.ok, true, `the clean transaction applies; findings=${JSON.stringify(t.findings)}`);
  assert.equal(t.written, true, 'the transaction reports it wrote');
  assert.equal(Object.keys(t.shas ?? {}).length, 5, 'a resulting sha is returned for every written doc');
  for (const name of Object.keys(DOCS)) {
    assert.notEqual(this.successBytes![name], this.origBytes![name], `${name} was written by the clean transaction`);
  }
  assert.ok(this.successBytes!['FR.md'].includes('- transaction touched FR-1'), 'the FR.md edit landed');
  assert.ok(this.successBytes!['FR.md'].includes('ACCEPTANCE_CRITERIA.md#transaction-ac-proof'), 'the FR-to-AC staged link landed');
  assert.ok(this.successBytes!['ACCEPTANCE_CRITERIA.md'].includes('FR.md#transaction-fr-proof'), 'the AC-to-FR staged link landed');
  assert.ok(this.successBytes!['fr60-txn.feature'].includes('# touched by transaction'), 'the .feature edit landed');
  // …OR NONE — the patch with one invalid edit wrote NOTHING (every doc byte-identical).
  const r = this.rollbackPayload!;
  assert.equal(r.ok, false, 'a patch with one invalid edit must be refused');
  assert.equal(r.error, 'VALIDATION_FAILED', `the refusal is a validation failure, got ${r.error}`);
  const frEdit = r.edits!.find((e) => e.doc === 'FR.md')!;
  assert.ok(Array.isArray(frEdit.findings) && frEdit.findings!.length > 0, 'the FR.md edit carries the finding(s) that blocked the patch');
  // The ATOMICITY invariant: the failed patch left EVERY document unchanged (no partial write) —
  // neither the broken FR.md edit nor the otherwise-valid edits 2-5 were applied.
  assert.deepEqual(this.rollbackBytes, this.successBytes, 'a refused transaction leaves EVERY document byte-identical');
  for (const content of Object.values(this.rollbackBytes!)) {
    assert.ok(!content.includes('BAD TXN'), 'no edit from the refused transaction leaked to disk');
  }

  const destructive = this.destructivePayload!;
  assert.equal(destructive.ok, false, 'an empty whole-document replacement must be refused in a batch');
  assert.equal(destructive.error, 'VALIDATION_FAILED');
  assert.ok(JSON.stringify(destructive.findings).includes('refusing to replace a non-empty document with empty content'));
  assert.deepEqual(readDocs(this), this.successBytes, 'the destructive replacement leaves every document unchanged');

  const ioFailure = this.ioFailurePayload!;
  assert.equal(ioFailure.ok, false, 'a second-write I/O failure must fail the transaction');
  assert.equal(ioFailure.error, 'WRITE_FAILED');
  assert.deepEqual(this.ioRollbackBytes, this.successBytes, 'a later I/O failure rolls back every earlier document byte-for-byte');
  for (const content of Object.values(this.ioRollbackBytes!)) {
    assert.ok(!content.includes('IO FAILURE MUST ROLLBACK'), 'no partially written transaction content survives rollback');
  }
});

Then(/^the audit log records the transaction as one conceptual spec mutation$/, function (this: F60TWorld) {
  // The audit trail is ONE event per transaction call — not one per document. The successful
  // 5-doc write is a single `apply_spec_transaction` ok line (its digest covers the whole edit set).
  const logFile = specAccessLogPath(this.tempDir);
  assert.ok(fs.existsSync(logFile), 'the spec-access audit log exists');
  const events = fs.readFileSync(logFile, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { tool: string; decision: string });
  const txnOk = events.filter((e) => e.tool === 'apply_spec_transaction' && e.decision === 'ok');
  const txnAll = events.filter((e) => e.tool === 'apply_spec_transaction');
  assert.equal(txnOk.length, 1, `exactly ONE audit event for the successful 5-doc transaction, got ${txnOk.length}`);
  assert.equal(txnAll.length, 3, 'each call is one event (3 total: 1 ok + 2 denied)');
  assert.ok(events.some((e) => e.tool === 'propose_patch'), 'the dry-run propose is audited too');
});

Then(
  /^the active create-spec workflow exposes and routes cross-document bootstrap through all transaction tools$/,
  function (this: F60TWorld) {
    const registryNames = new Set(buildToolRegistry(() => buildGraph({ repoRoot: this.tempDir, skipNdjson: true })).map((tool) => tool.name));
    const required = ['propose_patch', 'apply_proposed_patch', 'apply_spec_transaction'];
    for (const name of required) assert.ok(registryNames.has(name), `${name} must be exposed by the real MCP registry`);

    const skill = fs.readFileSync(path.resolve('.claude/skills/create-spec/SKILL.md'), 'utf-8');
    const frontmatter = skill.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
    for (const name of required) {
      assert.match(frontmatter, new RegExp(`mcp__dev-pomogator-specs__${name}\\b`), `${name} must be callable by the active create-spec skill`);
      assert.match(skill, new RegExp(`\\|[^\\n]*${name}[^\\n]*\\|`), `${name} must be documented in the active create-spec routing table`);
    }
    assert.match(skill, /fresh (?:spec )?bootstrap|fresh scaffold/i, 'fresh bootstrap must route to a multi-document transaction');
    assert.match(skill, /FR[^\n]*(?:Story|USER_STORIES)[^\n]*(?:Design|DESIGN)[^\n]*(?:AC|ACCEPTANCE_CRITERIA)/i, 'mutually-dependent FR/story/design/AC edits must be named');
    assert.match(skill, /apply_spec_transaction/i);
  },
);
