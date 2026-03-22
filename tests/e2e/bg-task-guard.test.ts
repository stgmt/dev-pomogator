import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'child_process';
import { appPath } from './helpers';

const MARK_HOOK = 'extensions/test-statusline/tools/bg-task-guard/mark-bg-task.sh';
const STOP_HOOK = 'extensions/test-statusline/tools/bg-task-guard/stop-guard.sh';
const MARKER_FILE = '.dev-pomogator/.bg-task-active';

function runHook(
  scriptPath: string,
  stdinJson: Record<string, unknown> = {},
  cwd?: string,
): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('bash', [appPath(scriptPath)], {
    input: JSON.stringify(stdinJson),
    encoding: 'utf-8',
    cwd: cwd || appPath(),
    env: { ...process.env, FORCE_COLOR: '0' },
    timeout: 10000,
  });
  return { stdout: result.stdout || '', stderr: result.stderr || '', status: result.status };
}

function markerPath(): string {
  return path.join(appPath(), MARKER_FILE);
}

function createMarker(ageMinutes: number = 0): void {
  const dir = path.dirname(markerPath());
  fs.ensureDirSync(dir);
  const pastTime = new Date(Date.now() - ageMinutes * 60 * 1000);
  fs.writeFileSync(markerPath(), pastTime.toISOString(), 'utf-8');

  if (ageMinutes > 0) {
    fs.utimesSync(markerPath(), pastTime, pastTime);
  }
}

function removeMarker(): void {
  fs.removeSync(markerPath());
}

beforeEach(() => {
  removeMarker();
});

afterEach(() => {
  removeMarker();
});

describe('GUARD002: Background Task Guard', () => {
  describe('PostToolUse Hook', () => {
    // @feature1
    it('GUARD002_01: creates marker when bg task detected in stdout', () => {
      const input = {
        tool_output: {
          stdout: 'Command running in background with ID: abc123. Output is being written to: /tmp/out',
        },
      };

      const result = runHook(MARK_HOOK, input);
      expect(result.status).toBe(0);
      expect(fs.pathExistsSync(markerPath())).toBe(true);

      const content = fs.readFileSync(markerPath(), 'utf-8').trim();
      // ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
      expect(content).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    });

    // @feature1
    it('GUARD002_02: ignores non-background output', () => {
      const input = {
        tool_output: {
          stdout: 'hello world\nnpm run build completed',
        },
      };

      const result = runHook(MARK_HOOK, input);
      expect(result.status).toBe(0);
      expect(fs.pathExistsSync(markerPath())).toBe(false);
    });
  });

  describe('Stop Hook', () => {
    // @feature1
    it('GUARD002_03: blocks when marker is fresh (< 15 min)', () => {
      createMarker(2); // 2 minutes ago

      const result = runHook(STOP_HOOK);
      expect(result.status).toBe(0);

      const output = JSON.parse(result.stdout.trim());
      expect(output.decision).toBe('block');
      expect(output.reason).toContain('Background task');
    });

    // @feature2
    it('GUARD002_04: allows when marker is stale (>= 15 min)', () => {
      createMarker(20); // 20 minutes ago

      const result = runHook(STOP_HOOK);
      expect(result.status).toBe(0);
      // Should not output block decision
      expect(result.stdout.trim()).toBe('');
      // Stale marker should be deleted
      expect(fs.pathExistsSync(markerPath())).toBe(false);
    });

    // @feature1
    it('GUARD002_05: allows when no marker exists', () => {
      const result = runHook(STOP_HOOK);
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('');
    });

    // @feature1
    it('GUARD002_06: fail-open on invalid marker content', () => {
      fs.ensureDirSync(path.dirname(markerPath()));
      fs.writeFileSync(markerPath(), 'not-a-timestamp\x00\xff', 'utf-8');

      const result = runHook(STOP_HOOK);
      // Should not crash — fail-open
      expect(result.status).toBe(0);
    });
  });

  describe('Extension Manifest', () => {
    // @feature1
    it('GUARD002_07: manifest declares PostToolUse and Stop hooks', async () => {
      const manifest = await fs.readJson(
        appPath('extensions/test-statusline/extension.json'),
      );

      expect(manifest.hooks.claude.PostToolUse).toBeDefined();
      expect(manifest.hooks.claude.Stop).toBeDefined();

      // PostToolUse should be array with Bash matcher
      const postToolUse = manifest.hooks.claude.PostToolUse;
      expect(Array.isArray(postToolUse)).toBe(true);
      expect(postToolUse[0].matcher).toBe('Bash');
      expect(postToolUse[0].hooks[0].command).toContain('mark-bg-task.sh');

      // Stop should be array
      const stop = manifest.hooks.claude.Stop;
      expect(Array.isArray(stop)).toBe(true);
      expect(stop[0].hooks[0].command).toContain('stop-guard.sh');
    });

    // @feature1
    it('GUARD002_08: toolFiles includes bg-task-guard scripts', async () => {
      const manifest = await fs.readJson(
        appPath('extensions/test-statusline/extension.json'),
      );

      const toolFiles = manifest.toolFiles['bg-task-guard'];
      expect(toolFiles).toBeDefined();
      expect(toolFiles.join(',')).toContain('mark-bg-task.sh');
      expect(toolFiles.join(',')).toContain('stop-guard.sh');
    });
  });
});
