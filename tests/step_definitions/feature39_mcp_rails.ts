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

// ── SPECGEN004_114/_115/_116 — FR-40: the mutation door (P17-2) ─────────────
// Bound to the REAL handlers (propose/apply/create) over an isolated corpus;
// _116 runs the REAL authoritative verdict (runSpecVerdict, cwd-aligned).

import { runSpecVerdict } from '../../tools/specs-generator/spec-verdict.ts';

interface F40World extends F39World {
  applyDenied?: { ok: boolean; error?: string; findings?: Array<{ layer: string; message: string }> };
  appliedOk?: { ok: boolean; bytes?: number };
  freshBody?: string;
  newbornVerdict?: { verdict: string; gapList: string[] };
}

function railsTools(world: F40World) {
  return buildToolRegistry(() => buildGraph({ repoRoot: world.tempDir, skipNdjson: true }));
}

async function callTool(world: F40World, name: string, args: Record<string, unknown>): Promise<any> {
  const t = railsTools(world).find((x) => x.name === name)!;
  const r = (await t.handler(args as never)) as { content: Array<{ text: string }> };
  return JSON.parse(r.content[0].text);
}

/** Run a handler with cwd switched to the isolated corpus (handlers resolve cwd). */
async function inCorpus<T>(world: F40World, fn: () => Promise<T>): Promise<T> {
  const prev = process.cwd();
  process.chdir(world.tempDir);
  try {
    return await fn();
  } finally {
    process.chdir(prev);
  }
}

// _114 — reject before disk, then the corrected change lands

Given('a spec change that breaks an anchor or a form contract', function (this: F40World) {
  const dir = path.join(this.tempDir, '.specs', 'mut-demo');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'FR.md'), '## FR-1: Demo\n\nBody.\n');
});

When('the agent applies it through the MCP mutation tool', async function (this: F40World) {
  this.applyDenied = await inCorpus(this, () =>
    callTool(this, 'apply_spec_change', {
      spec: 'mut-demo',
      doc: 'DESIGN.md',
      content: 'See [req](FR.md#fr-99-nope).\n', // broken anchor
      reason: 'bdd probe',
    }),
  );
});

Then('the server refuses without writing and returns the findings list', function (this: F40World) {
  assert.equal(this.applyDenied!.ok, false);
  assert.equal(this.applyDenied!.error, 'VALIDATION_FAILED');
  assert.ok(
    this.applyDenied!.findings!.some((f) => f.layer === 'anchor'),
    'the anchor finding must be named',
  );
  assert.ok(
    !fs.existsSync(path.join(this.tempDir, '.specs', 'mut-demo', 'DESIGN.md')),
    'a refused change must NOT touch the disk',
  );
});

Then('the corrected change is written atomically and logged', async function (this: F40World) {
  this.appliedOk = await inCorpus(this, () =>
    callTool(this, 'apply_spec_change', {
      spec: 'mut-demo',
      doc: 'DESIGN.md',
      content: 'See [req](FR.md#fr-1-demo).\n',
      reason: 'bdd probe fixed',
    }),
  );
  assert.equal(this.appliedOk!.ok, true);
  assert.ok(fs.existsSync(path.join(this.tempDir, '.specs', 'mut-demo', 'DESIGN.md')));
  const log = fs.readFileSync(path.join(this.tempDir, '.dev-pomogator', 'logs', 'spec-access.jsonl'), 'utf-8');
  assert.ok(/apply_spec_change.*denied/.test(log), 'the refusal is audited');
  assert.ok(/apply_spec_change.*"ok"/.test(log), 'the accepted write is audited');
});

// _115 — a successful write refreshes the graph for the next read

Given('an accepted spec change written through MCP', async function (this: F40World) {
  const dir = path.join(this.tempDir, '.specs', 'fresh-demo');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'FR.md'), '## FR-1: Old title\n\nBody.\n');
  // Watcher-less embedding: the registry gets an explicit refresh (FR-40c) —
  // inside the real server the FR-14 watcher plays this role.
  let graph = buildGraph({ repoRoot: this.tempDir, skipNdjson: true });
  const tools = buildToolRegistry(() => graph, {
    refreshGraph: () => {
      graph = buildGraph({ repoRoot: this.tempDir, skipNdjson: true });
    },
  });
  await inCorpus(this, async () => {
    const r = (await tools.find((t) => t.name === 'apply_spec_change')!.handler({
      spec: 'fresh-demo',
      doc: 'FR.md',
      content: '## FR-1: Fresh title\n\nBody.\n',
      reason: 'freshness probe',
    } as never)) as { content: Array<{ text: string }> };
    assert.equal(JSON.parse(r.content[0].text).ok, true);
    const node = (await tools.find((t) => t.name === 'get_node')!.handler({
      node_id: 'fresh-demo:FR-1',
    } as never)) as { content: Array<{ text: string }> };
    this.freshBody = JSON.parse(node.content[0].text).node?.title;
  });
});

