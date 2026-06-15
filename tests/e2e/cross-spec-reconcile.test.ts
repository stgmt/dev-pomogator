/**
 * FR-17 e2e — cross-spec-reconcile engine roundtrip over a REAL planted-drift corpus.
 *
 * Drives the actual reconcileCli (no mocks) against tests/fixtures/cross-spec-corpus,
 * and asserts the engine detects the planted drift with the codes the REAL engine emits
 * (captured 2026-06-15, see the fixture README) + writes YAML/SARIF to disk. This is the
 * multi-spec, asserted-findings layer the co-located reconcile-cli.test.ts (single demo
 * spec, write-only assertion) does not cover.
 *
 * The fixture lives under corpus/ (not a literal .specs/, so the spec-access-guard does not
 * intercept it); we copy it to a tmp <root>/.specs/ so the engine's report writes never
 * pollute the read-only fixture.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseReconcileArgs, reconcileCli } from '../../.claude/skills/cross-spec-reconcile/scripts/reconcile-cli.ts';

const FIXTURE_CORPUS = path.resolve(__dirname, '..', 'fixtures', 'cross-spec-corpus', 'corpus');
let root: string;

beforeEach(() => {
  root = path.join(os.tmpdir(), `xspec-e2e-${randomUUID()}`);
  fs.cpSync(FIXTURE_CORPUS, path.join(root, '.specs'), { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

/** Finding codes from a spec's written consistency-report.yaml (codes are lowercase-slashed). */
function findingCodes(slug: string): string[] {
  const yp = path.join(root, '.specs', slug, 'consistency-report.yaml');
  if (!fs.existsSync(yp)) return [];
  return [...fs.readFileSync(yp, 'utf-8').matchAll(/- code:\s*(\S+)/g)].map((m) => m[1]);
}

describe('XSPEC001: cross-spec-reconcile e2e — real engine over a planted-drift corpus', () => {
  // @feature17
  it('XSPEC001_01: detects impl-drift/missing-file when FILE_CHANGES references an absent file', async () => {
    const res = await reconcileCli(parseReconcileArgs([]), root);
    expect(res.totalFindings).toBeGreaterThan(0);
    expect(findingCodes('spec-a')).toContain('impl-drift/missing-file');
  });

  // @feature17
  it('XSPEC001_02: detects spec-only/missing-acceptance for an FR with no AC', async () => {
    await reconcileCli(parseReconcileArgs([]), root);
    expect(findingCodes('spec-b')).toContain('spec-only/missing-acceptance');
  });

  // @feature17
  it('XSPEC001_03: writes a consistency-report.yaml per spec (roundtrip to disk)', async () => {
    await reconcileCli(parseReconcileArgs([]), root);
    expect(fs.existsSync(path.join(root, '.specs', 'spec-a', 'consistency-report.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.specs', 'spec-b', 'consistency-report.yaml'))).toBe(true);
  });

  // @feature17
  it('XSPEC001_04: --sarif emits a SARIF report alongside the YAML', async () => {
    await reconcileCli(parseReconcileArgs(['--sarif']), root);
    expect(fs.existsSync(path.join(root, '.specs', 'spec-a', 'consistency-report.sarif'))).toBe(true);
  });

  // @feature17
  it('XSPEC001_05: --dry-run finds drift but writes no report', async () => {
    const res = await reconcileCli(parseReconcileArgs(['--dry-run']), root);
    expect(res.totalFindings).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(root, '.specs', 'spec-a', 'consistency-report.yaml'))).toBe(false);
  });
});
