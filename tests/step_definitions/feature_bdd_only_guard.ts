/**
 * Step definitions for BDDONLY001: the staged bdd-only test-file guard
 * (FR-5 of the bdd-only-migration spec). Drives the REAL guard
 * `tools/bdd-only-test-guard/guard.ts` via its real bootstrap launcher with a stdin
 * PreToolUse payload — no mocks, no inline copy. Per-scenario isolation comes from the
 * V4World Before hook's fresh `tempDir`; the "existing file" case is a real file written
 * under `this.tempDir`, and the escape log is asserted in the same isolated dir.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import { V4World } from '../hooks/before-after.ts';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  buildRepositoryOldTestCensus,
  type OldTestCensusReport,
} from '../../tools/bdd-migrator/repository-census.ts';
import { buildGraphFromCwd } from '../../tools/spec-graph/builder.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';
import { runSpecVerdict, type SpecVerdictResult } from '../../tools/specs-generator/spec-verdict.ts';

const REPO = process.env.APP_DIR || process.cwd();
const GUARD_REL = 'tools/bdd-only-test-guard/guard.ts';

interface GuardWorld extends V4World {
  guardExit: number;
  guardStdout: string;
  bddRel?: string;
  bddPre?: string;
  oldTestCensus?: OldTestCensusReport;
  readinessDebt?: { cli: string[]; mcp: string[] };
  readinessVerdict?: SpecVerdictResult;
  readinessStatus?: Record<string, unknown>;
}

/** A real vitest-style file with exactly `n` test-case openers (`it(`), so countTestCases() === n. */
function makeTestFile(n: number): string {
  let s = "describe('legacy', () => {\n";
  for (let i = 1; i <= n; i++) s += `  it('case ${i}', () => { expect(${i}).toBe(${i}); });\n`;
  s += '});\n';
  return s;
}

/** Spawn the guard through its REAL bootstrap launcher with a PreToolUse payload. cwd=REPO so tsx
 *  resolves node_modules; payload.cwd points at the scenario's tempDir so existence + the escape log
 *  are isolated there. */
function runGuard(
  toolName: string,
  filePathRel: string,
  cwd: string,
  env: Record<string, string> = {},
): { exitCode: number; stdout: string } {
  const payload = JSON.stringify({ tool_name: toolName, tool_input: { file_path: filePathRel }, cwd });
  const res = spawnSync(
    process.execPath,
    ['-e', "require(require('path').resolve('tools/_shared/bootstrap.cjs'))", '--', GUARD_REL],
    { input: payload, encoding: 'utf-8', cwd: REPO, env: { ...process.env, ...env }, timeout: 30000 },
  );
  return { exitCode: res.status ?? 1, stdout: res.stdout || '' };
}

/** Spawn the guard with a real Edit PreToolUse payload (file_path + old_string/new_string) so the
 *  FR-10 shrink-only path reads the on-disk pre-content and simulates the edit. No mocks. */
function runGuardEdit(
  filePathRel: string,
  cwd: string,
  oldStr: string,
  newStr: string,
  env: Record<string, string> = {},
): { exitCode: number; stdout: string } {
  const payload = JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePathRel, old_string: oldStr, new_string: newStr }, cwd });
  const res = spawnSync(
    process.execPath,
    ['-e', "require(require('path').resolve('tools/_shared/bootstrap.cjs'))", '--', GUARD_REL],
    { input: payload, encoding: 'utf-8', cwd: REPO, env: { ...process.env, ...env }, timeout: 30000 },
  );
  return { exitCode: res.status ?? 1, stdout: res.stdout || '' };
}

Given<GuardWorld>(/^a clean workspace for the bdd-only guard$/, function () {
  // V4World Before already made a fresh tempDir; nothing else needed.
});

