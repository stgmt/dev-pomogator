/**
 * Phase 4 Green tests: ingestion (@feature7 @feature2).
 * Covers: ONBOARD033 (repomix when available), ONBOARD034 (fallback).
 *
 * `repomix` availability is DI-injected; tests control both paths deterministically
 * без requirement to have the actual CLI installed.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fsExtra from 'fs-extra';
import { runBeforeEach, type BeforeEachContext } from './hooks/before-each.ts';
import { runAfterEach } from './hooks/after-each.ts';
import {
  runIngestion,
  type IngestionDeps,
} from '../../../extensions/onboard-repo/tools/onboard-repo/steps/ingestion.ts';


function depsWithRepomix(fakeOutput: string): IngestionDeps {
  return {
    repomixAvailable: () => true,
    runRepomix: (_projectPath, outputPath) => {
      fsExtra.ensureDirSync(path.dirname(outputPath));
      fsExtra.writeFileSync(outputPath, fakeOutput, 'utf-8');
      return { status: 0, message: 'fake-repomix ok' };
    },
  };
}


function depsRepomixFailing(): IngestionDeps {
  return {
    repomixAvailable: () => true,
    runRepomix: () => ({ status: 1, message: 'fake-repomix crashed' }),
  };
}


function depsWithoutRepomix(): IngestionDeps {
  return {
    repomixAvailable: () => false,
    runRepomix: () => ({ status: -1, message: 'not called' }),
  };
}


describe('Phase 4: Ingestion (@feature7, @feature2)', () => {
  let ctx: BeforeEachContext;

  afterEach(async () => {
    if (ctx) await runAfterEach(ctx);
  });

  // @feature7 ONBOARD033
  it('ONBOARD033: repomix available → method="repomix" with compression_ratio', async () => {
    ctx = await runBeforeEach('fake-python-api');
    const fakeOutput = 'X'.repeat(500); // small compressed output

    const outputDir = path.join(ctx.tmpdir, '.tmp-ingestion');
    const result = await runIngestion(
      { slug: 'python-api', projectPath: ctx.tmpdir, outputDir },
      depsWithRepomix(fakeOutput),
    );

    expect(result.method).toBe('repomix');
    expect(result.output_path).toMatch(/\.onboarding-python-api\.xml$/);
    expect(await fsExtra.pathExists(result.output_path as string)).toBe(true);
    expect(result.compression_ratio).toBeGreaterThan(0);
    expect(result.compression_ratio).toBeLessThanOrEqual(1);
    expect(result.files_included).toBeGreaterThan(0);
    expect(result.total_tokens_estimate).toBeGreaterThan(0);
  });

  // @feature7 ONBOARD034
  it('ONBOARD034: repomix NOT available → fallback with top-N ranking', async () => {
    ctx = await runBeforeEach('fake-python-api');

    const outputDir = path.join(ctx.tmpdir, '.tmp-ingestion');
    const result = await runIngestion(
      { slug: 'python-api', projectPath: ctx.tmpdir, outputDir, fallbackMaxFiles: 20 },
      depsWithoutRepomix(),
    );

    expect(result.method).toBe('fallback');
    expect(result.output_path).toMatch(/\.onboarding-python-api\.txt$/);
    expect(await fsExtra.pathExists(result.output_path as string)).toBe(true);
    expect(result.files_included).toBeGreaterThan(0);
    expect(result.files_included).toBeLessThanOrEqual(20);

    const content = await fsExtra.readFile(result.output_path as string, 'utf-8');
    expect(content).toContain('=== ');
    expect(content).toContain('score=');
  });

  // NFR-R fallback when repomix fails mid-run
  it('repomix crashes → falls back to top-N', async () => {
    ctx = await runBeforeEach('fake-python-api');

    const result = await runIngestion(
      { slug: 'python-api', projectPath: ctx.tmpdir },
      depsRepomixFailing(),
    );

    expect(result.method).toBe('fallback');
    expect(result.files_included).toBeGreaterThan(0);
  });

  // @feature7
  it('empty repo → fallback with 0 files', async () => {
    ctx = await runBeforeEach('fake-empty');

    const result = await runIngestion(
      { slug: 'empty', projectPath: ctx.tmpdir },
      depsWithoutRepomix(),
    );

    expect(result.method).toBe('fallback');
    expect(result.files_included).toBe(0);
    expect(result.output_path).toBeNull();
  });

  // @feature2 fallback excludes ignored dirs
  it('fallback ignores node_modules, dist, .git', async () => {
    ctx = await runBeforeEach('fake-python-api');

    // Создаём большой файл в node_modules — должен быть скипнут
    const nmPath = path.join(ctx.tmpdir, 'node_modules', 'huge.ts');
    await fsExtra.ensureDir(path.dirname(nmPath));
    await fsExtra.writeFile(nmPath, 'x'.repeat(100000), 'utf-8');

    const result = await runIngestion(
      { slug: 'python-api', projectPath: ctx.tmpdir },
      depsWithoutRepomix(),
    );

    const content = await fsExtra.readFile(result.output_path as string, 'utf-8');
    expect(content).not.toContain('node_modules');
  });

  // @feature7 fallback ranks top-N by heuristic
  it('fallback returns ranked output (score included)', async () => {
    ctx = await runBeforeEach('fake-nextjs-frontend');

    const result = await runIngestion(
      { slug: 'nextjs', projectPath: ctx.tmpdir },
      depsWithoutRepomix(),
    );

    expect(result.method).toBe('fallback');
    const content = await fsExtra.readFile(result.output_path as string, 'utf-8');

    // page.tsx should be in output (it's a source file)
    expect(content).toMatch(/page\.tsx/);

    // Score pattern includes numeric value
    const scoreMatches = content.match(/score=[\d.]+/g);
    expect(scoreMatches).not.toBeNull();
    expect((scoreMatches as RegExpMatchArray).length).toBeGreaterThan(0);
  });
});
