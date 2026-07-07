/**
 * Phase 6 Green tests: scratch findings (@feature14).
 * Covers: ONBOARD025 (scratch activates для large repo), ONBOARD026 (no scratch для small repo).
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fsExtra from 'fs-extra';
import { runBeforeEach, type BeforeEachContext } from './hooks/before-each.ts';
import { runAfterEach } from './hooks/after-each.ts';
import {
  countRepoFiles,
  ScratchAppender,
  archiveScratch,
  pruneScratchArchives,
  readScratch,
  SCRATCH_THRESHOLD,
} from '../../../extensions/onboard-repo/tools/onboard-repo/steps/scratch-findings.ts';


async function createManyFiles(dir: string, count: number): Promise<void> {
  const bucket = path.join(dir, 'bulk');
  await fsExtra.ensureDir(bucket);
  await Promise.all(
    Array.from({ length: count }, (_, i) =>
      fsExtra.writeFile(path.join(bucket, `file-${i}.ts`), `export const N = ${i};\n`, 'utf-8'),
    ),
  );
}


describe('Phase 6: Scratch findings (@feature14)', () => {
  let ctx: BeforeEachContext;

  afterEach(async () => {
    if (ctx) await runAfterEach(ctx);
  });

  // @feature14 ONBOARD026
  it('ONBOARD026: small repo (<=500 files) does NOT require scratch', async () => {
    ctx = await runBeforeEach('fake-python-api');

    const result = await countRepoFiles(ctx.tmpdir);
    expect(result.total).toBeLessThanOrEqual(SCRATCH_THRESHOLD);
    expect(result.requiresScratch).toBe(false);
  });

  // @feature14 ONBOARD025
  it('ONBOARD025: large repo (>500 files) requires scratch', async () => {
    ctx = await runBeforeEach('fake-python-api');
    await createManyFiles(ctx.tmpdir, SCRATCH_THRESHOLD + 50);

    const result = await countRepoFiles(ctx.tmpdir);
    expect(result.total).toBeGreaterThan(SCRATCH_THRESHOLD);
    expect(result.requiresScratch).toBe(true);
  });

  // @feature14 ONBOARD025 — appender writes findings
  it('ScratchAppender: creates file with header on first append', async () => {
    ctx = await runBeforeEach('fake-python-api');
    const appender = new ScratchAppender(ctx.tmpdir);
    expect(await appender.exists()).toBe(false);

    await appender.append('Subagent A', 'Found pyproject.toml with FastAPI');

    expect(await appender.exists()).toBe(true);
    const content = await readScratch(ctx.tmpdir) as string;
    expect(content).toContain('# Phase 0 Onboarding Scratch');
    expect(content).toContain('### ');
    expect(content).toContain('Subagent A');
    expect(content).toContain('- Found pyproject.toml with FastAPI');
  });

  // @feature14 multi-append accumulates
  it('ScratchAppender: multiple appends accumulate timestamped blocks', async () => {
    ctx = await runBeforeEach('fake-python-api');
    const appender = new ScratchAppender(ctx.tmpdir);

    await appender.append('Subagent A', ['pyproject.toml present', 'FastAPI detected']);
    await new Promise((r) => setTimeout(r, 15)); // ensure distinct timestamps
    await appender.append('Subagent B', 'pytest.ini found');
    await new Promise((r) => setTimeout(r, 15));
    await appender.append('Subagent C', 'src/main.py is FastAPI entry');

    const content = await readScratch(ctx.tmpdir) as string;
    const blocks = content.split('### ').slice(1);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toContain('Subagent A');
    expect(blocks[0]).toContain('- pyproject.toml present');
    expect(blocks[0]).toContain('- FastAPI detected');
    expect(blocks[1]).toContain('Subagent B');
    expect(blocks[2]).toContain('Subagent C');
  });

  // @feature14 archive moves scratch to history
  it('archiveScratch: moves scratch → .onboarding-history/scratch-<ISO>.md', async () => {
    ctx = await runBeforeEach('fake-python-api');
    const appender = new ScratchAppender(ctx.tmpdir);
    await appender.append('Subagent A', 'finding');

    const archivePath = await archiveScratch(ctx.tmpdir);
    expect(archivePath).not.toBeNull();
    expect(archivePath).toMatch(/scratch-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.md$/);
    expect(await fsExtra.pathExists(archivePath as string)).toBe(true);
    expect(await fsExtra.pathExists(path.join(ctx.tmpdir, '.specs', '.onboarding-scratch.md'))).toBe(false);
  });

  // @feature14 archive no-op when no scratch
  it('archiveScratch: returns null when no scratch file exists', async () => {
    ctx = await runBeforeEach('fake-python-api');
    const archivePath = await archiveScratch(ctx.tmpdir);
    expect(archivePath).toBeNull();
  });

  // @feature14 retention 5
  it('pruneScratchArchives: keeps only 5 most recent archives', async () => {
    ctx = await runBeforeEach('fake-python-api');

    const historyDir = path.join(ctx.tmpdir, '.specs', '.onboarding-history');
    await fsExtra.ensureDir(historyDir);

    // Create 7 synthetic scratch archives с distinct mtimes
    for (let i = 0; i < 7; i += 1) {
      const filePath = path.join(historyDir, `scratch-2026-04-2${i}.md`);
      await fsExtra.writeFile(filePath, `archive ${i}`, 'utf-8');
      const mtime = new Date(Date.now() + i * 1000);
      await fsExtra.utimes(filePath, mtime, mtime);
    }

    await pruneScratchArchives(ctx.tmpdir, 5);

    const remaining = (await fsExtra.readdir(historyDir)).filter((n) => n.startsWith('scratch-'));
    expect(remaining).toHaveLength(5);
    // Oldest 2 deleted (scratch-2026-04-20, scratch-2026-04-21)
    expect(remaining).not.toContain('scratch-2026-04-20.md');
    expect(remaining).not.toContain('scratch-2026-04-21.md');
    // Newest preserved
    expect(remaining).toContain('scratch-2026-04-26.md');
  });

  // @feature14 прочие файлы в history не трогаются
  it('pruneScratchArchives: does not touch non-scratch entries in history', async () => {
    ctx = await runBeforeEach('fake-python-api');

    const historyDir = path.join(ctx.tmpdir, '.specs', '.onboarding-history');
    await fsExtra.ensureDir(historyDir);

    // Add 6 scratch files + 1 directory (from archivePreviousOnboarding)
    for (let i = 0; i < 6; i += 1) {
      await fsExtra.writeFile(path.join(historyDir, `scratch-2026-04-2${i}.md`), 'x', 'utf-8');
      const mtime = new Date(Date.now() + i * 1000);
      await fsExtra.utimes(path.join(historyDir, `scratch-2026-04-2${i}.md`), mtime, mtime);
    }
    await fsExtra.ensureDir(path.join(historyDir, '2026-04-20T10-00-00-000Z'));

    await pruneScratchArchives(ctx.tmpdir, 5);

    const dir = await fsExtra.readdir(historyDir);
    expect(dir.filter((n) => n.startsWith('scratch-'))).toHaveLength(5);
    expect(dir).toContain('2026-04-20T10-00-00-000Z'); // directory preserved
  });
});
