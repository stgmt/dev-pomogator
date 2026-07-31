/**
 * FR-81 deterministic BDD steps (SPECGEN004_665–667).
 * Live 668–669 stay pending (manual evidence).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Given, When, Then } from '@cucumber/cucumber';
import { resolveRepoRoot } from '../../tools/spec-mcp-server/server.ts';

const REPO = process.cwd();
const DOOR = 'dev-pomogator-specs';

type World = {
  cursorMcp?: Record<string, unknown>;
  ensureExit?: number;
  ensureOut?: string;
  rrResult?: string;
  rrEnv?: string;
  rrCwd?: string;
};

Given('the repository root contains {string}', function (this: World, rel: string) {
  assert.ok(fs.existsSync(path.join(REPO, rel)), `missing ${rel}`);
});

When('the Cursor MCP config is loaded', function (this: World) {
  const raw = fs.readFileSync(path.join(REPO, '.cursor', 'mcp.json'), 'utf-8');
  this.cursorMcp = JSON.parse(raw) as Record<string, unknown>;
});

Then('it names the {string} server', function (this: World, name: string) {
  const servers = (this.cursorMcp as { mcpServers?: Record<string, unknown> }).mcpServers ?? {};
  assert.ok(servers[name], `missing server ${name}`);
});

Then('the launch path includes {string}', function (this: World, fragment: string) {
  const servers = (this.cursorMcp as { mcpServers?: Record<string, { args?: string[] }> }).mcpServers ?? {};
  const entry = servers[DOOR];
  const blob = JSON.stringify(entry ?? {});
  // Root/Cursor door launch uses node -e + path.join('tools','spec-mcp-server','server.bundle.mjs'),
  // so a contiguous "tools/…" string may be absent while every segment is present.
  const ok =
    blob.includes(fragment) ||
    (fragment.includes('/') && fragment.split('/').every((part) => part.length === 0 || blob.includes(part)));
  assert.ok(ok, `expected ${fragment} (or path segments) in ${blob}`);
});

Given(
  'root {string} and {string} both declare {string}',
  function (this: World, rootRel: string, cursorRel: string, name: string) {
    const root = JSON.parse(fs.readFileSync(path.join(REPO, rootRel), 'utf-8')) as {
      mcpServers?: Record<string, unknown>;
    };
    const cursor = JSON.parse(fs.readFileSync(path.join(REPO, cursorRel), 'utf-8')) as {
      mcpServers?: Record<string, unknown>;
    };
    assert.ok(root.mcpServers?.[name], `root missing ${name}`);
    assert.ok(cursor.mcpServers?.[name], `cursor missing ${name}`);
  },
);

When('ensure-cursor-mcp runs with {string}', function (this: World, flag: string) {
  const r = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'tools/spec-mcp-server/ensure-cursor-mcp.ts', flag],
    { cwd: REPO, encoding: 'utf-8' },
  );
  this.ensureExit = r.status ?? 1;
  this.ensureOut = `${r.stdout ?? ''}${r.stderr ?? ''}`;
});

Then('it exits {int} reporting the door entries match', function (this: World, code: number) {
  assert.equal(this.ensureExit, code, this.ensureOut);
  assert.match(this.ensureOut ?? '', /OK|match/i);
});

Given(
  'DEV_POMOGATOR_REPO_ROOT is the literal {string}',
  function (this: World, literal: string) {
    this.rrEnv = literal;
  },
);

Given(
  'process.cwd\\(\\) is a directory that contains {string}',
  function (this: World, marker: string) {
    assert.ok(fs.existsSync(path.join(REPO, marker)), `cwd missing ${marker}`);
    this.rrCwd = REPO;
  },
);

When('resolveRepoRoot runs', function (this: World) {
  this.rrResult = resolveRepoRoot(this.rrEnv, this.rrCwd ?? REPO);
});

Then('it returns the cwd that contains {string}', function (this: World, marker: string) {
  assert.equal(this.rrResult, this.rrCwd);
  assert.ok(fs.existsSync(path.join(this.rrResult!, marker)));
});

// Live dogfood — honest pending until manual Cursor evidence (FR-81c / FR-32)
Given(
  'Cursor Third-party skills are enabled and {string} is loaded',
  function (this: World, _rel: string) {
    return 'pending';
  },
);

When('the agent inspects the MCP tool catalog', function (this: World) {
  return 'pending';
});

Then('{string} tools are listed', function (this: World, _name: string) {
  return 'pending';
});

Given(
  'SPEC_ACCESS enforce is on and project {string} hooks are loaded in Cursor',
  function (this: World, _rel: string) {
    return 'pending';
  },
);

When('the agent attempts a raw Write under {string}', function (this: World, _rel: string) {
  return 'pending';
});

Then('the PreToolUse guard denies the write', function (this: World) {
  return 'pending';
});

Then('a valid MCP apply_spec_change succeeds', function (this: World) {
  return 'pending';
});
