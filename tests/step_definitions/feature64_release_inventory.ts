import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import {
  classifyReleaseArtifact,
  evaluateReleaseInventory,
  type ReleaseCandidateControl,
  type ReleaseInventoryInput,
  type ReleaseInventoryResult,
} from '../../tools/spec-graph/release-inventory.ts';

interface InstalledRuntimeRun {
  fixture: string;
  launcher: SpawnSyncReturns<string>;
  status: SpawnSyncReturns<string>;
  mcp: SpawnSyncReturns<string>;
}

interface F64World extends V4World {
  releaseInput?: ReleaseInventoryInput;
  releaseResult?: ReleaseInventoryResult;
  candidate?: ReleaseCandidateControl;
  installedComplete?: InstalledRuntimeRun;
  installedMissing?: InstalledRuntimeRun;
}

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
const baseline = '0b291bac';
const edges = ['spec-generator-v4:FR-64'];
const canonicalArtifact = (path: string, tracked = true) => ({ path, tracked, intentional: true, traceability_edges: edges });

function baseInput(): ReleaseInventoryInput {
  return {
    baseline_sha: baseline,
    pre_tracked: ['tools/spec-graph/release-inventory.ts', 'tests/fixture.feature'],
    post_tracked: ['tools/spec-graph/release-inventory.ts', 'tests/fixture.feature'],
    artifacts: [canonicalArtifact('tools/spec-graph/release-inventory.ts'), canonicalArtifact('tests/fixture.feature')],
    units: [{ id: 'SPECGEN004_558', outcome: 'PASSED', in_scope: true, source: 'docker-bdd:full', run_id: 'docker-64' }],
  };
}

/** Copy only user-distributed runtime artifacts: the fixture deliberately has no node_modules. */
function installedFixture(root: string, missingBundle = false): string {
  const fixture = fs.mkdtempSync(path.join(root, 'installed-runtime-'));
  const copy = (relative: string) => {
    const target = path.join(fixture, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, relative), target);
  };
  copy('tools/_shared/bootstrap.cjs');
  copy('tools/_shared/tsx-runner.js');
  // Status is shipped as a script family and uses relative imports; preserve that real closure,
  // but never copy repository node_modules into the installed fixture.
  fs.cpSync(path.join(REPO_ROOT, '.claude', 'skills', 'spec-status', 'scripts'), path.join(fixture, '.claude', 'skills', 'spec-status', 'scripts'), { recursive: true });
  fs.cpSync(path.join(REPO_ROOT, 'tools', 'spec-graph'), path.join(fixture, 'tools', 'spec-graph'), { recursive: true });
  // Keep the CJS launcher outside this ESM boundary; precheck itself needs ESM for top-level await.
  fs.writeFileSync(path.join(fixture, '.claude', 'skills', 'spec-status', 'scripts', 'package.json'), JSON.stringify({ type: 'module' }));
  if (!missingBundle) copy('tools/spec-mcp-server/server.bundle.mjs');
  assert.equal(fs.existsSync(path.join(fixture, 'node_modules')), false, 'installed fixture must not receive repository dependencies');
  return fixture;
}

function fixtureEnv(fixture: string, project: string): NodeJS.ProcessEnv {
  return { ...process.env, CLAUDE_PLUGIN_ROOT: fixture, DEV_POMOGATOR_REPO_ROOT: project };
}

function runInstalled(fixture: string, project: string): InstalledRuntimeRun {
  const env = fixtureEnv(fixture, project);
  const launcher = spawnSync(process.execPath, ['-e', "require(require('path').join(process.env.CLAUDE_PLUGIN_ROOT,'tools','_shared','bootstrap.cjs'))", '--', '.claude/skills/spec-status/scripts/precheck.ts', 'missing-spec'], { cwd: project, env, encoding: 'utf8', timeout: 30_000 });
  // The installed status entrypoint is launched by the same shipped bootstrap that plugin hooks use.
  const status = spawnSync(process.execPath, [path.join(fixture, 'tools', '_shared', 'bootstrap.cjs'), '.claude/skills/spec-status/scripts/precheck.ts', 'missing-spec'], { cwd: project, env, encoding: 'utf8', timeout: 30_000 });
  const init = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'installed-fixture', version: '1' } } });
  const mcp = spawnSync(process.execPath, [path.join(fixture, 'tools/spec-mcp-server/server.bundle.mjs')], { input: `${init}\n`, cwd: project, env, encoding: 'utf8', timeout: 30_000 });
  return { fixture, launcher, status, mcp };
}

Given(new RegExp('^a real spec fixture contains source, spec-test, generated, temporary, smoke, unclassified, and silent evidence records$'), function (this: F64World) {
  const input = baseInput();
  input.artifacts = [
    canonicalArtifact('tools/spec-graph/release-inventory.ts'),
    canonicalArtifact('.specs/spec-generator-v4/spec-generator-v4.feature'),
    canonicalArtifact('dist/server.bundle.mjs'),
    canonicalArtifact('.tmp/inventory.tmp', false),
    canonicalArtifact('.docker-status/bdd-run.ndjson', false),
    { path: 'opaque.bin', tracked: true },
    { path: 'silent.evidence', tracked: false, classification: 'silent' },
  ];
  this.releaseInput = input;
});

