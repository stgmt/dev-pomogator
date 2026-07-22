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
  edgeRuns?: Record<string, CoverageRun | { findings: Array<{ check?: string; severity?: string; message?: string }> }>;
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

  const runAnalyzer = (name: string, acceptanceContent: string, tasksContent: string): void => {
    const edgeDir = path.join(this.tempDir, 'edges', name);
    fs.mkdirSync(edgeDir, { recursive: true });
    const acceptance = path.join(edgeDir, 'ACCEPTANCE_CRITERIA.md');
    const tasks = path.join(edgeDir, 'TASKS.md');
    fs.writeFileSync(acceptance, acceptanceContent);
    fs.writeFileSync(tasks, tasksContent);
    const result = spawnSync(process.execPath, [helper, '--acceptance', acceptance, '--tasks', tasks, '--format', 'json'], { encoding: 'utf8' });
    const run: CoverageRun = { status: result.status, stdout: result.stdout, stderr: result.stderr };
    if (result.stdout.trim()) run.body = parseLastJson(result.stdout) as CoverageRun['body'];
    this.edgeRuns![name] = run;
  };
  this.edgeRuns = {};
  runAnalyzer('empty-tasks', '## AC-1.1\n\nA public API response is externally observable.\n', '');
  runAnalyzer('exact-id', '## AC-1.1\n\nA public API response is externally observable.\n', [
    '### P1 task for another AC',
    '_Acceptance: AC-1.10_',
    'source of truth mapping; contract regression; status/content-type/body semantic readback',
  ].join('\n'));
  runAnalyzer('markdown-id-boundary', '## AC-3.1\n\nA public API response is externally observable.\n', [
    '- [ ] P1 exact AC ownership — Status: TODO | Est: 30m',
    '  _Acceptance: AC-3.1_',
    '  **Done When:** source of truth mapping; contract regression; status/content-type/body semantic readback',
  ].join('\n'));
  runAnalyzer('internal-dispatch', '## AC-4.1\n\nThe form-guards-dispatch.ts helper executes the real guard pipeline.\n', '');
  runAnalyzer('claim-vocabulary', [
    '### AC-2.1',
    'Authenticated admission dispatches paid work and returns result delivery.',
    '',
    '#### AC-2.2',
    'Artifact delivery is required after settlement.',
  ].join('\n'), '');

  // Exercise audit when TASKS exists but is empty.
  const emptyRoot = path.join(this.tempDir, 'empty-audit');
  const emptySpec = path.join(emptyRoot, '.specs', 'paid-spa');
  fs.mkdirSync(emptySpec, { recursive: true });
  fs.writeFileSync(path.join(emptySpec, 'ACCEPTANCE_CRITERIA.md'), '## AC-1.1\n\nA public API response is externally observable.\n');
  fs.writeFileSync(path.join(emptySpec, 'TASKS.md'), '');
  fs.writeFileSync(path.join(emptySpec, 'FR.md'), '# Functional Requirements\n');
  const emptyAudit = spawnSync(process.execPath, [core, 'audit-spec', '-Path', '.specs/paid-spa', '-Format', 'json'], {
    cwd: emptyRoot, env: { ...process.env, SPECS_GENERATOR_ROOT: emptyRoot }, encoding: 'utf8',
  });
  assert.equal(emptyAudit.status, 0, emptyAudit.stderr);
  this.edgeRuns['empty-audit'] = parseLastJson(emptyAudit.stdout) as CoverageWorld['auditRuns'][string];

  // Copy the standalone core without its sibling analyzer: a hard gate must report
  // unavailability as ERROR instead of logging a warning and passing.
  const unavailableRoot = path.join(this.tempDir, 'unavailable-audit');
  const standaloneCore = path.join(unavailableRoot, 'specs-generator-core.mjs');
  const unavailableSpec = path.join(unavailableRoot, '.specs', 'paid-spa');
  fs.mkdirSync(unavailableSpec, { recursive: true });
  fs.copyFileSync(core, standaloneCore);
  fs.writeFileSync(path.join(unavailableSpec, 'ACCEPTANCE_CRITERIA.md'), '## AC-1.1\n\nA public API response is externally observable.\n');
  fs.writeFileSync(path.join(unavailableSpec, 'TASKS.md'), '# Tasks\n');
  fs.writeFileSync(path.join(unavailableSpec, 'FR.md'), '# Functional Requirements\n');
  const unavailableAudit = spawnSync(process.execPath, [standaloneCore, 'audit-spec', '-Path', '.specs/paid-spa', '-Format', 'json'], {
    cwd: unavailableRoot, env: { ...process.env, SPECS_GENERATOR_ROOT: unavailableRoot }, encoding: 'utf8',
  });
  assert.equal(unavailableAudit.status, 0, unavailableAudit.stderr);
  this.edgeRuns['unavailable-audit'] = parseLastJson(unavailableAudit.stdout) as CoverageWorld['auditRuns'][string];
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

Then(/^empty task plans exact AC identifiers alternate claim wording and analyzer outages fail closed$/, function (this: CoverageWorld) {
  for (const name of ['empty-tasks', 'exact-id', 'claim-vocabulary']) {
    const run = this.edgeRuns![name] as CoverageRun;
    assert.equal(run.body?.ok, false, `${name} must fail closed: ${run.stderr}`);
    assert.ok((run.body?.findings?.length ?? 0) > 0, `${name} must return a concrete coverage finding`);
  }
  const exact = this.edgeRuns!['exact-id'] as CoverageRun;
  assert.equal(exact.body?.findings?.[0]?.code, 'MISSING_AC_TASK_MAPPING', 'AC-1.10 must not satisfy AC-1.1');
  const vocabulary = this.edgeRuns!['claim-vocabulary'] as CoverageRun;
  assert.deepEqual(vocabulary.body?.findings?.map((finding) => finding.acId), ['AC-2.1', 'AC-2.2'], 'H3/H4 auth/result/artifact claims are all classified');
  const markdownBoundary = this.edgeRuns!['markdown-id-boundary'] as CoverageRun;
  assert.equal(markdownBoundary.body?.ok, true, 'the final AC id before Markdown underscore is parsed exactly');
  assert.deepEqual(markdownBoundary.body?.findings, []);
  const internalDispatch = this.edgeRuns!['internal-dispatch'] as CoverageRun;
  assert.equal(internalDispatch.body?.ok, true, 'an internal dispatch helper is not misclassified as paid delivery');
  assert.deepEqual(internalDispatch.body?.findings, []);

  const emptyAudit = this.edgeRuns!['empty-audit'] as CoverageWorld['auditRuns'][string];
  assert.ok(emptyAudit.findings.some((finding) => finding.check === 'ACCEPTANCE_DELIVERY_COVERAGE' && finding.severity === 'ERROR'), 'empty TASKS cannot bypass the audit hard gate');
  const unavailableAudit = this.edgeRuns!['unavailable-audit'] as CoverageWorld['auditRuns'][string];
  assert.ok(unavailableAudit.findings.some((finding) => finding.check === 'ACCEPTANCE_DELIVERY_COVERAGE_UNAVAILABLE' && finding.severity === 'ERROR'), 'a missing analyzer fails the hard gate closed');
});
