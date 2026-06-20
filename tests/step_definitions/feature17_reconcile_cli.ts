// Step definitions for SPECGEN004_352-360 — reconcile-cli (FR-17 CLI driver).
//
// Drives `parseReconcileArgs` and `reconcileCli` from the real production
// module in-process. No mocks — each scenario seeds a fresh tmpdir from the
// V4World Before hook.  Regex step patterns throughout (no Cucumber Expressions)
// so literal `/`, `{`, and backticks are safe.
//
// Classification: RUNTIME (in-process imports; no spawn needed — the engine
// itself is in-process and the CLI driver is a thin async wrapper).

import fs from 'node:fs';
import path from 'node:path';
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { V4World } from '../hooks/before-after.ts';
import {
  parseReconcileArgs,
  reconcileCli,
  type ReconcileCliArgs,
  type ReconcileCliResult,
} from '../../.claude/skills/cross-spec-reconcile/scripts/reconcile-cli.ts';

// ── World extension ──────────────────────────────────────────────────────────

interface ReconcileCliWorld extends V4World {
  parsedArgs?: ReconcileCliArgs;
  cliResult?: ReconcileCliResult;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Seed a minimal spec tree that will produce at least one impl-drift finding.
 *
 * The reconcile engine scans FR.md bodies for backtick-quoted paths matching
 * the PATH_REF_RE pattern:  /`(?:src|tools|tests|lib)\/[\w./-]+`/
 * and emits `impl-drift/missing-file` when the referenced path does not exist.
 * The path must NOT exist in the repoRoot (tempDir), so we reference a clearly
 * non-existent sub-path.
 */
function seedDriftSpec(repoRoot: string): void {
  const specDir = path.join(repoRoot, '.specs', 'demo-spec');
  fs.mkdirSync(specDir, { recursive: true });
  // Backtick-quoted src/ path that does not exist → triggers impl-drift/missing-file
  fs.writeFileSync(
    path.join(specDir, 'FR.md'),
    '## FR-1: Demo\n\nImplemented in `src/missing-impl.ts`.\n',
  );
}

/** Seed a spec that has an FR but no ACCEPTANCE_CRITERIA.md → triggers spec-only/missing-acceptance */
function seedMissingAcceptanceSpec(repoRoot: string): void {
  const specDir = path.join(repoRoot, '.specs', 'spec-b');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(
    path.join(specDir, 'FR.md'),
    '## FR-1: Login flow @feature1\n\nLogin SHALL call AuthManager. (No AC file — planted spec-only drift.)\n',
  );
  // Deliberately no ACCEPTANCE_CRITERIA.md
}

/** Helper: read finding codes from the written consistency-report.yaml for a given slug */
function findingCodesFromYaml(repoRoot: string, slug: string): string[] {
  const yamlPath = path.join(repoRoot, '.specs', slug, 'consistency-report.yaml');
  if (!fs.existsSync(yamlPath)) return [];
  return [...fs.readFileSync(yamlPath, 'utf-8').matchAll(/- code:\s*(\S+)/g)].map((m) => m[1]);
}

// ── Given steps ──────────────────────────────────────────────────────────────

Given(
  /^a reconcile-cli temp repo with one spec that has a missing impl path$/,
  function (this: ReconcileCliWorld) {
    seedDriftSpec(this.tempDir);
  },
);

// ── When steps ────────────────────────────────────────────────────────────────

When(
  /^parseReconcileArgs is called with no arguments$/,
  function (this: ReconcileCliWorld) {
    this.parsedArgs = parseReconcileArgs([]);
  },
);

When(
  /^parseReconcileArgs is called with "--mode full --dry-run --sarif --slug foo --slug bar"$/,
  function (this: ReconcileCliWorld) {
    this.parsedArgs = parseReconcileArgs([
      '--mode', 'full',
      '--dry-run',
      '--sarif',
      '--slug', 'foo',
      '--slug', 'bar',
    ]);
  },
);

When(
  /^parseReconcileArgs is called with "--bogus"$/,
  function (this: ReconcileCliWorld) {
    this.parsedArgs = parseReconcileArgs(['--bogus']);
  },
);

When(
  /^parseReconcileArgs is called with "--mode ultra"$/,
  function (this: ReconcileCliWorld) {
    this.parsedArgs = parseReconcileArgs(['--mode', 'ultra']);
  },
);

When(
  /^parseReconcileArgs is called with "--slug"$/,
  function (this: ReconcileCliWorld) {
    this.parsedArgs = parseReconcileArgs(['--slug']);
  },
);

When(
  /^reconcileCli is called with dry-run=true sarif=false$/,
  async function (this: ReconcileCliWorld) {
    const args = parseReconcileArgs(['--dry-run']);
    this.cliResult = await reconcileCli(args, this.tempDir);
  },
);

When(
  /^reconcileCli is called with dry-run=false sarif=false$/,
  async function (this: ReconcileCliWorld) {
    const args = parseReconcileArgs([]);
    this.cliResult = await reconcileCli(args, this.tempDir);
  },
);

When(
  /^reconcileCli is called with dry-run=false sarif=true$/,
  async function (this: ReconcileCliWorld) {
    const args = parseReconcileArgs(['--sarif']);
    this.cliResult = await reconcileCli(args, this.tempDir);
  },
);

When(
  /^reconcileCli is called with a parse-error args object$/,
  async function (this: ReconcileCliWorld) {
    const args = parseReconcileArgs(['--unknown-flag']);
    this.cliResult = await reconcileCli(args, this.tempDir);
  },
);

// ── Then steps — parseReconcileArgs ──────────────────────────────────────────

Then(
  /^the parsed reconcile args have mode=light dryRun=false sarif=false and empty slugs$/,
  function (this: ReconcileCliWorld) {
    const a = this.parsedArgs!;
    assert.equal(a.mode, 'light');
    assert.equal(a.dryRun, false);
    assert.equal(a.sarif, false);
    assert.deepEqual(a.slugs, []);
    assert.equal(a.error, undefined);
  },
);

Then(
  /^the parsed reconcile args have mode=full dryRun=true sarif=true and slugs foo and bar$/,
  function (this: ReconcileCliWorld) {
    const a = this.parsedArgs!;
    assert.equal(a.mode, 'full');
    assert.equal(a.dryRun, true);
    assert.equal(a.sarif, true);
    assert.deepEqual(a.slugs, ['foo', 'bar']);
    assert.equal(a.error, undefined);
  },
);

Then(
  /^the parsed reconcile args have an error matching "([^"]+)"$/,
  function (this: ReconcileCliWorld, pattern: string) {
    const a = this.parsedArgs!;
    assert.ok(a.error, `Expected parsedArgs.error to be set, got: ${JSON.stringify(a)}`);
    assert.match(a.error, new RegExp(pattern));
  },
);

