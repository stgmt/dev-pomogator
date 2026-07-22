/** @feature65 — deterministic acceptance-to-delivery coverage (SPECGEN004_565). */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';

interface CoverageRun {
  status: number | null;
  stdout: string;
  stderr: string;
  body?: { ok?: boolean; findings?: Array<{ acId?: string; code?: string; missingLanes?: string[] }> };
}

interface CoverageWorld extends V4World {
  corpus?: {
    acceptance: string;
    plans: Record<'shallow' | 'blocked' | 'complete', string>;
    deploymentEvidence: Record<string, unknown>;
  };
  analyzerRuns?: Record<string, CoverageRun>;
  auditRuns?: Record<string, { findings: Array<{ check?: string; severity?: string; message?: string }> }>;
}

function parseLastJson(stdout: string): unknown {
  const start = stdout.indexOf('{');
  assert.ok(start >= 0, `expected JSON output, got: ${stdout}`);
  return JSON.parse(stdout.slice(start));
}

Given(/^a synthetic paid SPA corpus with shallow, blocked-investigation, and complete acceptance task plans$/, function (this: CoverageWorld) {
  const fixture = path.resolve('tests/fixtures/specgen004-acceptance-coverage/paid-spa-corpus.json');
  this.corpus = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  assert.equal(this.corpus!.deploymentEvidence.root, '/api');
  assert.equal(this.corpus!.deploymentEvidence.prefix, '/go/api');
  assert.equal((this.corpus!.deploymentEvidence.infrastructure404 as { contentType: string }).contentType, 'text/html');
  assert.equal((this.corpus!.deploymentEvidence.unauthenticated as { contentType: string }).contentType, 'application/json');
  assert.deepEqual(this.corpus!.deploymentEvidence.requires, ['registry publication', 'slug mapping', 'settlement', 'artifact readback']);
});

When(/^the real acceptance delivery analyzer and audit inspect every plan$/, function (this: CoverageWorld) {
  const helper = path.resolve('tools/specs-generator/acceptance-task-coverage.mjs');
  const core = path.resolve('tools/specs-generator/specs-generator-core.mjs');
  this.analyzerRuns = {};
  this.auditRuns = {};

  for (const [name, tasks] of Object.entries(this.corpus!.plans)) {
    const specDir = path.join(this.tempDir, name, '.specs', 'paid-spa');
    fs.mkdirSync(specDir, { recursive: true });
    const acceptance = path.join(specDir, 'ACCEPTANCE_CRITERIA.md');
    const tasksFile = path.join(specDir, 'TASKS.md');
    fs.writeFileSync(acceptance, this.corpus!.acceptance);
    fs.writeFileSync(tasksFile, tasks);
    fs.writeFileSync(path.join(specDir, 'FR.md'), '# Functional Requirements\n');

    const analyzer = spawnSync(process.execPath, [helper, '--acceptance', acceptance, '--tasks', tasksFile, '--format', 'json'], {
      encoding: 'utf8',
    });
    const run: CoverageRun = { status: analyzer.status, stdout: analyzer.stdout, stderr: analyzer.stderr };
    if (analyzer.stdout.trim()) run.body = parseLastJson(analyzer.stdout) as CoverageRun['body'];
    this.analyzerRuns[name] = run;

    const audit = spawnSync(process.execPath, [core, 'audit-spec', '-Path', '.specs/paid-spa', '-Format', 'json'], {
      cwd: path.join(this.tempDir, name),
      env: { ...process.env, SPECS_GENERATOR_ROOT: path.join(this.tempDir, name) },
      encoding: 'utf8',
    });
    assert.equal(audit.status, 0, `audit command runs for ${name}: ${audit.stderr}`);
    this.auditRuns[name] = parseLastJson(audit.stdout) as CoverageWorld['auditRuns'][string];
  }
});

Then(/^shallow coverage names every missing public contract paid flow and semantic deploy lane$/, function (this: CoverageWorld) {
  const shallow = this.analyzerRuns!.shallow;
  assert.equal(shallow.body?.ok, false, `shallow plan must fail: ${shallow.stderr}`);
  const missing = new Set((shallow.body?.findings ?? []).flatMap((finding) => finding.missingLanes ?? []));
  for (const lane of [
    'source_mapping', 'contract_regression', 'semantic_readback', 'version_compatibility',
    'input_schema', 'redaction', 'route_prefix', 'insufficient_balance',
    'funded_success', 'settlement_idempotency', 'artifact_readback', 'controlled_spend',
  ]) assert.ok(missing.has(lane), `shallow plan names missing lane ${lane}`);
  assert.ok(this.auditRuns!.shallow.findings.some((finding) => finding.check === 'ACCEPTANCE_DELIVERY_COVERAGE' && finding.severity === 'ERROR'));
});

Then(/^a blocking investigation remains red while the complete AC-linked plan passes$/, function (this: CoverageWorld) {
  const blocked = this.analyzerRuns!.blocked.body!;
  assert.equal(blocked.ok, false);
  assert.ok(blocked.findings?.some((finding) => finding.code === 'UNRESOLVED_ACCEPTANCE_INVESTIGATION'));
  assert.ok(this.auditRuns!.blocked.findings.some((finding) => finding.check === 'ACCEPTANCE_DELIVERY_COVERAGE' && finding.severity === 'ERROR'));

  assert.equal(this.analyzerRuns!.complete.body?.ok, true, this.analyzerRuns!.complete.stderr);
  assert.deepEqual(this.analyzerRuns!.complete.body?.findings, []);
  assert.ok(!this.auditRuns!.complete.findings.some((finding) => finding.check === 'ACCEPTANCE_DELIVERY_COVERAGE'));
});