When('the agent reads the affected node afterwards', function (this: F40World) {
  // The read happened right after the write in the Given (single closure) —
  // nothing else to do here; the assertion is in the Then.
});

Then('the response reflects the fresh state', function (this: F40World) {
  assert.equal(this.freshBody, 'Fresh title', 'the post-write read must see the NEW content (FR-40c)');
});

// _116 — create_spec births a verdict-green spec through MCP

Given('the create_spec mutation tool', function (this: F40World) {
  fs.mkdirSync(path.join(this.tempDir, '.specs'), { recursive: true });
});

When('the agent creates a new spec through it', async function (this: F40World) {
  const r = await inCorpus(this, () => callTool(this, 'create_spec', { slug: 'newborn-mcp' }));
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 200));
  this.newbornVerdict = (await inCorpus(this, () =>
    runSpecVerdict('.specs/newborn-mcp', { semantic: false, cwd: this.tempDir } as never),
  )) as { verdict: string; gapList: string[] };
});

Then('the authoritative verdict for the newborn spec is GREEN', function (this: F40World) {
  assert.equal(
    this.newbornVerdict!.verdict,
    'GREEN',
    `newborn must be GREEN, gaps: ${this.newbornVerdict!.gapList.slice(0, 3).join(' | ')}`,
  );
});

// ── SPECGEN004_111 / _112 — FR-39c spec-access-guard (P17-3) ────────────────
// Drives the REAL guard as a subprocess with PreToolUse stdin, both tiers.

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const GUARD = path.resolve(import.meta.dirname ?? __dirname, '..', '..', 'tools', 'specs-validator', 'spec-access-guard.ts');

interface GuardWorld extends F39World {
  guardRes?: { status: number | null; stdout: string };
  guardCwd?: string;
}

function runGuard(world: GuardWorld, payload: object, enforce: boolean): { status: number | null; stdout: string } {
  const r = spawnSync(process.execPath, ['--import', 'tsx', GUARD], {
    encoding: 'utf-8',
    input: JSON.stringify({ ...payload, cwd: world.tempDir }),
    env: enforce ? { ...process.env, SPEC_ACCESS_ENFORCE: 'true' } : { ...process.env, SPEC_ACCESS_ENFORCE: '' },
    timeout: 60_000,
  });
  return { status: r.status, stdout: r.stdout ?? '' };
}

Given('spec access enforcement is enabled after read and write sufficiency are proven', function (this: GuardWorld) {
  fs.mkdirSync(path.join(this.tempDir, '.specs', 'guard-demo'), { recursive: true });
});

When('the agent calls a file tool on a path under the specs tree', function (this: GuardWorld) {
  this.guardRes = runGuard(this, { tool_name: 'Read', tool_input: { file_path: '.specs/guard-demo/FR.md' } }, true);
});

Then('the call is denied with a pointer to the MCP tools', function (this: GuardWorld) {
  assert.equal(this.guardRes!.status, 2, 'enforce mode must deny (exit 2)');
  const out = JSON.parse(this.guardRes!.stdout);
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /MCP|read_spec_doc/);
});

Then('the violation lands in the spec-access audit log', function (this: GuardWorld) {
  const log = fs.readFileSync(path.join(this.tempDir, '.dev-pomogator', 'logs', 'spec-access.jsonl'), 'utf-8');
  assert.ok(/spec-access-guard.*denied/.test(log), 'the deny must be audited');
});

Given('the spec-access guard runs in shadow mode', function (this: GuardWorld) {
  fs.mkdirSync(path.join(this.tempDir, '.specs', 'guard-demo'), { recursive: true });
});

When('the agent reads a spec file directly', function (this: GuardWorld) {
  this.guardRes = runGuard(this, { tool_name: 'Read', tool_input: { file_path: '.specs/guard-demo/FR.md' } }, false);
});