Given<GuardWorld>(/^an existing non-BDD test file with (\d+) test cases$/, function (n: string) {
  const rel = 'tests/e2e/legacy.test.ts';
  const content = makeTestFile(parseInt(n, 10));
  const abs = path.join(this.tempDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  this.bddRel = rel;
  this.bddPre = content;
});

When<GuardWorld>(/^the bdd-only guard receives an Edit that raises its test-case count to (\d+)$/, function (m: string) {
  const next = makeTestFile(parseInt(m, 10));
  const r = runGuardEdit(this.bddRel!, this.tempDir, this.bddPre!, next);
  this.guardExit = r.exitCode;
  this.guardStdout = r.stdout;
});

When<GuardWorld>(/^the bdd-only guard receives an Edit that lowers its test-case count to (\d+)$/, function (m: string) {
  const next = makeTestFile(parseInt(m, 10));
  const r = runGuardEdit(this.bddRel!, this.tempDir, this.bddPre!, next);
  this.guardExit = r.exitCode;
  this.guardStdout = r.stdout;
});

Then<GuardWorld>(/^the bdd-only guard should deny with a shrink-only reason$/, function () {
  assert.strictEqual(this.guardExit, 2, `expected deny exit 2, got ${this.guardExit}. stdout: ${this.guardStdout}`);
  assert.match(this.guardStdout, /"permissionDecision"\s*:\s*"deny"/, 'deny decision in output');
  assert.match(this.guardStdout, /shrink-only/, 'names the shrink-only invariant');
});

Given<GuardWorld>(/^an existing test file "([^"]+)" in the workspace$/, function (rel: string) {
  const abs = path.join(this.tempDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, '// existing test\n');
});

When<GuardWorld>(/^the bdd-only guard receives a Write for a new "([^"]+)"$/, function (rel: string) {
  const r = runGuard('Write', rel, this.tempDir);
  this.guardExit = r.exitCode;
  this.guardStdout = r.stdout;
});

When<GuardWorld>(/^the bdd-only guard receives an Edit for "([^"]+)"$/, function (rel: string) {
  const r = runGuard('Edit', rel, this.tempDir);
  this.guardExit = r.exitCode;
  this.guardStdout = r.stdout;
});

When<GuardWorld>(/^the bdd-only guard receives a Write for a new "([^"]+)" with BDD_ONLY_SKIP set$/, function (rel: string) {
  const r = runGuard('Write', rel, this.tempDir, { BDD_ONLY_SKIP: '1' });
  this.guardExit = r.exitCode;
  this.guardStdout = r.stdout;
});

Then<GuardWorld>(/^the bdd-only guard should deny with a BDD-only reason$/, function () {
  assert.strictEqual(this.guardExit, 2, `expected deny exit 2, got ${this.guardExit}. stdout: ${this.guardStdout}`);
  assert.match(this.guardStdout, /"permissionDecision"\s*:\s*"deny"/, 'deny decision in output');
  assert.match(this.guardStdout, /bdd-only-test-guard/, 'names the guard');
});

Then<GuardWorld>(/^the bdd-only guard should allow the write$/, function () {
  assert.strictEqual(this.guardExit, 0, `expected allow exit 0, got ${this.guardExit}. stdout: ${this.guardStdout}`);
  assert.doesNotMatch(this.guardStdout, /"permissionDecision"\s*:\s*"deny"/, 'must not deny');
});

Then<GuardWorld>(/^the escape should be recorded in the bdd-only escape log$/, function () {
  const log = path.join(this.tempDir, '.claude', 'logs', 'bdd-only-escapes.jsonl');
  assert.ok(fs.existsSync(log), 'escape log must exist after a BDD_ONLY_SKIP override');
  const lines = fs.readFileSync(log, 'utf-8').trim().split('\n').filter(Boolean);
  assert.ok(lines.length >= 1, 'escape log must have at least one entry');
  const entry = JSON.parse(lines[lines.length - 1]);
  assert.strictEqual(entry.reason, 'BDD_ONLY_SKIP', 'entry records the escape reason');
});

