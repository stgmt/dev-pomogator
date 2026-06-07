/**
 * @FR-39 step definitions — P17-1 read-sufficiency (SPECGEN004_113).
 * Bound to the REAL registry handlers (list_spec_docs / read_spec_doc) over an
 * isolated corpus + the REAL spec-access audit log. _111/_112 (enforce/shadow
 * guard) stay red until P17-3/6 build the spec-access-guard.
 *
 * @see .specs/spec-generator-v4/FR.md FR-39a/b
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';

interface F39World extends V4World {
  prevCwd?: string;
  docPayload?: { ok: boolean; content?: string; doc?: string };
  proseMarker?: string;
}

Given('a spec document whose prose lives outside graph nodes', function (this: F39World) {
  const dir = path.join(this.tempDir, '.specs', 'rails-demo');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'FR.md'), '## FR-1: Rails\n\nBody.\n');
  // RESUME-style prose: NOT addressable as any graph node — only a whole-doc
  // read can serve it (the exact FR-39a gap read_spec_doc closes).
  this.proseMarker = `handoff-prose-${process.pid}`;
  fs.writeFileSync(
    path.join(dir, 'RESUME.md'),
    `# Handoff\n\nFree prose between nodes: ${this.proseMarker}.\n`,
  );
  this.prevCwd = process.cwd();
  process.chdir(this.tempDir); // handlers resolve .specs/ against cwd
});

When('the agent calls read_spec_doc for it', async function (this: F39World) {
  try {
    const tools = buildToolRegistry(() => buildGraph({ repoRoot: this.tempDir, skipNdjson: true }));
    const r = await tools.find((t) => t.name === 'read_spec_doc')!.handler({
      spec: 'rails-demo',
      doc: 'RESUME.md',
    });
    this.docPayload = JSON.parse((r as { content: Array<{ text: string }> }).content[0].text);
  } finally {
    process.chdir(this.prevCwd!);
  }
});

Then('the full document content is returned', function (this: F39World) {
  assert.ok(this.docPayload?.ok, 'read_spec_doc must serve the doc');
  assert.ok(
    this.docPayload!.content!.includes(this.proseMarker!),
    'the WHOLE document (prose outside nodes) must come back',
  );
});

Then('the read lands in the spec-access audit log', function (this: F39World) {
  const log = path.join(this.tempDir, '.dev-pomogator', 'logs', 'spec-access.jsonl');
  assert.ok(fs.existsSync(log), 'spec-access.jsonl must be created on first access (FR-39b)');
  const entries = fs
    .readFileSync(log, 'utf-8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  const read = entries.find((e) => e.tool === 'read_spec_doc' && e.decision === 'ok');
  assert.ok(read, 'the ok-read must be audited');
  assert.match(read.args_digest, /^[0-9a-f]{16}$/, 'args digest present');
});
