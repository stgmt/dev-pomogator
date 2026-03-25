import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'child_process';
import { appPath, homePath, runInstaller, setupCleanState, getPythonRunner, runTsx } from './helpers';
import {
  DEFAULT_USER_STATUSLINE_COMMAND,
  extractUserCommandFromLegacyWrapper,
  isWrappedStatusLineCommand,
  isManagedStatusLineCommand,
  resolveClaudeStatusLine,
} from '../../src/utils/statusline.js';
import { VitestAdapter } from '../../extensions/tui-test-runner/tools/tui-test-runner/adapters/vitest_adapter.js';

// --- Helpers ---

const STATUS_DIR = '.dev-pomogator/.test-status';
const FIXTURES_DIR = 'tests/fixtures/tui-statusline';
const WRAPPER_SCRIPT = 'extensions/test-statusline/tools/test-statusline/test_runner_wrapper.cjs';
const SESSION_HOOK = 'extensions/test-statusline/tools/test-statusline/statusline_session_start.ts';
const DEFAULT_STATUSLINE_CONFIG = {
  type: 'command',
  command: DEFAULT_USER_STATUSLINE_COMMAND,
};

function statusFilePath(prefix: string): string {
  return path.join(appPath(), STATUS_DIR, `status.${prefix}.yaml`);
}

function projectClaudeSettingsPath(): string {
  return appPath('.claude', 'settings.json');
}

function globalClaudeSettingsPath(): string {
  return homePath('.claude', 'settings.json');
}

/** Build a legacy wrapped statusLine command for migration tests. */
function buildLegacyWrappedFixture(userCmd: string, managedCmd: string): string {
  const encodedUser = Buffer.from(userCmd, 'utf-8').toString('base64');
  const encodedManaged = Buffer.from(managedCmd, 'utf-8').toString('base64');
  return `node -e "require(require('path').join(require('os').homedir(),'.dev-pomogator','scripts','statusline_wrapper.js'))" -- --user-b64 "${encodedUser}" --managed-b64 "${encodedManaged}"`;
}

function runWrapper(args: string[], env: Record<string, string> = {}): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('node', [appPath(WRAPPER_SCRIPT), ...args], {
    encoding: 'utf-8',
    cwd: appPath(),
    env: { ...process.env, FORCE_COLOR: '0', ...env },
    timeout: 30000,
  });
  return { stdout: result.stdout || '', stderr: result.stderr || '', status: result.status };
}

function canonicalWrapperEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    TEST_STATUSLINE_SESSION: 'abc12345',
    TEST_STATUSLINE_PROJECT: appPath(),
    ...overrides,
  };
}

function runSessionHook(stdinJson: Record<string, unknown>, env: Record<string, string> = {}) {
  return runTsx(SESSION_HOOK, { input: stdinJson, env });
}

function readFixture(name: string): string {
  return fs.readFileSync(appPath(FIXTURES_DIR, name), 'utf-8');
}

function readTuiFixture(name: string): string {
  return fs.readFileSync(appPath('tests/fixtures/tui-test-runner', name), 'utf-8');
}

function readFixtureJson(name: string): Record<string, unknown> {
  return fs.readJsonSync(appPath(FIXTURES_DIR, name));
}