// ── Then steps — reconcileCli ──────────────────────────────────────────────

Then(
  /^the reconcileCli result has exitCode=0 totalFindings>=1 and bySeverity\.WARNING>=1$/,
  function (this: ReconcileCliWorld) {
    const r = this.cliResult!;
    assert.equal(r.exitCode, 0);
    assert.ok(r.totalFindings >= 1, `Expected totalFindings>=1, got ${r.totalFindings}`);
    assert.ok(r.bySeverity.WARNING >= 1, `Expected bySeverity.WARNING>=1, got ${r.bySeverity.WARNING}`);
  },
);

Then(
  /^the reconcileCli stdout contains "([^"]+)"$/,
  function (this: ReconcileCliWorld, text: string) {
    const stdout = this.cliResult!.stdout;
    assert.ok(
      stdout.includes(text),
      `Expected stdout to contain "${text}".\nActual stdout:\n${stdout}`,
    );
  },
);

Then(
  /^the reconcileCli stdout contains "first" and "finding\(s\):" and "\[WARNING\]" and "impl-drift\/missing-file"$/,
  function (this: ReconcileCliWorld) {
    const stdout = this.cliResult!.stdout;
    assert.ok(stdout.includes('first'), `Missing "first" in stdout:\n${stdout}`);
    assert.ok(stdout.includes('finding(s):'), `Missing "finding(s):" in stdout:\n${stdout}`);
    assert.ok(stdout.includes('[WARNING]'), `Missing "[WARNING]" in stdout:\n${stdout}`);
    assert.ok(stdout.includes('impl-drift/missing-file'), `Missing "impl-drift/missing-file" in stdout:\n${stdout}`);
  },
);

