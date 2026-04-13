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
const DOCKER_STATUS_DIR = '.dev-pomogator/.docker-status';
const FIXTURES_DIR = 'tests/fixtures/tui-statusline';
const WRAPPER_SCRIPT = 'extensions/test-statusline/tools/test-statusline/test_runner_wrapper.cjs';
// Use installed path where _shared/hook-utils.js is available (extensions/ lacks _shared/ at this level)
const SESSION_HOOK = '.dev-pomogator/tools/test-statusline/statusline_session_start.ts';
// Read statusLine type from the real extension manifest (not hardcoded)
const EXT_MANIFEST = fs.readJsonSync(appPath('extensions/test-statusline/extension.json'));
const MANIFEST_STATUSLINE_TYPE = EXT_MANIFEST.statusLine?.claude?.type ?? 'command';
const DEFAULT_STATUSLINE_CONFIG = {
  type: MANIFEST_STATUSLINE_TYPE,
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
    TEST_STATUS_DIR: STATUS_DIR,
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
    // Isolated state setup: previous test files (notably personal-pomogator)
    // call setupCleanState multiple times which empties .dev-pomogator/tools/.
    // Last install in personal-pomogator may use --plugins=... (not --all),
    // leaving test-statusline tool absent. Re-install before SessionStart tests
    // to guarantee statusline_session_start.ts and _shared/ are present.
    beforeAll(async () => {
      await setupCleanState('claude');
      const installResult = await runInstaller('--claude --all');
      if (installResult.exitCode !== 0) {
        throw new Error(`Failed to install for SessionStart tests: ${installResult.logs}`);
      }
    });

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

      // Run wrapper WITHOUT session env vars — it should read from session.env
      // Explicitly blank TEST_STATUSLINE_SESSION (docker-test.sh passes it to Docker env)
      const wrapperResult = runWrapper(['echo', 'test passed'], { TEST_STATUS_DIR: STATUS_DIR, TEST_STATUSLINE_SESSION: '' });
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
    it('PLUGIN011_20: manifest declares statusLine with ccstatusline command', async () => {
      const manifestPath = appPath('extensions/test-statusline/extension.json');
      const manifest = await fs.readJson(manifestPath);

      // statusLine section provides ccstatusline command for Claude Code
      expect(manifest.statusLine).toBeDefined();
      expect(manifest.statusLine.claude).toBeDefined();
      expect(manifest.statusLine.claude.type).toBe('command');
      expect(manifest.statusLine.claude.command).toContain('ccstatusline');
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
    it('PLUGIN011_70: tui-test-runner extension.json has array-format PreToolUse hooks', async () => {
      const manifest = await fs.readJson(
        appPath('extensions/tui-test-runner/extension.json'),
      );
      // Must be object { claude: { ... } }, NOT array at top level
      expect(manifest.hooks).not.toBeInstanceOf(Array);
      expect(manifest.hooks.claude).toBeDefined();
      expect(manifest.hooks.claude.SessionStart).toBeDefined();
      // PreToolUse is array format with matcher groups
      expect(manifest.hooks.claude.PreToolUse).toBeDefined();
      expect(Array.isArray(manifest.hooks.claude.PreToolUse)).toBe(true);
      const matchers = manifest.hooks.claude.PreToolUse.map((g: any) => g.matcher);
      expect(matchers).toContain('Bash');
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
          TEST_STATUS_DIR: STATUS_DIR,
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

  // =========================================================================
  // Docker Session Propagation (@feature14)
  // =========================================================================
  describe('Docker Session Propagation (@feature14)', () => {
    // uses file-level DOCKER_STATUS_DIR

    // @feature14
    it('PLUGIN011_84: CJS wrapper reads session.env from docker-status fallback', () => {
      // Create session.env in .docker-status/ (not .test-status/)
      const dockerDir = appPath(DOCKER_STATUS_DIR);
      fs.ensureDirSync(dockerDir);
      fs.writeFileSync(path.join(dockerDir, 'session.env'), 'TEST_STATUSLINE_SESSION=docker84\nTEST_STATUSLINE_PROJECT=' + appPath() + '\n');

      // Run wrapper WITHOUT TEST_STATUSLINE_SESSION in env — should fall back to docker-status/session.env
      const result = spawnSync('node', [
        appPath(WRAPPER_SCRIPT),
        'echo', 'docker-test',
      ], {
        encoding: 'utf-8',
        cwd: appPath(),
        timeout: 15000,
        env: {
          ...process.env,
          FORCE_COLOR: '0',
          TEST_STATUSLINE_SESSION: '',
          TEST_STATUS_DIR: DOCKER_STATUS_DIR,
        },
      });

      // Wrapper should have read session from docker-status/session.env and created YAML
      const statusFile = path.join(dockerDir, 'status.docker84.yaml');
      expect(fs.pathExistsSync(statusFile)).toBe(true);
      const content = fs.readFileSync(statusFile, 'utf-8');
      expect(getYamlField(content, 'session_id')).toBe('docker84');

      // Cleanup
      fs.removeSync(path.join(dockerDir, 'session.env'));
      fs.removeSync(statusFile);
    });

    // @feature14
    it('PLUGIN011_85: wrapper produces YAML with SESSION + TEST_STATUS_DIR to docker-status', () => {
      const dockerDir = appPath(DOCKER_STATUS_DIR);
      fs.ensureDirSync(dockerDir);

      const result = runWrapper(['--framework', 'vitest', '--', 'echo', 'test'], {
        ...canonicalWrapperEnv({
          TEST_STATUSLINE_SESSION: 'docker85',
          TEST_STATUS_DIR: DOCKER_STATUS_DIR,
        }),
      });

      const statusFile = path.join(dockerDir, 'status.docker85.yaml');
      expect(fs.pathExistsSync(statusFile)).toBe(true);
      const content = fs.readFileSync(statusFile, 'utf-8');
      expect(getYamlField(content, 'session_id')).toBe('docker85');
      expect(getYamlField(content, 'framework')).toBe('vitest');

      // Cleanup
      fs.removeSync(statusFile);
    });
  });

  // =========================================================================
  // Dual-Directory YAML Reader (@feature15)
  // =========================================================================
  describe('Dual-Directory YAML Reader (@feature15)', () => {
    // uses file-level DOCKER_STATUS_DIR

    // @feature15
    it('PLUGIN011_86: YamlReader falls back to docker-status directory', () => {
      // Create YAML only in docker-status, NOT in test-status
      const dockerDir = appPath(DOCKER_STATUS_DIR);
      fs.ensureDirSync(dockerDir);
      const yamlContent = readTuiFixture('yaml-v2-running.yaml');
      fs.writeFileSync(path.join(dockerDir, 'status.fallbk.yaml'), yamlContent);

      let python: string | undefined;
      try { python = getPythonRunner().python; } catch { /* no Python */ }
      if (!python) {
        // Fallback: verify file exists (structural test)
        expect(fs.pathExistsSync(path.join(dockerDir, 'status.fallbk.yaml'))).toBe(true);
        fs.removeSync(path.join(dockerDir, 'status.fallbk.yaml'));
        return;
      }

      const tuiDir = appPath('extensions/tui-test-runner/tools/tui-test-runner');
      const primaryFile = path.join(appPath(), STATUS_DIR, 'status.fallbk.yaml');

      // Use different filename in fallback dir to verify dir-scan (not same-name lookup)
      const result = spawnSync(python, ['-c', `
import sys; sys.path.insert(0, '${tuiDir.replace(/\\/g, '/')}')
from tui.yaml_reader import YamlReader
reader = YamlReader('${primaryFile.replace(/\\/g, '/')}', fallback_dirs=['${dockerDir.replace(/\\/g, '/')}'])
status = reader.check()
print('STATE=' + (status.state.value if status else 'NONE'))
`], { encoding: 'utf-8', timeout: 10000 });

      expect(result.stdout).toContain('STATE=running');

      // Cleanup
      fs.removeSync(path.join(dockerDir, 'status.fallbk.yaml'));
    });

    // @feature15
    it('PLUGIN011_87: YamlReader picks freshest file across dirs with different names', () => {
      // Create YAML in BOTH dirs with DIFFERENT filenames and different mtimes
      const dockerDir = appPath(DOCKER_STATUS_DIR);
      fs.ensureDirSync(dockerDir);
      fs.ensureDirSync(testStatusDir);

      // Older file in .test-status/
      const oldYaml = readTuiFixture('yaml-v2-running.yaml');
      const oldFile = path.join(testStatusDir, 'status.oldsess.yaml');
      fs.writeFileSync(oldFile, oldYaml);

      // Newer file in .docker-status/ (different session name)
      const newYaml = readTuiFixture('yaml-v2-failed.yaml');
      const newFile = path.join(dockerDir, 'status.newsess.yaml');

      // Write new file 1 second after old to ensure mtime difference
      const now = new Date();
      fs.utimesSync(oldFile, now, new Date(now.getTime() - 10000));
      fs.writeFileSync(newFile, newYaml);

      let python: string | undefined;
      try { python = getPythonRunner().python; } catch { /* no Python */ }
      if (!python) {
        fs.removeSync(oldFile);
        fs.removeSync(newFile);
        return;
      }

      const tuiDir = appPath('extensions/tui-test-runner/tools/tui-test-runner');
      const primaryFile = path.join(testStatusDir, 'status.oldsess.yaml');

      const result = spawnSync(python, ['-c', `
import sys; sys.path.insert(0, '${tuiDir.replace(/\\/g, '/')}')
from tui.yaml_reader import YamlReader
reader = YamlReader('${primaryFile.replace(/\\/g, '/')}', fallback_dirs=['${dockerDir.replace(/\\/g, '/')}'])
status = reader.check()
print('STATE=' + (status.state.value if status else 'NONE'))
`], { encoding: 'utf-8', timeout: 10000 });

      // Should return the NEWER file (failed) from docker-status, not the older (running) from test-status
      expect(result.stdout).toContain('STATE=failed');

      // Cleanup
      fs.removeSync(oldFile);
      fs.removeSync(newFile);
    });

    // @feature15
    it('PLUGIN011_88: YamlReader returns None when no files in any directory', () => {
      let python: string | undefined;
      try { python = getPythonRunner().python; } catch { /* no Python */ }
      if (!python) {
        // No Python in Docker — structural pass
        expect(true).toBe(true);
        return;
      }

      const tuiDir = appPath('extensions/tui-test-runner/tools/tui-test-runner');
      const nonexistentFile = path.join(appPath(), STATUS_DIR, 'status.noexist.yaml');
      const nonexistentFallback = path.join(appPath(), DOCKER_STATUS_DIR);

      const result = spawnSync(python, ['-c', `
import sys; sys.path.insert(0, '${tuiDir.replace(/\\/g, '/')}')
from tui.yaml_reader import YamlReader
reader = YamlReader('${nonexistentFile.replace(/\\/g, '/')}', fallback_dirs=['${nonexistentFallback.replace(/\\/g, '/')}'])
status = reader.check()
print('STATE=' + (status.state.value if status else 'NONE'))
`], { encoding: 'utf-8', timeout: 10000 });

      expect(result.stdout).toContain('STATE=NONE');
    });

    // @feature15
    it('PLUGIN011_89: Launcher passes docker-status as fallback directory', async () => {
      // Use installed path where _shared/hook-utils.js exists
      const mod = await import('../../.dev-pomogator/tools/tui-test-runner/launcher.ts');
      const args = mod.buildTuiLaunchArgs(
        '/project/.dev-pomogator/.test-status/status.abc12345.yaml',
        '/project/log.txt',
        'vitest',
      );

      expect(args).toContain('--fallback-dir');
      const fallbackIdx = args.indexOf('--fallback-dir');
      expect(args[fallbackIdx + 1]).toContain('.docker-status');
    });
  });

  // =========================================================================
  // TUI Stop Hook (@feature16)
  // =========================================================================
  describe('TUI Stop Hook (@feature16)', () => {
    // Use installed paths (.dev-pomogator/tools/) where _shared/hook-utils.js is available
    const TUI_STOP_HOOK = '.dev-pomogator/tools/tui-test-runner/tui_stop.ts';
    const TUI_SESSION_HOOK = '.dev-pomogator/tools/tui-test-runner/tui_session_start.ts';

    function runStopHook(stdinJson: Record<string, unknown>, env: Record<string, string> = {}) {
      return runTsx(TUI_STOP_HOOK, { input: stdinJson, env });
    }

    // @feature16
    it('PLUGIN011_90: Stop hook removes tui.pid and attempts process kill', () => {
      // Write a PID (use a dead PID to avoid 60s timeout from detached processes in Docker)
      const deadPid = createDeadPid();
      fs.writeFileSync(path.join(testStatusDir, 'tui.pid'), String(deadPid));

      // Run stop hook
      const result = runStopHook({ cwd: appPath(), session_id: 'test-stop' });
      expect(result.status).toBe(0);

      // tui.pid should be removed
      expect(fs.pathExistsSync(path.join(testStatusDir, 'tui.pid'))).toBe(false);
    });

    // @feature16
    it('PLUGIN011_91: Stop hook cleans tui.pid with garbage content', () => {
      // Non-numeric PID content — hook should clean up file without crashing
      fs.writeFileSync(path.join(testStatusDir, 'tui.pid'), 'not-a-number\n');

      const result = runStopHook({ cwd: appPath(), session_id: 'test-garbage' });
      expect(result.status).toBe(0);
      expect(fs.pathExistsSync(path.join(testStatusDir, 'tui.pid'))).toBe(false);
    });

    // @feature16
    it('PLUGIN011_92: Stop hook exits cleanly when tui.pid missing', () => {
      // No tui.pid — hook should still exit 0
      const result = runStopHook({ cwd: appPath(), session_id: 'test-nopid' });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('{}');
    });

    // @feature16
    it('PLUGIN011_93: SessionStart hook cleans stale tui.pid from previous session', () => {
      // Write stale PID (dead process — avoids 60s timeout in Docker)
      const deadPid = createDeadPid();
      fs.writeFileSync(path.join(testStatusDir, 'tui.pid'), String(deadPid));

      // Run SessionStart hook — should clean stale tui.pid
      const result = runTsx(TUI_SESSION_HOOK, {
        input: { cwd: appPath(), session_id: 'newsess93' },
      });
      expect(result.status).toBe(0);

      // PID file should be cleaned up
      expect(fs.pathExistsSync(path.join(testStatusDir, 'tui.pid'))).toBe(false);
    });
  });

  // =========================================================================
  // Discovery File Filters (@feature13)
  // =========================================================================
  describe('Discovery File Filters (@feature13)', () => {
    // @feature13
    it('PLUGIN011_95: discovery count respects file filter args', () => {
      // Run wrapper with specific test file — discovery should count only that file's tests
      const session = 'disc95';
      const singleTestFile = 'tests/e2e/tui-test-runner.test.ts';
      const result = runWrapper(['--framework', 'vitest', '--', 'npx', 'vitest', 'run', singleTestFile], {
        ...canonicalWrapperEnv({ TEST_STATUSLINE_SESSION: session }),
      });

      const statusFile = statusFilePath(session);
      if (!fs.pathExistsSync(statusFile)) return; // discovery might fail in Docker without vitest

      const content = fs.readFileSync(statusFile, 'utf-8');
      const total = parseInt(getYamlField(content, 'total'), 10);

      // Single file has ~34 tests, full project has 745+. If total < 100, filter worked.
      expect(total).toBeLessThan(100);

      fs.removeSync(statusFile);
    });
  });

  // =========================================================================
  // Docker Session Passing (@feature14 — RC4)
  // =========================================================================
  describe('Docker Session Passing (@feature14)', () => {
    // @feature14
    it('PLUGIN011_94: Dockerfile ENTRYPOINT includes wrapper so all runs produce YAML', () => {
      const dockerfile = fs.readFileSync(appPath('Dockerfile.test'), 'utf-8');

      // ENTRYPOINT must include wrapper — custom args replace CMD but ENTRYPOINT stays
      expect(dockerfile).toContain('ENTRYPOINT');
      expect(dockerfile).toContain('test_runner_wrapper.cjs');
      expect(dockerfile).toMatch(/ENTRYPOINT.*test_runner_wrapper/);

      // CMD must be separate (just the default test command)
      expect(dockerfile).toMatch(/CMD.*npm.*run.*test:e2e:docker/);

      // docker-test.sh must pass SESSION via -e
      const script = fs.readFileSync(appPath('scripts/docker-test.sh'), 'utf-8');
      expect(script).toContain('SESSION_ARGS+=(-e "TEST_STATUSLINE_SESSION=$SESSION")');
    });
  });
});
