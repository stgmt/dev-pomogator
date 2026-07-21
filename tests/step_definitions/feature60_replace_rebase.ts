/**
 * @feature60 step definitions — FR-60 P33-2 EOL-tolerant replace + diagnostics + CAS auto-rebase.
 *
 * Drives SPECGEN004_522 (replacement diagnostics distinguish EOL / whitespace /
 * multi-match / changed-body / missing-anchor misses) and SPECGEN004_524 (anchor-
 * targeted CAS mismatch auto-rebases only non-conflicting changes) against the REAL
 * `replace_in_section` MCP tool handler — the very registry `server.ts` boots
 * (`buildToolRegistry`) — over isolated CRLF corpora. No mocks, no re-implementation:
 * a diagnosed miss must leave the doc byte-identical, `normalize_eol:true` must accept
 * a CRLF/LF-only mismatch while the persisted file keeps CRLF, and a stale whole-doc
 * sha must rebase a non-conflicting change yet refuse a real conflict with fresh anchor
 * context. If the production code regresses, these assertions fail (no fake-green).
 *
 * REGEX steps (not cucumber-expressions) per the FR-60 authoring convention — literal
 * parens/slashes in sibling scenarios need escaping (the `CRLF\/LF` slash below), so
 * this file stays RegExp-consistent.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_522 / SPECGEN004_524
 * @see .specs/spec-generator-v4/TASKS.md p33-replace-diagnostics-rebase (Phase 33, P33-2)
 * @see tools/spec-mcp-server/section-ops.ts (replaceInSectionContent / applyReplaceChange)
 * @see tools/spec-mcp-server/tools.ts (replace_in_section)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';
import { locateSection, sectionSha } from '../../tools/spec-mcp-server/section-ops.ts';
import { docSha } from '../../tools/spec-mcp-server/mutations.ts';
import '../hooks/before-after.ts';

/** The stable Phase heading the scenarios target (matched by text OR its slug). */
const HEADING = 'Phase 1 — Demo';
/** Two-section CRLF corpus: Phase 1 is the target anchor; Phase 2 is "outside" text. */
const ROADMAP = '# Roadmap\n\n## Phase 1 — Demo\n\n- existing item one\n- existing item two\n\n## Phase 2 — Later\n\n- later item\n';

/** The JSON envelope the `replace_in_section` tool returns (parsed from content[0].text). */
interface ReplaceToolReply {
  ok?: boolean;
  error?: string;
  rebased?: boolean;
  normalized?: boolean;
  eol_style?: string;
  diagnostic?: { kind?: string; hint?: string; occurrences?: number };
  available_anchors?: string[];
  sha?: string;
  section_sha?: string | null;
  findings?: unknown[];
}

interface F60RWorld extends V4World {
  specSlug?: string;
  docRel?: string;
  docAbs?: string;
  origBytes?: string;
  // SPECGEN004_522
  diags?: Record<string, ReplaceToolReply>;
  afterDiagsState?: string;
  acceptPayload?: ReplaceToolReply;
  acceptState?: string;
  // SPECGEN004_524
  expectedSha?: string;
  secSha?: string;
  rebase?: ReplaceToolReply;
  rebaseState?: string;
  conflict?: ReplaceToolReply;
  conflictState?: string;
}

/** Build a CRLF document — the "known EOL style" the scenarios pin. */
function toCrlf(s: string): string {
  return s.replace(/\n/g, '\r\n');
}

/**
 * Drive the REAL `replace_in_section` MCP tool over the scenario's isolated corpus.
 * The door resolves `.specs/` against `process.cwd()`, so we chdir into the temp
 * workspace for the call and ALWAYS restore it. Building the registry per call mirrors
 * the P33-1 step-defs; no `refreshGraph` is wired, so a successful write does not
 * rebuild the graph (the read-only handlers never call getGraph here).
 */
async function callReplace(world: F60RWorld, args: Record<string, unknown>): Promise<ReplaceToolReply> {
  const prev = process.cwd();
  process.chdir(world.tempDir);
  try {
    const tools = buildToolRegistry(() => buildGraph({ repoRoot: world.tempDir, skipNdjson: true }));
    const tool = tools.find((t) => t.name === 'replace_in_section') as
      | { handler: (a: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }
      | undefined;
    assert.ok(tool, 'replace_in_section must be registered in the MCP tool registry (FR-60 P33-2)');
    const res = await tool!.handler(args);
    return JSON.parse(res.content[0].text) as ReplaceToolReply;
  } finally {
    process.chdir(prev);
  }
}

/** Create the two-section CRLF corpus + a minimal FR.md so the graph gates have a graph. */
function seedCorpus(world: F60RWorld, slug: string): void {
  const dir = path.join(world.tempDir, '.specs', slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'FR.md'), toCrlf('## FR-1: Demo\n\nBody.\n'));
  const roadmap = toCrlf(ROADMAP);
  const docAbs = path.join(dir, 'ROADMAP.md');
  fs.writeFileSync(docAbs, roadmap);
  world.specSlug = slug;
  world.docRel = 'ROADMAP.md';
  world.docAbs = docAbs;
  world.origBytes = roadmap;
}

