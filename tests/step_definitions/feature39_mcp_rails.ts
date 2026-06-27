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

// ── SPECGEN004_133 — FR-39f engine carve-out, REAL producer invocations (P17-4) ─
// Pins the guard against the ACTUAL commands skills run over .specs/ (verify-
// against-real-artifact: the first cut tested synthetic `tools/x/<cli>.ts` and
// gave false-green while `tools/anchor-integrity/fix.mjs` was really DENIED —
// 2026-06-08 review). Every real engine producer must be ALLOWED; generic /
// inline / heredoc-to-tmp reads must stay a VIOLATION, so enforce (P17-6) can't
// silently brick authoring yet can't be bypassed by ad-hoc code either.
import { violationOf, extractSkipMarker } from '../../tools/specs-validator/spec-access-guard.ts';

// The commands authoring skills ACTUALLY invoke (basenames check/fix/full-mode/
// variant-matrix-cli are too generic to whitelist — recognized as project scripts).
const REAL_ENGINE_INVOCATIONS = [
  'npx tsx tools/specs-generator/spec-verdict.ts .specs/demo',          // canonical CLI by name
  'npx tsx tools/spec-graph/collision-probe.ts .specs/demo',
  'node tools/anchor-integrity/check.mjs --spec .specs/demo',          // directory-named tool
  'node tools/anchor-integrity/fix.mjs --spec .specs/demo --apply',    // the anchor-fix write path
  'npx tsx .claude/skills/cross-spec-reconcile/scripts/full-mode.ts .specs/demo',
  'npx tsx tools/specs-generator/architecture-decision/architecture-decision-cli.ts .specs/demo',
  'npx tsx tools/specs-generator/variant-matrix/variant-matrix-cli.ts .specs/demo',
];
const MUST_DENY = [
  'cat .specs/demo/FR.md',                                              // generic reader
  "node -e \"require('fs').readFileSync('.specs/demo/FR.md')\"",       // inline code, no script token
  'grep -rn X .specs/demo',                                            // generic search over .specs/
  'node /tmp/t.mjs .specs/demo',                                       // heredoc-to-/tmp escape hatch
  'cat .specs/demo/FR.md > tools/leak.ts',                             // content-read via redirect TARGET in tools/
  'cp .specs/demo/FR.md tools/leak.ts',                                // content-read via cp into a project dir
];
interface CarveWorld extends F39World {
  carveAllowed?: string[];
  carveDenied?: string[];
}
Given('the spec-access-guard engine-CLI carve-out', function (this: CarveWorld) {
  this.carveAllowed = [];
  this.carveDenied = [];
});
When('each documented engine CLI and a generic reader run over the specs tree', function (this: CarveWorld) {
  const allowed = (command: string): boolean =>
    violationOf({ tool_name: 'Bash', tool_input: { command } }) === null;
  for (const cmd of REAL_ENGINE_INVOCATIONS) if (allowed(cmd)) this.carveAllowed!.push(cmd);
  for (const cmd of MUST_DENY) if (!allowed(cmd)) this.carveDenied!.push(cmd);
});
Then('every engine CLI is allowed and the generic reader stays a violation', function (this: CarveWorld) {
  assert.deepEqual(
    this.carveAllowed!,
    REAL_ENGINE_INVOCATIONS,
    'every REAL engine producer invocation over .specs/ must be allowed — a denied one is a deferred enforce regression',
  );
  assert.deepEqual(
    this.carveDenied!,
    MUST_DENY,
    'generic / inline / heredoc-to-tmp reads over .specs/ must stay violations — the carve-out is not a blanket pass',
  );
});

// ── SPECGEN004_135 — MCP server repo-root robust vs unresolved ${…} (P17-6) ────
import { resolveRepoRoot } from '../../tools/spec-mcp-server/server.ts';

interface RepoRootWorld extends F39World {
  rrEnv?: string;
  rrCwd?: string;
  rrResult?: string;
}
Given('a repo-root env that is an unresolved placeholder and a cwd that contains a specs tree', function (this: RepoRootWorld) {
  this.rrCwd = path.join(this.tempDir, 'cwd-with-specs');
  fs.mkdirSync(path.join(this.rrCwd, '.specs'), { recursive: true });
  this.rrEnv = '${CLAUDE_PROJECT_DIR}'; // headless launch did not substitute it
});
When('the server resolves its repo root', function (this: RepoRootWorld) {
  this.rrResult = resolveRepoRoot(this.rrEnv, this.rrCwd!);
});
Then('it ignores the placeholder and uses the cwd', function (this: RepoRootWorld) {
  assert.equal(this.rrResult, this.rrCwd);
  // a real repo path (with .specs/) is honoured over cwd:
  assert.equal(resolveRepoRoot(this.rrCwd!, this.tempDir), this.rrCwd);
});

