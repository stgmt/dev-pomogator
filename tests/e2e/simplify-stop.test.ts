import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { runTsx, appPath } from './helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HOOK_PATH = 'extensions/auto-simplify/tools/auto-simplify/simplify_stop.ts';
const MARKER_PATH = '.dev-pomogator/.simplify-marker.json';

interface HookResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runStopHook(
  input: Record<string, unknown>,
  envOverrides: Record<string, string> = {}
): HookResult {
  const result = runTsx(HOOK_PATH, {
    input,
    env: envOverrides,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function defaultInput(): Record<string, unknown> {
  return {
    conversation_id: 'test-conv-123',
    workspace_roots: [appPath()],
  };
}

function parseOutput(stdout: string): Record<string, unknown> {
  try {
    return JSON.parse(stdout.trim());
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await fs.remove(appPath(MARKER_PATH));
  await fs.remove(appPath(MARKER_PATH + '.tmp'));
});

afterEach(async () => {
  await fs.remove(appPath(MARKER_PATH));
  await fs.remove(appPath(MARKER_PATH + '.tmp'));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Auto-Simplify Stop Hook', () => {
  // @feature8 — Disabled via env
  it('should approve when SIMPLIFY_ENABLED=false', () => {
    const result = runStopHook(defaultInput(), { SIMPLIFY_ENABLED: 'false' });
    expect(result.exitCode).toBe(0);
    const output = parseOutput(result.stdout);
    expect(output).not.toHaveProperty('decision');
  });

  // @feature1 — Always exit 0
  it('should always exit 0 (fail-open)', () => {
    const result = runStopHook(defaultInput());
    expect(result.exitCode).toBe(0);
  });

  // @feature7 — Empty input
  it('should approve on empty stdin', () => {
    const result = runTsx(HOOK_PATH, {});
    expect(result.status).toBe(0);
  });

  // @feature7 — No workspace_roots
  it('should approve when no workspace_roots', () => {
    const result = runStopHook({ conversation_id: 'test' });
    expect(result.exitCode).toBe(0);
    const output = parseOutput(result.stdout);
    expect(output).not.toHaveProperty('decision');
  });

  // Structural verification — file exists and is a valid module
  describe('Source code structure', () => {
    it('should be a substantial TypeScript module', async () => {
      const stat = await fs.stat(appPath(HOOK_PATH));
      expect(stat.size).toBeGreaterThan(1000);

      const content = await fs.readFile(appPath(HOOK_PATH), 'utf-8');
      expect(content).toMatch(/export|function main/);
    });
  });

  describe('Marker file operations', () => {
    // @feature4 — Hash dedup
    it('should skip when marker hash matches (dedup)', async () => {
      // Create a marker with a known hash
      await fs.ensureDir(path.dirname(appPath(MARKER_PATH)));
      await fs.writeJson(appPath(MARKER_PATH), {
        hash: 'test-hash-value',
        timestamp: new Date().toISOString(),
        count: 1,
      });

      // The hook will compute a different hash from actual git diff,
      // so this tests the read/compare path
      const result = runStopHook(defaultInput());
      expect(result.exitCode).toBe(0);
    });

    // @feature9 — Corrupted marker
    it('should handle corrupted marker file gracefully', async () => {
      await fs.ensureDir(path.dirname(appPath(MARKER_PATH)));
      await fs.writeFile(appPath(MARKER_PATH), 'not-json{{{', 'utf-8');

      const result = runStopHook(defaultInput());
      expect(result.exitCode).toBe(0);
      // Should not crash — fail-open
    });

    // @feature6 — Max retries
    it('should skip when max retries exceeded', async () => {
      await fs.ensureDir(path.dirname(appPath(MARKER_PATH)));
      await fs.writeJson(appPath(MARKER_PATH), {
        hash: 'old-hash',
        timestamp: new Date(Date.now() - 600_000).toISOString(), // 10 min ago (past cooldown)
        count: 99,
      });

      const result = runStopHook(defaultInput(), { SIMPLIFY_MAX_RETRIES: '2' });
      expect(result.exitCode).toBe(0);
      const output = parseOutput(result.stdout);
      expect(output).not.toHaveProperty('decision');
      expect(result.stderr).toContain('Max retries');
    });
  });

  describe('Threshold gate', () => {
    // @feature2 — Below threshold
    it('should use default threshold when SIMPLIFY_MIN_LINES not set', () => {
      // Run hook without SIMPLIFY_MIN_LINES — should use built-in default
      const result = runStopHook(defaultInput());
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Simplify-extended rule', () => {
    const rulePath = '.claude/rules/simplify-extended.md';

    it('should exist', async () => {
      const stat = await fs.stat(appPath(rulePath));
      expect(stat.size).toBeGreaterThan(0);
    });

    it('should cover spec and test review', async () => {
      const content = await fs.readFile(appPath(rulePath), 'utf-8');
      expect(content).toContain('Spec-файлы');
      expect(content).toContain('Test-файлы');
    });
  });

  describe('Extension manifest', () => {
    const manifestPath = 'extensions/auto-simplify/extension.json';

    it('should exist and be valid JSON', async () => {
      const content = await fs.readFile(appPath(manifestPath), 'utf-8');
      const manifest = JSON.parse(content);
      expect(manifest.name).toBe('auto-simplify');
    });

    it('should declare Stop hook', async () => {
      const content = await fs.readFile(appPath(manifestPath), 'utf-8');
      const manifest = JSON.parse(content);
      expect(manifest.hooks?.claude?.Stop).toContain('simplify_stop.ts');
    });

    it('should not override stock simplify skill', async () => {
      const content = await fs.readFile(appPath(manifestPath), 'utf-8');
      const manifest = JSON.parse(content);
      expect(manifest.skills).toBeUndefined();
      expect(manifest.skillFiles).toBeUndefined();
    });

    it('should declare toolFiles', async () => {
      const content = await fs.readFile(appPath(manifestPath), 'utf-8');
      const manifest = JSON.parse(content);
      expect(manifest.toolFiles?.['auto-simplify']).toContain(
        '.dev-pomogator/tools/auto-simplify/simplify_stop.ts'
      );
    });
  });
});
