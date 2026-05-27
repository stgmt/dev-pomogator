import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runDoctor } from '../../src/doctor/index.ts';
import { buildTempHome } from '../fixtures/pomogator-doctor/temp-home-builder.ts';
import { killAllChildren } from '../fixtures/pomogator-doctor/child-registry.ts';

describe('PLUGIN017: chrome-devtools-mcp-mux — doctor checks (FR-4)', () => {
  afterEach(async () => {
    await killAllChildren();
  });

  // @feature4 — FR-4: 5 CDMM-* entries when extension installed
  it('PLUGIN017_05: doctor emits 5 CDMM-* checks when extension installed', async () => {
    const home = buildTempHome({
      installedExtensions: [{ name: 'chrome-devtools-mcp-mux', version: '0.1.0' }],
    });
    try {
      // Write a valid .mcp.json so CDMM-2 sees the entry
      const mcpJson = {
        mcpServers: {
          'chrome-devtools-mcp-mux': {
            command: 'npx',
            args: ['-y', 'chrome-devtools-mcp-mux@0.2.2'],
          },
        },
      };
      fs.writeFileSync(path.join(home.projectDir, '.mcp.json'), JSON.stringify(mcpJson));
      // Write a SKILL.md so CDMM-5 passes
      const skillDir = path.join(home.projectDir, '.claude', 'skills', 'chrome-devtools-mcp-mux');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: chrome-devtools-mcp-mux\n---\n');

      const report = await runDoctor({
        homeDir: home.homeDir,
        projectRoot: home.projectDir,
        timeout: 20_000,
      });

      const cdmmIds = report.results
        .map((r) => r.id)
        .filter((id) => id.startsWith('CDMM-'))
        .sort();

      expect(cdmmIds).toEqual(['CDMM-1', 'CDMM-2', 'CDMM-3', 'CDMM-4', 'CDMM-5']);

      const cdmmResults = report.results.filter((r) => r.id.startsWith('CDMM-'));
      for (const r of cdmmResults) {
        expect(['ok', 'warning', 'critical']).toContain(r.severity);
        if (r.severity !== 'ok') {
          expect(r.hint).toBeDefined();
          expect(r.hint!.length).toBeGreaterThan(0);
        }
        expect(r.extension).toBe('chrome-devtools-mcp-mux');
      }
    } finally {
      home.cleanup();
    }
  }, 30_000);

  // @feature4 — FR-4: skip when extension absent
  it('PLUGIN017_06: doctor skips CDMM-* checks when extension not in installedExtensions', async () => {
    const home = buildTempHome({
      installedExtensions: [{ name: 'auto-commit', version: '1.0.0' }],
    });
    try {
      const report = await runDoctor({
        homeDir: home.homeDir,
        projectRoot: home.projectDir,
      });

      const cdmmIds = report.results.filter((r) => r.id.startsWith('CDMM-'));
      expect(cdmmIds.length).toBe(0);

      // Should be in gatedOut
      const gated = report.gatedOut.filter((g) => g.id === 'CDMM' || g.id.startsWith('CDMM-'));
      expect(gated.length).toBeGreaterThan(0);
    } finally {
      home.cleanup();
    }
  }, 15_000);

  // @feature5 — FR-5: doctor co-existence warning
  it('PLUGIN017_08: doctor CDMM-2 warns when claude-in-chrome ALSO configured', async () => {
    const home = buildTempHome({
      installedExtensions: [{ name: 'chrome-devtools-mcp-mux', version: '0.1.0' }],
    });
    try {
      // Both servers present
      const mcpJson = {
        mcpServers: {
          'chrome-devtools-mcp-mux': {
            command: 'npx',
            args: ['-y', 'chrome-devtools-mcp-mux@0.2.2'],
          },
          'claude-in-chrome': {
            command: 'node',
            args: ['cic.mjs'],
          },
        },
      };
      fs.writeFileSync(path.join(home.projectDir, '.mcp.json'), JSON.stringify(mcpJson));
      const skillDir = path.join(home.projectDir, '.claude', 'skills', 'chrome-devtools-mcp-mux');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: chrome-devtools-mcp-mux\n---\n');

      const report = await runDoctor({
        homeDir: home.homeDir,
        projectRoot: home.projectDir,
        timeout: 20_000,
      });

      const cdmm2 = report.results.find((r) => r.id === 'CDMM-2');
      expect(cdmm2).toBeDefined();
      expect(cdmm2!.severity).toBe('warning');
      expect(cdmm2!.hint).toContain('FR-5');
    } finally {
      home.cleanup();
    }
  }, 30_000);
});