function getYamlField(yamlContent: string, field: string): string {
  const match = yamlContent.match(new RegExp(`^${field}:\\s*(.*)$`, 'm'));
  return match ? match[1].replace(/['"]/g, '').replace(/\r/g, '').trim() : '';
}

function withPid(yamlContent: string, pid: number): string {
  return yamlContent.replace('__PID__', String(pid));
}

function createDeadPid(): number {
  const result = spawnSync(process.execPath, ['-e', 'process.exit(0)'], {
    encoding: 'utf-8',
    cwd: appPath(),
    env: { ...process.env, FORCE_COLOR: '0' },
    timeout: 10000,
  });
  if (!result.pid || result.status !== 0) {
    throw new Error(`Failed to create dead PID fixture (status=${result.status}, pid=${result.pid})`);
  }
  return result.pid;
}

// --- Setup / Cleanup ---

let testStatusDir: string;

beforeEach(async () => {
  testStatusDir = appPath(STATUS_DIR);
  await fs.ensureDir(testStatusDir);
});

afterEach(async () => {
  if (await fs.pathExists(testStatusDir)) {
    await fs.remove(testStatusDir);
  }
});

// --- Tests ---

describe('PLUGIN011: TUI Statusline', () => {

  // ===========================================
  // @feature1 — Statusline Render
  // ===========================================

  // Legacy Statusline Render (@feature1) — REMOVED in v2.0.0
  // Tests PLUGIN011_01..03, 26, 29, 35 removed — render replaced by TUI CompactBar (PLUGIN011_60..62)
  // PID repair tested via SessionStart hook (PLUGIN011_28)

  // Legacy Graceful Degradation (@feature1a) — REMOVED in v2.0.0
  // Tests PLUGIN011_04..06 removed — covered by TUI CompactBar (PLUGIN011_61, 62)

  // ===========================================
  // @feature2 — YAML Protocol & Wrapper
  // ===========================================

  describe('YAML Protocol & Wrapper (@feature2)', () => {
    // @feature2
    it('PLUGIN011_07: YAML status file contains all required fields', async () => {
      const env = canonicalWrapperEnv();
      const result = runWrapper(['echo', 'test passed'], env);

      const statusFile = statusFilePath('abc12345');
      expect(await fs.pathExists(statusFile)).toBe(true);
      const content = await fs.readFile(statusFile, 'utf-8');

      expect(getYamlField(content, 'version')).toBe('2');
      expect(getYamlField(content, 'session_id')).toBeTruthy();
      expect(getYamlField(content, 'pid')).toBeTruthy();
      expect(getYamlField(content, 'started_at')).toBeTruthy();
      expect(getYamlField(content, 'updated_at')).toBeTruthy();
      expect(getYamlField(content, 'state')).toBeTruthy();
      expect(getYamlField(content, 'total')).toBeTruthy();
      expect(getYamlField(content, 'passed')).toBeTruthy();
      expect(getYamlField(content, 'failed')).toBeTruthy();
      expect(content).toContain('skipped:');
      expect(content).toContain('running:');
      expect(content).toContain('percent:');
      expect(content).toContain('duration_ms:');
      expect(getYamlField(content, 'log_file')).toContain('test.abc12345.log');
    });

    // @feature2
    it('PLUGIN011_08: wrapper writes atomic YAML via temp file rename', async () => {
      const env = canonicalWrapperEnv();
      const result = runWrapper(['echo', 'test passed'], env);

      // Verify no .tmp files left behind (atomic write completed)
      const files = await fs.readdir(appPath(STATUS_DIR));
      const tmpFiles = files.filter(f => f.endsWith('.tmp'));
      expect(tmpFiles).toHaveLength(0);
    });

    // @feature2
    it('PLUGIN011_09: wrapper creates initial state on test start', async () => {
      const env = canonicalWrapperEnv();
      // Use a command that takes time so we can check initial state
      const result = runWrapper(['sleep', '0.1'], env);

      const statusFile = statusFilePath('abc12345');
      expect(await fs.pathExists(statusFile)).toBe(true);
      // Final state after completion — verify it was created
      const content = await fs.readFile(statusFile, 'utf-8');
      expect(content).toContain('state:');
    });

    // @feature2
    it('PLUGIN011_10: wrapper updates state to passed on success', async () => {
      const env = canonicalWrapperEnv();
      const result = runWrapper(['true'], env);

      const content = await fs.readFile(statusFilePath('abc12345'), 'utf-8');
      expect(getYamlField(content, 'state')).toBe('passed');
    });

    // @feature2
    it('PLUGIN011_11: wrapper updates state to failed on error', async () => {
      const env = canonicalWrapperEnv();
      const result = runWrapper(['false'], env);

      const content = await fs.readFile(statusFilePath('abc12345'), 'utf-8');
      expect(getYamlField(content, 'state')).toBe('failed');
    });

    // @feature2
    it('PLUGIN011_27: wrapper writes pid field to YAML', async () => {
      const env = canonicalWrapperEnv();
      runWrapper(['echo', 'test passed'], env);

      const content = await fs.readFile(statusFilePath('abc12345'), 'utf-8');
      const pid = getYamlField(content, 'pid');
      expect(pid).toMatch(/^\d+$/);
      expect(Number(pid)).toBeGreaterThan(0);
    });

    // @feature2
    it('PLUGIN011_36: wrapper writes stdout and stderr into log_file', async () => {
      const env = canonicalWrapperEnv();
      const scriptPath = appPath(STATUS_DIR, 'wrapper-log-script.js');
      await fs.copyFile(path.join(__dirname, '../fixtures/tui-statusline/wrapper-log-test-script.js'), scriptPath);
      const result = runWrapper([
        'node',
        scriptPath,
      ], env);

      expect(result.status).toBe(0);

      const content = await fs.readFile(statusFilePath('abc12345'), 'utf-8');
      const logFile = getYamlField(content, 'log_file');
      const absoluteLogFile = path.isAbsolute(logFile) ? logFile : path.join(appPath(), logFile);

      expect(await fs.pathExists(absoluteLogFile)).toBe(true);

      const logContent = await fs.readFile(absoluteLogFile, 'utf-8');
      expect(logContent).toContain('stdout line');
      expect(logContent).toContain('stderr line');
    });

    // PLUGIN011_51: legacy render e2e test — REMOVED in v2.0.0 (render replaced by CompactBar)

    // @feature2
    it('PLUGIN011_76: vitest adapter ignores file-level FAIL lines', () => {
      const adapter = new VitestAdapter();

      // File-level FAIL result — should NOT produce test_fail
      expect(adapter.parseLine('FAIL tests/e2e/file.test.ts > Suite > some test')).toBeNull();
      expect(adapter.parseLine(' FAIL  tests/e2e/installer.test.ts (50 tests | 2.3s)')).toBeNull();
      expect(adapter.parseLine('PASS tests/e2e/file.test.ts > Suite > some test')).toBeNull();

      // File-level result with ✓/× — should be skipped (file-level summary)
      expect(adapter.parseLine(' ✓ tests/e2e/file.test.ts (50 tests | 2.3s)')).toBeNull();
      expect(adapter.parseLine(' × tests/e2e/file.test.ts (3 tests | 1.2s)')).toBeNull();

      // Real test failure via unicode marker still detected
      const fail = adapter.parseLine('  ✗ some failing test  456ms');
      expect(fail).not.toBeNull();
      expect(fail?.type).toBe('test_fail');
    });
  });

  // ===========================================
  // @feature3 — Session Isolation
  // ===========================================

  describe('Session Isolation (@feature3)', () => {
    // PLUGIN011_12: legacy render session isolation test — REMOVED in v2.0.0

    // @feature3
    it('PLUGIN011_13: status file path uses session_id prefix', () => {
      const sessionId = 'abc12345def67890';
      const prefix = sessionId.substring(0, 8);
      const expectedPath = path.join(STATUS_DIR, `status.${prefix}.yaml`);

      expect(prefix).toBe('abc12345');
      expect(expectedPath).toBe('.dev-pomogator/.test-status/status.abc12345.yaml');
    });
  });

  // ===========================================
  // @feature4 — SessionStart Hook
  // ===========================================

  describe('SessionStart Hook (@feature4)', () => {
    // @feature4
    it('PLUGIN011_14: creates status directory', async () => {
      // Remove the dir first
      await fs.remove(appPath(STATUS_DIR));
      expect(await fs.pathExists(appPath(STATUS_DIR))).toBe(false);

      const envFile = appPath('.dev-pomogator/.test-env-file');
      const result = runSessionHook(
        { session_id: 'abc12345def67890', cwd: appPath(), hook_event_name: 'SessionStart' },
        { CLAUDE_ENV_FILE: envFile }
      );

      expect(await fs.pathExists(appPath(STATUS_DIR))).toBe(true);
      expect(result.stdout.trim()).toBe('{}');
      expect(result.status).toBe(0);

      await fs.remove(envFile);
    });

    // @feature4
    it('PLUGIN011_15: writes env var to CLAUDE_ENV_FILE', async () => {
      const envFile = appPath('.dev-pomogator/.test-env-file');
      await fs.ensureFile(envFile);

      runSessionHook(
        { session_id: 'abc12345def67890', cwd: appPath(), hook_event_name: 'SessionStart' },
        { CLAUDE_ENV_FILE: envFile }
      );

      const envContent = await fs.readFile(envFile, 'utf-8');
      expect(envContent).toContain('TEST_STATUSLINE_SESSION=abc12345');
      expect(envContent).toContain(`TEST_STATUSLINE_PROJECT=${appPath()}`);

      await fs.remove(envFile);
    });

    // @feature4
    it('PLUGIN011_52: hook writes session.env file (CLAUDE_ENV_FILE bug workaround)', async () => {
      // Run hook WITHOUT CLAUDE_ENV_FILE (simulates bug #15840)
      runSessionHook(
        { session_id: 'abc12345def67890', cwd: appPath(), hook_event_name: 'SessionStart' },
        {} // no CLAUDE_ENV_FILE
      );

      const sessionEnvPath = path.join(appPath(), STATUS_DIR, 'session.env');
      expect(await fs.pathExists(sessionEnvPath)).toBe(true);

      const content = await fs.readFile(sessionEnvPath, 'utf-8');
      expect(content).toContain('TEST_STATUSLINE_SESSION=abc12345');
      expect(content).toContain(`TEST_STATUSLINE_PROJECT=${appPath()}`);
    });

    // @feature4
    it('PLUGIN011_53: wrapper reads session.env when env vars not set', async () => {
      // Write session.env manually (simulates hook having written it)
      const sessionEnvPath = path.join(appPath(), STATUS_DIR, 'session.env');
      await fs.ensureDir(path.join(appPath(), STATUS_DIR));
      await fs.writeFile(sessionEnvPath, `TEST_STATUSLINE_SESSION=abc12345\nTEST_STATUSLINE_PROJECT=${appPath()}\n`);

      // Run wrapper WITHOUT env vars — it should read from session.env
      const wrapperResult = runWrapper(['echo', 'test passed'], {});
      expect(wrapperResult.status).toBe(0);

      // YAML should be created (wrapper found session from session.env)
      const statusFile = statusFilePath('abc12345');
      expect(await fs.pathExists(statusFile)).toBe(true);
    });

    // PLUGIN011_54: legacy render session.env test — REMOVED in v2.0.0

    // @feature4
    it('PLUGIN011_16: cleans stale files older than 24h', async () => {
      // Create a "stale" file and a "recent" file
      const staleFile = statusFilePath('stale123');
      const recentFile = statusFilePath('recent12');
      await fs.writeFile(staleFile, readFixture('mock-status-passed.yaml'));
      await fs.writeFile(recentFile, readFixture('mock-status-running.yaml'));

      // Set mtime to 25 hours ago for stale file
      const staleTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
      await fs.utimes(staleFile, staleTime, staleTime);

      const envFile = appPath('.dev-pomogator/.test-env-file');
      runSessionHook(
        { session_id: 'newsessidxxxxxxx', cwd: appPath(), hook_event_name: 'SessionStart' },
        { CLAUDE_ENV_FILE: envFile }
      );

      expect(await fs.pathExists(staleFile)).toBe(false);
      expect(await fs.pathExists(recentFile)).toBe(true);

      await fs.remove(envFile);
    });

    // @feature4
    it('PLUGIN011_17: cleans idle files older than 1h', async () => {
      // Create an idle file with old mtime
      const idleFile = statusFilePath('idle1234');
      const idleYaml = readFixture('mock-status-passed.yaml').replace('state: passed', 'state: idle');
      await fs.writeFile(idleFile, idleYaml);

      // Set mtime to 2 hours ago
      const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await fs.utimes(idleFile, oldTime, oldTime);

      const envFile = appPath('.dev-pomogator/.test-env-file');
      runSessionHook(
        { session_id: 'newsessidxxxxxxx', cwd: appPath(), hook_event_name: 'SessionStart' },
        { CLAUDE_ENV_FILE: envFile }
      );

      expect(await fs.pathExists(idleFile)).toBe(false);

      await fs.remove(envFile);
    });

    // @feature4
    it('PLUGIN011_28: repairs running files with dead pid', async () => {
      const deadPid = createDeadPid();
      const runningFile = statusFilePath('deadpid1');
      const yamlContent = withPid(readFixture('mock-status-running-dead-pid.yaml'), deadPid);
      await fs.writeFile(runningFile, yamlContent);

      const envFile = appPath('.dev-pomogator/.test-env-file');
      await fs.ensureFile(envFile);

      const result = runSessionHook(
        { session_id: 'newsessidxxxxxxx', cwd: appPath(), hook_event_name: 'SessionStart' },
        { CLAUDE_ENV_FILE: envFile }
      );

      expect(result.status).toBe(0);
      expect(await fs.pathExists(runningFile)).toBe(true);

      const repaired = await fs.readFile(runningFile, 'utf-8');
      expect(getYamlField(repaired, 'state')).toBe('failed');
      expect(getYamlField(repaired, 'pid')).toBe(String(deadPid));
      expect(getYamlField(repaired, 'error_message')).toContain('Process died unexpectedly');

      await fs.remove(envFile);
    });
  });

  // ===========================================
  // @feature5 — Extension Manifest
  // ===========================================

  describe('Extension Manifest (@feature5)', () => {
    // @feature5
    it('PLUGIN011_18: manifest lists all tool files', async () => {
      const manifestPath = appPath('extensions/test-statusline/extension.json');
      expect(await fs.pathExists(manifestPath)).toBe(true);

      const manifest = await fs.readJson(manifestPath);
      const toolFiles = manifest.toolFiles?.['test-statusline'] || [];

      // Shared files remain
      expect(toolFiles.join(',')).toContain('test_runner_wrapper.cjs');
      expect(toolFiles.join(',')).toContain('statusline_session_start.ts');
      expect(toolFiles.join(',')).toContain('status_types.ts');
      // Legacy render files removed (replaced by TUI CompactBar)
      expect(toolFiles.join(',')).not.toContain('statusline_render.cjs');
      expect(toolFiles.join(',')).not.toContain('statusline_wrapper.js');
    });

    // @feature5
    it('PLUGIN011_19: manifest registers SessionStart hook', async () => {
      const manifestPath = appPath('extensions/test-statusline/extension.json');
      const manifest = await fs.readJson(manifestPath);

      expect(manifest.hooks).toBeDefined();
      expect(manifest.hooks.claude).toBeDefined();
      expect(manifest.hooks.claude.SessionStart).toBeDefined();
      expect(manifest.hooks.claude.SessionStart).toContain('statusline_session_start.ts');
    });

    // @feature5
    it('PLUGIN011_20: manifest does NOT declare statusLine (removed in v2)', async () => {
      const manifestPath = appPath('extensions/test-statusline/extension.json');
      const manifest = await fs.readJson(manifestPath);

      // statusLine section removed — replaced by TUI CompactBar
      expect(manifest.statusLine).toBeUndefined();
    });
  });

  // ===========================================
  // @feature8 — StatusLine Coexistence (Global)
  // ===========================================

  describe('StatusLine Resolution (@feature8)', () => {
    // @feature8
    it('PLUGIN011_21: no existing statusLine installs ccstatusline directly', () => {
      const resolved = resolveClaudeStatusLine({
        statusLineConfig: DEFAULT_STATUSLINE_CONFIG,
      });

      expect(resolved.mode).toBe('direct');
      expect(resolved.source).toBe('none');
      expect(resolved.existingKind).toBe('none');
      expect(resolved.command).toBe(DEFAULT_USER_STATUSLINE_COMMAND);
      // No wrapping — direct ccstatusline
      expect(resolved.command).not.toContain('statusline_wrapper.js');
      expect(resolved.command).not.toContain('statusline_render.cjs');
    });

    // @feature8
    it('PLUGIN011_22: old managed statusLine is replaced with ccstatusline', () => {
      const oldManaged = 'bash /old/path/.dev-pomogator/tools/test-statusline/statusline_render.cjs';

      expect(isManagedStatusLineCommand(oldManaged)).toBe(true);

      const resolved = resolveClaudeStatusLine({
        globalStatusLine: { type: 'command', command: oldManaged },
        statusLineConfig: DEFAULT_STATUSLINE_CONFIG,
      });

      expect(resolved.mode).toBe('direct');
      expect(resolved.source).toBe('global');
      expect(resolved.existingKind).toBe('managed');
      expect(resolved.command).toBe(DEFAULT_USER_STATUSLINE_COMMAND);
    });

    // @feature8
    it('PLUGIN011_23: user-defined statusLine is preserved as-is', () => {
      const resolved = resolveClaudeStatusLine({
        globalStatusLine: { type: 'command', command: 'npx -y ccstatusline@latest' },
        statusLineConfig: DEFAULT_STATUSLINE_CONFIG,
      });

      expect(resolved.mode).toBe('direct');
      expect(resolved.source).toBe('global');
      expect(resolved.existingKind).toBe('user');
      expect(resolved.command).toBe('npx -y ccstatusline@latest');
    });

    // @feature8
    it('PLUGIN011_24: legacy wrapped command is unwrapped to user command', () => {
      const userCmd = 'npx -y ccstatusline@latest';
      const legacyWrapped = buildLegacyWrappedFixture(userCmd, 'bash /old/path/statusline_render.cjs');

      expect(isWrappedStatusLineCommand(legacyWrapped)).toBe(true);

      const resolved = resolveClaudeStatusLine({
        globalStatusLine: { type: 'command', command: legacyWrapped },
        statusLineConfig: DEFAULT_STATUSLINE_CONFIG,
      });

      expect(resolved.mode).toBe('direct');
      expect(resolved.existingKind).toBe('wrapped');
      // Unwrapped to just the user command
      expect(resolved.command).toBe(userCmd);
      expect(resolved.command).not.toContain('statusline_wrapper.js');
    });

    // PLUGIN011_25, 31, 32, 33, 37, 38, 39: legacy wrapper tests — REMOVED in v3.0.0 (wrapping removed)

    // @feature8
    it('PLUGIN011_34: broken wrapper falls back to ccstatusline', () => {
      const brokenWrapper = `node -e "require(require('path').join(require('os').homedir(),'.dev-pomogator','scripts','statusline_wrapper.js'))" -- --user-b64 "not_base64" --managed-b64 "still_bad"`;

      expect(isWrappedStatusLineCommand(brokenWrapper)).toBe(true);
      expect(extractUserCommandFromLegacyWrapper(brokenWrapper)).toBeNull();

      const resolved = resolveClaudeStatusLine({
        globalStatusLine: { type: 'command', command: brokenWrapper },
        statusLineConfig: DEFAULT_STATUSLINE_CONFIG,
      });

      expect(resolved.mode).toBe('direct');
      expect(resolved.source).toBe('global');
      expect(resolved.existingKind).toBe('wrapped');
      // Broken wrapper → falls back to ccstatusline
      expect(resolved.command).toBe(DEFAULT_USER_STATUSLINE_COMMAND);
    });

    // @feature8
    it('PLUGIN011_40: updater unwraps legacy wrapper to user command', () => {
      const userCmd = 'npx -y ccstatusline@latest';
      const legacyWrapped = buildLegacyWrappedFixture(userCmd, 'bash /old/managed.cjs');

      const resolved = resolveClaudeStatusLine({
        globalStatusLine: { type: 'command', command: legacyWrapped },
        statusLineConfig: DEFAULT_STATUSLINE_CONFIG,
      });

      expect(resolved.mode).toBe('direct');
      expect(resolved.command).toBe(userCmd);
    });

    // @feature8
    it('PLUGIN011_41: re-install is idempotent (ccstatusline stays ccstatusline)', () => {
      // First resolve — install ccstatusline
      const first = resolveClaudeStatusLine({
        statusLineConfig: DEFAULT_STATUSLINE_CONFIG,
      });
      expect(first.command).toBe(DEFAULT_USER_STATUSLINE_COMMAND);

      // Second resolve with first result as existing — should be same
      const second = resolveClaudeStatusLine({
        globalStatusLine: { type: 'command', command: first.command },
        statusLineConfig: DEFAULT_STATUSLINE_CONFIG,
      });
      expect(second.command).toBe(DEFAULT_USER_STATUSLINE_COMMAND);
      expect(second.existingKind).toBe('user');
    });

    // PLUGIN011_42: legacy wrapper stdin forwarding test — REMOVED in v3.0.0
  });

  // ===========================================
  // @feature9 — Global StatusLine Migration
  // ===========================================

  describe('Global StatusLine Migration (@feature9)', () => {
    // @feature9
    it('PLUGIN011_43: ccstatusline auto-install when no statusLine exists', () => {
      const resolved = resolveClaudeStatusLine({
        statusLineConfig: DEFAULT_STATUSLINE_CONFIG,
      });

      expect(resolved.mode).toBe('direct');
      expect(resolved.source).toBe('none');
      expect(resolved.existingKind).toBe('none');
      expect(resolved.command).toBe(DEFAULT_USER_STATUSLINE_COMMAND);
      expect(resolved.command).toContain('ccstatusline');
    });

    // @feature9
    it('PLUGIN011_44: installer deletes project-level statusLine (migration)', async () => {
      const projectSettingsPath = projectClaudeSettingsPath();

      await setupCleanState('claude');
      try {
        // Pre-populate project settings with old project-level statusLine
        await fs.ensureDir(path.dirname(projectSettingsPath));
        await fs.writeJson(projectSettingsPath, {
          statusLine: { type: 'command', command: 'node /old/project/.dev-pomogator/tools/test-statusline/statusline_render.cjs' },
        }, { spaces: 2 });

        const result = await runInstaller('--claude --all');
        expect(result.exitCode).toBe(0);

        // Project settings should have statusLine REMOVED (migrated to global)
        const projectSettings = await fs.readJson(projectSettingsPath);
        expect(projectSettings.statusLine).toBeUndefined();
      } finally {
        await setupCleanState('claude');
      }
    });

    // @feature9
    it('PLUGIN011_48: extra fields like padding are preserved in resolution', () => {
      const resolved = resolveClaudeStatusLine({
        globalStatusLine: { type: 'command', command: 'npx -y ccstatusline@latest' },
        statusLineConfig: DEFAULT_STATUSLINE_CONFIG,
      });

      // Simulate what the installer does: spread existing statusLine then overwrite type/command
      const existingStatusLine: Record<string, unknown> = { type: 'command', command: 'npx -y ccstatusline@latest', padding: 0 };
      const merged: Record<string, unknown> = {
        ...existingStatusLine,
        type: resolved.type,
        command: resolved.command,
      };

      // Extra field (padding) should be preserved
      expect(merged.padding).toBe(0);
      expect(merged.type).toBe('command');
      // Direct command, no wrapping
      expect(merged.command).toBe('npx -y ccstatusline@latest');
    });

    // PLUGIN011_49: portable managed command test — REMOVED in v3.0.0 (managed render script deleted)
    // PLUGIN011_50: portable wrapped command test — REMOVED in v3.0.0 (wrapping removed)

    // @feature9
    it('PLUGIN011_51: installer writes ccstatusline to global settings.json', async () => {
      await setupCleanState('claude');
      const result = await runInstaller('--claude --all');
      expect(result.exitCode).toBe(0);

      const globalSettings = await fs.readJson(homePath('.claude', 'settings.json'));
      expect(globalSettings.statusLine).toBeDefined();
      expect(globalSettings.statusLine.command).toContain('ccstatusline');
    });
  });

  // =========================================================================
  // Compact Mode (@feature1) — CompactBar render tests
  // =========================================================================
  describe('Compact Mode (@feature1)', () => {
    const TUI_DIR = 'extensions/tui-test-runner/tools/tui-test-runner';
    const COMPACT_RENDER_SCRIPT = `
import sys, json
sys.path.insert(0, '${TUI_DIR}')
from tui.widgets.compact_bar import render_compact
from tui.models import TestStatus, TestState
data = json.loads(sys.stdin.read())
if data.get('_null'):
    print(render_compact(None))
elif data.get('_corrupted'):
    print(render_compact(None))
else:
    status = TestStatus(**{k: (TestState(v) if k == 'state' else v) for k, v in data.items()})
    print(render_compact(status))
`;

    function renderCompact(payload: Record<string, unknown>): string {
      const runner = getPythonRunner();
      const result = spawnSync(runner.command, [...runner.prefixArgs, '-c', COMPACT_RENDER_SCRIPT], {
        input: JSON.stringify(payload),
        encoding: 'utf-8',
        cwd: appPath(),
        timeout: 10000,
      });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`Python error: ${result.stderr}`);
      return (result.stdout || '').trim();
    }

    // @feature1
    it('PLUGIN011_60: CompactBar renders running state with progress', () => {
      const output = renderCompact({
        state: 'running',
        framework: 'vitest',
        passed: 38,
        failed: 2,
        skipped: 0,
        running: 10,
        total: 50,
        percent: 76,
        duration_ms: 12500,
      });
      expect(output).toContain('76%');
      expect(output).toContain('38/50✅');
      expect(output).toContain('2❌');
      expect(output).toContain('RUN');
      expect(output).toContain('█');
    });

    // @feature12
    it('PLUGIN011_74: CompactBar hides /total and % when total=0 (no discovery)', () => {
      const output = renderCompact({
        state: 'running',
        framework: 'vitest',
        passed: 34,
        failed: 0,
        skipped: 0,
        running: 0,
        total: 0,
        percent: 0,
        duration_ms: 66000,
      });
      // Should NOT show /total or percent
      expect(output).not.toContain('/%');
      expect(output).toContain('34✅');
      expect(output).toContain('RUN');
    });

    // @feature12
    it('PLUGIN011_75: CompactBar shows real progress with discovery total', () => {
      const output = renderCompact({
        state: 'running',
        framework: 'vitest',
        passed: 34,
        failed: 0,
        skipped: 0,
        running: 541,
        total: 575,
        percent: 6,
        duration_ms: 66000,
      });
      expect(output).toContain('34/575✅');
      expect(output).toContain('6%');
      expect(output).toContain('RUN');
    });

    // @feature12
    it('PLUGIN011_77: CompactBar shows building Docker status when 0 completed with known total', () => {
      const output = renderCompact({
        state: 'running',
        framework: 'vitest',
        passed: 0,
        failed: 0,
        skipped: 0,
        running: 0,
        total: 678,
        percent: 0,
        duration_ms: 45000,
      });
      expect(output).toContain('building Docker');
      expect(output).toContain('0/678');
      expect(output).toContain('RUN');
    });

    // @feature1
    it('PLUGIN011_61: CompactBar shows idle indicator when no tests', () => {
      const output = renderCompact({ _null: true });
      expect(output).toContain('no test runs');
    });

    // @feature1
    it('PLUGIN011_62: CompactBar handles corrupted YAML gracefully', () => {
      // render_compact(None) should return idle indicator without crashing
      const output = renderCompact({ _corrupted: true });
      expect(output).toContain('no test runs');
    });

    // --- Integration tests: VitestAdapter → CompactBar pipeline ---

    function parseFixtureCounts(fixturePath: string): { passed: number; failed: number; skipped: number } {
      const adapter = new VitestAdapter();
      const content = fs.readFileSync(fixturePath, 'utf-8');
      let passed = 0, failed = 0, skipped = 0;
      for (const line of content.split('\n')) {
        const event = adapter.parseLine(line.replace(/\x1b\[[0-9;]*m/g, ''));
        if (!event) continue;
        if (event.type === 'test_pass') passed++;
        if (event.type === 'test_fail') failed++;
        if (event.type === 'test_skip') skipped++;
      }
      return { passed, failed, skipped };
    }

    // @feature13
    it('PLUGIN011_78: VitestAdapter parses fixture into correct counts', () => {
      const counts = parseFixtureCounts(appPath(FIXTURES_DIR, 'vitest-docker-output.txt'));
      expect(counts.passed).toBe(8);
      expect(counts.failed).toBe(2);
      expect(counts.skipped).toBe(3);
    });

    // @feature13
    it('PLUGIN011_79: VitestAdapter parses suite start headers', () => {
      const adapter = new VitestAdapter();
      const event = adapter.parseLine(' ❯ tests/e2e/installer.test.ts (28)');
      expect(event).not.toBeNull();
      expect(event!.type).toBe('suite_start');
    });

    // @feature13
    it('PLUGIN011_80: Full pipeline fixture → adapter → render shows progress', () => {
      const { passed, failed, skipped } = parseFixtureCounts(appPath(FIXTURES_DIR, 'vitest-docker-output.txt'));

      const output = renderCompact({
        state: 'running',
        framework: 'vitest',
        passed,
        failed,
        skipped,
        running: 0,
        total: 13,
        percent: Math.round(((passed + failed + skipped) / 13) * 100),
        duration_ms: 4400,
      });

      expect(output).toContain('8');
      expect(output).toContain('2❌');
      expect(output).not.toContain('building Docker');
    });

    // @feature13
    it('PLUGIN011_81: Building Docker state when adapter has 0 results but total known', () => {
      // Simulate: discovery found 687 tests, but adapter hasn't parsed any results yet
      const output = renderCompact({
        state: 'running',
        framework: 'vitest',
        passed: 0,
        failed: 0,
        skipped: 0,
        running: 0,
        total: 687,
        percent: 0,
        duration_ms: 30000,
      });
      expect(output).toContain('building Docker');
      expect(output).toContain('0/687');
    });
  });

  // =========================================================================
  // Toggle/Stop/Resize (@feature2-4) — replaced by Python Pilot tests
  // See: tests/tui/test_toggle.py, test_stop.py, test_resize.py
  // Old file-inspection tests PLUGIN011_63-67 removed — they were false
  // positives that checked code strings instead of real TUI behavior.
  // =========================================================================

  // =========================================================================
  // Statusline Render Removal (@feature5) — verify legacy files removed
  // =========================================================================
  describe('Statusline Render Removal (@feature5)', () => {
    const TEST_STATUSLINE_DIR = 'extensions/test-statusline/tools/test-statusline';

    // @feature5
    it('PLUGIN011_68: legacy render files removed from extension', async () => {
      expect(await fs.pathExists(appPath(TEST_STATUSLINE_DIR, 'statusline_render.cjs'))).toBe(false);
      expect(await fs.pathExists(appPath(TEST_STATUSLINE_DIR, 'statusline_render.sh'))).toBe(false);
      expect(await fs.pathExists(appPath(TEST_STATUSLINE_DIR, 'statusline_wrapper.js'))).toBe(false);
    });

    // @feature5
    it('PLUGIN011_69: shared files still present after render removal', async () => {
      expect(await fs.pathExists(appPath(TEST_STATUSLINE_DIR, 'statusline_session_start.ts'))).toBe(true);
      expect(await fs.pathExists(appPath(TEST_STATUSLINE_DIR, 'test_runner_wrapper.cjs'))).toBe(true);
      expect(await fs.pathExists(appPath(TEST_STATUSLINE_DIR, 'status_types.ts'))).toBe(true);
    });
  });

  // =========================================================================
  // Installer hooks — tui-test-runner hooks in extension.json (@feature6)
  // =========================================================================
  describe('Installer hooks (@feature6)', () => {
    // @feature6
    it('PLUGIN011_70: tui-test-runner extension.json has object-format hooks', async () => {
      const manifest = await fs.readJson(
        appPath('extensions/tui-test-runner/extension.json'),
      );
      // Must be object { claude: { ... } }, NOT array
      expect(manifest.hooks).not.toBeInstanceOf(Array);
      expect(manifest.hooks.claude).toBeDefined();
      expect(manifest.hooks.claude.SessionStart).toBeDefined();
      expect(manifest.hooks.claude.PreToolUse).toBeDefined();
      expect(manifest.hooks.claude.PreToolUse.matcher).toBe('Bash');
    });

    // PLUGIN011_72, PLUGIN011_73: removed — statusline_render.cjs deleted (dead code, replaced by TUI compact_bar.py)

    // @feature6
    it('PLUGIN011_71: wrapper creates YAML when SESSION is set', () => {
      // Run wrapper with a test session and a quick command (echo)
      const session = 'e2etest1';
      const result = spawnSync('node', [
        appPath('extensions/test-statusline/tools/test-statusline/test_runner_wrapper.cjs'),
        'echo', 'hello',
      ], {
        encoding: 'utf-8',
        cwd: appPath(),
        timeout: 15000,
        env: {
          ...process.env,
          TEST_STATUSLINE_SESSION: session,
          TEST_STATUSLINE_PROJECT: appPath(),
        },
      });
      // Wrapper should create YAML status file
      const statusFile = path.join(appPath(), '.dev-pomogator', '.test-status', `status.${session}.yaml`);
      expect(fs.pathExistsSync(statusFile)).toBe(true);
      const content = fs.readFileSync(statusFile, 'utf-8');
      expect(content).toContain('state:');
      // Cleanup
      fs.removeSync(statusFile);
    });
  });
});
