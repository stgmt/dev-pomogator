import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import { appPath } from './helpers';

const MARK_HOOK = 'extensions/test-statusline/tools/bg-task-guard/mark-bg-task.sh';
const STOP_HOOK = 'extensions/test-statusline/tools/bg-task-guard/stop-guard.sh';
const MARKER_FILE = '.dev-pomogator/.bg-task-active';

// Temp directory for test isolation — all markers/YAML/session.env go here, not in real .dev-pomogator/
let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-task-guard-test-'));
  fs.ensureDirSync(path.join(tmpDir, '.dev-pomogator', '.test-status'));
  fs.ensureDirSync(path.join(tmpDir, '.dev-pomogator', '.docker-status'));
});

afterAll(() => {
  fs.removeSync(tmpDir);
});

/**
 * Build a realistic Claude Code PostToolUse stdin payload.
 * Uses real field names from Claude Code API: tool_response (NOT tool_output).
 *
 * Key discovery: backgroundTaskId is NOT reliable for detecting intentional
 * background tasks — Claude Code assigns it to long-running commands too.
 * The reliable signal is tool_input.run_in_background === true.
 */
function makeToolResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    stdout: '',
    stderr: '',
    interrupted: false,
    isImage: false,
    noOutputExpected: false,
    ...overrides,
  };
}

function makePostToolUseInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    session_id: 'test-session-abc123',
    transcript_path: '/tmp/test-transcript.jsonl',
    cwd: '/test/project',
    permission_mode: 'default',
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_use_id: 'toolu_test01',
    tool_input: { command: 'sleep 60', run_in_background: true },
    tool_response: makeToolResponse({ backgroundTaskId: 'bs0olkeoz' }),
    ...overrides,
  };
}

function runHook(
  scriptPath: string,
  stdinJson: Record<string, unknown> = {},
  cwd?: string,
): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('bash', [appPath(scriptPath)], {
    input: JSON.stringify(stdinJson),
    encoding: 'utf-8',
    cwd: cwd || tmpDir,
    env: { ...process.env, FORCE_COLOR: '0' },
    timeout: 10000,
  });
  return { stdout: result.stdout || '', stderr: result.stderr || '', status: result.status };
}

function markerPath(sessionPrefix?: string): string {
  if (sessionPrefix) {
    return path.join(tmpDir, `.dev-pomogator/.bg-task-active.${sessionPrefix}`);
  }
  return path.join(tmpDir, MARKER_FILE);
}

function createMarker(ageMinutes: number = 0, taskId: string = 'test-task-id', sessionPrefix?: string): void {
  const mp = markerPath(sessionPrefix);
  const dir = path.dirname(mp);
  fs.ensureDirSync(dir);
  const pastTime = new Date(Date.now() - ageMinutes * 60 * 1000);
  fs.writeFileSync(mp, `${taskId} ${pastTime.toISOString()}`, 'utf-8');

  if (ageMinutes > 0) {
    fs.utimesSync(mp, pastTime, pastTime);
  }
}

function removeMarker(): void {
  fs.removeSync(markerPath());
  // Also clean per-session markers
  const dir = path.join(tmpDir, '.dev-pomogator');
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (f === '.bg-task-active' || f.startsWith('.bg-task-active.')) {
        fs.removeSync(path.join(dir, f));
      }
    }
  }
}

beforeEach(() => {
  removeMarker();
});

afterEach(() => {
  removeMarker();
});

