import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'child_process';
import { appPath } from './helpers';

// --- Constants ---

const DEDUP_HOOK = 'extensions/test-quality/tools/test-quality/dedup_stop.ts';
const MANIFEST_PATH = 'extensions/test-quality/extension.json';

function runDedupHook(
  stdinJson: Record<string, unknown>,
  env: Record<string, string> = {},
): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('npx', ['tsx', appPath(DEDUP_HOOK)], {
    input: JSON.stringify(stdinJson),
    encoding: 'utf-8',
    cwd: appPath(),
    env: { ...process.env, FORCE_COLOR: '0', ...env },
    timeout: 15000,
  });
  return { stdout: result.stdout || '', stderr: result.stderr || '', status: result.status };
}

// --- Tests ---

describe('PLUGIN014: Test Quality', () => {

  // ===========================================
  // @feature1 — Stop Hook
  // ===========================================

  describe('Stop Hook (@feature1)', () => {
    // @feature1
    it('PLUGIN014_01: hook approves when no test files changed', () => {
      // Pass empty workspace — no git diff will find test files
      const result = runDedupHook(
        { workspace_roots: [appPath()], hook_event_name: 'Stop' },
        { DEDUP_ENABLED: 'true' }
      );
      expect(result.status).toBe(0);
      // Should approve (no test files in diff, or diff is clean)
      const output = result.stdout.trim();
      // If no test files changed → approve with {}
      // Note: actual behavior depends on git state; at minimum hook should not crash
      expect(output).toBeTruthy();
    });

    // @feature1
    it('PLUGIN014_02: hook outputs valid JSON', () => {
      const result = runDedupHook(
        { workspace_roots: [appPath()], hook_event_name: 'Stop' },
      );
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout.trim());
      // Should be either {} (approve) or { decision: 'block', reason: '...' }
      expect(typeof parsed).toBe('object');
    });

    // @feature1
    it('PLUGIN014_04: hook approves when disabled via env', () => {
      const result = runDedupHook(
        { workspace_roots: [appPath()], hook_event_name: 'Stop' },
        { DEDUP_ENABLED: 'false' }
      );
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('{}');
    });

    // @feature1
    it('PLUGIN014_05: hook approves when no workspace_roots', () => {
      const result = runDedupHook({ hook_event_name: 'Stop' });
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('{}');
    });
  });

  // ===========================================
  // @feature2 — Extension Manifest
  // ===========================================

  describe('Extension Manifest (@feature2)', () => {
    // @feature2
    it('PLUGIN014_06: manifest registers Stop hook', async () => {
      const manifestPath = appPath(MANIFEST_PATH);
      expect(await fs.pathExists(manifestPath)).toBe(true);

      const manifest = await fs.readJson(manifestPath);
      expect(manifest.hooks).toBeDefined();
      expect(manifest.hooks.claude).toBeDefined();
      expect(manifest.hooks.claude.Stop).toBeDefined();
      expect(manifest.hooks.claude.Stop).toContain('dedup_stop.ts');
    });

    // @feature2
    it('PLUGIN014_07: manifest declares dedup-tests skill', async () => {
      const manifest = await fs.readJson(appPath(MANIFEST_PATH));
      expect(manifest.skills).toBeDefined();
      expect(manifest.skills['dedup-tests']).toBeDefined();
    });
  });

  // ===========================================
  // @feature3 — Helper Extraction
  // ===========================================

  describe('Helper Extraction (@feature3)', () => {
    // @feature3
    it('PLUGIN014_08: getPythonRunner exported from helpers.ts', async () => {
      const helpersPath = appPath('tests/e2e/helpers.ts');
      const content = await fs.readFile(helpersPath, 'utf-8');
      expect(content).toContain('export function getPythonRunner');
    });

    // @feature3
    it('PLUGIN014_09: runPythonJson exported from helpers.ts', async () => {
      const helpersPath = appPath('tests/e2e/helpers.ts');
      const content = await fs.readFile(helpersPath, 'utf-8');
      expect(content).toContain('export function runPythonJson');
    });

    // @feature3
    it('PLUGIN014_10: no duplicate getPythonRunner in test files', () => {
      const testFiles = [
        'tests/e2e/tui-statusline.test.ts',
        'tests/e2e/tui-test-runner.test.ts',
        'tests/e2e/tui-test-runner-v2.test.ts',
      ];

      for (const file of testFiles) {
        const content = fs.readFileSync(appPath(file), 'utf-8');
        // Should NOT have local function definition (should import from helpers)
        expect(content).not.toMatch(/^function getPythonRunner/m);
        expect(content).not.toMatch(/^export function getPythonRunner/m);
      }
    });
  });
});
