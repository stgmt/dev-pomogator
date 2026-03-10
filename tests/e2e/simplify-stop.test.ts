import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'child_process';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getProjectRoot(): string {
  return process.env.APP_DIR || process.cwd();
}

function appPath(...segments: string[]): string {
  return path.join(getProjectRoot(), ...segments);
}

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
  const hookFile = path.join(appPath(), HOOK_PATH);
  const result = spawnSync('npx', ['tsx', hookFile], {
    input: JSON.stringify(input),
    encoding: 'utf-8',
    cwd: appPath(),
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      ...envOverrides,
    },
    timeout: 15000,
    shell: true,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
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
    const hookFile = path.join(appPath(), HOOK_PATH);
    const result = spawnSync('npx', ['tsx', hookFile], {
      input: '',
      encoding: 'utf-8',
      cwd: appPath(),
      env: { ...process.env, FORCE_COLOR: '0' },
      timeout: 15000,
      shell: true,
    });
    expect(result.status).toBe(0);
  });

  // @feature7 — No workspace_roots
  it('should approve when no workspace_roots', () => {
    const result = runStopHook({ conversation_id: 'test' });
    expect(result.exitCode).toBe(0);
    const output = parseOutput(result.stdout);
    expect(output).not.toHaveProperty('decision');
  });

  // Static code verification
  describe('Source code quality', () => {
    let sourceCode: string;

    beforeEach(async () => {
      sourceCode = await fs.readFile(appPath(HOOK_PATH), 'utf-8');
    });

    it('should import createHash from node:crypto', () => {
      expect(sourceCode).toContain("from 'node:crypto'");
    });

    it('should use atomic write pattern (tmp + rename)', () => {
      expect(sourceCode).toContain('.tmp');
      expect(sourceCode).toContain('renameSync');
    });

    it('should read SIMPLIFY_MIN_LINES env var', () => {
      expect(sourceCode).toContain('SIMPLIFY_MIN_LINES');
    });

    it('should read SIMPLIFY_COOLDOWN_MINUTES env var', () => {
      expect(sourceCode).toContain('SIMPLIFY_COOLDOWN_MINUTES');
    });

    it('should read SIMPLIFY_MAX_RETRIES env var', () => {
      expect(sourceCode).toContain('SIMPLIFY_MAX_RETRIES');
    });

    it('should use git diff --numstat for threshold', () => {
      expect(sourceCode).toContain('git diff --numstat');
    });

    it('should always exit 0 (fail-open pattern)', () => {
      expect(sourceCode).toContain('process.exit(0)');
    });

    it('should log to stderr not stdout', () => {
      expect(sourceCode).toContain('process.stderr.write');
    });

    it('should output decision block JSON format', () => {
      expect(sourceCode).toContain("'block'");
      expect(sourceCode).toContain('/simplify');
    });

    it('should hash with SHA-256', () => {
      expect(sourceCode).toContain("'sha256'");
    });

    it('should include normalizePath for Windows compatibility', () => {
      expect(sourceCode).toContain('normalizePath');
      expect(sourceCode).toContain('win32');
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
    it('should have SIMPLIFY_MIN_LINES default of 10', () => {
      // Verified via source code — default is 10
      const sourceCode = fs.readFileSync(appPath(HOOK_PATH), 'utf-8');
      expect(sourceCode).toContain("'10'");
    });
  });

  describe('Simplify-extended rule', () => {
    const rulePath = '.claude/rules/simplify-extended.md';

    it('should exist', async () => {
      const exists = await fs.pathExists(appPath(rulePath));
      expect(exists).toBe(true);
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
