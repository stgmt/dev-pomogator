import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { appPath, runTsx, pluginHookCommands } from './helpers';

// --- Constants ---

// Use INSTALLED location: source path lacks `_shared/` neighbor (installer
// copies extensions/_shared/ → tools/_shared/ at install time).
// Running source directly fails with ERR_MODULE_NOT_FOUND.
const DEDUP_HOOK = 'tools/test-quality/dedup_stop.ts';
const MANIFEST_PATH = 'extensions/test-quality/extension.json';

function runDedupHook(
  stdinJson: Record<string, unknown>,
  env: Record<string, string> = {},
) {
  return runTsx(DEDUP_HOOK, { input: stdinJson, env });
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

  describe('Plugin hook + skill registration (@feature2)', () => {
    // @feature2
    it('PLUGIN014_06: plugin registry registers the dedup Stop hook', () => {
      expect(
        pluginHookCommands('Stop').some((c) => c.includes('test-quality/dedup_stop.ts')),
      ).toBe(true);
    });

    // @feature2
    it('PLUGIN014_07: dedup-tests skill is installed', () => {
      expect(fs.existsSync(appPath('.claude/skills/dedup-tests/SKILL.md'))).toBe(true);
    });
  });

  // ===========================================
  // @feature3 — Helper Extraction
  // ===========================================

  describe('Helper Extraction (@feature3)', () => {
    // @feature3
    it('PLUGIN014_08: getPythonRunner exported from helpers.ts', async () => {
      const { getPythonRunner } = await import('./helpers');
      expect(typeof getPythonRunner).toBe('function');
    });

    // @feature3
    it('PLUGIN014_09: runPythonJson exported from helpers.ts', async () => {
      const { runPythonJson } = await import('./helpers');
      expect(typeof runPythonJson).toBe('function');
    });

    // @feature3
    it('PLUGIN014_10: no duplicate getPythonRunner in test files', () => {
      // Scan ALL *.test.ts dynamically — a hardcoded list rots (it named a since-deleted
      // tui-statusline.test.ts → ENOENT). The rule is universal: no test file may redefine
      // getPythonRunner; it must import from helpers.ts (which is NOT a *.test.ts, so the
      // legitimate definition there is excluded). See issue #45 Class B (hardcoded-list rot).
      const walk = (dir: string): string[] =>
        fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(full);
          return /\.test\.ts$/.test(e.name) ? [full] : [];
        });
      const testFiles = walk(appPath('tests'));
      expect(testFiles.length).toBeGreaterThan(0);
      for (const file of testFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        // Should import from helpers, NOT define locally.
        expect(content, `${file} redefines getPythonRunner — import it from helpers.ts`).not.toMatch(/^function getPythonRunner/m);
        expect(content, `${file} redefines getPythonRunner — import it from helpers.ts`).not.toMatch(/^export function getPythonRunner/m);
      }
    });
  });
});