// ── SPECGEN004_136 — enforce ON from plugin userConfig export, not only env ────
import { enforceEnabled } from '../../tools/specs-validator/spec-access-guard.ts';

interface EnfWorld extends F39World {
  enfOn?: boolean;
  enfOff?: boolean;
}
Given('the plugin userConfig enforce toggle exported to the guard environment', function (this: EnfWorld) {
  // the value the When uses; Claude Code exports userConfig as CLAUDE_PLUGIN_OPTION_<key>
  this.enfOn = undefined;
});
When('the guard computes whether enforce is on', function (this: EnfWorld) {
  this.enfOn = enforceEnabled({ CLAUDE_PLUGIN_OPTION_spec_access_enforce: 'true' } as NodeJS.ProcessEnv);
  this.enfOff = enforceEnabled({} as NodeJS.ProcessEnv);
});
Then('enforce is on, and it is off when no enforce signal is present', function (this: EnfWorld) {
  assert.equal(this.enfOn, true);
  assert.equal(this.enfOff, false);
});

// ── SPECGEN004_138 — P19-6 read door reaches subdirs, still refuses traversal ──
// Binds the REAL handlers over a tempDir corpus: a subdir doc + a binary
// attachment are reachable through the door (read_spec_doc / read_attachment),
// while a `..` subpath is refused — the containment check replaces the old
// basename-strip WITHOUT reopening the traversal hole.
interface SubdirWorld extends F39World {
  subdirRead?: { ok: boolean; content?: string; doc?: string };
  attachRead?: { ok: boolean; mime?: string; base64?: string; bytes?: number };
  subTraversal?: { ok: boolean; error?: string };
}
Given('a spec whose docs live in a subdirectory and a secret file outside the spec root', function (this: SubdirWorld) {
  const root = path.join(this.tempDir, '.specs', 'subdir-demo');
  fs.mkdirSync(path.join(root, 'ARCHITECTURE'), { recursive: true });
  fs.mkdirSync(path.join(root, 'attachments'), { recursive: true });
  fs.writeFileSync(path.join(root, 'FR.md'), '## FR-1: X\n');
  fs.writeFileSync(path.join(root, 'ARCHITECTURE', 'AXIS-1.md'), '# AXIS-1\n\naxis body marker-138\n');
  // a tiny PNG (header + bytes) — read_attachment must base64 it
  fs.writeFileSync(path.join(root, 'attachments', 'diag.png'), Buffer.from('89504e470d0a1a0a0102030405', 'hex'));
  fs.mkdirSync(path.join(this.tempDir, 'secret'), { recursive: true });
  fs.writeFileSync(path.join(this.tempDir, 'secret', 'leak.md'), 'TOP SECRET 138');
});
When('the door resolves an in-tree subpath and a traversal subpath', async function (this: SubdirWorld) {
  const prev = process.cwd();
  process.chdir(this.tempDir);
  try {
    const t = buildToolRegistry(() => buildGraph({ repoRoot: this.tempDir, skipNdjson: true }));
    const read = (n: string, a: object) =>
      t.find((x) => x.name === n)!.handler(a as never) as Promise<{ content: Array<{ text: string }> }>;
    this.subdirRead = JSON.parse((await read('read_spec_doc', { spec: 'subdir-demo', doc: 'ARCHITECTURE/AXIS-1.md' })).content[0].text);
    this.attachRead = JSON.parse((await read('read_attachment', { spec: 'subdir-demo', path: 'attachments/diag.png' })).content[0].text);
    // a traversal subpath that would escape the spec root into the sibling secret/
    this.subTraversal = JSON.parse((await read('read_spec_doc', { spec: 'subdir-demo', doc: '../../secret/leak.md' })).content[0].text);
  } finally {
    process.chdir(prev);
  }
});
Then('the in-tree subpath resolves inside the spec root and the traversal subpath is refused', function (this: SubdirWorld) {
  // subdir text doc served through the door
  assert.equal(this.subdirRead!.ok, true, 'a subdir doc must be reachable via read_spec_doc');
  assert.equal(this.subdirRead!.doc, 'ARCHITECTURE/AXIS-1.md');
  assert.match(this.subdirRead!.content!, /marker-138/);
  // binary attachment served as base64
  assert.equal(this.attachRead!.ok, true, 'a binary attachment must be reachable via read_attachment');
  assert.equal(this.attachRead!.mime, 'image/png');
  assert.ok((this.attachRead!.base64?.length ?? 0) > 0, 'attachment base64 is non-empty');
  // traversal refused, nothing outside the spec root leaks
  assert.equal(this.subTraversal!.ok, false, 'a .. subpath must be refused');
  assert.equal(this.subTraversal!.error, 'DOC_TRAVERSAL');
  assert.ok(!JSON.stringify(this.subTraversal).includes('TOP SECRET'), 'no out-of-tree content may leak');
});