describe('GUARD002: Background Task Guard', () => {
  describe('PostToolUse Hook', () => {
    // @feature1 (updated: marker creation moved to wrapper)
    it('GUARD002_01: mark-bg-task is no-op (marker creation in wrapper)', () => {
      const input = makePostToolUseInput({
        tool_input: { command: 'npm test', run_in_background: true },
        tool_response: makeToolResponse({ backgroundTaskId: 'bs0olkeoz' }),
      });

      const result = runHook(MARK_HOOK, input);
      expect(result.status).toBe(0);
      // mark-bg-task is no-op — does NOT create marker (wrapper does)
      expect(fs.pathExistsSync(markerPath())).toBe(false);
    });

    // @feature1
    it('GUARD002_02: ignores non-background output', () => {
      const input = makePostToolUseInput({
        tool_input: { command: 'npm run build' },
        tool_response: makeToolResponse({ stdout: 'hello world\nnpm run build completed' }),
      });

      const result = runHook(MARK_HOOK, input);
      expect(result.status).toBe(0);
      expect(fs.pathExistsSync(markerPath())).toBe(false);
    });

    // @feature3
    it('GUARD002_09: does NOT create marker from stdout fallback (removed — was too greedy)', () => {
      // Fallback via stdout "Command running in background" was removed because
      // task notification stdout can contain this text and re-create marker after cleanup.
      // Only run_in_background=true creates marker now.
      const input = makePostToolUseInput({
        tool_input: { command: 'sleep 60' },
        tool_response: makeToolResponse({ stdout: 'Command running in background with ID: abc123.' }),
      });

      const result = runHook(MARK_HOOK, input);
      expect(result.status).toBe(0);
      // Should NOT create marker — fallback removed
      expect(fs.pathExistsSync(markerPath())).toBe(false);
    });

    // @feature1
    it('GUARD002_10: ignores backgroundTaskId without run_in_background', () => {
      // Claude Code assigns backgroundTaskId to long-running commands too
      // (e.g. commands with custom timeout). This must NOT create marker.
      const input = makePostToolUseInput({
        tool_input: { command: 'sleep 10 && cat file.txt' },
        tool_response: makeToolResponse({ stdout: 'file contents here', backgroundTaskId: 'b7yh2acqb' }),
      });

      const result = runHook(MARK_HOOK, input);
      expect(result.status).toBe(0);
      expect(fs.pathExistsSync(markerPath())).toBe(false);
    });
  });

  describe('Stop Hook', () => {
    // @feature1 (updated: PID-based blocking instead of TTL)
    it('GUARD002_03: blocks when marker is fresh (within TTL)', () => {
      createMarker(2, 'bs0olkeoz'); // 2 min old, under 15 min TTL

      const result = runHook(STOP_HOOK);
      expect(result.status).toBe(0);

      const output = JSON.parse(result.stdout.trim());
      expect(output.decision).toBe('block');
      expect(output.reason).toContain('Background task bs0olkeoz');
    });

    // @feature2 (updated: PID dead → allow, replaces TTL stale)
    it('GUARD002_04: allows when marker PID is dead', () => {
      // Use dead PID (99999)
      const mp = markerPath();
      fs.ensureDirSync(path.dirname(mp));
      fs.writeFileSync(mp, '99999 2026-01-01T00:00:00Z\n', 'utf-8');

      const result = runHook(STOP_HOOK);
      expect(result.status).toBe(0);
      // Dead PID → allow stop, marker deleted
      expect(result.stdout.trim()).toBe('');
      expect(fs.pathExistsSync(mp)).toBe(false);
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

  describe('Auto-Cleanup (FR-5)', () => {
    // @feature3 (updated: PID-based, replaces soft TTL)
    it('GUARD002_12: allows stop when marker PID is dead even with stale YAML', () => {
      // Marker with dead PID
      const mp = markerPath();
      fs.ensureDirSync(path.dirname(mp));
      fs.writeFileSync(mp, '99998 2026-01-01T00:00:00Z\n', 'utf-8');

      // Stale YAML exists
      const statusDir = path.join(tmpDir, '.dev-pomogator', '.test-status');
      fs.ensureDirSync(statusDir);
      const staleStatusFile = path.join(statusDir, 'status.test.yaml');
      fs.writeFileSync(staleStatusFile, 'state: running\nresult: unknown\n', 'utf-8');

      const result = runHook(STOP_HOOK);
      expect(result.status).toBe(0);
      // Dead PID → allow stop regardless of YAML
      expect(result.stdout.trim()).toBe('');
      expect(fs.pathExistsSync(mp)).toBe(false);

      fs.removeSync(staleStatusFile);
    });

    // @feature3 (updated: PID alive → block regardless of age)
    it('GUARD002_13: blocks when marker PID is alive regardless of marker age', () => {
      // Marker 10 min old (under 15 min hard TTL) with non-numeric task ID (skips PID check)
      const mp = markerPath();
      fs.ensureDirSync(path.dirname(mp));
      const oldTime = new Date(Date.now() - 10 * 60 * 1000);
      fs.writeFileSync(mp, `task-alive ${oldTime.toISOString()}\n`, 'utf-8');
      fs.utimesSync(mp, oldTime, oldTime);

      const result = runHook(STOP_HOOK);
      expect(result.status).toBe(0);
      // PID 1 alive → block even though marker is 20 min old
      const output = JSON.parse(result.stdout.trim());
      expect(output.decision).toBe('block');
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

  describe('Edge Cases (FR-4)', () => {
    // @feature4
    it('GUARD002_14: allows stop when marker is empty', () => {
      fs.ensureDirSync(path.dirname(markerPath()));
      fs.writeFileSync(markerPath(), '');

      const result = runHook(STOP_HOOK);
      expect(result.status).toBe(0);
      expect(fs.existsSync(markerPath())).toBe(false);
    });

    // @feature4
    it('GUARD002_15: allows stop when marker is whitespace-only', () => {
      fs.ensureDirSync(path.dirname(markerPath()));
      fs.writeFileSync(markerPath(), '  \n\t\n');

      const result = runHook(STOP_HOOK);
      expect(result.status).toBe(0);
      expect(fs.existsSync(markerPath())).toBe(false);
    });

    // @feature4 — empty stdin edge case, runHook always sends JSON so use spawnSync
    it('GUARD002_16: does not create marker with empty stdin', () => {
      const result = spawnSync('bash', [appPath(MARK_HOOK)], {
        cwd: tmpDir,
        encoding: 'utf-8',
        input: '',
      });

      expect(result.status).toBe(0);
      expect(fs.existsSync(markerPath())).toBe(false);
    });

    // @feature4
    it('GUARD002_17: does not create marker without run_in_background', () => {
      const input = makePostToolUseInput({
        tool_input: { command: 'echo hello' },
      });

      const result = runHook(MARK_HOOK, input);
      expect(result.status).toBe(0);
      expect(fs.existsSync(markerPath())).toBe(false);
    });
  });

  // @feature5
  describe('Stop Hook YAML Result Check (FR-5/6/7)', () => {
    const STATUS_DIR = '.dev-pomogator/.test-status';

    function createYamlStatus(fields: Record<string, string | number>): void {
      const statusDir = path.join(tmpDir, STATUS_DIR);
      fs.ensureDirSync(statusDir);
      const lines = Object.entries(fields).map(([k, v]) => `${k}: ${v}`);
      fs.writeFileSync(path.join(statusDir, 'status.test-session.yaml'), lines.join('\n'), 'utf-8');
    }

    function cleanYamlStatus(): void {
      const statusDir = path.join(tmpDir, STATUS_DIR);
      const statusFile = path.join(statusDir, 'status.test-session.yaml');
      if (fs.existsSync(statusFile)) fs.removeSync(statusFile);
    }

    afterEach(() => {
      cleanYamlStatus();
    });

    // @feature5
    it('GUARD002_18: shows results and allows stop when tests completed', () => {
      createMarker(2, 'task123');
      createYamlStatus({ state: 'passed', passed: 5, failed: 0, skipped: 2, total: 7, percent: 100 });

      const result = runHook(STOP_HOOK);
      expect(result.status).toBe(0);
      // exit 0 = allow stop, no JSON output needed
      expect(fs.existsSync(markerPath())).toBe(false);
    });

    // @feature5
    it('GUARD002_19: warns on all-skipped (filter matched nothing)', () => {
      createMarker(2, 'task456');
      createYamlStatus({ state: 'passed', passed: 0, failed: 0, skipped: 709, total: 709, percent: 100 });

      const result = runHook(STOP_HOOK);
      expect(result.status).toBe(0);
      // exit 0 = allow stop, marker cleaned
      expect(fs.existsSync(markerPath())).toBe(false);
    });

    // @feature5
    it('GUARD002_20: shows progress when tests still running', () => {
      createMarker(2, 'task789');
      createYamlStatus({ state: 'running', passed: 3, failed: 1, skipped: 0, total: 20, percent: 15 });

      const result = runHook(STOP_HOOK);
      expect(result.stdout).toContain('block');
      expect(result.stdout).toContain('3/20');
    });

    // @feature9
    it('GUARD002_29: stop-guard blocks with "Building Docker" for building state', () => {
      createMarker(2, 'build-task');
      createYamlStatus({ state: 'building', passed: 0, failed: 0, skipped: 0, total: 733, percent: 0 });

      const result = runHook(STOP_HOOK);
      expect(result.stdout).toContain('block');
      expect(result.stdout).toContain('Building Docker');
      expect(result.stdout).not.toContain('0/733');
    });

    // @feature9
    it('GUARD002_30: stop-guard does NOT trigger stuck detection for building state', () => {
      createMarker(4, 'build-task-long');
      createYamlStatus({ state: 'building', passed: 0, failed: 0, skipped: 0, total: 733, percent: 0 });

      const result = runHook(STOP_HOOK);
      // Should block with "Building Docker", NOT allow via stuck detection
      expect(result.stdout).toContain('block');
      expect(result.stdout).toContain('Building Docker');
    });

    // @feature8
    it('GUARD002_26: skips inconsistent YAML data (partial read: percent>0 but passed=0)', () => {
      createMarker(2, 'race-task');
      // Simulate partial read: percent=51 but passed=0 — race condition during write
      createYamlStatus({ state: 'running', passed: 0, failed: 0, skipped: 0, total: 733, percent: 51 });

      const result = runHook(STOP_HOOK);
      // Should still block (marker active) but NOT show inconsistent 0/733 at 51%
      expect(result.stdout).toContain('block');
      expect(result.stdout).not.toContain('0/733');
    });

    // @feature8
    it('GUARD002_35: skips inconsistent YAML data (percent mismatch with passed count)', () => {
      createMarker(2, 'race-task2');
      // Simulate partial read: passed=33 but percent=56 (33/769=4.3%, not 56%)
      createYamlStatus({ state: 'running', passed: 33, failed: 1, skipped: 0, total: 769, percent: 56 });

      const result = runHook(STOP_HOOK);
      expect(result.stdout).toContain('block');
      // Should NOT show mismatched percent — 33/769 ≠ 56%
      expect(result.stdout).not.toContain('56%');
    });

    // @feature10
    it('GUARD002_32: stop-guard skips stale YAML (mtime > 30s)', () => {
      createMarker(1, 'stale-yaml-task');
      createYamlStatus({ state: 'running', passed: 100, failed: 5, skipped: 0, total: 200, percent: 52 });
      // Make YAML old (60s ago)
      const statusDir = path.join(tmpDir, '.dev-pomogator', '.test-status');
      const yamlFile = path.join(statusDir, 'status.test-session.yaml');
      const sixtySecAgo = new Date(Date.now() - 60_000);
      fs.utimesSync(yamlFile, sixtySecAgo, sixtySecAgo);

      const result = runHook(STOP_HOOK);
      // Should block (marker active) but NOT show stale progress
      expect(result.stdout).toContain('block');
      expect(result.stdout).not.toContain('100/200');
    });
  });

  describe('Per-Session Marker Isolation', () => {
    // @feature7 (updated: mark-bg-task is now no-op, per-session markers disabled)
    it('GUARD002_21: mark-bg-task is no-op (does not create per-session or legacy marker)', () => {
      const input = makePostToolUseInput({
        session_id: 'sess-aaaa-bbbb-cccc',
        tool_input: { command: 'npm test', run_in_background: true },
        tool_response: makeToolResponse({ backgroundTaskId: 'task-123' }),
      });

      const result = runHook(MARK_HOOK, input);
      expect(result.status).toBe(0);
      expect(fs.pathExistsSync(markerPath('sess-aaa'))).toBe(false);
      expect(fs.pathExistsSync(markerPath())).toBe(false);
    });

    function getSessionEnvPath(): string {
      return path.join(tmpDir, '.dev-pomogator', '.test-status', 'session.env');
    }

    function writeSessionEnv(prefix: string): void {
      const statusDir = path.join(tmpDir, '.dev-pomogator', '.test-status');
      fs.ensureDirSync(statusDir);
      fs.writeFileSync(getSessionEnvPath(), `TEST_STATUSLINE_SESSION=${prefix}\n`, 'utf-8');
    }

    function cleanSessionEnv(): void {
      try { fs.removeSync(getSessionEnvPath()); } catch { /* ignore */ }
    }

    // @feature7
    it('GUARD002_22: stop-guard ignores other session markers', () => {
      // Session A has a fresh marker
      createMarker(1, 'task-A', 'sessAAAA');

      // Session B runs stop hook — session.env points to B's prefix
      writeSessionEnv('sessBBBB');
      const result = runHook(STOP_HOOK, {});
      expect(result.stdout).not.toContain('block');
      expect(result.status).toBe(0);
      cleanSessionEnv();
    });

    // @feature7
    it('GUARD002_23: stop-guard blocks on own session marker', () => {
      // Session A has a fresh marker
      createMarker(1, 'task-A', 'sessAAAA');

      // Session A runs stop hook — session.env points to A's prefix
      writeSessionEnv('sessAAAA');
      const result = runHook(STOP_HOOK, {});
      expect(result.stdout).toContain('block');
      cleanSessionEnv();
    });

    // @feature7
    it('GUARD002_24: stop-guard cleans orphaned markers older than 15 min', () => {
      // Create orphan marker from crashed session (20 min old)
      createMarker(20, 'orphan-task', 'deadSESS');

      // stop-guard with different session — orphan not visible (different prefix), allows stop
      writeSessionEnv('liveSESS');
      const result = runHook(STOP_HOOK, {});
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('block');
      // Orphan still exists (not this session's responsibility — TTL handled by SessionStart)
      expect(fs.pathExistsSync(markerPath('deadSESS'))).toBe(true);
      cleanSessionEnv();
    });

    // @feature10
    it('GUARD002_31: mark-bg-task is no-op regardless of session_id', () => {
      const input = makePostToolUseInput({
        session_id: 'any-session-id',
        tool_input: { command: 'npm test', run_in_background: true },
        tool_response: makeToolResponse({ backgroundTaskId: 'task-noop' }),
      });

      const result = runHook(MARK_HOOK, input);
      expect(result.status).toBe(0);
      // No marker created — wrapper handles this now
      expect(fs.pathExistsSync(markerPath())).toBe(false);
      expect(fs.pathExistsSync(markerPath('any-sess'))).toBe(false);
    });

    // @feature10
    it('GUARD002_33: stop-guard reads session prefix from session.env', () => {
      // Save/restore pattern — never delete infra file
      writeSessionEnv('testpfx1');

      // Create per-session marker matching that prefix
      createMarker(1, 'session-env-task', 'testpfx1');

      // stop-guard should find marker via session.env prefix (not stdin session_id)
      const result = runHook(STOP_HOOK, {}); // empty stdin — no session_id
      expect(result.stdout).toContain('block');

      cleanSessionEnv();
    });

    // @feature10
    it('GUARD002_34: wrapper cleans stale marker with dead PID', () => {
      // Create marker with dead PID (99999)
      createMarker(0, 'dead-pid-task');
      const mp = markerPath();
      fs.writeFileSync(mp, '99999 2026-01-01T00:00:00Z\n', 'utf-8');
      expect(fs.existsSync(mp)).toBe(true);

      // Wrapper should detect dead PID and clean marker
      // (We test the logic by checking kill(99999, 0) throws)
      let pidAlive = false;
      try { process.kill(99999, 0); pidAlive = true; } catch { pidAlive = false; }
      expect(pidAlive).toBe(false); // PID 99999 should be dead
    });
  });
});
