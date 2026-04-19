import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { runDoctor } from '../../src/doctor/index.ts';
import { killAllChildren } from '../fixtures/pomogator-doctor/child-registry.ts';
import { buildTempHome } from '../fixtures/pomogator-doctor/temp-home-builder.ts';

describe('POMOGATORDOCTOR001 — Reinstall flow (FR-18..FR-19)', () => {
  afterEach(async () => {
    await killAllChildren();
  });

  afterAll(async () => {
    await killAllChildren();
  });

  it('POMOGATORDOCTOR001_02: Missing tools — C5 critical+reinstallable', async () => {
    const home = buildTempHome({ skipTools: true });
    try {
      const report = await runDoctor({
        homeDir: home.homeDir,
        projectRoot: home.projectDir,
      });
      const c5 = report.results.find((r) => r.id === 'C5');
      expect(c5?.severity).toBe('critical');
      expect(c5?.reinstallable).toBe(true);
      expect(c5?.message).toMatch(/auto-commit/);
      expect(report.reinstallableIssues.some((r) => r.id === 'C5')).toBe(true);
    } finally {
      home.cleanup();
    }
  });

  it('POMOGATORDOCTOR001_07: Version mismatch — C13 critical reinstallable', async () => {
    const home = buildTempHome({ configVersion: '1.3.0', packageVersion: '2.0.0' });
    try {
      const report = await runDoctor({
        homeDir: home.homeDir,
        projectRoot: home.projectDir,
      });
      const c13 = report.results.find((r) => r.id === 'C13');
      expect(c13?.severity).toBe('critical');
      expect(c13?.reinstallable).toBe(true);
      expect(c13?.message).toMatch(/major/i);
    } finally {
      home.cleanup();
    }
  });

  it('POMOGATORDOCTOR001_09: Plugin-loader broken-missing — reinstallable', async () => {
    const home = buildTempHome({
      pluginJson: { commands: [{ name: 'create-spec' }, { name: 'reflect' }] },
      // no pluginCommandsOnDisk → both are BROKEN-missing
    });
    try {
      const report = await runDoctor({
        homeDir: home.homeDir,
        projectRoot: home.projectDir,
      });
      const summary = report.results.find((r) => r.id === 'C15');
      expect(summary?.severity).toBe('critical');
      expect(summary?.reinstallable).toBe(true);
      expect(summary?.state).toBe('BROKEN-missing');
      expect(summary?.message).toMatch(/create-spec|reflect/);
    } finally {
      home.cleanup();
    }
  });
});