// ── SPECGEN004_139 — P19-6 mutation door reaches subdirs, refuses traversal ───
// The write twin of _138: apply_spec_change writes a non-graph WORKING doc into a
// subdirectory (.architecture-research/) WITHOUT the form/anchor/conformance gates
// (those are for top-level graph docs), while a `..` write is refused and nothing
// lands outside the spec root. Binds the REAL mutation handler over a tempDir corpus.
interface SubWriteWorld extends F40World {
  subWrite?: { ok: boolean; path?: string; findings?: unknown[] };
  travWrite?: { ok: boolean; error?: string };
}
Given('a spec that needs a research stage file written into a subdirectory', function (this: SubWriteWorld) {
  const dir = path.join(this.tempDir, '.specs', 'sub-write-demo');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'FR.md'), '## FR-1: Demo\n\nBody.\n');
});
When('the agent applies a subdir write and a traversal write through the mutation tool', async function (this: SubWriteWorld) {
  this.subWrite = await inCorpus(this, () =>
    callTool(this, 'apply_spec_change', {
      spec: 'sub-write-demo',
      doc: '.architecture-research/1-problem-framing.md',
      content: '# Stage 1\n\nFreeform research prose with a [link](http://example.com).\n',
      reason: 'P19-6 subdir research stage write',
    }),
  );
  this.travWrite = await inCorpus(this, () =>
    callTool(this, 'apply_spec_change', {
      spec: 'sub-write-demo',
      doc: '../../escape-139.md',
      content: 'should never land',
      reason: 'P19-6 traversal write probe',
    }),
  );
});
Then('the subdir doc is written without the graph gates and the traversal write is refused with nothing escaping the spec root', function (this: SubWriteWorld) {
  // subdir working doc written, graph gates skipped (freeform prose → no findings)
  assert.equal(this.subWrite!.ok, true, 'a contained subdir write must succeed');
  assert.deepEqual(this.subWrite!.findings, [], 'a non-graph subdir doc skips the form/anchor/conformance gates');
  assert.ok(
    fs.existsSync(path.join(this.tempDir, '.specs', 'sub-write-demo', '.architecture-research', '1-problem-framing.md')),
    'the subdir file must be on disk',
  );
  // traversal refused, nothing escapes the spec root
  assert.equal(this.travWrite!.ok, false, 'a .. write must be refused');
  assert.ok(!fs.existsSync(path.join(this.tempDir, 'escape-139.md')), 'no file may escape to the corpus root');
  assert.ok(!fs.existsSync(path.join(this.tempDir, '.specs', 'escape-139.md')), 'no file may escape to .specs/');
});

