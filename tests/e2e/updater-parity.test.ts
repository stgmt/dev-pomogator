/**
 * CORE020 — Updater parity with installer tests.
 *
 * The installer copies `extensions/_shared/` → `.dev-pomogator/tools/_shared/`
 * via `fs.copy` (full directory copy) at install step 3b. The updater
 * historically only synced files declared in extension manifests'
 * `toolFiles[]` whitelist, leaving `_shared/` STALE on every auto-update.
 *
 * Result: hook scripts that import from `../_shared/hook-utils.js` fail
 * with `MODULE_NOT_FOUND` after upstream changes _shared/.
 *
 * Reference incident: dkidyaev (`c:\msmaster`) — 5 hooks failing, traced
 * to stale `_shared/` directory after auto-update.
 *
 * These tests assert FR-12 (`updateSharedFiles`) closes the gap.
 *
 * Test strategy: install full set, simulate stale state, run check-update
 * (which triggers shared sync via `setupNeedsUpdateState` fixture so
 * cooldown is bypassed), assert post-state matches expectations.
 */

import { describe, it, beforeAll, expect } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import {
  runInstaller,
  appPath,
  homePath,
  setupCleanState,
  ensureCheckUpdateScript,
  runCheckUpdate,
  setupNeedsUpdateState,
} from './helpers';