Given<GuardWorld>(/^a Git-tracked old-test corpus with product files, fixtures, generated mirrors, and explicit exemptions$/, function () {
  const root = path.join(this.tempDir, 'census-repo');
  fs.mkdirSync(root, { recursive: true });
  const files = [
    'tests/e2e/product.test.ts',
    'service/payments_test.py',
    'tests/fixtures/producer.test.ts',
    '.agents/skills/mirror/GeneratedTests.cs',
    '.claude/worktrees/run-1/tests/mirror_test.go',
    'src/product.ts',
  ];
  for (const rel of files) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `fixture:${rel}\n`, 'utf-8');
  }
  const git = (args: string[]) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf-8' });
    assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  };
  git(['init', '-q']);
  git(['config', 'user.email', 'bdd@example.com']);
  git(['config', 'user.name', 'BDD']);
  git(['add', '.']);
  git(['commit', '-qm', 'fixture corpus']);
  (this as unknown as Record<string, unknown>)['_censusRoot'] = root;
});

When<GuardWorld>(/^the repository old-test census runs$/, function () {
  const root = (this as unknown as Record<string, unknown>)['_censusRoot'] as string;
  this.oldTestCensus = buildRepositoryOldTestCensus(root);
});

Then<GuardWorld>(/^every matched path is classified exactly once with conservation and mandatory exemption reasons$/, function () {
  const report = this.oldTestCensus!;
  assert.equal(report.available, true, 'census must come from real git ls-files');
  assert.equal(report.counts.tracked, 5);
  assert.equal(report.counts.inScope, 2);
  assert.equal(report.counts.exempt, 3);
  assert.deepEqual(report.invariants, {
    unique: true,
    disjoint: true,
    conserved: true,
    reasonsComplete: true,
  });
  assert.equal(new Set(report.tracked.map((entry) => entry.path)).size, report.counts.tracked);
  assert.ok(report.exempt.every((entry) => Boolean(entry.reason?.trim())), 'every exemption must explain itself');
  assert.deepEqual(
    [...report.inScope.map((entry) => entry.path), ...report.exempt.map((entry) => entry.path)].sort(),
    report.tracked.map((entry) => entry.path).sort(),
    'in-scope plus exempt paths must conserve the complete tracked match set',
  );
});

