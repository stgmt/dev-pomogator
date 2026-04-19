import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { runDoctor } from '../../src/doctor/index.ts';
import { killAllChildren } from '../fixtures/pomogator-doctor/child-registry.ts';
import { buildTempHome } from '../fixtures/pomogator-doctor/temp-home-builder.ts';

const apiKeyName = 'AUTO_COMMIT_API_KEY';
const savedProcessEnv = { ...process.env };

describe('POMOGATORDOCTOR001 — Per-extension gating (FR-21..FR-22)', () => {
  afterEach(async () => {
    process.env = { ...savedProcessEnv };
    await killAllChildren();
  });

  afterAll(async () => {
    await killAllChildren();
  });

  it('POMOGATORDOCTOR001_11: Per-extension gating skips irrelevant checks', async () => {
    const home = buildTempHome({
      installedExtensions: [
        { name: 'plan-pomogator', dependencies: {} },
        {
          name: 'auto-commit',
          dependencies: {},
          envRequirements: [{ name: apiKeyName, required: true }],
        },
      ],
      envInSettingsLocal: { [apiKeyName]: 'sk-test' },
    });
    try {
      const report = await runDoctor({
        homeDir: home.homeDir,
        projectRoot: home.projectDir,
      });
      const gatedIds = new Set(report.gatedOut.map((g) => g.id));
      expect(gatedIds.has('C9')).toBe(true);
      expect(gatedIds.has('C10')).toBe(true);
      expect(gatedIds.has('C16')).toBe(true);
      const resultIds = new Set(report.results.map((r) => r.id.split(':')[0]));
      expect(resultIds.has('C9')).toBe(false);
      expect(resultIds.has('C10a')).toBe(false);
      expect(resultIds.has('C10b')).toBe(false);
      expect(resultIds.has('C16a')).toBe(false);
    } finally {
      home.cleanup();
    }
  });

  it('POMOGATORDOCTOR001_11b: Bun gate activates when extension declares it', async () => {
    const home = buildTempHome({
      installedExtensions: [
        {
          name: 'bun-oom-guard',
          dependencies: { binaries: ['bun'] },
        },
      ],
    });
    try {
      const report = await runDoctor({
        homeDir: home.homeDir,
        projectRoot: home.projectDir,
      });
      const gatedIds = new Set(report.gatedOut.map((g) => g.id));
      expect(gatedIds.has('C9')).toBe(false);
      const resultIds = new Set(report.results.map((r) => r.id));
      expect(resultIds.has('C9')).toBe(true);
    } finally {
      home.cleanup();
    }
  });

  it('POMOGATORDOCTOR001_12: API key in settings.local.json env fallback is accepted', async () => {
    delete process.env[apiKeyName];
    const home = buildTempHome({
      envInSettingsLocal: { [apiKeyName]: 'sk-from-settings-local' },
    });
    try {
      const report = await runDoctor({
        homeDir: home.homeDir,
        projectRoot: home.projectDir,
      });
      const envCheck = report.results.find(
        (r) => r.fr === 'FR-5' && r.name === apiKeyName,
      );
      expect(envCheck).toBeDefined();
      expect(envCheck?.severity).toBe('ok');
      expect(envCheck?.message).toContain('settings.local.json');
      expect(envCheck?.envStatus).toEqual({ name: apiKeyName, status: 'set' });
      // redaction: no raw value leaked into result
      expect(JSON.stringify(envCheck)).not.toContain('sk-from-settings-local');
    } finally {
      home.cleanup();
    }
  });

  it('POMOGATORDOCTOR001_03: Missing API key — critical non-reinstallable', async () => {
    delete process.env[apiKeyName];
    const home = buildTempHome();
    try {
      const report = await runDoctor({
        homeDir: home.homeDir,
        projectRoot: home.projectDir,
      });
      const envCheck = report.results.find(
        (r) => r.fr === 'FR-5' && r.name === apiKeyName,
      );
      expect(envCheck?.severity).toBe('critical');
      expect(envCheck?.reinstallable).toBe(false);
      expect(envCheck?.hint).toMatch(/\.env|settings\.local\.json/);
      expect(report.manualIssues.some((r) => r.name === apiKeyName)).toBe(true);
    } finally {
      home.cleanup();
    }
  });
});
