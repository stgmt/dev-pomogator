/**
 * @FR-40 edge step definitions — SPECGEN004_124..130. Regression pins for the
 * mutation-tool edge cases the 2026-06-07 dynamic-workflow review confirmed
 * (traversal / mixed-case ext / .progress.json / empty replace / ambiguous /
 * missing-spec crash / reserved slug). Bound to the REAL handlers on an
 * isolated corpus — no mocks.
 *
 * @see audit: dynamic workflow wf_859eee1f-282
 * @see .specs/spec-generator-v4/FR.md FR-40
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';

interface EdgeWorld extends V4World {
  args?: Record<string, unknown>;
  result?: { ok: boolean; error?: string; findings?: Array<{ layer: string }> };
  tool?: 'apply_spec_change' | 'create_spec';
}

function tools(w: EdgeWorld) {
  return buildToolRegistry(() => buildGraph({ repoRoot: w.tempDir, skipNdjson: true }));
}
async function run(w: EdgeWorld): Promise<void> {
  const prev = process.cwd();
  process.chdir(w.tempDir);
  try {
    const t = tools(w).find((x) => x.name === w.tool)!;
    const r = (await t.handler(w.args as never)) as { content: Array<{ text: string }> };
    w.result = JSON.parse(r.content[0].text);
  } finally {
    process.chdir(prev);
  }
}
function seedSpec(w: EdgeWorld, slug: string, body = '## FR-1: Demo\n\nBody one.\n'): string {
  const dir = path.join(w.tempDir, '.specs', slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'FR.md'), body);
  return dir;
}

// _124 traversal
Given('a mutation targeting a spec slug that escapes the specs tree', function (this: EdgeWorld) {
  this.tool = 'apply_spec_change';
  this.args = { spec: '../escape', doc: 'EVIL.md', content: '# pwn\n', reason: 'edge' };
});
Then('no file is written outside the specs tree', function (this: EdgeWorld) {
  assert.ok(!fs.existsSync(path.join(this.tempDir, 'escape')), 'nothing may be written outside .specs/');
});

// _125 mixed-case ext
Given('an existing validated FR.md and a change targeting FR.MD', function (this: EdgeWorld) {
  seedSpec(this, 'case-demo');
  this.tool = 'apply_spec_change';
  this.args = { spec: 'case-demo', doc: 'FR.MD', content: 'UNVALIDATED\n', reason: 'edge' };
});
Then('the original FR.md content is intact', function (this: EdgeWorld) {
  const body = fs.readFileSync(path.join(this.tempDir, '.specs', 'case-demo', 'FR.md'), 'utf-8');
  assert.ok(body.includes('Body one.'), 'the canonical FR.md must be untouched');
});

// _126 .progress.json
Given('a change targeting .progress.json', function (this: EdgeWorld) {
  seedSpec(this, 'prog-demo');
  this.tool = 'apply_spec_change';
  this.args = { spec: 'prog-demo', doc: '.progress.json', content: '{garbage', reason: 'edge' };
});
Then('no progress file is written', function (this: EdgeWorld) {
  assert.ok(!fs.existsSync(path.join(this.tempDir, '.specs', 'prog-demo', '.progress.json')));
});

// _127 empty replace
Given('an existing non-empty document and an empty-content change', function (this: EdgeWorld) {
  seedSpec(this, 'empty-demo');
  this.tool = 'apply_spec_change';
  this.args = { spec: 'empty-demo', doc: 'FR.md', content: '', reason: 'edge' };
});
Then('the server refuses on the change guard', function (this: EdgeWorld) {
  assert.equal(this.result!.ok, false);
  assert.ok(
    this.result!.findings?.some((f) => f.layer === 'change'),
    'the refusal must be a change-layer finding',
  );
});
Then('the document keeps its content', function (this: EdgeWorld) {
  const body = fs.readFileSync(path.join(this.tempDir, '.specs', 'empty-demo', 'FR.md'), 'utf-8');
  assert.ok(body.trim().length > 0, 'the doc must not be emptied');
});

// _128 ambiguous
// regex (not a Cucumber Expression): the `/` in old_string/new_string would
// otherwise be parsed as an alternative — the JS analog of reqnroll-ce-slash.
Given(/^a change carrying both content and an old_string\/new_string pair$/, function (this: EdgeWorld) {
  seedSpec(this, 'ambi-demo');
  this.tool = 'apply_spec_change';
  this.args = { spec: 'ambi-demo', doc: 'FR.md', content: 'x', old_string: 'a', new_string: 'b', reason: 'edge' };
});
Then('the server refuses as ambiguous', function (this: EdgeWorld) {
  assert.equal(this.result!.error, 'AMBIGUOUS_CHANGE');
});

// _129 missing spec
Given('a markdown change targeting a spec slug that does not exist', function (this: EdgeWorld) {
  fs.mkdirSync(path.join(this.tempDir, '.specs'), { recursive: true });
  this.tool = 'apply_spec_change';
  this.args = { spec: 'no-such-spec', doc: 'FR.md', content: '## FR-1: X\n\nB.\n', reason: 'edge' };
});
Then('the server returns a clean validation failure without throwing', function (this: EdgeWorld) {
  // No throw reached here (run() would have propagated it) — and the envelope is clean.
  assert.equal(this.result!.ok, false);
  assert.equal(this.result!.error, 'VALIDATION_FAILED');
});

// _130 reserved slug
Given('a create_spec call with a reserved device-name slug', function (this: EdgeWorld) {
  fs.mkdirSync(path.join(this.tempDir, '.specs'), { recursive: true });
  this.tool = 'create_spec';
  this.args = { slug: 'con' };
});
Then('the server refuses the reserved slug', function (this: EdgeWorld) {
  assert.equal(this.result!.error, 'RESERVED_SLUG');
});

// shared When + target-guard Then (wrap so cucumber sees arity 0 + promise,
// not a (callback) signature)
When('the agent applies it', function (this: EdgeWorld) {
  return run(this);
});
When('the agent runs it', function (this: EdgeWorld) {
  return run(this);
});
Then('the server refuses on the target guard', function (this: EdgeWorld) {
  assert.equal(this.result!.ok, false);
  assert.ok(
    this.result!.findings?.some((f) => f.layer === 'target') || this.result!.error === 'VALIDATION_FAILED',
    `expected a target-guard refusal, got ${JSON.stringify(this.result)}`,
  );
});
