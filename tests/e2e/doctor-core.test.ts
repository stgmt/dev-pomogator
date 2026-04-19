import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { runDoctor } from '../../src/doctor/index.ts';
import { killAllChildren } from '../fixtures/pomogator-doctor/child-registry.ts';
import { spawnFakeMcp } from '../fixtures/pomogator-doctor/fake-mcp-server.ts';
import { buildTempHome } from '../fixtures/pomogator-doctor/temp-home-builder.ts';

describe('POMOGATORDOCTOR001 — Core checks (FR-1..FR-14)', () => {
  afterEach(async () => {
    await killAllChildren();
  });

  afterAll(async () => {
    await killAllChildren();
  });

  it('POMOGATORDOCTOR001_01: happy path produces report with all known check ids', async () => {
    const home = buildTempHome({
      envInSettingsLocal: { AUTO_COMMIT_API_KEY: 'sk-test-fake' },
      packageVersion: '1.5.0',
      configVersion: '1.5.0',
    });
    try {
      const report = await runDoctor({
        homeDir: home.homeDir,
        projectRoot: home.projectDir,
      });
      const ids = new Set(report.results.map((r) => r.id.split(':')[0]));
      expect(ids.has('C1')).toBe(true);
      expect(ids.has('C2')).toBe(true);
      expect(ids.has('C3')).toBe(true);
      expect(ids.has('C6')).toBe(true);
      expect(ids.has('C7')).toBe(true);
      expect(ids.has('C13')).toBe(true);
      expect(ids.has('C14')).toBe(true);
      expect(report.installedExtensions).toContain('auto-commit');
    } finally {
      home.cleanup();
    }
  });

  it('POMOGATORDOCTOR001_06: MCP probe timeout triggers SIGKILL', async () => {
    const hanging = spawnFakeMcp('hangOnInit');
    const home = buildTempHome();
    try {
      const mcpConfig = {
        mcpServers: {
          'fake-hanging': {
            command: hanging.command,
            args: hanging.args,
          },
        },
      };
      fs.writeFileSync(path.join(home.projectDir, '.mcp.json'), JSON.stringify(mcpConfig));
      const rulesDir = path.join(home.projectDir, '.claude', 'rules');
      fs.mkdirSync(rulesDir, { recursive: true });
      fs.writeFileSync(
        path.join(rulesDir, 'references.md'),
        'Uses mcp__fake-hanging__do_work in our flow.\n',
      );

      const started = Date.now();
      const report = await runDoctor({
        homeDir: home.homeDir,
        projectRoot: home.projectDir,
      });
      const elapsed = Date.now() - started;

      const probe = report.results.find((r) => r.id === 'C12:fake-hanging');
      expect(probe).toBeDefined();
      expect(probe?.severity).toBe('critical');
      expect(probe?.message).toMatch(/timeout/i);
      // 3s probe timeout + bounded pool + lock = must finish in < 6s
      expect(elapsed).toBeLessThan(6000);
      expect(probe?.durationMs).toBeGreaterThanOrEqual(2800);
      expect(probe?.durationMs).toBeLessThan(4000);
    } finally {
      await hanging.kill();
      home.cleanup();
    }
  }, 10_000);
});
