import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { runDoctor } from '../../src/doctor/index.ts';
import {
  buildHookOutput,
  exitCodeFor,
  formatChalk,
  formatJson,
} from '../../src/doctor/reporter.ts';
import { killAllChildren } from '../fixtures/pomogator-doctor/child-registry.ts';
import { buildTempHome } from '../fixtures/pomogator-doctor/temp-home-builder.ts';

const apiKey = 'AUTO_COMMIT_API_KEY';
const savedEnv = { ...process.env };

describe('POMOGATORDOCTOR001 — Output formats (FR-20, FR-23..FR-25)', () => {
  afterEach(async () => {
    process.env = { ...savedEnv };
    await killAllChildren();
  });

  afterAll(async () => {
    await killAllChildren();
  });

  it('POMOGATORDOCTOR001_08: CI --json output — redacted, no raw env values, exit 2 when critical', async () => {
    delete process.env[apiKey];
    const home = buildTempHome();
    try {
      const report = await runDoctor({
        homeDir: home.homeDir,
        projectRoot: home.projectDir,
        json: true,
        interactive: false,
      });
      const json = formatJson(report);
      expect(() => JSON.parse(json)).not.toThrow();
      expect(json).not.toMatch(/\u001b\[/); // no ANSI codes
      expect(json).not.toContain('sk-'); // no leaked key
      const parsed = JSON.parse(json) as { results: Array<{ name: string; envStatus?: unknown; value?: unknown }> };
      const envCheck = parsed.results.find((r) => r.name === apiKey);
      expect(envCheck?.envStatus).toEqual({ name: apiKey, status: 'unset' });
      expect(envCheck).not.toHaveProperty('value');
      expect(exitCodeFor(report)).toBe(2);
    } finally {
      home.cleanup();
    }
  });

  it('POMOGATORDOCTOR001_10: Traffic-light grouped output contains all 3 group emojis', async () => {
    const home = buildTempHome({
      installedExtensions: [
        { name: 'plan-pomogator' },
        {
          name: 'auto-commit',
          envRequirements: [{ name: apiKey, required: true }],
        },
        {
          name: 'bun-oom-guard',
          dependencies: { binaries: ['bun'] },
        },
      ],
      envInSettingsLocal: { [apiKey]: 'sk-test' },
    });
    try {
      const report = await runDoctor({
        homeDir: home.homeDir,
        projectRoot: home.projectDir,
        interactive: true,
      });
      const chalkOutput = formatChalk(report);
      expect(chalkOutput).toContain('🟢');
      expect(chalkOutput).toContain('🟡');
      expect(chalkOutput).toContain('🔴');
      expect(chalkOutput).toMatch(/Self-sufficient/);
      expect(chalkOutput).toMatch(/Needs env vars/);
      expect(chalkOutput).toMatch(/Needs external deps/);
      expect(chalkOutput).toMatch(/Summary:/);
    } finally {
      home.cleanup();
    }
  });

  it('POMOGATORDOCTOR001_10b: Hook output is silent when all ok', async () => {
    const home = buildTempHome({
      envInSettingsLocal: { [apiKey]: 'sk-test' },
    });
    try {
      const report = await runDoctor({
        homeDir: home.homeDir,
        projectRoot: home.projectDir,
        quiet: true,
      });
      const hookOut = buildHookOutput(report);
      expect(hookOut.continue).toBe(true);
      // With the real environment some checks may warn (Node <22.6 is warning on this host).
      // We verify the schema is either silent or includes a bounded banner, not both.
      if (report.summary.critical === 0 && report.summary.warnings === 0) {
        expect(hookOut.suppressOutput).toBe(true);
        expect(hookOut.additionalContext).toBeUndefined();
      } else {
        expect(hookOut.additionalContext).toBeDefined();
        expect(hookOut.additionalContext!.length).toBeLessThanOrEqual(100);
        expect(hookOut.additionalContext).toMatch(/pomogator-doctor/);
      }
    } finally {
      home.cleanup();
    }
  });
});