// ── SPECGEN004_147 — P19-4 D-door: delete through the door, refuse strands ───
// Binds the REAL delete_spec_doc handler over a tempDir corpus: a free prose doc
// deletes cleanly; a doc whose nodes carry cross-file inbound edges is refused
// with named blockers (no dangling refs); .progress.json is single-writer (refused).
interface DDoorWorld extends F40World {
  delFree?: { ok: boolean; deleted?: boolean };
  delRef?: { ok: boolean; error?: string; blockers?: Array<{ edge: string }> };
  delProgress?: { ok: boolean; error?: string };
}
Given('a spec with a free prose doc and a doc whose nodes are referenced from another file', function (this: DDoorWorld) {
  const dir = path.join(this.tempDir, '.specs', 'd-demo');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'FR.md'), '## FR-1: Thing\n\nBody.\n');
  // AC in ANOTHER file covers FR-1 → cross-file inbound edge onto FR.md's node.
  fs.writeFileSync(path.join(dir, 'ACCEPTANCE_CRITERIA.md'), '## AC-1.1\n\n**Требование:** [FR-1](FR.md#fr-1)\n\nWHEN x THEN y SHALL z.\n');
  fs.writeFileSync(path.join(dir, 'RESUME.md'), '# Handoff\n\nfree prose, no nodes.\n');
  fs.writeFileSync(path.join(dir, '.progress.json'), '{}');
});
When('the agent deletes each target through the delete door', async function (this: DDoorWorld) {
  this.delFree = await inCorpus(this, () => callTool(this, 'delete_spec_doc', { spec: 'd-demo', doc: 'RESUME.md', reason: 'throwaway prose cleanup' }));
  this.delRef = await inCorpus(this, () => callTool(this, 'delete_spec_doc', { spec: 'd-demo', doc: 'FR.md', reason: 'attempt referenced doc' }));
  this.delProgress = await inCorpus(this, () => callTool(this, 'delete_spec_doc', { spec: 'd-demo', doc: '.progress.json', reason: 'single-writer probe' }));
});
Then('the free doc is deleted and the referenced doc and the progress artifact are refused with named blockers', function (this: DDoorWorld) {
  const dir = path.join(this.tempDir, '.specs', 'd-demo');
  assert.equal(this.delFree!.ok, true, 'a free prose doc must delete through the door');
  assert.ok(!fs.existsSync(path.join(dir, 'RESUME.md')), 'the free doc must be gone from disk');
  assert.equal(this.delRef!.ok, false, 'a referenced doc must be refused');
  assert.equal(this.delRef!.error, 'LIVE_INBOUND_EDGES');
  assert.ok((this.delRef!.blockers?.length ?? 0) > 0, 'the refusal must NAME the blocking edges');
  assert.ok(fs.existsSync(path.join(dir, 'FR.md')), 'the referenced doc must remain on disk');
  assert.equal(this.delProgress!.ok, false, 'the single-writer artifact must be refused');
  assert.equal(this.delProgress!.error, 'NOT_DELETABLE');
  assert.ok(fs.existsSync(path.join(dir, '.progress.json')), '.progress.json must remain on disk');
});

// ── SPECGEN004_148 — P21-2 git VCS-plumbing carve-out over .specs under enforce ──
// Binds the REAL violationOf: committing door-written specs (add/commit/status/
// unstage) is allowed; content-leak/worktree-rewrite git (show/diff/checkout/
// reset --hard) and generic readers stay violations.
interface GitCarveWorld extends F39World { blockedAllow?: string[]; leakedDeny?: string[]; }
Given('the spec-access-guard git carve-out under enforce', function (this: GitCarveWorld) {
  this.blockedAllow = undefined;
});
When('git plumbing and git content commands run over the specs tree', function (this: GitCarveWorld) {
  const S = '.' + 'specs';
  const denied = (command: string): boolean => violationOf({ tool_name: 'Bash', tool_input: { command } } as never) !== null;
  const mustAllow = [
    `git add ${S}/auth/FR.md`,
    `git add ${S}/auth/FR.md && git commit -m "x"`,
    `git commit -m "x"`,
    `git status -s ${S}/auth/`,
    `git stash push ${S}/auth/`,
    `git restore --staged ${S}/auth/FR.md`,
    `git rm --cached ${S}/auth/old.md`,
    // dogfood 2026-06-21: a multi-line commit via heredoc (`-F - <<'EOF' … EOF`) — the
    // bdd-migrator's own recommended form — must be allowed even when the message BODY
    // mentions `.specs/`; the heredoc body is DATA, not a non-git pipeline segment.
    `git commit -F - -- ${S}/auth/FR.md <<'EOF'\nfix: correct tag\n\nbody mentions ${S}/auth here\nEOF`,
    `git commit -F - -- ${S}/auth/FR.md <<EOF\nmsg\nEOF`,
  ];
  const mustDeny = [
    `git show HEAD:${S}/auth/FR.md`,
    `git diff ${S}/auth/FR.md`,
    `git checkout ${S}/auth/FR.md`,
    `git restore ${S}/auth/FR.md`,
    `git reset --hard ${S}/auth/`,
    `cat ${S}/auth/FR.md`,
    `git add ${S}/auth/FR.md && cat ${S}/auth/FR.md`,
  ];
  this.blockedAllow = mustAllow.filter((c) => denied(c)); // should be []
  this.leakedDeny = mustDeny.filter((c) => !denied(c)); // should be []
});
Then('VCS plumbing commands are allowed and content-reading git commands stay violations', function (this: GitCarveWorld) {
  assert.deepEqual(this.blockedAllow, [], `VCS-plumbing wrongly blocked: ${JSON.stringify(this.blockedAllow)}`);
  assert.deepEqual(this.leakedDeny, [], `content-leak/worktree-write/reader wrongly allowed: ${JSON.stringify(this.leakedDeny)}`);
});

