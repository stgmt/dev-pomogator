/**
 * @feature60 step definitions — FR-60e read-for-edit metadata + safe insertion tokens (P33-1 wiring).
 *
 * Drives SPECGEN004_521 (read_for_edit returns section metadata and safe insertion tokens)
 * against the REAL `read_spec_doc(read_for_edit:true)` MCP handler — the very registry
 * `server.ts` boots (`buildToolRegistry`) — over an isolated CRLF corpus. The handler is
 * already implemented (P33-1); this WIRING proves it returns eol_style, heading_anchor,
 * section_sha, start_line/end_line, and append/insert tokens, and — the point of the tokens —
 * that a follow-up insert keyed off the returned token re-targets the SAME section by its
 * stable ANCHOR even after unrelated text shifts the line numbers elsewhere in the doc. No
 * mocks, no re-implementation: if readForEdit regresses (drops a field, or the token stops
 * carrying the anchor), these assertions fail (no fake-green).
 *
 * REGEX steps (not cucumber-expressions) per the FR-60 authoring convention — this file stays
 * RegExp-consistent with its siblings.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_521
 * @see .specs/spec-generator-v4/TASKS.md p33-anchor-section-ops (Phase 33, P33-1 — read_for_edit leg)
 * @see tools/spec-mcp-server/section-ops.ts (readForEdit / parseSectionToken)
 * @see tools/spec-mcp-server/tools.ts (read_spec_doc read_for_edit:true / append_to_section)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';
import { parseSectionToken } from '../../tools/spec-mcp-server/section-ops.ts';
import '../hooks/before-after.ts';

const SLUG = 'fr60-read-edit';
/** The stable Phase heading the read targets (matched by text OR its slug). */
const HEADING = 'Phase 1 — Demo';
const HEADING_ANCHOR = 'phase-1-demo';
/** Two-section CRLF corpus: Phase 1 is the read target; Phase 2 is "elsewhere" text. */
const ROADMAP = '# Roadmap\n\n## Phase 1 — Demo\n\n- existing item one\n- existing item two\n\n## Phase 2 — Later\n\n- later item\n';
/** Text the follow-up (token-keyed) insert appends to the Phase 1 section. */
const INSERTED = '- inserted via token';

interface ReadForEditReply {
  ok?: boolean;
  mode?: string;
  eol_style?: string;
  heading_anchor?: string | null;
  section_sha?: string | null;
  start_line?: number | null;
  end_line?: number | null;
  append_token?: string;
  insert_token?: string;
  sha?: string;
}

interface F60REWorld extends V4World {
  specSlug?: string;
  docRel?: string;
  docAbs?: string;
  readPayload?: ReadForEditReply;
  appendPayload?: Record<string, unknown>;
  finalContent?: string;
}

/** Build a CRLF document — the "known EOL style" the metadata must report. */
function toCrlf(s: string): string {
  return s.replace(/\n/g, '\r\n');
}

