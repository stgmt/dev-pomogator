import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import {
  runInstaller,
  homePath,
  appPath,
  setupCleanState,
} from './helpers';

/**
 * CORE005: Settings.json Atomic Write Protection
 *
 * Tests that .claude/settings.json is written atomically with backup/recovery:
 * - Backup (.bak) created before overwriting
 * - Recovery from corrupted JSON via .bak
 * - Fallback to empty settings when both corrupted
 * - User hooks preserved during re-install
 * - No .tmp files left after write
 *
 * @implemented: settings-protection.test.ts
 */
describe('CORE005: Settings.json Atomic Write Protection', () => {
  const projectSettingsPath = () => appPath('.claude', 'settings.json');
  const projectSettingsBak = () => appPath('.claude', 'settings.json.bak');
  const projectSettingsTmp = () => appPath('.claude', 'settings.json.tmp');
  const globalSettingsPath = () => homePath('.claude', 'settings.json');
  const globalSettingsBak = () => homePath('.claude', 'settings.json.bak');

  // @feature1 — Atomic write creates backup
  describe('Scenario: Atomic write creates backup before overwriting', () => {
    beforeAll(async () => {
      await setupCleanState('claude');
      await runInstaller('--claude --all');
    });

    it('should create .claude/settings.json in project', async () => {
      expect(await fs.pathExists(projectSettingsPath())).toBe(true);
    });

    it('should create .claude/settings.json.bak after second install', async () => {
      // First install created settings.json
      // Second install should backup it before overwriting
      await runInstaller('--claude --all');
      expect(await fs.pathExists(projectSettingsBak())).toBe(true);
    });

    it('should have valid JSON in .bak file', async () => {
      const bak = await fs.readJson(projectSettingsBak());
      expect(bak).toBeDefined();
      expect(bak.hooks).toBeDefined();
    });

    it('should have all managed hooks in settings.json', async () => {
      const settings = await fs.readJson(projectSettingsPath());
      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.Stop).toBeDefined();
      expect(Array.isArray(settings.hooks.Stop)).toBe(true);
      expect(settings.hooks.Stop.length).toBeGreaterThan(0);
    });

    it('should not leave .tmp files', async () => {
      expect(await fs.pathExists(projectSettingsTmp())).toBe(false);
    });

    it('should create global settings.json.bak', async () => {
      // Global settings also use atomic write
      expect(await fs.pathExists(globalSettingsBak())).toBe(true);
    });
  });

  // @feature2 — Recovery from corrupted settings.json
  describe('Scenario: Recovery from corrupted settings.json', () => {
    beforeAll(async () => {
      await setupCleanState('claude');
      // First install — creates valid settings
      await runInstaller('--claude --all');
    });

    it('should recover hooks from .bak when primary is corrupted', async () => {
      // Capture current valid settings
      const validSettings = await fs.readJson(projectSettingsPath());
      const hookCount = validSettings.hooks?.Stop?.length || 0;

      // Create backup manually (simulating previous atomic write)
      await fs.copy(projectSettingsPath(), projectSettingsBak());

      // Corrupt the primary file
      await fs.writeFile(projectSettingsPath(), '{invalid json!!!', 'utf-8');

      // Re-install — should recover from .bak
      await runInstaller('--claude --all');

      const recovered = await fs.readJson(projectSettingsPath());
      expect(recovered.hooks).toBeDefined();
      expect(recovered.hooks.Stop).toBeDefined();
      // Should have hooks (recovered from bak + re-installed)
      expect(recovered.hooks.Stop.length).toBeGreaterThan(0);
    });
  });

  // @feature3 — Both primary and backup corrupted
  describe('Scenario: Both primary and backup corrupted', () => {
    beforeAll(async () => {
      await setupCleanState('claude');
    });

    it('should use empty fallback and still install hooks', async () => {
      // Create corrupted primary
      await fs.ensureDir(path.dirname(projectSettingsPath()));
      await fs.writeFile(projectSettingsPath(), 'NOT JSON AT ALL', 'utf-8');

      // Create corrupted backup
      await fs.writeFile(projectSettingsBak(), 'ALSO NOT JSON', 'utf-8');

      // Install — should use empty fallback and still add hooks
      await runInstaller('--claude --all');

      const settings = await fs.readJson(projectSettingsPath());
      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.Stop).toBeDefined();
      expect(settings.hooks.Stop.length).toBeGreaterThan(0);
    });
  });

  // @feature4 — User hooks preserved
  describe('Scenario: User hooks preserved during re-install', () => {
    beforeAll(async () => {
      await setupCleanState('claude');
      await runInstaller('--claude --all');
    });

    it('should preserve user-added hooks after re-install', async () => {
      // Add a user hook (not containing .dev-pomogator/tools/)
      const settings = await fs.readJson(projectSettingsPath());
      if (!settings.hooks.Stop) settings.hooks.Stop = [];
      settings.hooks.Stop.push({
        matcher: '',
        hooks: [{
          type: 'command',
          command: 'echo "user custom hook"',
          timeout: 30,
        }],
      });
      await fs.writeJson(projectSettingsPath(), settings, { spaces: 2 });

      // Re-install
      await runInstaller('--claude --all');

      // User hook should still be there
      const updated = await fs.readJson(projectSettingsPath());
      const userHook = updated.hooks.Stop.find(
        (h: { hooks?: Array<{ command: string }> }) =>
          h.hooks?.some((hook: { command: string }) => hook.command === 'echo "user custom hook"'),
      );
      expect(userHook).toBeDefined();

      // Managed hooks should also be present
      const managedHook = updated.hooks.Stop.find(
        (h: { hooks?: Array<{ command: string }> }) =>
          h.hooks?.some((hook: { command: string }) => hook.command.includes('.dev-pomogator/tools/')),
      );
      expect(managedHook).toBeDefined();
    });
  });

  // @feature5 — No .tmp files after write
  describe('Scenario: No .tmp files left after successful write', () => {
    beforeAll(async () => {
      await setupCleanState('claude');
      await runInstaller('--claude --all');
    });

    it('should not have settings.json.tmp in project', async () => {
      expect(await fs.pathExists(projectSettingsTmp())).toBe(false);
    });

    it('should not have settings.json.tmp in global', async () => {
      expect(await fs.pathExists(homePath('.claude', 'settings.json.tmp'))).toBe(false);
    });

    it('should have valid JSON in project settings', async () => {
      const content = await fs.readFile(projectSettingsPath(), 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('should have valid JSON in global settings', async () => {
      const content = await fs.readFile(globalSettingsPath(), 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });
  });
});
