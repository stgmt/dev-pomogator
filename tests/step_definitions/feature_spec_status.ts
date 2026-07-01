// SPECGEN004_160/161 — explicit SPEC-level backlog marker (set_spec_status door tool + census exclusion).
// Drives the REAL chain: a temp corpus with two specs each carrying one open task; mark one `backlog`
// THROUGH the door's set_spec_status tool; the task-census (the same one the Stop-gate reads) then
// EXCLUDES the backlog spec — no status math, just the explicit marker. `active` restores it.
import { Given, When, Then } from '@cucumber/cucumber';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { computeTaskCensus } from '../../tools/spec-graph/task-census.ts';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { readSpecStatus, backlogSpecs } from '../../tools/spec-graph/spec-status-store.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';

interface SpecStatusWorld {
  ssRoot?: string;
  ssSet?: { ok: boolean; status?: string; error?: string };
  ssGet?: { ok: boolean; spec_status?: string };
  ssCensus?: { total: { open: number }; specs: Array<{ slug: string }> };
}

function mkSpecWithOpenTask(root: string, slug: string): void {
  const dir = path.join(root, '.specs', slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'FR.md'), `## FR-1: Demo for ${slug}\n\nBody.\n`);
  fs.writeFileSync(
    path.join(dir, 'TASKS.md'),
    `- [ ] Build the ${slug} thing -- @feature1 — id: t1 — Status: TODO | Est: 10m\n` +
      `  _Requirements: [FR-1](FR.md#fr-1)_\n  **Done When:**\n  - [ ] the thing exists\n`,
  );
}

async function callDoor(root: string, name: string, args: Record<string, unknown>): Promise<any> {
  const prev = process.cwd();
  process.chdir(root);
  try {
    const tools = buildToolRegistry(() => buildGraph({ repoRoot: root, skipNdjson: true }));
    const tool = tools.find((t) => t.name === name)!;
    const r = (await tool.handler(args as never)) as { content: Array<{ text: string }> };
    return JSON.parse(r.content[0].text);
  } finally {
    process.chdir(prev);
  }
}

function census(root: string): { total: { open: number }; specs: Array<{ slug: string }> } {
  const graph = buildGraph({ repoRoot: root, skipNdjson: true });
  return computeTaskCensus(graph, { backlogSpecs: backlogSpecs(root) }) as never;
}

function cleanup(root?: string): void {
  if (!root) return;
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* Windows can hold the temp dir briefly — best-effort cleanup */
  }
}

Given('a spec corpus with two specs each carrying one open task', function (this: SpecStatusWorld) {
  this.ssRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-status-'));
  mkSpecWithOpenTask(this.ssRoot, 'demo-a');
  mkSpecWithOpenTask(this.ssRoot, 'demo-b');
});

When('I mark spec demo-b backlog through the set_spec_status door tool', async function (this: SpecStatusWorld) {
  this.ssSet = await callDoor(this.ssRoot!, 'set_spec_status', { spec: 'demo-b', status: 'backlog' });
  this.ssGet = await callDoor(this.ssRoot!, 'get_spec_status', { spec: 'demo-b' });
  this.ssCensus = census(this.ssRoot!);
});

When('I mark spec demo-b backlog then back to active through the door', async function (this: SpecStatusWorld) {
  await callDoor(this.ssRoot!, 'set_spec_status', { spec: 'demo-b', status: 'backlog' });
  this.ssSet = await callDoor(this.ssRoot!, 'set_spec_status', { spec: 'demo-b', status: 'active' });
  this.ssCensus = census(this.ssRoot!);
});

Then('the door reports backlog and the task-census drops demo-b while demo-a stays', function (this: SpecStatusWorld) {
  assert.equal(this.ssSet!.ok, true, 'set_spec_status returns ok');
  assert.equal(this.ssSet!.status, 'backlog');
  assert.equal(this.ssGet!.spec_status, 'backlog', 'get_spec_status surfaces the explicit marker');
  assert.equal(readSpecStatus(this.ssRoot!, 'demo-b'), 'backlog', 'the .spec-status sentinel persisted');
  const slugs = this.ssCensus!.specs.map((s) => s.slug);
  assert.ok(slugs.includes('demo-a'), 'the active spec stays in the census');
  assert.ok(!slugs.includes('demo-b'), 'the backlog spec is EXCLUDED from the census');
  assert.equal(this.ssCensus!.total.open, 1, "only the active spec's open task is counted");
  cleanup(this.ssRoot);
});

Then('the marker is removed and the task-census counts demo-b again', function (this: SpecStatusWorld) {
  assert.equal(this.ssSet!.ok, true);
  assert.equal(this.ssSet!.status, 'active');
  assert.equal(readSpecStatus(this.ssRoot!, 'demo-b'), 'active', 'active removes the .spec-status marker');
  const slugs = this.ssCensus!.specs.map((s) => s.slug);
  assert.ok(slugs.includes('demo-a') && slugs.includes('demo-b'), 'both specs counted once active again');
  assert.equal(this.ssCensus!.total.open, 2, 'both open tasks counted again');
  cleanup(this.ssRoot);
});