// ── SPECGEN004_149 — P21-1 multi-session door: EVERY session writes (E-A redesign, owner 2026-06-20) ──
// Binds the REAL chain under the finished all-write design: a first session holds the lifetime PRESENCE
// lock; a second session's acquireLockOrReadOnly returns reader+holder (no throw). The lifetime lock NO
// LONGER blocks writes — apply_spec_change SERIALISES in via the short per-write lock + CAS, reads + the
// propose dry-run stay live, and the write reaches disk. (The retired lifetime WRITE_LOCK_HELD read-only
// refusal is GONE — owner decision: finish the redesign so every session can write.) Behaviour verified
// against the live door before this rewrite (apply → {ok:true, findings:[]}).
import { acquireLock, acquireLockOrReadOnly } from '../../tools/spec-mcp-server/lock-manager.ts';
interface RoDoorWorld extends F40World {
  roApply?: { ok: boolean; error?: string };
  roRead?: { ok: boolean; content?: string };
  roPropose?: { ok: boolean; error?: string };
  roBodyBefore?: string;
  roBodyAfter?: string;
}
const RO_WRITTEN = '## FR-1: ReadOnly\n\nSecond session wrote this, serialized.\n';
Given('a spec corpus whose presence-lock is already held by another session', function (this: RoDoorWorld) {
  const dir = path.join(this.tempDir, '.specs', 'ro-demo');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'FR.md'), '## FR-1: ReadOnly\n\nOriginal body.\n');
  this.roBodyBefore = fs.readFileSync(path.join(dir, 'FR.md'), 'utf-8');
  // First session holds the lifetime PRESENCE lock for THIS corpus (no longer a write-block under E-A).
  acquireLock({ repoRoot: this.tempDir, env: 'host' });
});
When('a second session boots its door and exercises read + write tools', async function (this: RoDoorWorld) {
  await inCorpus(this, async () => {
    // Non-fatal acquisition: contention → presence-reader (no throw). Under E-A it STILL writes.
    const acq = acquireLockOrReadOnly({ repoRoot: this.tempDir, env: 'host' });
    assert.equal(acq.mode, 'reader', 'a second session does not own the lifetime presence lock');
    const tools = buildToolRegistry(() => buildGraph({ repoRoot: this.tempDir, skipNdjson: true }));
    const call = async (name: string, args: Record<string, unknown>): Promise<any> => {
      const r = (await tools.find((t) => t.name === name)!.handler(args as never)) as { content: Array<{ text: string }> };
      return JSON.parse(r.content[0].text);
    };
    this.roApply = await call('apply_spec_change', {
      spec: 'ro-demo', doc: 'FR.md',
      old_string: 'Original body.', new_string: 'Second session wrote this, serialized.',
      reason: 'serialized write from a second session',
    });
    this.roRead = await call('read_spec_doc', { spec: 'ro-demo', doc: 'FR.md' });
    this.roPropose = await call('propose_spec_change', { spec: 'ro-demo', doc: 'FR.md', content: '## FR-1: ReadOnly\n\nproposed.\n' });
  });
  this.roBodyAfter = fs.readFileSync(path.join(this.tempDir, '.specs', 'ro-demo', 'FR.md'), 'utf-8');
});
Then('every session can write — the second session\'s write serialises in, reads stay live, and no lifetime lock refuses it', function (this: RoDoorWorld) {
  assert.equal(this.roApply!.ok, true, 'apply_spec_change must SUCCEED — the door is writable for every session (no lifetime read-only)');
  assert.notEqual(this.roApply!.error, 'WRITE_LOCK_HELD', 'the retired lifetime read-only refusal must NOT fire');
  assert.ok(this.roRead!.ok, 'read_spec_doc stays available');
  assert.ok(this.roRead!.content!.includes('Second session wrote this'), 'the read returns the serialized write');
  assert.notEqual(this.roPropose!.error, 'WRITE_LOCK_HELD', 'the propose dry-run is not lock-gated');
  assert.equal(this.roBodyAfter, RO_WRITTEN, 'the serialized write reached disk');
});

