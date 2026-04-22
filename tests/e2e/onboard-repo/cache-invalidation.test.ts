/**
 * Phase 1 Green tests: cache invalidation (FR-4, FR-16, NFR-C3).
 * Covers: ONBOARD003 (cache hit), ONBOARD004 (SHA drift prompt), ONBOARD005 (manual refresh),
 * ONBOARD032 (non-git fallback).
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fsExtra from 'fs-extra';
import { runBeforeEach, type BeforeEachContext } from './hooks/before-each.ts';
import { runAfterEach } from './hooks/after-each.ts';
import { seedOnboardingJson, runGit } from './helpers.ts';
import {
  checkCache,
  decideAction,
  archivePreviousOnboarding,
  pruneHistory,
  driftExceedsThreshold,
  isGitRepo,
  getHeadSha,
} from '../../../extensions/onboard-repo/tools/onboard-repo/lib/git-sha-cache.ts';


describe('Phase 1: Cache invalidation (@feature4)', () => {
  let ctx: BeforeEachContext;

  afterEach(async () => {
    if (ctx) await runAfterEach(ctx);
  });

  // @feature4
  it('ONBOARD003: cache hit when SHA matches', async () => {
    ctx = await runBeforeEach('fake-python-api');
    await seedOnboardingJson(ctx.tmpdir, 'valid-v1.json', { matchHeadSha: true });

    const status = await checkCache(ctx.tmpdir);
    expect(status.status).toBe('valid');

    const decision = await decideAction({ projectPath: ctx.tmpdir, refreshFlag: false });
    expect(decision.action).toBe('skip');
    expect(decision.reason).toContain('cache hit');
  });

  // @feature4
  it('ONBOARD003: cache check completes well under 3 seconds (NFR-P4)', async () => {
    ctx = await runBeforeEach('fake-python-api');
    await seedOnboardingJson(ctx.tmpdir, 'valid-v1.json', { matchHeadSha: true });

    const start = Date.now();
    const decision = await decideAction({ projectPath: ctx.tmpdir, refreshFlag: false });
    const elapsed = Date.now() - start;

    expect(decision.action).toBe('skip');
    expect(elapsed).toBeLessThan(3000);
  });

  // @feature4
  it('ONBOARD004: stale SHA with >= 5 commits triggers prompt-drift', async () => {
    ctx = await runBeforeEach('fake-python-api');
    await seedOnboardingJson(ctx.tmpdir, 'valid-v1.json', { matchHeadSha: true });

    // Add 5 more commits after seeding → drift
    for (let i = 0; i < 5; i += 1) {
      await fsExtra.writeFile(path.join(ctx.tmpdir, `bump-${i}.txt`), `bump ${i}`);
      runGit(ctx.tmpdir, ['add', '.']);
      runGit(ctx.tmpdir, ['commit', '-m', `bump ${i}`]);
    }

    const decision = await decideAction({ projectPath: ctx.tmpdir, refreshFlag: false });
    expect(decision.action).toBe('prompt-drift');
    expect(decision.commitsAhead).toBeGreaterThanOrEqual(5);
    expect(driftExceedsThreshold(decision.status, 5)).toBe(true);
  });

  // @feature4
  it('ONBOARD004 variant: drift below threshold is silent reuse', async () => {
    ctx = await runBeforeEach('fake-python-api');
    await seedOnboardingJson(ctx.tmpdir, 'valid-v1.json', { matchHeadSha: true });

    // Add only 2 commits → below threshold 5
    for (let i = 0; i < 2; i += 1) {
      await fsExtra.writeFile(path.join(ctx.tmpdir, `bump-${i}.txt`), `bump ${i}`);
      runGit(ctx.tmpdir, ['add', '.']);
      runGit(ctx.tmpdir, ['commit', '-m', `bump ${i}`]);
    }

    const decision = await decideAction({ projectPath: ctx.tmpdir, refreshFlag: false });
    expect(decision.action).toBe('skip');
    expect(decision.reason).toContain('< threshold');
  });

  // @feature4
  it('ONBOARD005: --refresh-onboarding forces run-full', async () => {
    ctx = await runBeforeEach('fake-python-api');
    await seedOnboardingJson(ctx.tmpdir, 'valid-v1.json', { matchHeadSha: true });

    const decision = await decideAction({ projectPath: ctx.tmpdir, refreshFlag: true });
    expect(decision.action).toBe('run-full');
    expect(decision.reason).toContain('--refresh-onboarding');
  });

  // @feature4
  it('ONBOARD005: archive moves previous artifacts to .onboarding-history/<timestamp>/', async () => {
    ctx = await runBeforeEach('fake-python-api');
    await seedOnboardingJson(ctx.tmpdir, 'valid-v1.json', { matchHeadSha: true });

    const archiveDir = await archivePreviousOnboarding(ctx.tmpdir);
    expect(archiveDir).not.toBeNull();
    const archivedJson = path.join(archiveDir as string, '.onboarding.json');
    expect(await fsExtra.pathExists(archivedJson)).toBe(true);
    expect(await fsExtra.pathExists(path.join(ctx.tmpdir, '.specs', '.onboarding.json'))).toBe(false);

    // Timestamp format ISO-8601 with `-` substitutions
    const dirName = path.basename(archiveDir as string);
    expect(dirName).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/);
  });

  // @feature4
  it('ONBOARD005: retention keeps only 5 most recent history snapshots', async () => {
    ctx = await runBeforeEach('fake-python-api');

    const historyDir = path.join(ctx.tmpdir, '.specs', '.onboarding-history');
    await fsExtra.ensureDir(historyDir);

    // Create 7 synthetic history entries с distinct mtimes
    for (let i = 0; i < 7; i += 1) {
      const dir = path.join(historyDir, `snap-${i}`);
      await fsExtra.ensureDir(dir);
      await fsExtra.writeFile(path.join(dir, '.onboarding.json'), '{}');
      const mtime = new Date(Date.now() + i * 1000);
      await fsExtra.utimes(dir, mtime, mtime);
    }

    await pruneHistory(ctx.tmpdir, 5);

    const remaining = await fsExtra.readdir(historyDir);
    expect(remaining.length).toBe(5);
    // Newest 5 preserved (snap-2..snap-6), oldest 2 (snap-0, snap-1) deleted
    expect(remaining).not.toContain('snap-0');
    expect(remaining).not.toContain('snap-1');
    expect(remaining).toContain('snap-6');
  });

  // EC-1
  it('ONBOARD032: non-git repo falls back to mtime-based invalidation', async () => {
    ctx = await runBeforeEach('fake-no-git', { initGit: false });

    expect(isGitRepo(ctx.tmpdir)).toBe(false);
    expect(getHeadSha(ctx.tmpdir)).toBeNull();

    // Seed .onboarding.json without git match (manually set last_indexed_sha = "")
    const jsonContent = await fsExtra.readJson(
      path.join(ctx.tmpdir, '..', '..', '..', 'tests', 'fixtures', 'onboarding-artifacts', 'valid-v1.json').replace(
        /onboard-phase0-[^/\\]+[\\/]\.\.[\\/]\.\.[\\/]\.\./,
        '',
      ),
    ).catch(async () => {
      // Use absolute path relative to REPO_ROOT via helpers approach
      const jsonSrc = path.resolve(__dirname, '..', '..', 'fixtures', 'onboarding-artifacts', 'valid-v1.json');
      return await fsExtra.readJson(jsonSrc);
    });
    jsonContent.last_indexed_sha = '';
    await fsExtra.ensureDir(path.join(ctx.tmpdir, '.specs'));
    await fsExtra.writeJson(path.join(ctx.tmpdir, '.specs', '.onboarding.json'), jsonContent, { spaces: 2 });

    // Fresh mtime — no manifests newer than .onboarding.json → valid
    const statusFresh = await checkCache(ctx.tmpdir);
    expect(statusFresh.status).toBe('valid');

    // Touch package.json to make it newer → drift
    await new Promise((r) => setTimeout(r, 10));
    const pkgPath = path.join(ctx.tmpdir, 'package.json');
    const now = new Date();
    await fsExtra.utimes(pkgPath, now, now);

    const statusDrift = await checkCache(ctx.tmpdir);
    expect(statusDrift.status).toBe('drift');
  });

  // @feature4
  it('missing .onboarding.json → run-full', async () => {
    ctx = await runBeforeEach('fake-python-api');

    const status = await checkCache(ctx.tmpdir);
    expect(status.status).toBe('missing');

    const decision = await decideAction({ projectPath: ctx.tmpdir, refreshFlag: false });
    expect(decision.action).toBe('run-full');
    expect(decision.reason).toContain('absent');
  });

  // @feature4
  it('corrupted .onboarding.json → error → run-full', async () => {
    ctx = await runBeforeEach('fake-python-api');

    await fsExtra.ensureDir(path.join(ctx.tmpdir, '.specs'));
    await fsExtra.writeFile(path.join(ctx.tmpdir, '.specs', '.onboarding.json'), '{ corrupt: "not valid json');

    const status = await checkCache(ctx.tmpdir);
    expect(status.status).toBe('error');

    const decision = await decideAction({ projectPath: ctx.tmpdir, refreshFlag: false });
    expect(decision.action).toBe('run-full');
    expect(decision.reason).toContain('parse');
  });
});