/** Drive a REAL MCP tool over the isolated corpus (chdir in, always restore). */
async function callTool(world: F60REWorld, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const prev = process.cwd();
  process.chdir(world.tempDir);
  try {
    const tools = buildToolRegistry(() => buildGraph({ repoRoot: world.tempDir, skipNdjson: true }));
    const tool = tools.find((t) => t.name === name) as
      | { handler: (a: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }
      | undefined;
    assert.ok(tool, `${name} must be registered in the MCP tool registry (FR-60e)`);
    const res = await tool!.handler(args);
    return JSON.parse(res.content[0].text) as Record<string, unknown>;
  } finally {
    process.chdir(prev);
  }
}

Given(/^an agent reads a spec section for edit through the MCP door$/, function (this: F60REWorld) {
  const dir = path.join(this.tempDir, '.specs', SLUG);
  fs.mkdirSync(dir, { recursive: true });
  // A minimal graph doc so the door's gates have a graph; the target is the CRLF ROADMAP.md.
  fs.writeFileSync(path.join(dir, 'FR.md'), toCrlf('## FR-1: Demo\n\nBody.\n'));
  const roadmap = toCrlf(ROADMAP);
  const docAbs = path.join(dir, 'ROADMAP.md');
  fs.writeFileSync(docAbs, roadmap);
  this.specSlug = SLUG;
  this.docRel = 'ROADMAP.md';
  this.docAbs = docAbs;
});

When(/^the read_for_edit response is returned$/, async function (this: F60REWorld) {
  const res = await callTool(this, 'read_spec_doc', {
    spec: this.specSlug, doc: this.docRel, section: HEADING, read_for_edit: true,
  });
  this.readPayload = res as unknown as ReadForEditReply;
});

Then(/^it includes eol_style, heading_anchor, section_sha, start_line, end_line, and append or insert tokens$/, function (this: F60REWorld) {
  const r = this.readPayload!;
  assert.equal(r.ok, true, 'read_for_edit succeeds');
  assert.equal(r.mode, 'read_for_edit', 'the response is the read-for-edit mode');
  assert.equal(r.eol_style, 'crlf', 'eol_style reports the document CRLF style');
  assert.equal(r.heading_anchor, HEADING_ANCHOR, 'heading_anchor is the stable Marksman slug of the section');
  assert.equal(typeof r.section_sha, 'string', 'section_sha is returned');
  assert.ok((r.section_sha as string).length > 0, 'section_sha is non-empty');
  assert.equal(typeof r.start_line, 'number', 'start_line is returned');
  assert.equal(typeof r.end_line, 'number', 'end_line is returned');
  assert.ok((r.start_line as number) >= 1 && (r.end_line as number) >= (r.start_line as number), 'the line span is a valid 1-based range');
  assert.equal(typeof r.append_token, 'string', 'an append token is returned');
  assert.equal(typeof r.insert_token, 'string', 'an insert token is returned');
  // The token is ANCHOR-based (not a line number) — that is what makes it safe to reuse.
  const parsed = parseSectionToken(r.append_token as string);
  assert.ok(parsed, 'the append token parses back into a kind + heading');
  assert.equal(parsed!.kind, 'append', 'the append token is an append op');
  assert.equal(parsed!.heading, HEADING_ANCHOR, 'the token carries the stable heading anchor, not a line number');
});

Then(/^a follow-up insert using those tokens targets the same section even when unrelated document text changes elsewhere$/, async function (this: F60REWorld) {
  const token = this.readPayload!.append_token as string;
  const oldStartLine = this.readPayload!.start_line as number;
  const parsed = parseSectionToken(token)!;

  // Simulate an UNRELATED edit elsewhere: insert two preamble lines BEFORE the Phase 1 heading.
  // This shifts Phase 1's line numbers (the stale start_line no longer points at the heading),
  // but the section's ANCHOR (carried by the token) is unchanged.
  const current = fs.readFileSync(this.docAbs!, 'utf-8');
  const shifted = current.replace('# Roadmap\r\n', '# Roadmap\r\n\r\n> preamble note added elsewhere\r\n> another preamble line\r\n');
  assert.notEqual(shifted, current, 'the unrelated edit shifted the document');
  fs.writeFileSync(this.docAbs!, shifted);
  const shiftedLines = shifted.split(/\r\n|\n/);
  const newHeadingLine = shiftedLines.findIndex((l) => l.includes(`## ${HEADING}`)) + 1;
  assert.notEqual(newHeadingLine, oldStartLine, 'the Phase 1 heading moved — the read line number is now stale');

  // The follow-up insert is keyed ONLY off the token's anchor (no line number, no exact old_string).
  this.appendPayload = await callTool(this, 'append_to_section', {
    spec: this.specSlug, doc: this.docRel, heading: parsed.heading, text: INSERTED,
  });
  assert.equal(this.appendPayload!.ok, true, `the token-keyed insert applies; findings=${JSON.stringify(this.appendPayload!.findings)}`);

  // The insert landed INSIDE the Phase 1 section (between its heading and the next), even though
  // the line numbers moved — proving the anchor, not the stale line, targeted the section.
  this.finalContent = fs.readFileSync(this.docAbs!, 'utf-8');
  const lines = this.finalContent.split(/\r\n|\n/);
  const p1 = lines.findIndex((l) => l.includes(`## ${HEADING}`));
  const p2 = lines.findIndex((l) => l.includes('## Phase 2 — Later'));
  const ins = lines.findIndex((l) => l.includes(INSERTED));
  assert.ok(p1 >= 0 && p2 >= 0 && ins >= 0, 'the section headings and the inserted line are all present');
  assert.ok(ins > p1 && ins < p2, `the token-keyed insert lands inside the Phase 1 section (p1=${p1} < ins=${ins} < p2=${p2}), not at the stale line ${oldStartLine}`);
});