// ── SPECGEN004_150 — P21-2 read_spec_doc pagination over a big doc ───────────
// Binds the REAL read_spec_doc handler: a {section} read returns one heading
// block (down to the next same/higher heading, deeper headings stay in); an
// {offset,limit} read returns a line window with truncated+next_offset; the
// whole-doc read stays back-compat and every reply carries total_lines.
interface PageWorld extends F40World {
  pgSection?: { ok: boolean; content?: string; section?: string; lines?: number; total_lines?: number };
  pgWindow?: { ok: boolean; content?: string; lines?: number; truncated?: boolean; next_offset?: number | null; total_lines?: number };
  pgWhole?: { ok: boolean; content?: string; total_lines?: number };
  pgMiss?: { ok: boolean; error?: string };
}
Given('a spec doc with several headings and many lines', function (this: PageWorld) {
  const dir = path.join(this.tempDir, '.specs', 'page-demo');
  fs.mkdirSync(dir, { recursive: true });
  const body = [
    '# Doc', 'intro line',
    '## FR-1', 'fr1 a', 'fr1 b',
    '## FR-2', 'fr2 marker UNIQUE-FR2', '### AC-2.1', 'deeper stays in FR-2',
    '## FR-3', 'fr3 tail',
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(dir, 'FR.md'), body);
});
When('the agent reads it by section, by line window, and whole', async function (this: PageWorld) {
  this.pgSection = await inCorpus(this, () => callTool(this, 'read_spec_doc', { spec: 'page-demo', doc: 'FR.md', section: 'FR-2' }));
  this.pgWindow = await inCorpus(this, () => callTool(this, 'read_spec_doc', { spec: 'page-demo', doc: 'FR.md', offset: 1, limit: 3 }));
  this.pgWhole = await inCorpus(this, () => callTool(this, 'read_spec_doc', { spec: 'page-demo', doc: 'FR.md' }));
  this.pgMiss = await inCorpus(this, () => callTool(this, 'read_spec_doc', { spec: 'page-demo', doc: 'FR.md', section: 'FR-9999' }));
});
// ── SPECGEN004_151 — P21-2 inline escape marker over .specs under enforce ────
// Spawns the REAL guard (full main(): violationOf + enforceEnabled +
// extractSkipMarker + decision). Under enforce a Bash `.specs/` read is DENY;
// appending `[skip-spec-access: <reason ≥8>]` to the command ALLOWS it (logged);
// a too-short reason is NOT honoured (stays DENY). Also pins the pure parser.
import { spawnSync as _spawnSync151 } from 'node:child_process';
interface EscapeWorld extends F39World {
  escWith?: number;
  escWithout?: number;
  escShort?: number;
  escLogged?: boolean;
}
Given('the spec-access-guard inline escape under enforce', function (this: EscapeWorld) {
  fs.mkdirSync(path.join(this.tempDir, '.specs', 'esc-demo'), { recursive: true });
  fs.writeFileSync(path.join(this.tempDir, '.specs', 'esc-demo', 'FR.md'), '## FR-1\n\nbody\n');
});
When('a Bash spec read runs with a valid marker, no marker, and a too-short marker', function (this: EscapeWorld) {
  const guardPath = path.resolve(process.cwd(), 'tools', 'specs-validator', 'spec-access-guard.ts');
  const S = '.' + 'specs';
  const run = (command: string): number => {
    const r = _spawnSync151('node', ['--import', 'tsx', guardPath], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: this.tempDir }),
      encoding: 'utf-8',
      env: { ...process.env, SPEC_ACCESS_ENFORCE: 'true', SPEC_ACCESS_SKIP: '' },
    });
    return r.status ?? -1;
  };
  this.escWith = run(`cat ${S}/esc-demo/FR.md # [skip-spec-access: cleanup stray scaffold artifact]`);
  this.escWithout = run(`cat ${S}/esc-demo/FR.md`);
  this.escShort = run(`cat ${S}/esc-demo/FR.md # [skip-spec-access: x]`);
  const log = path.join(this.tempDir, '.claude', 'logs', 'spec-access-escapes.jsonl');
  this.escLogged = fs.existsSync(log) && fs.readFileSync(log, 'utf-8').includes('cleanup stray scaffold artifact');
});
Then('only the valid marker is honoured and the escape is audit-logged', function (this: EscapeWorld) {
  assert.equal(this.escWith, 0, 'a valid [skip-spec-access: …] marker must ALLOW the Bash spec read (exit 0)');
  assert.equal(this.escWithout, 2, 'no marker → DENY (exit 2)');
  assert.equal(this.escShort, 2, 'a <8-char reason must NOT be honoured → DENY (exit 2)');
  assert.ok(this.escLogged, 'the honoured escape must land in spec-access-escapes.jsonl with its reason');
  // Pin the pure parser the decision relies on.
  assert.equal(extractSkipMarker('x # [skip-spec-access: deliberate cleanup]'), 'deliberate cleanup');
  assert.equal(extractSkipMarker('cat .specs/x'), null);
  assert.equal(extractSkipMarker('[skip-spec-access: ]'), '');
});