// ─── SPECGEN004_522 — replacement diagnostics ─────────────────────────────────

Given(/^an MCP literal replacement fails to find old_string in a spec document$/, function (this: F60RWorld) {
  seedCorpus(this, 'fr60-replace-diag');
});

When(/^the server analyzes the failed replacement$/, async function (this: F60RWorld) {
  const call = (args: Record<string, unknown>): Promise<ReplaceToolReply> =>
    callReplace(this, { spec: this.specSlug, doc: this.docRel, ...args });
  // Five distinct miss shapes, one per diagnostic class — each a literal replacement
  // the door cannot apply as-is against the CRLF corpus.
  this.diags = {
    // doc is CRLF, old_string is LF → matches only after EOL normalization
    eol: await call({ heading: HEADING, old_string: '- existing item one\n- existing item two', new_string: '- replaced' }),
    // spacing differs → matches only after whitespace normalization
    ws: await call({ heading: HEADING, old_string: '- existing  item one', new_string: '- replaced' }),
    // substring of both body items → not unique within the section
    multi: await call({ heading: HEADING, old_string: '- existing item', new_string: '- replaced' }),
    // anchor resolves but the text is gone → body changed under the same anchor
    changed: await call({ heading: HEADING, old_string: '- item removed by another session', new_string: '- replaced' }),
    // no such heading → missing anchor
    missing: await call({ heading: 'Phase 9 — Ghost', old_string: '- existing item one', new_string: '- replaced' }),
  };
  this.afterDiagsState = fs.readFileSync(this.docAbs!, 'utf-8');
});

Then(/^the response classifies the miss as EOL-only, whitespace-only, multi-match, changed body under the same anchor, or missing anchor$/, function (this: F60RWorld) {
  const d = this.diags!;
  assert.equal(d.eol.diagnostic?.kind, 'eol_only', `EOL mismatch must diagnose eol_only, got ${JSON.stringify(d.eol.diagnostic)}`);
  assert.equal(d.ws.diagnostic?.kind, 'whitespace_only', `whitespace mismatch must diagnose whitespace_only, got ${JSON.stringify(d.ws.diagnostic)}`);
  assert.equal(d.multi.diagnostic?.kind, 'multi_match', `a non-unique old_string must diagnose multi_match, got ${JSON.stringify(d.multi.diagnostic)}`);
  assert.equal(d.multi.diagnostic?.occurrences, 2, 'multi_match reports the occurrence count');
  assert.equal(d.changed.diagnostic?.kind, 'changed_body', `a gone old_string under a live anchor must diagnose changed_body, got ${JSON.stringify(d.changed.diagnostic)}`);
  assert.equal(d.missing.diagnostic?.kind, 'missing_anchor', `an unresolved heading must diagnose missing_anchor, got ${JSON.stringify(d.missing.diagnostic)}`);
  // Each miss is REFUSED with an ACTIONABLE hint (not a generic error) and writes nothing.
  for (const [name, reply] of Object.entries(d)) {
    assert.equal(reply.ok, false, `${name} must be refused`);
    assert.ok(typeof reply.diagnostic?.hint === 'string' && reply.diagnostic!.hint.length > 0, `${name} carries an actionable next-operation hint`);
  }
  // The five classes are DISTINCT — the whole point of the diagnostics.
  const kinds = new Set(Object.values(d).map((r) => r.diagnostic?.kind));
  assert.equal(kinds.size, 5, `five distinct diagnostic classes, got ${[...kinds].join(',')}`);
  // missing_anchor hands back the live anchors so the caller can re-target.
  assert.ok(Array.isArray(d.missing.available_anchors) && d.missing.available_anchors!.includes('phase-1-demo'), 'missing_anchor returns the live anchor list');
  // A diagnosed miss leaves the document byte-identical (validation-before-write, no partial write).
  assert.equal(this.afterDiagsState, this.origBytes, 'a diagnosed miss leaves the document byte-identical');
});

Then(/^with normalize_eol true a CRLF\/LF-only mismatch is accepted while the persisted file keeps its original EOL style$/, async function (this: F60RWorld) {
  this.acceptPayload = await callReplace(this, {
    spec: this.specSlug, doc: this.docRel, heading: HEADING,
    old_string: '- existing item one\n- existing item two', new_string: '- rebound item one\n- rebound item two',
    normalize_eol: true,
  });
  this.acceptState = fs.readFileSync(this.docAbs!, 'utf-8');
  const p = this.acceptPayload!;
  assert.equal(p.ok, true, `normalize_eol must accept the CRLF/LF-only mismatch; diagnostic=${JSON.stringify(p.diagnostic)} findings=${JSON.stringify(p.findings)}`);
  assert.equal(p.normalized, true, 'the response flags that EOL normalization bridged the match');
  assert.equal(p.eol_style, 'crlf', 'the document EOL is still detected as CRLF');
  const s = this.acceptState!;
  assert.ok(s.includes('\r\n'), 'the persisted file keeps CRLF separators');
  assert.ok(!/[^\r]\n/.test(s), 'the persisted file has NO bare LF — the original EOL is preserved');
  assert.ok(s.includes('- rebound item one'), 'the replacement landed on disk');
});