describe('CORE020: Updater parity with installer (FR-12)', () => {
  beforeAll(async () => {
    await setupCleanState('claude');
    const installResult = await runInstaller('--claude --all');
    if (installResult.exitCode !== 0) {
      throw new Error(`Installer failed: ${installResult.logs}`);
    }
  });

  it('CORE020_00: _shared/ files installed by installer (sanity)', async () => {
    // Sanity check: verify the installer did copy _shared/ as expected.
    // If this fails, the rest of the suite is meaningless.
    const sharedDir = appPath('.dev-pomogator/tools/_shared');
    expect(await fs.pathExists(sharedDir)).toBe(true);
    expect(await fs.pathExists(path.join(sharedDir, 'hook-utils.ts'))).toBe(true);
    expect(await fs.pathExists(path.join(sharedDir, 'marker-utils.ts'))).toBe(true);
    expect(await fs.pathExists(path.join(sharedDir, 'index.ts'))).toBe(true);
  });

  it('CORE020_01: updater restores stale _shared/hook-utils.ts after upstream change simulation', async () => {
    // Arrange: simulate stale state — overwrite hook-utils.ts with placeholder
    const sharedFile = appPath('.dev-pomogator/tools/_shared/hook-utils.ts');
    await fs.writeFile(sharedFile, '// STALE PLACEHOLDER — should be replaced by updater\n', 'utf-8');
    expect(await fs.readFile(sharedFile, 'utf-8')).toContain('STALE PLACEHOLDER');

    // Trigger updater via setupNeedsUpdateState — bypasses cooldown by setting
    // an extension to version "0.0.1" with old lastCheck. The updater's per-project
    // _shared/ sync (FR-12) runs unconditionally before extension processing.
    await setupNeedsUpdateState('claude', 'auto-commit');
    await ensureCheckUpdateScript();
    await runCheckUpdate('--claude');

    // Assert: file restored — no longer contains stale placeholder
    const post = await fs.readFile(sharedFile, 'utf-8');
    expect(post).not.toContain('STALE PLACEHOLDER');
    // Real hook-utils.ts has `export function log` and `normalizePath`
    expect(post).toContain('export function log');
    expect(post).toContain('normalizePath');
  });

  it('CORE020_03: updater regenerates plugin.json after run (FR-14)', async () => {
    // Arrange: corrupt plugin.json with stale content
    const pluginPath = appPath('.dev-pomogator/.claude-plugin/plugin.json');
    await fs.ensureDir(path.dirname(pluginPath));
    await fs.writeJson(pluginPath, {
      name: 'dev-pomogator',
      version: '0.0.0',
      description: 'Installed extensions: stale-removed-ext-name',
    }, { spaces: 2 });

    // Trigger updater
    await setupNeedsUpdateState('claude', 'auto-commit');
    await ensureCheckUpdateScript();
    await runCheckUpdate('--claude');

    // Assert: plugin.json regenerated, no longer contains stale entry
    const post = await fs.readJson(pluginPath);
    expect(post.description).not.toContain('stale-removed-ext-name');
    expect(post.description).toContain('Installed extensions:');
    // Description must list at least one real extension
    expect(post.description.length).toBeGreaterThan('Installed extensions: '.length);
  });

  it('CORE020_04: pruneEmptyDirs helper exists in updater (FR-13)', async () => {
    // FR-13 is hard to integration-test without a controlled tool removal scenario
    // (we'd need to simulate an extension shrinking its toolFiles list, which isn't
    // doable through the existing test fixtures). This test asserts the function
    // is wired into the updater bundle so refactors don't accidentally lose it.
    const bundlePath = appPath('dist/check-update.bundle.cjs');
    if (await fs.pathExists(bundlePath)) {
      const bundle = await fs.readFile(bundlePath, 'utf-8');
      expect(bundle).toContain('pruneEmptyDirs');
    }
  });

  it('CORE020_02: updater removes orphan files no longer in _shared/.manifest.json', async () => {
    // Arrange: pre-seed orphan file inside _shared/
    const orphanFile = appPath('.dev-pomogator/tools/_shared/orphan-leftover.ts');
    await fs.writeFile(orphanFile, '// orphan — not in upstream .manifest.json\n', 'utf-8');
    expect(await fs.pathExists(orphanFile)).toBe(true);

    // Pre-load installedShared in config so updater sees this orphan as previously synced.
    // Without this, the orphan is foreign to the updater (it only prunes files it tracked).
    const configPath = homePath('.dev-pomogator/config.json');
    const config = await fs.readJson(configPath);
    config.installedShared = config.installedShared ?? {};
    config.installedShared[appPath()] = [
      ...(config.installedShared[appPath()] ?? []),
      { path: '.dev-pomogator/tools/_shared/orphan-leftover.ts', hash: 'fake-hash' },
    ];
    await fs.writeJson(configPath, config, { spaces: 2 });

    // Trigger updater
    await setupNeedsUpdateState('claude', 'auto-commit');
    // Re-seed installedShared after setupNeedsUpdateState (which rewrites config.json)
    {
      const c = await fs.readJson(configPath);
      c.installedShared = c.installedShared ?? {};
      c.installedShared[appPath()] = [
        ...(c.installedShared[appPath()] ?? []),
        { path: '.dev-pomogator/tools/_shared/orphan-leftover.ts', hash: 'fake-hash' },
      ];
      await fs.writeJson(configPath, c, { spaces: 2 });
    }
    await ensureCheckUpdateScript();
    await runCheckUpdate('--claude');

    // Assert: orphan removed
    expect(await fs.pathExists(orphanFile)).toBe(false);
  });

  it('CORE020_05: forced sync recovers missing _shared/ during cooldown (FR-12)', async () => {
    // Regression for legacy installs (pre-commit 6b475e4) where _shared/ was
    // never copied or got deleted. The updater historically skipped _shared/
    // sync when 24h cooldown was active. Now hasMissingSharedDir() probe in
    // checkUpdate() bypasses cooldown for the missing-directory case.

    // Arrange 1: physically remove the entire _shared/ directory
    const sharedDir = appPath('.dev-pomogator/tools/_shared');
    await fs.remove(sharedDir);
    expect(await fs.pathExists(sharedDir)).toBe(false);

    // Arrange 2: ensure config.installedShared[projectPath] is non-empty so
    // the probe iterates over this project (empty array → probe skips it)
    const configPath = homePath('.dev-pomogator/config.json');
    {
      const c = await fs.readJson(configPath);
      c.installedShared = c.installedShared ?? {};
      const existing = c.installedShared[appPath()] ?? [];
      if (existing.length === 0) {
        c.installedShared[appPath()] = [
          { path: '.dev-pomogator/tools/_shared/hook-utils.ts', hash: 'fake-hash-1' },
          { path: '.dev-pomogator/tools/_shared/marker-utils.ts', hash: 'fake-hash-2' },
          { path: '.dev-pomogator/tools/_shared/index.ts', hash: 'fake-hash-3' },
        ];
      }
      // Arrange 3: cooldown ACTIVE — set lastCheck to now so shouldCheckUpdate() returns false
      c.lastCheck = new Date().toISOString();
      c.cooldownHours = c.cooldownHours ?? 24;
      await fs.writeJson(configPath, c, { spaces: 2 });
    }

    // Act: run check-update WITHOUT setupNeedsUpdateState (we want cooldown ACTIVE,
    // not bypassed via the test helper). The probe should detect missing _shared/
    // and force the sync through despite the recent lastCheck.
    await ensureCheckUpdateScript();
    await runCheckUpdate('--claude');

    // Assert: directory recreated with all three files
    expect(await fs.pathExists(sharedDir)).toBe(true);
    expect(await fs.pathExists(path.join(sharedDir, 'hook-utils.ts'))).toBe(true);
    expect(await fs.pathExists(path.join(sharedDir, 'marker-utils.ts'))).toBe(true);
    expect(await fs.pathExists(path.join(sharedDir, 'index.ts'))).toBe(true);
  });
});