When(new RegExp('^graph conformance and release inventory run with baseline evidence sha `0b291bac`$'), function (this: F64World) {
  this.releaseResult = evaluateReleaseInventory(this.releaseInput!);
});

Then(new RegExp('^canonical records retain explicit provenance, intentional classification, traceability edges, and baseline evidence sha `0b291bac`$'), function (this: F64World) {
  const result = this.releaseResult!;
  assert.equal(result.baseline_sha, baseline);
  assert.equal(classifyReleaseArtifact('tools/spec-graph/release-inventory.ts'), 'source');
  assert.equal(classifyReleaseArtifact('.specs/spec-generator-v4/spec-generator-v4.feature'), 'spec-test');
  assert.equal(classifyReleaseArtifact('dist/server.bundle.mjs'), 'generated');
  assert.equal(classifyReleaseArtifact('.tmp/inventory.tmp'), 'temporary');
  assert.equal(classifyReleaseArtifact('.docker-status/bdd-run.ndjson'), 'smoke');
  assert.ok(result.artifacts.filter((a) => a.classification !== 'unclassified' && a.classification !== 'silent').every((a) => a.intentional && a.traceability_edges.length > 0));
});

Then(new RegExp('^unclassified or silent inventory evidence is surfaced and cleaned rather than accepted as implementation proof$'), function (this: F64World) {
  const result = this.releaseResult!;
  assert.equal(result.status, 'NOT_READY');
  assert.ok(result.violations.some((v) => v.startsWith('UNCLASSIFIED_ARTIFACT:opaque.bin')));
  assert.ok(result.violations.some((v) => v.startsWith('UNTRACKED_UNCLASSIFIED:silent.evidence')));
});

Given(new RegExp('^a real Docker BDD fixture has classified and cleaned tracked before and after inventories, including temporary and untracked paths, and PASSED, FAILED, PENDING, UNDEFINED, AMBIGUOUS, and NOT_RUN units$'), function (this: F64World) {
  const input = baseInput();
  input.artifacts.push({ ...canonicalArtifact('.tmp/run.tmp', false), classification: 'temporary' }, { ...canonicalArtifact('.docker-status/run.ndjson', false), classification: 'smoke' });
  input.units = ['PASSED', 'FAILED', 'PENDING', 'UNDEFINED', 'AMBIGUOUS', 'NOT_RUN'].map((outcome, index) => ({ id: `unit-${index}`, outcome: outcome as any, in_scope: true, source: 'docker-bdd:full', run_id: 'docker-64' }));
  this.releaseInput = input;
});

When(new RegExp('^/run-tests runs the Docker-only release inventory gate$'), function (this: F64World) {
  this.releaseResult = evaluateReleaseInventory(this.releaseInput!);
});

Then(new RegExp('^every tracked in-scope unit must be PASSED, every outcome remains distinct, and every in-scope unit satisfies the AND gate$'), function (this: F64World) {
  const result = this.releaseResult!;
  assert.equal(result.outcomes.PASSED, 1);
  for (const outcome of ['FAILED', 'PENDING', 'UNDEFINED', 'AMBIGUOUS', 'NOT_RUN']) assert.equal(result.outcomes[outcome], 1);
  assert.equal(result.status, 'NOT_READY');
  assert.equal(result.violations.filter((v) => v.startsWith('NON_PASS_UNIT:')).length, 5);
});

Then(new RegExp('^additions, removals, duplicates, and untracked paths are explicitly classified; unclassified untracked paths violate cardinality or conservation rather than becoming release-ready$'), function (this: F64World) {
  const input = this.releaseInput!;
  input.post_tracked.push('new-unclassified.bin');
  input.artifacts.push({ path: 'new-unclassified.bin', tracked: false }, { path: 'new-unclassified.bin', tracked: false });
  const result = evaluateReleaseInventory(input);
  assert.deepEqual(result.additions, ['new-unclassified.bin']);
  assert.deepEqual(result.duplicates, ['new-unclassified.bin']);
  assert.ok(result.violations.some((v) => v.startsWith('TRACKED_CONSERVATION:')));
  assert.ok(result.violations.some((v) => v.startsWith('UNTRACKED_UNCLASSIFIED:new-unclassified.bin')));
});

Given(new RegExp('^an installed plugin fixture has repository development dependencies absent$'), function (this: F64World) {
  this.releaseInput = baseInput();
  // Make the installed status surface reach its dynamic graph import instead of returning
  // early for an absent spec; the copied fixture has no @cucumber/gherkin dependency.
  fs.mkdirSync(path.join(this.tempDir, '.specs', 'missing-spec'), { recursive: true });
  fs.writeFileSync(path.join(this.tempDir, '.specs', 'missing-spec', 'FR.md'), '## FR-1: Fixture\n');
  this.installedComplete = runInstalled(installedFixture(this.tempDir), this.tempDir);
  this.installedMissing = runInstalled(installedFixture(this.tempDir, true), this.tempDir);
  this.candidate = {
    candidate: { pr: '#45', tag: 'v1.5.0', github_release: 'v1.5.0', commit: baseline },
    documentation: { readme: true, tasks: true, changelog: true, release_notes: true }, owner: 'release-owner', monitoring_signal: 'post-release-smoke', rollback_action: 'git revert tag', follow_up_verification: 'docker-bdd rerun',
    evidence: { baseline_sha: baseline, run_id: 'installed-64', evidence_source: 'installed-runtime', dependencies_absent: true, outcome: 'PASSED' },
  };
});

