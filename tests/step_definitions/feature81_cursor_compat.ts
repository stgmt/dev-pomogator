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
  liveEvidenceCodes?: Set<string>;
  liveEvidencePermissiveOk?: boolean;
  groundTruthFixtureDir?: string;
  groundTruthResult?: LiveEvidenceValidationResult;
  groundTruthTamperCodes?: Set<string>;
};

type MutableManifest = {
  git_sha: string;
  workspace_files: string[];
  workspace_digest: string;
  trace: { path: string; sha256: string };
  records: Array<Record<string, unknown>>;
};

const LIVE_EVIDENCE_FIXTURE_DIR = path.join(REPO, 'tests', 'fixtures', 'live-evidence');

function initFixtureGitRepo(dir: string): string {
  assert.equal(spawnSync('git', ['init'], { cwd: dir, encoding: 'utf8' }).status, 0);
  fs.writeFileSync(path.join(dir, 'tracked.txt'), 'tracked', 'utf8');
  assert.equal(spawnSync('git', ['add', 'tracked.txt'], { cwd: dir }).status, 0);
  const commit = spawnSync('git', ['-c', 'user.name=BDD', '-c', 'user.email=bdd@example.invalid', 'commit', '-m', 'fixture'], { cwd: dir, encoding: 'utf8' });
  assert.equal(commit.status, 0, commit.stderr);
  return spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout.trim();
}

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

/**
 * Two-sided completeness (FR-81f): the real producer manifest carries records for
 * BOTH live scenarios, so the full expectation set is validated once and each
 * scenario asserts against the same stored result. Validating per-scenario would
 * reject the sibling record as unexpected.
 */
const LIVE_EXPECTED_SCENARIOS: Record<string, 'PASSED'> = {
  SPECGEN004_668: 'PASSED',
  SPECGEN004_669: 'PASSED',
};
const LIVE_EXPECTED_PROFILES: Record<string, string> = {
  SPECGEN004_668: 'cursor-mcp-catalog',
  SPECGEN004_669: 'cursor-enforce-mcp',
};

