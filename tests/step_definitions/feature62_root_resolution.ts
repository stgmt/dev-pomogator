import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { resolveTargetProjectRoot, normalizeRootIdentity, type RootResolution } from '../../tools/spec-graph/root-resolution.ts';
import { resolveMcpRoot } from '../../tools/spec-mcp-server/server.ts';
import { precheck, resolvePrecheckRoot, type PrecheckResult } from '../../.claude/skills/spec-status/scripts/precheck.ts';

interface F62World extends V4World {
  repo?: string;
  pluginCache?: string;
  cli?: PrecheckResult;
  mcp?: RootResolution;
  resolutions?: RootResolution[];
}

function fixtureRoot(world: F62World): string {
  const root = path.join(world.tempDir, 'project');
  fs.mkdirSync(path.join(root, '.specs', 'demo'), { recursive: true });
  fs.writeFileSync(path.join(root, '.specs', 'demo', 'FR.md'), '# FR\n');
  return root;
}

Given(new RegExp('^a real fixture checkout has equivalent Windows and WSL roots and tracked readiness inputs$'), function (this: F62World) {
  this.repo = fixtureRoot(this);
  this.pluginCache = path.join(this.tempDir, '.claude', 'plugins', 'cache', 'dev-pomogator');
  fs.mkdirSync(this.pluginCache, { recursive: true });
  assert.equal(normalizeRootIdentity('/mnt/e/repos/demo'), normalizeRootIdentity('E:\\repos\\demo'));
});

Given(new RegExp('^SPECS_GENERATOR_ROOT is supplied as an environment override while stdin is independently inherited, closed, or noninteractive$'), function (this: F62World) {
  // Call the real resolver only: its input contract intentionally has no stdin,
  // therefore inherited/closed stdin cannot be read to choose a project root.
  process.env.SPECS_GENERATOR_ROOT = this.repo!;
});

When(new RegExp('^spec-status and MCP resolve the root in order through validated SPECS_GENERATOR_ROOT, caller or project cwd, and findRepoRoot\\(SCRIPT_DIR\\)$'), function (this: F62World) {
  this.cli = precheck(['demo'], this.repo!);
  this.mcp = resolveMcpRoot(this.repo, this.repo!, this.pluginCache!);
});

Then(new RegExp('^neither command waits indefinitely for stdin or reads the root from stdin$'), function (this: F62World) {
  assert.equal(resolvePrecheckRoot(this.repo!).source, 'env_override');
  assert.equal(this.mcp!.source, 'env_override');
  assert.equal(resolvePrecheckRoot(this.repo!).root, this.repo);
  delete process.env.SPECS_GENERATOR_ROOT;
});

Then(new RegExp('^valid SPECS_GENERATOR_ROOT selects the same tracked artifact set as the caller project fallback$'), function (this: F62World) {
  const caller = resolveTargetProjectRoot({ cwd: this.repo!, scriptDir: this.pluginCache! });
  assert.equal(caller.root, this.repo);
  assert.deepEqual(fs.readdirSync(path.join(this.mcp!.root!, '.specs')), fs.readdirSync(path.join(caller.root!, '.specs')));
});

Given(new RegExp('^a WSL-only command resolves its candidate root from the caller or project WSL worktree$'), function (this: F62World) {
  this.repo = fixtureRoot(this);
  this.pluginCache = path.join(this.tempDir, '.claude', 'plugins', 'cache', 'dev-pomogator');
  fs.mkdirSync(this.pluginCache, { recursive: true });
});

When(new RegExp('^the root precheck runs through CLI and MCP$'), function (this: F62World) {
  const unsafe = ['C:\\Windows', '\\\\server\\share', this.pluginCache!];
  this.resolutions = unsafe.map((cwd) => resolveTargetProjectRoot({ cwd, scriptDir: cwd }));
  this.cli = precheck(['demo'], this.repo!);
  this.mcp = resolveMcpRoot(undefined, this.repo!, this.pluginCache!);
});

Then(new RegExp('^each surface accepts only a validated caller or project WSL root$'), function (this: F62World) {
  assert.equal(this.cli!.root_resolution!.root, this.repo);
  assert.equal(this.mcp!.root, this.repo);
  assert.equal(normalizeRootIdentity('/mnt/e/project'), normalizeRootIdentity('E:\\project'));
});

Then(new RegExp('^it reports NOT_READY with the observed root, unsafe artifact, and corrective action without substituting a plugin-cache, C Windows cwd, or UNC-relative root$'), function (this: F62World) {
  for (const result of this.resolutions!) {
    assert.equal(result.status, 'NOT_READY');
    assert.equal(result.root, null);
    assert.ok(result.rejected.length > 0);
    assert.match(result.corrective_action, /SPECS_GENERATOR_ROOT/);
  }
});
