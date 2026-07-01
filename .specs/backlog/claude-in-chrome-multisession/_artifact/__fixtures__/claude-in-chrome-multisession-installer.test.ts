import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import { appPath, runInstaller, setupCleanState, type InstallerResult } from './helpers';

/**
 * PLUGIN018_10 — installer integration test (AC-9, FR-9).
 *
 * Verifies the existing dev-pomogator installer correctly handles
 * `extension.json.hooks.claude.{PreToolUse, PostToolUse}` — no new
 * `src/installer/` code is needed for `claude-in-chrome-multisession`.
 *
 * **Docker-only**: this test runs `runInstaller` which calls `setupCleanState`
 * (deletes `~/.claude/`, `~/.dev-pomogator/`, project `.claude/settings*.json`).
 * Refuses on host unless `DEVPOM_ALLOW_HOST_TESTS=1` (per ensure-docker.ts).
 */
const PERSONAL_ENV = { DEV_POMOGATOR_SKIP_SELF_GUARD: '1' };

describe('PLUGIN018: claude-in-chrome-multisession — installer integration (AC-9)', () => {
  let result: InstallerResult;

  beforeAll(async () => {
    await setupCleanState('claude');
    result = await runInstaller(
      '--claude --plugins=claude-in-chrome-multisession',
      PERSONAL_ENV,
    );
  });

  afterAll(async () => {
    // Cleanup left behind by setupCleanState — best-effort.
    try {
      await fs.remove(appPath('.claude', 'settings.local.json'));
    } catch {
      /* ignore */
    }
  });

  it('PLUGIN018_10a: installer exit code is 0', () => {
    expect(result.exitCode, `installer logs:\n${result.logs}`).toBe(0);
  });

  it('PLUGIN018_10b: cims-guard.ts copied to .dev-pomogator/tools/', async () => {
    expect(
      await fs.pathExists(
        appPath('.dev-pomogator', 'tools', 'claude-in-chrome-multisession', 'cims-guard.ts'),
      ),
    ).toBe(true);
  });

  it('PLUGIN018_10c: claim-tab.mjs copied to .dev-pomogator/tools/', async () => {
    expect(
      await fs.pathExists(
        appPath('.dev-pomogator', 'tools', 'claude-in-chrome-multisession', 'claim-tab.mjs'),
      ),
    ).toBe(true);
  });

  it('PLUGIN018_10d: SKILL.md copied to .claude/skills/', async () => {
    expect(
      await fs.pathExists(
        appPath('.claude', 'skills', 'claude-in-chrome-multisession', 'SKILL.md'),
      ),
    ).toBe(true);
  });

  it('PLUGIN018_10e: settings.local.json contains PreToolUse hook for mcp__claude-in-chrome__.*', async () => {
    const settingsPath = appPath('.claude', 'settings.local.json');
    expect(await fs.pathExists(settingsPath)).toBe(true);
    const settings = await fs.readJson(settingsPath);
    const pre = settings?.hooks?.PreToolUse ?? [];
    const matchingPre = pre.filter(
      (g: { matcher?: string; hooks?: Array<{ command?: string }> }) =>
        g.matcher === 'mcp__claude-in-chrome__.*' &&
        g.hooks?.some((h) => h.command?.includes('cims-guard.ts')),
    );
    expect(matchingPre.length).toBeGreaterThan(0);
  });

  it('PLUGIN018_10f: settings.local.json contains PostToolUse hook (symmetric)', async () => {
    const settings = await fs.readJson(appPath('.claude', 'settings.local.json'));
    const post = settings?.hooks?.PostToolUse ?? [];
    const matchingPost = post.filter(
      (g: { matcher?: string; hooks?: Array<{ command?: string }> }) =>
        g.matcher === 'mcp__claude-in-chrome__.*' &&
        g.hooks?.some((h) => h.command?.includes('cims-guard.ts')),
    );
    expect(matchingPost.length).toBeGreaterThan(0);
  });

  it('PLUGIN018_10g: dev-pomogator config.json includes installedExtensions entry', async () => {
    const config = await import('./helpers').then((m) => m.getDevPomogatorConfig());
    expect(config).not.toBeNull();
    const ext = config?.installedExtensions?.find(
      (e) => e.name === 'claude-in-chrome-multisession',
    );
    expect(ext).toBeDefined();
    expect(ext?.platform).toBe('claude');
    expect(ext?.projectPaths).toContain(appPath());
  });

  it('PLUGIN018_10h: idempotent — second install does not duplicate hooks', async () => {
    await runInstaller('--claude --plugins=claude-in-chrome-multisession', PERSONAL_ENV);
    const settings = await fs.readJson(appPath('.claude', 'settings.local.json'));
    const pre = settings?.hooks?.PreToolUse ?? [];
    const matchingCount = pre.reduce((acc: number, g: { hooks?: Array<{ command?: string }> }) => {
      const inner = g.hooks?.filter((h) => h.command?.includes('cims-guard.ts'))?.length ?? 0;
      return acc + inner;
    }, 0);
    expect(matchingCount).toBe(1);
  });
});
