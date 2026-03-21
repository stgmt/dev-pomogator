import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import {
  runInstaller,
  homePath,
  appPath,
  setupCleanState,
  type InstallerResult,
} from './helpers';

/**
 * CORE007: Bundled Scripts Installation
 *
 * Verifies that check-update.bundle.cjs and tsx-runner.js are reliably
 * installed to ~/.dev-pomogator/scripts/ after installation, and that
 * both scripts are executable by Node.js without MODULE_NOT_FOUND errors.
 */
let installerResult: InstallerResult;

describe('CORE007: Bundled Scripts Installation', () => {
  beforeAll(async () => {
    await setupCleanState('claude');
    installerResult = await runInstaller('--claude --all');
  }, 120_000);

  // @feature1
  describe('Scenario: CORE007_01 check-update.js is installed to global scripts', () => {
    it('CORE007_01: should install check-update.js with bundled content', async () => {
      const scriptPath = homePath('.dev-pomogator', 'scripts', 'check-update.js');
      expect(await fs.pathExists(scriptPath)).toBe(true);

      const content = await fs.readFile(scriptPath, 'utf-8');
      expect(content).toContain('checkUpdate');

      const stat = await fs.stat(scriptPath);
      expect(stat.size).toBeGreaterThan(100 * 1024); // >100KB bundled
    });
  });

  // @feature2
  describe('Scenario: CORE007_02 tsx-runner.js is installed to global scripts', () => {
    it('CORE007_02: should install tsx-runner.js with runner content', async () => {
      const scriptPath = homePath('.dev-pomogator', 'scripts', 'tsx-runner.js');
      expect(await fs.pathExists(scriptPath)).toBe(true);

      const content = await fs.readFile(scriptPath, 'utf-8');
      expect(content).toContain('resolveScriptPath');

      const stat = await fs.stat(scriptPath);
      expect(stat.size).toBeGreaterThan(5 * 1024); // >5KB
    });
  });

  // @feature3
  describe('Scenario: CORE007_03 check-update.js is executable by node', () => {
    it('CORE007_03: should run without MODULE_NOT_FOUND error', () => {
      const scriptPath = homePath('.dev-pomogator', 'scripts', 'check-update.js');

      try {
        execSync(`node "${scriptPath}" --check-only`, {
          encoding: 'utf-8',
          timeout: 15_000,
          cwd: appPath(),
        });
      } catch (err: any) {
        // Script may exit non-zero (no config, no network) — that's OK.
        // But it must NOT fail with MODULE_NOT_FOUND (broken bundle).
        const output = (err.stderr || '') + (err.stdout || '') + (err.message || '');
        expect(output).not.toContain('MODULE_NOT_FOUND');
        expect(output).not.toContain('Cannot find module');
      }
    });
  });

  // @feature4
  describe('Scenario: CORE007_04 tsx-runner.js is executable by node', () => {
    it('CORE007_04: should run a TypeScript file successfully', async () => {
      const runnerPath = homePath('.dev-pomogator', 'scripts', 'tsx-runner.js');

      // Create a minimal test TypeScript file
      const testScript = appPath('test-bundled-echo.ts');
      await fs.writeFile(testScript, 'console.log("BUNDLED_SCRIPTS_OK");');

      try {
        const output = execSync(`node "${runnerPath}" "${testScript}"`, {
          encoding: 'utf-8',
          timeout: 30_000,
          cwd: appPath(),
        });
        expect(output).toContain('BUNDLED_SCRIPTS_OK');
      } finally {
        await fs.remove(testScript);
      }
    });
  });

  // @feature5
  describe('Scenario: CORE007_05 dist files are included in npm pack output', () => {
    it('CORE007_05: npm pack --dry-run should include all bundled scripts', () => {
      const output = execSync('npm pack --dry-run 2>&1', {
        encoding: 'utf-8',
        timeout: 60_000,
        cwd: appPath(),
      });

      expect(output).toContain('dist/check-update.bundle.cjs');
      expect(output).toContain('dist/tsx-runner.js');
      expect(output).toContain('dist/launch-claude-tui.ps1');
    });
  });

  // @feature6
  describe('Scenario: CORE007_06 launch-claude-tui.ps1 is installed to global scripts', () => {
    it('CORE007_06: should install launch-claude-tui.ps1', async () => {
      const scriptPath = homePath('.dev-pomogator', 'scripts', 'launch-claude-tui.ps1');
      expect(await fs.pathExists(scriptPath)).toBe(true);

      const content = await fs.readFile(scriptPath, 'utf-8');
      expect(content).toContain('-ProjectDir');
    });
  });
});