Then('each paging mode returns the right slice with total_lines metadata', function (this: PageWorld) {
  // section: just the FR-2 block, deeper AC-2.1 included, FR-3 excluded.
  assert.ok(this.pgSection!.ok, 'section read must succeed');
  assert.ok(this.pgSection!.content!.includes('UNIQUE-FR2'), 'section must contain its own body');
  assert.ok(this.pgSection!.content!.includes('### AC-2.1'), 'a deeper heading stays inside the section');
  assert.ok(!this.pgSection!.content!.includes('## FR-3'), 'the next same-level heading ends the section');
  // window: 3 lines, truncated, next_offset past them.
  assert.equal(this.pgWindow!.lines, 3, 'line window must honour limit');
  assert.equal(this.pgWindow!.truncated, true, 'a partial window must report truncated');
  assert.equal(this.pgWindow!.next_offset, 4, 'next_offset must point past the window');
  // whole: back-compat + size metadata present in every mode.
  assert.ok(this.pgWhole!.ok && this.pgWhole!.content!.includes('# Doc'), 'whole-doc read stays back-compat');
  assert.ok((this.pgWhole!.total_lines ?? 0) >= 11, 'total_lines metadata accompanies the read');
  assert.equal(this.pgSection!.total_lines, this.pgWhole!.total_lines, 'total_lines is the doc total, not the slice');
  // missing section is explicit, never an empty string.
  assert.equal(this.pgMiss!.ok, false);
  assert.equal(this.pgMiss!.error, 'SECTION_NOT_FOUND');
});

// ── SPECGEN004_153 — P21-5 optimistic CAS on apply_spec_change ───────────────
// Binds the REAL door: read_spec_doc returns a content sha; apply with the fresh
// sha lands (and returns the NEW sha); apply with the now-stale sha is refused
// CAS_MISMATCH (reporting the actual sha); re-reading + retrying lands. A subdir
// doc isolates CAS from the form/anchor/conformance gates.
interface CasWorld extends F40World {
  casSha?: string;
  casFresh?: { ok: boolean; sha?: string };
  casStale?: { ok: boolean; error?: string; actual_sha?: string };
  casRebased?: { ok: boolean };
}
Given('a spec doc read with its content sha', async function (this: CasWorld) {
  const dir = path.join(this.tempDir, '.specs', 'cas-demo', 'notes');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'x.md'), 'hello\n');
  const read = await inCorpus(this, () => callTool(this, 'read_spec_doc', { spec: 'cas-demo', doc: 'notes/x.md' }));
  this.casSha = read.sha;
});
When('the agent applies with the fresh sha, then the stale sha, then the rebased sha', async function (this: CasWorld) {
  this.casFresh = await inCorpus(this, () => callTool(this, 'apply_spec_change', { spec: 'cas-demo', doc: 'notes/x.md', content: 'hello2\n', expected_sha: this.casSha, reason: 'cas fresh' }));
  this.casStale = await inCorpus(this, () => callTool(this, 'apply_spec_change', { spec: 'cas-demo', doc: 'notes/x.md', content: 'hello3\n', expected_sha: this.casSha, reason: 'cas stale' }));
  this.casRebased = await inCorpus(this, () => callTool(this, 'apply_spec_change', { spec: 'cas-demo', doc: 'notes/x.md', content: 'hello3\n', expected_sha: this.casFresh!.sha, reason: 'cas rebased' }));
});
Then('only the up-to-date write lands and the stale one is refused CAS_MISMATCH', function (this: CasWorld) {
  assert.match(this.casSha ?? '', /^[0-9a-f]{64}$/, 'read_spec_doc must return a content sha');
  assert.equal(this.casFresh!.ok, true, 'a fresh-sha write must land');
  assert.ok(this.casFresh!.sha && this.casFresh!.sha !== this.casSha, 'apply returns the NEW sha for chaining edits');
  assert.equal(this.casStale!.ok, false, 'a stale-sha write must be refused');
  assert.equal(this.casStale!.error, 'CAS_MISMATCH');
  assert.equal(this.casStale!.actual_sha, this.casFresh!.sha, 'the refusal reports the actual current sha');
  assert.equal(this.casRebased!.ok, true, 're-reading the fresh sha and retrying must succeed');
});