// ─── SPECGEN004_524 — CAS auto-rebase of non-conflicting changes ──────────────

Given(/^an anchor-targeted MCP mutation was prepared from an older document sha$/, function (this: F60RWorld) {
  seedCorpus(this, 'fr60-replace-rebase');
  // The "older document sha" the mutation was prepared from + the section precondition
  // (the section_sha a read_for_edit would have handed back at prep time).
  this.expectedSha = docSha(this.origBytes!);
  const loc = locateSection(this.origBytes!.split(/\r\n|\n/), HEADING);
  this.secSha = sectionSha(this.origBytes!, loc)!;
  assert.ok(this.secSha, 'the prepared section sha must resolve');
});

When(/^another session has changed unrelated text outside the target anchor$/, async function (this: F60RWorld) {
  // Simulate a concurrent session editing OUTSIDE the target anchor (Phase 2): the
  // whole-doc sha moves, but the Phase 1 section the mutation targets is untouched.
  const concurrent = this.origBytes!.replace('- later item', '- later item\r\n- concurrent outside edit');
  fs.writeFileSync(this.docAbs!, concurrent);
  this.rebase = await callReplace(this, {
    spec: this.specSlug, doc: this.docRel, heading: HEADING,
    old_string: '- existing item one', new_string: '- rebound item one',
    expected_sha: this.expectedSha, expected_section_sha: this.secSha,
  });
  this.rebaseState = fs.readFileSync(this.docAbs!, 'utf-8');
});

Then(/^the mutation auto-rebases and applies against the fresh document$/, function (this: F60RWorld) {
  const r = this.rebase!;
  assert.equal(r.ok, true, `a non-conflicting CAS mismatch must auto-rebase; error=${r.error} diagnostic=${JSON.stringify(r.diagnostic)} findings=${JSON.stringify(r.findings)}`);
  assert.equal(r.rebased, true, 'the response flags the auto-rebase over the concurrent edit');
  const s = this.rebaseState!;
  assert.ok(s.includes('- rebound item one'), 'the anchor-targeted change applied against the fresh document');
  assert.ok(s.includes('- concurrent outside edit'), 'the unrelated outside change is preserved by the rebase');
});

Then(/^when the target anchor body or preconditions changed the server refuses with fresh anchor context for the caller$/, async function (this: F60RWorld) {
  // Reset, then simulate a concurrent session editing INSIDE the target anchor: the
  // Phase 1 body the mutation was prepared from is gone (body AND section precondition changed).
  fs.writeFileSync(this.docAbs!, this.origBytes!);
  const concurrent = this.origBytes!.replace('- existing item one', '- concurrent rewrote item one');
  fs.writeFileSync(this.docAbs!, concurrent);
  this.conflict = await callReplace(this, {
    spec: this.specSlug, doc: this.docRel, heading: HEADING,
    old_string: '- existing item one', new_string: '- rebound item one',
    expected_sha: this.expectedSha, expected_section_sha: this.secSha,
  });
  this.conflictState = fs.readFileSync(this.docAbs!, 'utf-8');
  const c = this.conflict!;
  assert.equal(c.ok, false, 'a conflicting CAS mismatch must be refused, never a silent last-write-wins');
  assert.equal(c.error, 'CAS_CONFLICT', `the refusal is CAS_CONFLICT, got ${c.error}`);
  assert.equal(c.diagnostic?.kind, 'changed_body', `the conflict is diagnosed as a changed body under the same anchor, got ${JSON.stringify(c.diagnostic)}`);
  // Fresh anchor context so the caller can rebase by hand: live anchors + fresh shas.
  assert.ok(Array.isArray(c.available_anchors) && c.available_anchors!.length > 0 && c.available_anchors!.includes('phase-1-demo'), 'fresh anchor context: the live anchor list is returned');
  assert.ok(typeof c.sha === 'string' && c.sha !== this.expectedSha, 'fresh anchor context: the fresh whole-doc sha is returned');
  assert.ok(typeof c.section_sha === 'string' && c.section_sha !== this.secSha, 'fresh anchor context: the fresh section_sha is returned');
  const s = this.conflictState!;
  assert.ok(s.includes('- concurrent rewrote item one'), 'the concurrent change is NOT overwritten');
  assert.ok(!s.includes('- rebound item one'), 'our mutation is NOT applied on a conflict');
});