Then(
  /^the reconcileCli reportPaths is empty and no yaml was written$/,
  function (this: ReconcileCliWorld) {
    const r = this.cliResult!;
    assert.deepEqual(r.reportPaths, []);
    // Double-check: no consistency-report.yaml in the spec dir
    const yamlPath = path.join(this.tempDir, '.specs', 'demo-spec', 'consistency-report.yaml');
    assert.ok(!fs.existsSync(yamlPath), `Unexpected yaml at ${yamlPath}`);
  },
);

Then(
  /^the reconcileCli result has exitCode=0 and reportPaths\.length=1$/,
  function (this: ReconcileCliWorld) {
    const r = this.cliResult!;
    assert.equal(r.exitCode, 0);
    assert.equal(r.reportPaths.length, 1, `Expected 1 reportPath, got ${r.reportPaths.length}`);
  },
);

Then(
  /^a consistency-report\.yaml file exists at the reported path$/,
  function (this: ReconcileCliWorld) {
    const p = this.cliResult!.reportPaths[0];
    assert.ok(fs.existsSync(p), `Expected yaml at ${p} to exist`);
  },
);

Then(
  /^the yaml body contains "impl-drift\/missing-file"$/,
  function (this: ReconcileCliWorld) {
    const p = this.cliResult!.reportPaths[0];
    const body = fs.readFileSync(p, 'utf8');
    assert.ok(body.includes('impl-drift/missing-file'), `yaml body missing "impl-drift/missing-file":\n${body}`);
  },
);

Then(
  /^the reconcileCli sarifPaths\.length=1 and the sarif file exists on disk$/,
  function (this: ReconcileCliWorld) {
    const r = this.cliResult!;
    assert.equal(r.sarifPaths.length, 1, `Expected 1 sarifPath, got ${r.sarifPaths.length}`);
    assert.ok(fs.existsSync(r.sarifPaths[0]), `Expected sarif at ${r.sarifPaths[0]} to exist`);
  },
);

Then(
  /^the reconcileCli result has exitCode=2 and stdout contains "usage: reconcile-cli"$/,
  function (this: ReconcileCliWorld) {
    const r = this.cliResult!;
    assert.equal(r.exitCode, 2);
    assert.ok(r.stdout.includes('usage: reconcile-cli'), `stdout missing usage line:\n${r.stdout}`);
  },
);

Then(
  /^the reconcileCli reportPaths is empty$/,
  function (this: ReconcileCliWorld) {
    assert.deepEqual(this.cliResult!.reportPaths, []);
  },
);

// ── SPECGEN004_371 — spec-only/missing-acceptance via reconcileCli ────────────

Given(
  /^a reconcile-cli temp repo with one spec that has an FR but no ACCEPTANCE_CRITERIA\.md$/,
  function (this: ReconcileCliWorld) {
    seedMissingAcceptanceSpec(this.tempDir);
  },
);

Then(
  /^the consistency-report\.yaml for "([^"]+)" contains the code "([^"]+)"$/,
  function (this: ReconcileCliWorld, slug: string, code: string) {
    const codes = findingCodesFromYaml(this.tempDir, slug);
    assert.ok(
      codes.includes(code),
      `Expected consistency-report.yaml for "${slug}" to contain code "${code}", got: ${JSON.stringify(codes)}`,
    );
  },
);
