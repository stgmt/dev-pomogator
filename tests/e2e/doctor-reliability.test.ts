import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { acquireLock, LockHeldError } from '../../src/doctor/lock.ts';
import { runDoctor } from '../../src/doctor/index.ts';
import { killAllChildren } from '../fixtures/pomogator-doctor/child-registry.ts';
import { buildTempHome } from '../fixtures/pomogator-doctor/temp-home-builder.ts';

describe('POMOGATORDOCTOR001 — Reliability (NFR)', () => {
  afterEach(async () => {
    await killAllChildren();
  });

  afterAll(async () => {
    await killAllChildren();
  });

  it('POMOGATORDOCTOR001_14: Concurrent doctor run is blocked by lock', async () => {
    const home = buildTempHome();
    try {
      const lockPath = path.join(home.homeDir, '.dev-pomogator', 'doctor.lock');
      const holder = acquireLock(lockPath);
      try {
        await expect(runDoctor({ homeDir: home.homeDir, projectRoot: home.projectDir })).rejects.toBeInstanceOf(
          LockHeldError,
        );
      } finally {
        holder.release();
      }
      expect(fs.existsSync(lockPath)).toBe(false);
    } finally {
      home.cleanup();
    }
  });

  it('POMOGATORDOCTOR001_13: Corrupt config handled without crash, C3 critical+reinstallable', async () => {
    const home = buildTempHome({ corruptConfig: true });
    try {
      const report = await runDoctor({
        homeDir: home.homeDir,
        projectRoot: home.projectDir,
      });
      expect(report.schemaVersion).toBe('1.0.0');
      expect(report.installedExtensions).toEqual([]);
      const c3 = report.results.find((r) => r.id === 'C3');
      expect(c3).toBeDefined();
      expect(c3?.severity).toBe('critical');
      expect(c3?.reinstallable).toBe(true);
      expect(c3?.message).toMatch(/invalid|parse/i);
      expect(report.reinstallableIssues.length).toBeGreaterThan(0);
    } finally {
      home.cleanup();
    }
  });
});
