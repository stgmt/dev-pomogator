/**
 * FR-81 deterministic BDD steps (SPECGEN004_665–667).
 * Live 668–669 run only in the explicit profile with real producer evidence.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Given, When, Then } from '@cucumber/cucumber';
import { resolveRepoRoot } from '../../tools/spec-mcp-server/server.ts';
import {
  assertLiveEvidence,
  digestTraceEvent,
  digestWorkspace,
  validateLiveEvidence,
  type LiveEvidenceValidationResult,
} from '../../tools/live-evidence/validator.mjs';

const REPO = process.cwd();
const DOOR = 'dev-pomogator-specs';

type World = {
  cursorMcp?: Record<string, unknown>;
  ensureExit?: number;
  ensureOut?: string;
  rrResult?: string;
  rrEnv?: string;
  rrCwd?: string;
  liveEvidencePath?: string;
  liveEvidenceScenarios?: string[];
  liveEvidenceResult?: LiveEvidenceValidationResult;
  liveEvidenceManifestPath?: string;
};

function sha256File(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function writeLiveEvidenceFixture(world: World): Record<string, unknown> {
  const workspaceFile = 'workspace.txt';
  fs.writeFileSync(path.join(world.liveEvidencePath!, workspaceFile), 'current workspace input', 'utf8');
  const gitSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: world.liveEvidencePath, encoding: 'utf8' }).stdout.trim();
  const event = {
    event_id: 'event-682',
    scenario_id: 'SPECGEN004_682',
    profile: 'cursor-mcp-catalog',
    producer: true,
    tool_catalog: ['dev-pomogator-specs'],
    server_name: DOOR,
  };
  const trace = {
    schema: 'dev-pomogator.live-evidence.trace.v2',
    producer: { name: 'fixture-producer', version: '2.0.0', marker: 'dev-pomogator-live-evidence-producer/v2' },
    platform: process.platform,
    events: [event],
  };
  const tracePath = path.join(world.liveEvidencePath!, 'trace.json');
  fs.writeFileSync(tracePath, JSON.stringify(trace), 'utf8');
  const workspaceDigest = digestWorkspace(world.liveEvidencePath!, [workspaceFile]);
  return {
    schema: 'dev-pomogator.live-evidence.v2',
    generated_at: new Date().toISOString(),
    git_sha: gitSha,
    workspace_files: [workspaceFile],
    workspace_digest: workspaceDigest,
    producer: { name: 'fixture-producer', version: '2.0.0', marker: 'dev-pomogator-live-evidence-producer/v2' },
    trace: { path: 'trace.json', sha256: sha256File(tracePath) },
    records: [{
      scenario_id: 'SPECGEN004_682',
      profile: 'cursor-mcp-catalog',
      result: 'PASSED',
      git_sha: gitSha,
      workspace_digest: workspaceDigest,
      producer_name: 'fixture-producer',
      producer_version: '2.0.0',
      trace_event: event.event_id,
      trace_event_sha256: digestTraceEvent(event),
      trace_hash: sha256File(tracePath),
    }],
  };
}

function requireLiveEvidence(world: World, scenarioId: string): void {
  const manifestPath = process.env.DEV_POMOGATOR_LIVE_EVIDENCE?.trim();
  assert.ok(manifestPath, 'DEV_POMOGATOR_LIVE_EVIDENCE must point to a real producer manifest');
  assertLiveEvidence({
    manifestPath,
    repoRoot: REPO,
    expectedScenarios: { [scenarioId]: 'PASSED' },
    expectedProfiles: {
      [scenarioId]: scenarioId === 'SPECGEN004_668'
        ? 'cursor-mcp-catalog'
        : 'cursor-enforce-mcp',
    },
  });
  world.liveEvidencePath = manifestPath;
  world.liveEvidenceScenarios = [...(world.liveEvidenceScenarios ?? []), scenarioId];
}

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

// Live dogfood — only the explicit live-evidence profile may consume real producer evidence.
Given(
  'Cursor Third-party skills are enabled and {string} is loaded',
  function (this: World, rel: string) {
    assert.equal(rel, '.cursor/mcp.json');
    requireLiveEvidence(this, 'SPECGEN004_668');
  },
);

When('the agent inspects the MCP tool catalog', function (this: World) {
  assert.ok(this.liveEvidencePath, 'Cursor catalog evidence was not validated');
});

Then('{string} tools are listed', function (this: World, name: string) {
  assert.equal(name, DOOR);
  assert.ok(this.liveEvidenceScenarios?.includes('SPECGEN004_668'));
});

Given(
  'SPEC_ACCESS enforce is on and project {string} hooks are loaded in Cursor',
  function (this: World, rel: string) {
    assert.equal(rel, '.claude/settings.json');
    requireLiveEvidence(this, 'SPECGEN004_669');
  },
);

When('the agent attempts a raw Write under {string}', function (this: World, rel: string) {
  assert.equal(rel, '.specs/');
  assert.ok(this.liveEvidenceScenarios?.includes('SPECGEN004_669'));
});

Then('the PreToolUse guard denies the write', function (this: World) {
  assert.ok(this.liveEvidencePath, 'Cursor enforce evidence was not validated');
});

Then('a valid MCP apply_spec_change succeeds', function (this: World) {
  assert.ok(this.liveEvidenceScenarios?.includes('SPECGEN004_669'));
});

Given('a producer-derived live evidence manifest with current checkout and workspace bindings', function (this: World) {
  this.liveEvidencePath = fs.mkdtempSync(path.join(this.tempDir, 'live-evidence-'));
  const init = spawnSync('git', ['init'], { cwd: this.liveEvidencePath, encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  fs.writeFileSync(path.join(this.liveEvidencePath, 'tracked.txt'), 'tracked', 'utf8');
  assert.equal(spawnSync('git', ['add', 'tracked.txt'], { cwd: this.liveEvidencePath }).status, 0);
  const commit = spawnSync('git', ['-c', 'user.name=BDD', '-c', 'user.email=bdd@example.invalid', 'commit', '-m', 'fixture'], { cwd: this.liveEvidencePath, encoding: 'utf8' });
  assert.equal(commit.status, 0, commit.stderr);
  const manifest = writeLiveEvidenceFixture(this);
  this.liveEvidenceManifestPath = path.join(this.liveEvidencePath, 'manifest.json');
  fs.writeFileSync(this.liveEvidenceManifestPath, JSON.stringify(manifest), 'utf8');
});

When('the real live evidence validator checks missing and modified producer bindings', function (this: World) {
  const missing = validateLiveEvidence({
    manifestPath: this.liveEvidenceManifestPath!,
    repoRoot: this.liveEvidencePath!,
    expectedScenarios: { SPECGEN004_MISSING: 'PASSED' },
    expectedProfiles: { SPECGEN004_MISSING: 'cursor-mcp-catalog' },
  });
  const manifest = JSON.parse(fs.readFileSync(this.liveEvidenceManifestPath!, 'utf8')) as { records: Array<Record<string, unknown>> };
  manifest.records[0].trace_event = 'other-event';
  fs.writeFileSync(this.liveEvidenceManifestPath!, JSON.stringify(manifest), 'utf8');
  const modified = validateLiveEvidence({
    manifestPath: this.liveEvidenceManifestPath!,
    repoRoot: this.liveEvidencePath!,
    expectedScenarios: { SPECGEN004_682: 'PASSED' },
    expectedProfiles: { SPECGEN004_682: 'cursor-mcp-catalog' },
  });
  fs.writeFileSync(path.join(this.liveEvidencePath!, 'workspace.txt'), 'modified workspace input', 'utf8');
  const staleWorkspace = validateLiveEvidence({
    manifestPath: this.liveEvidenceManifestPath!,
    repoRoot: this.liveEvidencePath!,
    expectedScenarios: { SPECGEN004_682: 'PASSED' },
    expectedProfiles: { SPECGEN004_682: 'cursor-mcp-catalog' },
  });
  this.liveEvidenceResult = { ok: false, errors: [...missing.errors, ...modified.errors, ...staleWorkspace.errors], records: [] };
});

Then('missing expected records and changed trace or workspace evidence are rejected by named findings', function (this: World) {
  const codes = new Set(this.liveEvidenceResult!.errors.map((error) => error.code));
  assert.ok(codes.has('EXPECTED_SCENARIO_MISSING'));
  assert.ok(codes.has('EXPECTED_PROFILE_MISSING'));
  assert.ok(codes.has('TRACE_EVENT_MISSING'));
  assert.ok(codes.has('WORKSPACE_DIGEST_MISMATCH'));
});
