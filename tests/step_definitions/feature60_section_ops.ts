/**
 * @feature60 step definitions — FR-60a/e high-level MCP authoring API (P33-1).
 *
 * Drives SPECGEN004_520 (section-targeted append preserves validation and EOL
 * style) against the REAL `append_to_section` MCP tool handler — the very
 * registry `server.ts` boots (`buildToolRegistry`) — over an isolated CRLF
 * corpus. No mocks, no re-implementation: the operation must resolve a STABLE
 * heading anchor (no exact old_string), PRESERVE the document's CRLF EOL, and
 * run the existing form/anchor/conformance validation-before-write — proven by
 * refusing an anchor-breaking append and leaving the doc byte-identical.
 *
 * REGEX steps (not cucumber-expressions) per the FR-60 authoring convention —
 * literal parens/slashes in sibling scenarios need escaping, so this file stays
 * RegExp-consistent.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_520
 * @see .specs/spec-generator-v4/TASKS.md p33-anchor-section-ops (Phase 33, P33-1)
 * @see tools/spec-mcp-server/section-ops.ts (applySectionChange / readForEdit)
 * @see tools/spec-mcp-server/tools.ts (append_to_section / insert_after_heading / insert_at_eof)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';
import { marksmanSlug } from '../../tools/anchor-integrity/marksman-slug.mjs';
import '../hooks/before-after.ts';

/** The stable Phase heading the scenario targets (matched by text OR its slug). */
const HEADING = 'Phase 1 — Demo';
/** Plain item appended by the clean proposal (no links → passes the anchor gate). */
const APPENDED = '- appended via stable heading anchor';

interface F60World extends V4World {
  prevCwd?: string;
  specSlug?: string;
  docRel?: string;
  docAbs?: string;
  origBytes?: string;
  cleanState?: string;
  afterDirtyState?: string;
  cleanPayload?: Record<string, unknown>;
  dirtyPayload?: Record<string, unknown>;
}

/** Build a CRLF document — the "known EOL style" the scenario pins. */
function toCrlf(s: string): string {
  return s.replace(/\n/g, '\r\n');
}

Given(/^a spec document has an existing Phase heading and a known EOL style$/, function (this: F60World) {
  const slug = 'fr60-section-ops';
  const dir = path.join(this.tempDir, '.specs', slug);
  fs.mkdirSync(dir, { recursive: true });
  // A minimal graph doc so the form/anchor/conformance gates have a real graph to run over.
  fs.writeFileSync(path.join(dir, 'FR.md'), toCrlf('## FR-1: Demo\n\nBody.\n'));
  // The target doc: CRLF ("known EOL style") with a stable Phase heading to address.
  const roadmap = toCrlf('# Roadmap\n\n## Phase 1 — Demo\n\n- existing item\n\n## Phase 2 — Later\n\n- later item\n');
  const docAbs = path.join(dir, 'ROADMAP.md');
  fs.writeFileSync(docAbs, roadmap);
  this.specSlug = slug;
  this.docRel = 'ROADMAP.md';
  this.docAbs = docAbs;
  this.origBytes = roadmap;
  this.prevCwd = process.cwd();
  process.chdir(this.tempDir); // the door's handlers resolve .specs/ against cwd
});

When(/^an agent proposes an MCP append_to_section operation targeting that Phase heading$/, async function (this: F60World) {
  try {
    const tools = buildToolRegistry(() => buildGraph({ repoRoot: this.tempDir, skipNdjson: true }));
    const append = tools.find((t) => t.name === 'append_to_section');
    assert.ok(append, 'append_to_section must be registered in the MCP tool registry (FR-60a)');
    const call = async (text: string): Promise<Record<string, unknown>> => {
      const res = await append!.handler({ spec: this.specSlug, doc: this.docRel, heading: HEADING, text });
      return JSON.parse((res as { content: Array<{ text: string }> }).content[0].text);
    };
    // (a) the clean proposal the scenario describes — address the section by its
    //     stable heading (NO old_string), append a plain item.
    this.cleanPayload = await call(APPENDED);
    this.cleanState = fs.readFileSync(this.docAbs!, 'utf-8');
    // (b) a validation-violating proposal (a brand-new broken anchor) to prove the
    //     form/anchor/conformance checks gate the write BEFORE it touches disk.
    this.dirtyPayload = await call('- [bad](FR.md#zzz-not-real-999)');
    this.afterDirtyState = fs.readFileSync(this.docAbs!, 'utf-8');
  } finally {
    process.chdir(this.prevCwd!);
  }
});

Then(/^the proposal resolves the stable heading anchor without requiring an exact old_string$/, function (this: F60World) {
  const p = this.cleanPayload!;
  assert.equal(p.ok, true, `clean append must succeed; findings=${JSON.stringify(p.findings)}`);
  assert.equal(p.resolved, true, 'the heading anchor must resolve from a heading reference (no old_string)');
  // The resolved anchor is the Marksman slug of the heading — computed for the caller.
  assert.equal(p.heading_anchor, marksmanSlug(HEADING), 'resolved anchor === the heading Marksman slug');
  assert.equal(typeof p.preview, 'string', 'a preview of the resulting document is returned');
});

Then(/^the preview preserves the document EOL style$/, function (this: F60World) {
  const p = this.cleanPayload!;
  const preview = String(p.preview);
  assert.equal(p.eol_style, 'crlf', 'the document EOL is detected as CRLF');
  assert.ok(preview.includes('\r\n'), 'the preview keeps CRLF separators');
  assert.ok(!/[^\r]\n/.test(preview), 'the preview introduces NO bare LF into the CRLF document');
  assert.ok(preview.includes(APPENDED), 'the appended text is present in the preview');
});

Then(/^the same form, anchor, and conformance checks run before any write is applied$/, function (this: F60World) {
  // The clean proposal passed validation and WAS written...
  assert.notEqual(this.cleanState, this.origBytes, 'a clean proposal is written to disk');
  assert.ok(this.cleanState!.includes(APPENDED), 'the clean append landed on disk');
  assert.deepEqual(this.cleanPayload!.findings, [], 'a clean proposal reports no findings');
  // ...but a proposal that breaks an anchor is REFUSED with findings and leaves the
  // doc byte-identical — i.e. the same checks ran BEFORE any write was applied.
  const d = this.dirtyPayload!;
  assert.equal(d.ok, false, 'an anchor-breaking append must be refused');
  assert.ok(Array.isArray(d.findings) && (d.findings as unknown[]).length > 0, 'the refusal carries the finding(s) that blocked it');
  assert.equal(this.afterDirtyState, this.cleanState, 'a refused proposal must NOT touch the document');
});