Then('the access is logged as a violation', function (this: GuardWorld) {
  const log = fs.readFileSync(path.join(this.tempDir, '.dev-pomogator', 'logs', 'spec-access.jsonl'), 'utf-8');
  assert.ok(/spec-access-guard.*shadow/.test(log), 'shadow mode must log the violation');
});

Then('the call is not blocked', function (this: GuardWorld) {
  assert.equal(this.guardRes!.status, 0, 'shadow mode must NOT block (exit 0)');
});

void pathToFileURL;

// ── SPECGEN004_132 — FR-39 read tools share the slug guard (no traversal leak) ─
import { isSafeSlug } from '../../tools/spec-mcp-server/mutations.ts';

interface LeakWorld extends F39World {
  leakRes?: { ok: boolean; error?: string };
}
Given('a secret file outside the specs tree and a read targeting it via a traversal slug', function (this: LeakWorld) {
  fs.mkdirSync(path.join(this.tempDir, '.specs', 'safe'), { recursive: true });
  fs.writeFileSync(path.join(this.tempDir, '.specs', 'safe', 'FR.md'), '## FR-1: X\n');
  fs.mkdirSync(path.join(this.tempDir, 'secret'), { recursive: true });
  fs.writeFileSync(path.join(this.tempDir, 'secret', 'leak.md'), 'TOP SECRET');
});
When('the agent calls the read tool', async function (this: LeakWorld) {
  const prev = process.cwd();
  process.chdir(this.tempDir);
  try {
    const t = buildToolRegistry(() => buildGraph({ repoRoot: this.tempDir, skipNdjson: true }));
    const r = (await t.find((x) => x.name === 'read_spec_doc')!.handler({
      spec: '../secret',
      doc: 'leak.md',
    } as never)) as { content: Array<{ text: string }> };
    this.leakRes = JSON.parse(r.content[0].text);
  } finally {
    process.chdir(prev);
  }
});
Then('the read is refused as an unsafe spec and nothing outside the tree is returned', function (this: LeakWorld) {
  assert.equal(this.leakRes!.ok, false);
  assert.equal(this.leakRes!.error, 'UNSAFE_SPEC');
  assert.ok(!JSON.stringify(this.leakRes).includes('TOP SECRET'), 'no out-of-tree content may leak');
  // the shared guard is the single chokepoint:
  assert.equal(isSafeSlug('../secret'), false);
  assert.equal(isSafeSlug('backlog/nested'), true);
});

// ── SPECGEN004_133 — FR-39f engine-CLI carve-out is complete (P17-4) ───────────
// Pins the verified ENGINE_CLI whitelist against the engine CLIs skills actually
// invoke over .specs/ (DESIGN §"Engine carve-out"): each must be ALLOWED by the
// real guard decision, while a generic reader over .specs/ stays a VIOLATION —
// so enforce (P17-6) can't silently brick a legitimate authoring CLI.
import { violationOf } from '../../tools/specs-validator/spec-access-guard.ts';

const SKILL_ENGINE_CLIS = [
  'spec-verdict', 'validate-spec', 'audit-spec', 'spec-status', 'corpus-health',
  'collision-probe', 'spec-form-parsers', 'scaffold-spec', 'anchor-integrity', 'analyze-features',
];
interface CarveWorld extends F39World {
  carveAllowed?: string[];
  carveGenericViolation?: boolean;
}
Given('the spec-access-guard engine-CLI carve-out', function (this: CarveWorld) {
  this.carveAllowed = [];
});
When('each documented engine CLI and a generic reader run over the specs tree', function (this: CarveWorld) {
  const bash = (command: string): boolean =>
    violationOf({ tool_name: 'Bash', tool_input: { command } }) === null;
  for (const cli of SKILL_ENGINE_CLIS) {
    if (bash(`npx tsx tools/x/${cli}.ts .specs/demo/FR.md`)) this.carveAllowed!.push(cli);
  }
  // generic reader over .specs/ must NOT be allowed (carve-out is not a blanket pass)
  this.carveGenericViolation = !bash('cat .specs/demo/FR.md');
});
Then('every engine CLI is allowed and the generic reader stays a violation', function (this: CarveWorld) {
  assert.deepEqual(
    [...this.carveAllowed!].sort(),
    [...SKILL_ENGINE_CLIS].sort(),
    'every documented skill-invoked engine CLI must be allowed over .specs/ — a missing one is a deferred enforce regression',
  );
  assert.equal(this.carveGenericViolation, true, 'a generic reader over .specs/ stays a violation');
});