// ── SPECGEN004_503 — FR-39 search coverage: tested-by edges + covered flag in ONE call ──
interface SearchCovWorld extends V4World {
  covPrevCwd?: string;
  covResults?: Array<{ id: string; covered?: boolean; tested_by?: string[] }>;
}
Given('a cov-demo spec whose FR owns a @feature1-tagged scenario', function (this: SearchCovWorld) {
  const dir = path.join(this.tempDir, '.specs', 'cov-demo');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'FR.md'), '## FR-1: Coverage demo @feature1\n\nBody.\n');
  fs.writeFileSync(
    path.join(dir, 'cov-demo.feature'),
    'Feature: Cov demo\n\n  @feature1\n  Scenario: COVDEMO_01 the thing works\n    Given a precondition\n    When an action\n    Then an outcome\n',
  );
  this.covPrevCwd = process.cwd();
  process.chdir(this.tempDir);
});
When('the search tool runs with coverage for the cov-demo FR', async function (this: SearchCovWorld) {
  try {
    const tools = buildToolRegistry(() => buildGraph({ repoRoot: this.tempDir, skipNdjson: true }));
    const r = await tools.find((t) => t.name === 'search')!.handler({ query: 'cov-demo:FR-1', coverage: true });
    this.covResults = JSON.parse((r as { content: Array<{ text: string }> }).content[0].text).results;
  } finally {
    process.chdir(this.covPrevCwd!);
  }
});
Then('the cov-demo FR result carries tested-by scenarios and a covered flag in one call', function (this: SearchCovWorld) {
  const fr = this.covResults!.find((x) => x.id === 'cov-demo:FR-1');
  assert.ok(fr, 'search must return the cov-demo FR node');
  assert.equal(fr!.covered, true, 'an FR with a @feature1 scenario must be covered:true — answered by the single search call');
  assert.deepEqual(fr!.tested_by, ['cov-demo:SCEN-covdemo-01-the-thing-works'], 'tested_by must list EXACTLY the one covering scenario node');
});

// ── SPECGEN004_504 — FR-39c guard maps a denied .specs grep to the concrete search call ──
import { suggestDoorCall } from '../../tools/specs-validator/spec-access-guard.ts';
interface SuggestWorld extends V4World {
  suggestions?: Record<string, string | null>;
}
Given('the spec-access-guard grep-to-search suggester', function (this: SuggestWorld) {
  this.suggestions = {};
});
When('denied .specs greps and a non-grep reader are mapped to door calls', function (this: SuggestWorld) {
  this.suggestions = {
    quoted: suggestDoorCall('grep -rn "jira-mode" .specs/foo'),
    bare: suggestDoorCall('grep jira-mode .specs/foo'),
    rg: suggestDoorCall('rg "FR-7" .specs/bar'),
    nonGrep: suggestDoorCall('cat .specs/foo/FR.md'),
  };
});
Then('each grep maps to its concrete spec-door search call and the non-grep maps to nothing', function (this: SuggestWorld) {
  assert.match(this.suggestions!.quoted!, /spec-door\.ts search "jira-mode"/, 'quoted grep pattern -> search "jira-mode"');
  assert.match(this.suggestions!.bare!, /spec-door\.ts search "jira-mode"/, 'bareword grep pattern -> search "jira-mode"');
  assert.match(this.suggestions!.rg!, /spec-door\.ts search "FR-7"/, 'rg pattern -> search "FR-7"');
  assert.equal(this.suggestions!.nonGrep, null, 'a non-grep .specs read has no grep->search mapping');
});
