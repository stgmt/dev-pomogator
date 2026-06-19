/**
 * Corpus roadmap invariant tests (H2 / FR-M5). The corpus tool shipped UNTESTED and so it
 * over-reported NET: it marked already-wired specs as "definitely need migration" (it never
 * consulted cucumber.json), which sent migrators at already-done specs (dogfood 2026-06-19).
 * These tests guard the missing invariant: a spec whose .feature is wired in cucumber.json is
 * NOT remaining work. Drives the REAL buildCorpusReport / collectWiredSlugs / isWired — no mocks.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildCorpusReport, collectWiredSlugs, isWired } from '../corpus.ts';

describe('CORPUS001: roadmap consults cucumber.json (H2 false-NET fix)', () => {
  it('CORPUS001_01: isWired maps tests/e2e/<slug>.test.ts to a wired slug', () => {
    const wired = new Set(['spec-reality-check', 'tui-test-runner']);
    expect(isWired('tests/e2e/spec-reality-check.test.ts', wired)).toBe(true);
    expect(isWired('tests/e2e/tui-test-runner.test.ts', wired)).toBe(true);
  });

  it('CORPUS001_02: isWired matches a hyphen-prefix variant (e.g. -hook test of a wired spec)', () => {
    const wired = new Set(['spec-reality-check']);
    expect(isWired('tests/e2e/spec-reality-check-hook.test.ts', wired)).toBe(true);
  });

  it('CORPUS001_03: isWired matches the trailing segment of a NESTED wired slug', () => {
    const wired = new Set(['backlog/honest-status-command']);
    expect(isWired('tests/e2e/honest-status-command.test.ts', wired)).toBe(true);
  });

  it('CORPUS001_04: a tool test with no 1:1 spec slug stays NOT-wired (correctly net)', () => {
    const wired = new Set(['spec-reality-check']);
    expect(isWired('tools/spec-graph/__tests__/registry-parity.test.ts', wired)).toBe(false);
  });

  it('CORPUS001_05: no cucumber.json / empty wired set → nothing is wired', () => {
    expect(isWired('tests/e2e/anything.test.ts', new Set())).toBe(false);
  });
});

describe('CORPUS002: buildCorpusReport excludes wired specs from netCount (the invariant)', () => {
  let root: string;
  // Non-overlapping names so endsWith()/basename matching is unambiguous (an earlier draft used
  // wiredspec/unwiredspec — "unwiredspec".endsWith("wiredspec.test.ts") is TRUE, a substring trap).
  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-wired-'));
    fs.mkdirSync(path.join(root, '.specs', 'alphamigrated'), { recursive: true });
    fs.mkdirSync(path.join(root, '.specs', 'betapending'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tests', 'e2e'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tests', 'step_definitions'), { recursive: true });
    // cucumber.json wires ONLY alphamigrated
    fs.writeFileSync(
      path.join(root, 'cucumber.json'),
      JSON.stringify({ default: { paths: ['.specs/alphamigrated/alphamigrated.feature'] } }),
    );
    // two vitest files: one for the wired spec, one for a pending (unwired) spec
    const vitest = `import { describe, it, expect } from 'vitest';\ndescribe('x', () => { it('a', () => expect(1).toBe(1)); it('b', () => expect(2).toBe(2)); });\n`;
    fs.writeFileSync(path.join(root, 'tests', 'e2e', 'alphamigrated.test.ts'), vitest);
    fs.writeFileSync(path.join(root, 'tests', 'e2e', 'betapending.test.ts'), vitest);
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it('CORPUS002_01: collectWiredSlugs reads the wired slug from cucumber.json', () => {
    const slugs = collectWiredSlugs(root);
    expect(slugs.has('alphamigrated')).toBe(true);
    expect(slugs.has('betapending')).toBe(false);
  });

  it('CORPUS002_02: the wired spec test is marked wired and EXCLUDED from netCount; the pending one is net', () => {
    const r = buildCorpusReport(root);
    const wiredFile = r.files.find((f) => f.file.endsWith('/alphamigrated.test.ts'));
    const unwiredFile = r.files.find((f) => f.file.endsWith('/betapending.test.ts'));
    expect(wiredFile?.wired, 'wired spec test must be flagged wired').toBe(true);
    expect(unwiredFile?.wired, 'unwired spec test must NOT be wired').toBe(false);
    // The invariant that was missing: a wired file is never counted as remaining work.
    expect(r.wiredCount).toBe(1);
    expect(r.netCount).toBe(r.files.filter((f) => !f.wired && !f.twinHint).length);
    expect(r.files.filter((f) => f.wired).every((f) => !(!f.wired && !f.twinHint))).toBe(true);
  });
});