Given<GuardWorld>(/^an otherwise ready bdd-only-migration spec with tracked in-scope old-test debt$/, function () {
  const root = path.join(this.tempDir, 'readiness-corpus');
  const dot = '.specs';
  const specDir = path.join(root, dot, 'bdd-only-migration');
  fs.mkdirSync(specDir, { recursive: true });
  fs.mkdirSync(path.join(root, 'tests', 'e2e'), { recursive: true });
  const write = (rel: string, content: string) => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
  };
  write(`${dot}/bdd-only-migration/USER_STORIES.md`, '# User Stories\n\n### User Story 1: BDD-only readiness\n\n**Требование:** [FR-1](FR.md#fr-1)\n**Why:** old tests must block readiness.\n**Independent Test:** BDDONLY001_08\n');
  write(`${dot}/bdd-only-migration/USE_CASES.md`, '# Use Cases\n\n## UC-1: Readiness\n');
  write(`${dot}/bdd-only-migration/RESEARCH.md`, '# Research\n\n- Existing old-test debt is enumerated by git.\n');
  write(`${dot}/bdd-only-migration/REQUIREMENTS.md`, '# Requirements\n\n| CHK | Requirement | Scenario |\n|---|---|---|\n| CHK-1 | [FR-1](FR.md#fr-1) | BDDONLY001_08 |\n');
  write(`${dot}/bdd-only-migration/FR.md`, '# Functional Requirements\n\n## FR-1: Readiness\n\nThe migration SHALL block while old tests remain.\n\n**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)\n');
  write(`${dot}/bdd-only-migration/NFR.md`, '# Non-Functional Requirements\n\n## Reliability\n\nReadiness is fail-closed.\n');
  write(`${dot}/bdd-only-migration/ACCEPTANCE_CRITERIA.md`, '# Acceptance Criteria\n\n## AC-1 (FR-1)\n\n**Требование:** [FR-1](FR.md#fr-1)\n\nWHEN tracked old-test debt exists THEN readiness SHALL be NOT_READY.\n');
  write(`${dot}/bdd-only-migration/DESIGN.md`, '# Design\n\n### Decision: Git census\n\n**Требование:** [FR-1](FR.md#fr-1)\n');
  write(`${dot}/bdd-only-migration/TASKS.md`, '# Tasks\n\n## Phase 1: Migration\n\n- [ ] Enforce old-test debt -- @feature11 — id: old-test-debt — Status: IN_PROGRESS | Est: 30m\n  _Requirements: [FR-1](FR.md#fr-1)_\n  **Done When:**\n  - [ ] BDDONLY001_08 scenario passes\n');
  write(`${dot}/bdd-only-migration/FILE_CHANGES.md`, '# File Changes\n\n| Path | Action | Reason |\n|---|---|---|\n| `tools/bdd-migrator/repository-census.ts` | edit | real census |\n');
  write(`${dot}/bdd-only-migration/CHANGELOG.md`, '# Changelog\n\n- Readiness fixture.\n');
  write(`${dot}/bdd-only-migration/README.md`, '# BDD-only readiness fixture\n');
  write(`${dot}/bdd-only-migration/bdd-only-migration.feature`, '@feature11\nFeature: BDDONLY001 readiness\n\n  Scenario: BDDONLY001_08 residual old-test debt\n    Given an otherwise ready bdd-only-migration spec with tracked in-scope old-test debt\n    When spec-verdict and MCP status evaluate migration readiness\n    Then both surfaces report NOT_READY with the same repository old-test debt\n');
  write('tests/e2e/residual.test.ts', "describe('residual old test', () => { it('remains', () => { return true; }); });\n");
  const git = (args: string[]) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf-8' });
    assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  };
  git(['init', '-q']);
  git(['config', 'user.email', 'bdd@example.com']);
  git(['config', 'user.name', 'BDD']);
  git(['add', '.']);
  git(['commit', '-qm', 'readiness fixture']);
  (this as unknown as Record<string, unknown>)['_readinessRoot'] = root;
  (this as unknown as Record<string, unknown>)['_readinessSpec'] = path.join(dot, 'bdd-only-migration');
});

When<GuardWorld>(/^spec-verdict and MCP status evaluate migration readiness$/, async function () {
  const state = this as unknown as Record<string, unknown>;
  const root = state['_readinessRoot'] as string;
  const spec = state['_readinessSpec'] as string;
  this.readinessVerdict = await runSpecVerdict(spec, { cwd: root, semantic: false });
  const graph = buildGraphFromCwd(root);
  const statusTool = buildToolRegistry(() => graph, { repoRoot: root }).find((tool) => tool.name === 'get_spec_status');
  assert.ok(statusTool, 'real get_spec_status producer must be registered');
  const status = await statusTool.handler({ spec: 'bdd-only-migration', view: 'status' });
  this.readinessStatus = JSON.parse(status.content[0].text) as Record<string, unknown>;
  const cliDebt = this.readinessVerdict.evidence.oldTestCensus?.debt ?? [];
  const mcpReadiness = this.readinessStatus.readiness as { lanes?: { BDD_SYNC?: { debt?: string[] } }; overall?: string };
  this.readinessDebt = { cli: cliDebt, mcp: mcpReadiness.lanes?.BDD_SYNC?.debt ?? [] };
});

Then<GuardWorld>(/^both surfaces report NOT_READY with the same repository old-test debt$/, function () {
  const result = this.readinessDebt!;
  assert.equal(this.readinessVerdict?.readiness.overall, 'NOT_READY', 'authoritative spec-verdict must block readiness');
  assert.equal(this.readinessStatus?.readiness && (this.readinessStatus.readiness as { overall?: string }).overall, 'NOT_READY', 'MCP status must block readiness');
  assert.deepEqual(result.cli, ['OLD_TEST_MIGRATION_REMAINING:1']);
  assert.deepEqual(result.mcp, result.cli, `MCP BDD_SYNC debt diverged from spec-verdict: ${JSON.stringify(result)}`);
});
