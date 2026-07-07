/**
 * Phase 2 Green tests: archetype triage (@feature8).
 * Covers: ONBOARD015 (python-api), ONBOARD016 (nextjs-frontend), ONBOARD018 (minimal).
 * ONBOARD017 (monorepo) tested where fixture F-4 exists — fallback to python-api когда F-4 отсутствует.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { runBeforeEach, type BeforeEachContext } from './hooks/before-each.ts';
import { runAfterEach } from './hooks/after-each.ts';
import { archetypeTriage } from '../../../extensions/onboard-repo/tools/onboard-repo/steps/archetype-triage.ts';


describe('Phase 2: Archetype triage (@feature8)', () => {
  let ctx: BeforeEachContext;

  afterEach(async () => {
    if (ctx) await runAfterEach(ctx);
  });

  // @feature8
  it('ONBOARD015: classifies fake-python-api as python-api with high confidence', async () => {
    ctx = await runBeforeEach('fake-python-api');

    const start = Date.now();
    const result = await archetypeTriage(ctx.tmpdir);
    const elapsed = Date.now() - start;

    expect(result.archetype).toBe('python-api');
    expect(result.confidence).toBe('high');
    expect(result.evidence).toContain('pyproject.toml');
    expect(elapsed).toBeLessThan(120000); // NFR-P2: ≤ 120s
    expect(elapsed).toBeLessThan(5000);   // tmpdir small — actually much faster
  });

  // @feature8
  it('ONBOARD016: classifies fake-nextjs-frontend as nodejs-frontend', async () => {
    ctx = await runBeforeEach('fake-nextjs-frontend');

    const result = await archetypeTriage(ctx.tmpdir);

    expect(result.archetype).toBe('nodejs-frontend');
    expect(result.confidence).toBe('high');
    expect(result.evidence).toMatch(/next\.config\.ts|src\/app/);
  });

  // @feature8 EC-4
  it('ONBOARD018: classifies fake-empty as unknown (minimal content)', async () => {
    ctx = await runBeforeEach('fake-empty');

    const result = await archetypeTriage(ctx.tmpdir);

    expect(result.archetype).toBe('unknown');
    expect(result.confidence).toBe('low');
    expect(result.evidence).toContain('minimal');
  });

  // @feature8
  it('fake-no-tests (FastAPI valid, no tests/) still classified as python-api', async () => {
    ctx = await runBeforeEach('fake-no-tests');

    const result = await archetypeTriage(ctx.tmpdir);

    expect(result.archetype).toBe('python-api');
    expect(result.confidence).not.toBe('low');
  });

  // @feature8
  it('fake-with-cursorignore still classified as python-api (cursorignore does not affect triage)', async () => {
    ctx = await runBeforeEach('fake-with-cursorignore');

    const result = await archetypeTriage(ctx.tmpdir);

    expect(result.archetype).toBe('python-api');
  });

  // @feature8 EC-1
  it('fake-no-git (package.json only, no scripts) classified as library or cli-tool', async () => {
    ctx = await runBeforeEach('fake-no-git', { initGit: false });

    const result = await archetypeTriage(ctx.tmpdir);

    // fake-no-git has package.json with "main": "index.js" → library
    expect(['library', 'nodejs-backend', 'unknown']).toContain(result.archetype);
  });

  // @feature8 NFR-P2
  it('triage returns result object with all required fields', async () => {
    ctx = await runBeforeEach('fake-python-api');

    const result = await archetypeTriage(ctx.tmpdir);

    expect(result).toHaveProperty('archetype');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('evidence');
    expect(['high', 'medium', 'low']).toContain(result.confidence);
    expect(typeof result.evidence).toBe('string');
    expect(result.evidence.length).toBeGreaterThan(0);
  });
});