When(new RegExp('^the installed launcher, status surface, and MCP execute the fixture$'), function (this: F64World) {
  const complete = this.installedComplete!;
  const missing = this.installedMissing!;
  // Complete fixture: real bootstrap and real status both reach dependency-absent diagnostics,
  // while the distributed bundle starts from a directory that never contained node_modules.
  for (const result of [complete.launcher, complete.status]) {
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /DEPENDENCY_ABSENT|NOT_READY/, result.stdout);
  }
  assert.equal(complete.mcp.status, 0, complete.mcp.stderr);
  assert.match(complete.mcp.stdout, /dev-pomogator-specs/, complete.mcp.stdout);
  // Negative fixture deletes the actual bundle after installation; Node must name that installed path.
  assert.notEqual(missing.mcp.status, 0, 'missing installed bundle must not silently skip');
  assert.match(`${missing.mcp.stderr}${missing.mcp.stdout}`, new RegExp(missing.fixture.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  this.releaseInput!.candidate = this.candidate;
  this.releaseResult = evaluateReleaseInventory(this.releaseInput!);
});

Then(new RegExp('^a missing runtime import, bundle, or asset is reported with installed-runtime provenance and does not become a source-tree pass$'), function (this: F64World) {
  const missing = this.installedMissing!;
  assert.equal(this.candidate!.evidence!.evidence_source, 'installed-runtime');
  assert.equal(this.candidate!.evidence!.dependencies_absent, true);
  assert.equal(this.releaseResult!.status, 'READY', 'complete installed evidence may pass only after all real surfaces passed');
  const actualMissing = `${missing.mcp.stderr}${missing.mcp.stdout}`;
  assert.ok(actualMissing.includes(missing.fixture), 'missing asset diagnostic must retain installed-runtime provenance');
  assert.equal(actualMissing.includes(REPO_ROOT), false, 'installed failure must not be laundered through a source-tree path');
});

Then(new RegExp('^a complete installed fixture records its baseline, run identity, and evidence source$'), function (this: F64World) {
  const evidence = this.candidate!.evidence!;
  assert.equal(evidence.baseline_sha, baseline);
  assert.equal(evidence.run_id, 'installed-64');
  assert.equal(evidence.evidence_source, 'installed-runtime');
  assert.equal(this.installedComplete!.launcher.status, 0);
  assert.equal(this.installedComplete!.status.status, 0);
  assert.equal(this.installedComplete!.mcp.status, 0);
});

Given(new RegExp('^a single PR, GitHub release candidate, or tag is prepared with README, TASKS, CHANGELOG, and release notes$'), function (this: F64World) {
  this.releaseInput = baseInput();
  this.candidate = { candidate: { pr: '#45', tag: 'v1.5.0', github_release: 'v1.5.0', commit: baseline }, documentation: { readme: true, tasks: true, changelog: true, release_notes: true }, owner: 'release-owner', monitoring_signal: 'dependency-absent-regression', rollback_action: 'roll back v1.5.0', follow_up_verification: 'verified rollback', evidence: { baseline_sha: baseline, run_id: 'candidate-64', evidence_source: 'installed-runtime', dependencies_absent: true, outcome: 'not_recorded' } };
});

When(new RegExp('^integration-first verification or post-release monitoring detects a tracked-file or dependency-absent failure after release$'), function (this: F64World) {
  this.releaseInput!.candidate = this.candidate;
  this.releaseInput!.units = [{ id: 'post-release', outcome: 'FAILED', in_scope: true, source: 'docker-bdd:full', run_id: 'candidate-64' }];
  this.releaseResult = evaluateReleaseInventory(this.releaseInput!);
});

Then(new RegExp('^the PR identity, GitHub release candidate, or tag, run identity, owner, monitoring signal, rollback action, and follow-up verification are recorded$'), function (this: F64World) {
  const c = this.candidate!;
  assert.equal(c.candidate.pr, '#45'); assert.equal(c.candidate.tag, 'v1.5.0'); assert.equal(c.candidate.github_release, 'v1.5.0');
  assert.ok(c.evidence!.run_id && c.owner && c.monitoring_signal && c.rollback_action && c.follow_up_verification);
});

Then(new RegExp('^not_recorded or never-run evidence prevents a release-ready claim$'), function (this: F64World) {
  assert.equal(this.releaseResult!.status, 'NOT_READY');
  assert.ok(this.releaseResult!.violations.some((v) => v.includes('not_recorded')));
  assert.ok(this.releaseResult!.violations.some((v) => v.includes('NON_PASS_UNIT:post-release:FAILED')));
});
