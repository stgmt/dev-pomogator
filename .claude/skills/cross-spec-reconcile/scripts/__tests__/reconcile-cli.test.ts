/**
 * Tests for the cross-spec-reconcile CLI driver (FR-17 — T7-56 --dry-run +
 * T7-57 summary table + the runnable entry the skill documented but lacked).
 * Drives reconcileCli against a REAL tmp `.specs/` corpus + checks disk — not
 * a stub, not a mock of the engine.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { parseReconcileArgs, reconcileCli } from '../reconcile-cli.ts';

let repoRoot: string;

beforeEach(() => {
  repoRoot = path.join(os.tmpdir(), `reconcile-cli-${randomUUID()}`);
  const specDir = path.join(repoRoot, '.specs', 'demo-spec');
  fs.mkdirSync(specDir, { recursive: true });
  // FR references a path that does not exist → guaranteed impl-drift/missing-file.
  fs.writeFileSync(
    path.join(specDir, 'FR.md'),
    '## FR-1: Demo\n\nThe system SHALL live in `tools/demo/does-not-exist.ts`.\n',
    'utf8',
  );
});

afterEach(() => {
  fs.rmSync(repoRoot, { recursive: true, force: true });
});

describe('parseReconcileArgs — the four documented flags', () => {
  it('defaults: light mode, no dry-run, no sarif, all specs', () => {
    expect(parseReconcileArgs([])).toEqual({ mode: 'light', dryRun: false, sarif: false, slugs: [] });
  });

  it('parses --mode full --dry-run --sarif --slug (repeatable)', () => {
    const a = parseReconcileArgs(['--mode', 'full', '--dry-run', '--sarif', '--slug', 'x', '--slug', 'y']);
    expect(a).toEqual({ mode: 'full', dryRun: true, sarif: true, slugs: ['x', 'y'] });
  });

  it('rejects an unknown flag with an error message', () => {
    expect(parseReconcileArgs(['--bogus']).error).toMatch(/unknown argument: --bogus/);
  });

  it('rejects --mode with an invalid value', () => {
    expect(parseReconcileArgs(['--mode', 'turbo']).error).toMatch(/light\|full/);
  });

  it('rejects --slug with no value', () => {
    expect(parseReconcileArgs(['--slug']).error).toMatch(/--slug expects/);
  });
});

describe('reconcileCli — drives the real engine + writes artifacts', () => {
  it('--dry-run finds the drift, prints the table, writes NOTHING', async () => {
    const res = await reconcileCli(parseReconcileArgs(['--dry-run', '--slug', 'demo-spec']), repoRoot);
    expect(res.exitCode).toBe(0);
    expect(res.totalFindings).toBeGreaterThanOrEqual(1);
    expect(res.bySeverity.WARNING).toBeGreaterThanOrEqual(1);
    expect(res.stdout).toContain('| spec | CRIT | WARN | INFO | total |');
    expect(res.stdout).toContain('--dry-run');
    expect(res.reportPaths).toEqual([]);
    expect(fs.existsSync(path.join(repoRoot, '.specs', 'demo-spec', 'consistency-report.yaml'))).toBe(false);
  });

  it('a real run WRITES consistency-report.yaml to disk', async () => {
    const res = await reconcileCli(parseReconcileArgs(['--slug', 'demo-spec']), repoRoot);
    expect(res.exitCode).toBe(0);
    expect(res.reportPaths).toHaveLength(1);
    const yamlPath = path.join(repoRoot, '.specs', 'demo-spec', 'consistency-report.yaml');
    expect(fs.existsSync(yamlPath)).toBe(true);
    const body = fs.readFileSync(yamlPath, 'utf8');
    expect(body).toContain('impl-drift/missing-file');
  });

  it('--sarif also writes consistency-report.sarif', async () => {
    const res = await reconcileCli(parseReconcileArgs(['--sarif', '--slug', 'demo-spec']), repoRoot);
    expect(res.sarifPaths).toHaveLength(1);
    expect(fs.existsSync(path.join(repoRoot, '.specs', 'demo-spec', 'consistency-report.sarif'))).toBe(true);
  });

  it('a parse error short-circuits with exit 2 + usage, no engine run', async () => {
    const res = await reconcileCli(parseReconcileArgs(['--bogus']), repoRoot);
    expect(res.exitCode).toBe(2);
    expect(res.stdout).toContain('usage: reconcile-cli');
    expect(res.reportPaths).toEqual([]);
  });
});