function requireLiveEvidence(world: World, scenarioId: string): void {
  const manifestPath = process.env.DEV_POMOGATOR_LIVE_EVIDENCE?.trim();
  assert.ok(manifestPath, 'DEV_POMOGATOR_LIVE_EVIDENCE must point to a real producer manifest');
  if (!world.liveEvidenceResult) {
    world.liveEvidenceResult = validateLiveEvidence({
      manifestPath,
      repoRoot: REPO,
      expectedScenarios: LIVE_EXPECTED_SCENARIOS,
      expectedProfiles: LIVE_EXPECTED_PROFILES,
    });
  }
  assert.ok(
    world.liveEvidenceResult.ok,
    `live evidence rejected: ${world.liveEvidenceResult.errors.map((error) => `${error.code}: ${error.message}`).join('; ')}`,
  );
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
  assert.match(this.ensureOut ?? '', /OK|Cursor-native|match/i);
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
  initFixtureGitRepo(this.liveEvidencePath);
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

// SPECGEN004_686 — symlink/junction escapes must fail closed (FR-81e / AC-81.8).
Given('a live evidence manifest whose workspace and trace files escape through symlinks', function (this: World) {
  this.liveEvidencePath = fs.mkdtempSync(path.join(this.tempDir, 'live-evidence-escape-'));
  initFixtureGitRepo(this.liveEvidencePath);
  const outsideDir = fs.mkdtempSync(path.join(this.tempDir, 'live-evidence-outside-'));
  const outsideWorkspace = path.join(outsideDir, 'outside-workspace.txt');
  const outsideTrace = path.join(outsideDir, 'outside-trace.json');
  fs.writeFileSync(outsideWorkspace, 'external workspace bytes', 'utf8');
  fs.writeFileSync(outsideTrace, JSON.stringify({ external: true }), 'utf8');
  fs.symlinkSync(outsideWorkspace, path.join(this.liveEvidencePath!, 'escape-workspace.txt'));
  fs.symlinkSync(outsideTrace, path.join(this.liveEvidencePath!, 'escape-trace.json'));
  const manifest = writeLiveEvidenceFixture(this) as unknown as MutableManifest;
  manifest.workspace_files = ['escape-workspace.txt'];
  manifest.workspace_digest = digestWorkspace(this.liveEvidencePath!, ['escape-workspace.txt']);
  manifest.trace = {
    path: 'escape-trace.json',
    sha256: sha256File(path.join(this.liveEvidencePath!, 'escape-trace.json')),
  };
  for (const record of manifest.records) {
    record.git_sha = manifest.git_sha;
    record.workspace_digest = manifest.workspace_digest;
    record.trace_hash = manifest.trace.sha256;
  }
  this.liveEvidenceManifestPath = path.join(this.liveEvidencePath!, 'manifest.json');
  fs.writeFileSync(this.liveEvidenceManifestPath, JSON.stringify(manifest), 'utf8');
});

When('the real live evidence validator checks canonical path containment', function (this: World) {
  const result = validateLiveEvidence({
    manifestPath: this.liveEvidenceManifestPath!,
    repoRoot: this.liveEvidencePath!,
  });
  this.liveEvidenceResult = result;
  this.liveEvidenceCodes = new Set(result.errors.map((error) => error.code));
});

Then('escaping workspace and trace evidence are rejected fail-closed by named findings', function (this: World) {
  assert.equal(this.liveEvidenceResult!.ok, false, 'escaping evidence must never validate');
  const codes = [...this.liveEvidenceCodes!].join(',');
  assert.ok(this.liveEvidenceCodes!.has('WORKSPACE_FILE_CONTAINMENT_ESCAPE'), codes);
  assert.ok(this.liveEvidenceCodes!.has('TRACE_CONTAINMENT_ESCAPE'), codes);
});

// SPECGEN004_687 — expected-record completeness is two-sided (FR-81f / AC-81.9).
Given('a producer-derived manifest containing an unexpected extra evidence record', function (this: World) {
  this.liveEvidencePath = fs.mkdtempSync(path.join(this.tempDir, 'live-evidence-extra-'));
  initFixtureGitRepo(this.liveEvidencePath);
  const manifest = writeLiveEvidenceFixture(this) as unknown as MutableManifest;
  const tracePath = path.join(this.liveEvidencePath!, 'trace.json');
  const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8')) as { events: Array<Record<string, unknown>> };
  const extraEvent = {
    event_id: 'event-extra',
    scenario_id: 'SPECGEN004_UNEXPECTED',
    profile: 'cursor-mcp-catalog',
    producer: true,
    tool_catalog: [DOOR],
    server_name: DOOR,
  };
  trace.events.push(extraEvent);
  fs.writeFileSync(tracePath, JSON.stringify(trace), 'utf8');
  const traceHash = sha256File(tracePath);
  manifest.trace.sha256 = traceHash;
  for (const record of manifest.records) record.trace_hash = traceHash;
  manifest.records.push({
    scenario_id: 'SPECGEN004_UNEXPECTED',
    profile: 'cursor-mcp-catalog',
    result: 'PASSED',
    git_sha: manifest.git_sha,
    workspace_digest: manifest.workspace_digest,
    producer_name: 'fixture-producer',
    producer_version: '2.0.0',
    trace_event: extraEvent.event_id,
    trace_event_sha256: digestTraceEvent(extraEvent),
    trace_hash: traceHash,
  });
  this.liveEvidenceManifestPath = path.join(this.liveEvidencePath!, 'manifest.json');
  fs.writeFileSync(this.liveEvidenceManifestPath, JSON.stringify(manifest), 'utf8');
});

When('the real validator checks the manifest with and without an expectation set', function (this: World) {
  const withExpectations = validateLiveEvidence({
    manifestPath: this.liveEvidenceManifestPath!,
    repoRoot: this.liveEvidencePath!,
    expectedScenarios: { SPECGEN004_682: 'PASSED' },
    expectedProfiles: { SPECGEN004_682: 'cursor-mcp-catalog' },
  });
  this.liveEvidenceResult = withExpectations;
  this.liveEvidenceCodes = new Set(withExpectations.errors.map((error) => error.code));
  this.liveEvidencePermissiveOk = validateLiveEvidence({
    manifestPath: this.liveEvidenceManifestPath!,
    repoRoot: this.liveEvidencePath!,
  }).ok;
});

Then('unexpected records fail closed while empty expectations stay permissive', function (this: World) {
  assert.equal(this.liveEvidenceResult!.ok, false, 'an unexpected record must reject the manifest');
  assert.ok(this.liveEvidenceCodes!.has('UNEXPECTED_EVIDENCE_RECORD'), [...this.liveEvidenceCodes!].join(','));
  assert.equal(this.liveEvidencePermissiveOk, true, 'without expectations the extra record is not a completeness violation');
});

// SPECGEN004_688 — captured fixture validated against INDEPENDENT ground-truth digests (FR-81g / AC-81.10).
Given('a captured live evidence fixture with independent ground-truth digests', function (this: World) {
  this.groundTruthFixtureDir = fs.mkdtempSync(path.join(this.tempDir, 'live-evidence-ground-truth-'));
  for (const name of ['manifest.json', 'trace.json', 'workspace.txt', 'ground-truth.json']) {
    fs.copyFileSync(path.join(LIVE_EVIDENCE_FIXTURE_DIR, name), path.join(this.groundTruthFixtureDir!, name));
  }
  const gitSha = initFixtureGitRepo(this.groundTruthFixtureDir!);
  const groundTruth = JSON.parse(fs.readFileSync(path.join(LIVE_EVIDENCE_FIXTURE_DIR, 'ground-truth.json'), 'utf8')) as Record<string, string>;
  const manifestPath = path.join(this.groundTruthFixtureDir!, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as MutableManifest;
  // The independent constants must agree with the captured manifest BEFORE any validator code runs.
  assert.equal(manifest.workspace_digest, groundTruth.workspace_digest);
  assert.equal(manifest.trace.sha256, groundTruth.trace_sha256);
  assert.equal(manifest.records[0].trace_event_sha256, groundTruth.trace_event_sha256);
  // git_sha is checkout-bound by design: stamp the fixture repo HEAD.
  manifest.git_sha = gitSha;
  for (const record of manifest.records) record.git_sha = gitSha;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
});

When('the real validator verifies the captured fixture and tampered variants', function (this: World) {
  const repoRoot = this.groundTruthFixtureDir!;
  const manifestPath = path.join(repoRoot, 'manifest.json');
  const expectations = {
    expectedScenarios: { SPECGEN004_688: 'PASSED' as const },
    expectedProfiles: { SPECGEN004_688: 'cursor-mcp-catalog' },
  };
  this.groundTruthResult = validateLiveEvidence({ manifestPath, repoRoot, ...expectations });
  const tamperCodes = new Set<string>();
  fs.appendFileSync(path.join(repoRoot, 'workspace.txt'), 'X');
  for (const error of validateLiveEvidence({ manifestPath, repoRoot, ...expectations }).errors) tamperCodes.add(error.code);
  const traceFile = path.join(repoRoot, 'trace.json');
  fs.writeFileSync(traceFile, fs.readFileSync(traceFile, 'utf8').replace('event-ground-truth', 'event-ground-trutX'), 'utf8');
  for (const error of validateLiveEvidence({ manifestPath, repoRoot, ...expectations }).errors) tamperCodes.add(error.code);
  this.groundTruthTamperCodes = tamperCodes;
});

Then('the captured fixture passes against independent digests and one-byte tamper fails closed', function (this: World) {
  assert.equal(
    this.groundTruthResult!.ok,
    true,
    `captured fixture rejected: ${this.groundTruthResult!.errors.map((error) => `${error.code}: ${error.message}`).join('; ')}`,
  );
  const summary = [...this.groundTruthTamperCodes!].sort().join(',');
  assert.ok(this.groundTruthTamperCodes!.has('WORKSPACE_DIGEST_MISMATCH'), summary);
  assert.ok(this.groundTruthTamperCodes!.has('TRACE_HASH_MISMATCH'), summary);
  assert.ok(this.groundTruthTamperCodes!.has('TRACE_EVENT_MISSING'), summary);
});
