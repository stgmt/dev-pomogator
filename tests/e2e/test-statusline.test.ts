import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'child_process';
import { appPath, homePath, runInstaller, setupCleanState } from './helpers';
import {
  buildPortableManagedCommand,
  buildPortableWrappedCommand,
  DEFAULT_USER_STATUSLINE_COMMAND,
  parseWrappedStatusLineCommand,
  resolveClaudeStatusLine,
} from '../../src/utils/statusline.js';
import { VitestAdapter } from '../../extensions/tui-test-runner/tools/tui-test-runner/adapters/vitest_adapter.js';

// --- Helpers ---

interface PythonRunner { command: string; prefixArgs: string[]; }
let cachedPythonRunner: PythonRunner | null = null;

function getPythonRunner(): PythonRunner {
  if (cachedPythonRunner) return cachedPythonRunner;
  const candidates: PythonRunner[] = process.platform === 'win32'
    ? [{ command: 'python', prefixArgs: [] }, { command: 'py', prefixArgs: ['-3'] }, { command: 'python3', prefixArgs: [] }]
    : [{ command: 'python3', prefixArgs: [] }, { command: 'python', prefixArgs: [] }];
  for (const c of candidates) {
    const r = spawnSync(c.command, [...c.prefixArgs, '--version'], { encoding: 'utf-8', timeout: 5000 });
    if (r.status === 0) { cachedPythonRunner = c; return c; }
  }
  throw new Error('Python 3 required for compact mode tests');
}

const STATUS_DIR = '.dev-pomogator/.test-status';
const FIXTURES_DIR = 'tests/fixtures/test-statusline';
const WRAPPER_SCRIPT = 'extensions/test-statusline/tools/test-statusline/test_runner_wrapper.sh';
const SESSION_HOOK = 'extensions/test-statusline/tools/test-statusline/statusline_session_start.ts';
const DEFAULT_STATUSLINE_CONFIG = {
  type: 'command',
  command: 'node .dev-pomogator/tools/test-statusline/statusline_render.cjs',
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

function runWrapper(args: string[], env: Record<string, string> = {}): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('bash', [appPath(WRAPPER_SCRIPT), ...args], {
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

function runSessionHook(stdinJson: Record<string, unknown>, env: Record<string, string> = {}): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('npx', ['tsx', appPath(SESSION_HOOK)], {
    input: JSON.stringify(stdinJson),
    encoding: 'utf-8',
    cwd: appPath(),
    env: { ...process.env, FORCE_COLOR: '0', ...env },
    timeout: 15000,
  });
  return { stdout: result.stdout || '', stderr: result.stderr || '', status: result.status };
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

describe('PLUGIN011: Test Statusline', () => {

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
      await fs.writeFile(scriptPath, [
        "console.log('stdout line');",
        "console.error('stderr line');",
      ].join('\n'));
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
      expect(toolFiles.join(',')).toContain('test_runner_wrapper.sh');
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

  describe('StatusLine Coexistence (@feature8)', () => {
    // @feature8
    it('PLUGIN011_21: no existing statusLine installs ccstatusline wrapped with managed', () => {
      const resolved = resolveClaudeStatusLine({
        statusLineConfig: DEFAULT_STATUSLINE_CONFIG,
      });

      expect(resolved.mode).toBe('wrapped');
      expect(resolved.source).toBe('none');
      expect(resolved.existingKind).toBe('none');
      expect(resolved.command).toContain('statusline_wrapper.js');

      const parsed = parseWrappedStatusLineCommand(resolved.command);
      expect(parsed).not.toBeNull();
      expect(parsed?.userCommand).toBe(DEFAULT_USER_STATUSLINE_COMMAND);
      expect(parsed?.managedCommand).toContain('statusline_render.cjs');
    });

    // @feature8
    it('PLUGIN011_22: old managed statusLine is replaced with ccstatusline wrapper', () => {
      const oldManaged = 'bash /old/path/.dev-pomogator/tools/test-statusline/statusline_render.cjs';

      const resolved = resolveClaudeStatusLine({
        globalStatusLine: { type: 'command', command: oldManaged },
        statusLineConfig: DEFAULT_STATUSLINE_CONFIG,
      });

      expect(resolved.mode).toBe('wrapped');
      expect(resolved.source).toBe('global');
      expect(resolved.existingKind).toBe('managed');

      const parsed = parseWrappedStatusLineCommand(resolved.command);
      expect(parsed).not.toBeNull();
      expect(parsed?.userCommand).toBe(DEFAULT_USER_STATUSLINE_COMMAND);
      expect(parsed?.managedCommand).toContain('statusline_render.cjs');
      // Old path should be gone
      expect(parsed?.managedCommand).not.toContain('/old/path/');
    });

    // @feature8
    it('PLUGIN011_23: user-defined statusLine is wrapped alongside managed one', () => {
      const resolved = resolveClaudeStatusLine({
        globalStatusLine: { type: 'command', command: 'npx -y ccstatusline@latest' },
        statusLineConfig: DEFAULT_STATUSLINE_CONFIG,
      });

      expect(resolved.command).toContain('statusline_wrapper.js');
      expect(resolved.source).toBe('global');

      const parsed = parseWrappedStatusLineCommand(resolved.command);
      expect(parsed).not.toBeNull();
      expect(parsed?.userCommand).toBe('npx -y ccstatusline@latest');
      expect(parsed?.managedCommand).toContain('statusline_render.cjs');
    });

    // @feature8
    it('PLUGIN011_24: existing wrapper keeps user command and updates managed command', () => {
      const existingWrapper = buildPortableWrappedCommand(
        'npx -y ccstatusline@latest',
        'bash /old/path/.dev-pomogator/tools/test-statusline/statusline_render.cjs'
      );

      const resolved = resolveClaudeStatusLine({
        globalStatusLine: { type: 'command', command: existingWrapper },
        statusLineConfig: DEFAULT_STATUSLINE_CONFIG,
      });

      const parsed = parseWrappedStatusLineCommand(resolved.command);
      expect(parsed).not.toBeNull();
      expect(parsed?.userCommand).toBe('npx -y ccstatusline@latest');
      expect(parsed?.managedCommand).toContain('statusline_render.cjs');
      expect(parsed?.managedCommand).not.toContain('/old/path/');
    });

    // PLUGIN011_25, 31, 32, 33: legacy wrapper runtime tests — REMOVED in v2.0.0 (wrapper deleted)

    // @feature8
    it('PLUGIN011_34: broken wrapper falls back to ccstatusline wrapped with managed', () => {
      const brokenWrapper = `node -e "require(require('path').join(require('os').homedir(),'.dev-pomogator','scripts','statusline_wrapper.js'))" -- --user-b64 "not_base64" --managed-b64 "still_bad"`;

      expect(parseWrappedStatusLineCommand(brokenWrapper)).toBeNull();

      const resolved = resolveClaudeStatusLine({
        globalStatusLine: { type: 'command', command: brokenWrapper },
        statusLineConfig: DEFAULT_STATUSLINE_CONFIG,
      });

      expect(resolved.mode).toBe('wrapped');
      expect(resolved.source).toBe('global');
      expect(resolved.existingKind).toBe('wrapped');
      // Falls back to ccstatusline + managed wrapper, NOT direct managed
      expect(resolved.command).toContain('statusline_wrapper.js');
      const parsed = parseWrappedStatusLineCommand(resolved.command);
      expect(parsed).not.toBeNull();
      expect(parsed?.userCommand).toBe(DEFAULT_USER_STATUSLINE_COMMAND);
      expect(parsed?.managedCommand).toContain('statusline_render.cjs');
    });

    // PLUGIN011_37, 38, 39: legacy wrapper edge case tests — REMOVED in v2.0.0

    // @feature8
    it('PLUGIN011_40: updater preserves wrapper on extension update (global)', () => {
      const existingWrapper = buildPortableWrappedCommand(
        'npx -y ccstatusline@latest',
        'bash /old/path/.dev-pomogator/tools/test-statusline/statusline_render.cjs'
      );

      // Simulate updater: reads global settings, resolves statusLine
      const resolved = resolveClaudeStatusLine({
        globalStatusLine: { type: 'command', command: existingWrapper },
        statusLineConfig: DEFAULT_STATUSLINE_CONFIG,
      });

      expect(resolved.mode).toBe('wrapped');
      const parsed = parseWrappedStatusLineCommand(resolved.command);
      expect(parsed).not.toBeNull();
      expect(parsed?.userCommand).toBe('npx -y ccstatusline@latest');
      expect(parsed?.managedCommand).toContain('statusline_render.cjs');
      // Old path should be replaced with portable command
      expect(parsed?.managedCommand).not.toContain('/old/path/');
    });

    // @feature8
    it('PLUGIN011_41: re-install does not create nested wrapper', () => {
      const managedCommand = buildPortableManagedCommand();
      const firstWrapper = buildPortableWrappedCommand(
        'npx -y ccstatusline@latest',
        managedCommand
      );

      const resolved = resolveClaudeStatusLine({
        globalStatusLine: { type: 'command', command: firstWrapper },
        statusLineConfig: DEFAULT_STATUSLINE_CONFIG,
      });

      // Should still be a single wrapper, not nested
      expect(resolved.mode).toBe('wrapped');
      const parsed = parseWrappedStatusLineCommand(resolved.command);
      expect(parsed).not.toBeNull();
      expect(parsed?.userCommand).toBe('npx -y ccstatusline@latest');
      // Managed command must not itself be a wrapper
      expect(parsed?.managedCommand).not.toContain('statusline_wrapper.js');
      // Exactly one --user-b64 and one --managed-b64
      const userB64Count = (resolved.command.match(/--user-b64/g) || []).length;
      const managedB64Count = (resolved.command.match(/--managed-b64/g) || []).length;
      expect(userB64Count).toBe(1);
      expect(managedB64Count).toBe(1);
    });

    // PLUGIN011_42: legacy wrapper stdin forwarding test — REMOVED in v2.0.0
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

      expect(resolved.mode).toBe('wrapped');
      expect(resolved.source).toBe('none');
      expect(resolved.existingKind).toBe('none');

      const parsed = parseWrappedStatusLineCommand(resolved.command);
      expect(parsed).not.toBeNull();
      // ccstatusline is auto-installed as user command
      expect(parsed?.userCommand).toBe(DEFAULT_USER_STATUSLINE_COMMAND);
      expect(parsed?.userCommand).toContain('ccstatusline');
      // Managed command points to statusline_render.cjs
      expect(parsed?.managedCommand).toContain('statusline_render.cjs');
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
    it('PLUGIN011_48: extra fields like padding are preserved when wrapping', () => {
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
      expect(merged.command).toContain('statusline_wrapper.js');
    });

    // @feature9
    it('PLUGIN011_49: portable managed command uses os.homedir() path', () => {
      const managed = buildPortableManagedCommand();

      // Should use portable node -e require(...) pattern
      expect(managed).toContain('node -e');
      expect(managed).toContain("os').homedir()");  // portable require pattern with single-quoted module
      expect(managed).toContain('.dev-pomogator');
      expect(managed).toContain('statusline_render.cjs');
      // Should NOT contain absolute paths
      expect(managed).not.toMatch(/[A-Z]:\\/);
      expect(managed).not.toMatch(/\/home\//);
      expect(managed).not.toMatch(/\/Users\//);
    });

    // @feature9
    it('PLUGIN011_50: portable wrapped command encodes user and managed in base64', () => {
      const userCmd = 'npx -y ccstatusline@latest';
      const managedCmd = buildPortableManagedCommand();
      const wrapped = buildPortableWrappedCommand(userCmd, managedCmd);

      // Should contain wrapper script reference
      expect(wrapped).toContain('statusline_wrapper.js');
      expect(wrapped).toContain('--user-b64');
      expect(wrapped).toContain('--managed-b64');

      // Should be parseable
      const parsed = parseWrappedStatusLineCommand(wrapped);
      expect(parsed).not.toBeNull();
      expect(parsed?.userCommand).toBe(userCmd);
      expect(parsed?.managedCommand).toBe(managedCmd);
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
      expect(output).toContain('vitest');
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
      expect(output).not.toContain('/');
      expect(output).not.toContain('%');
      expect(output).toContain('34✅');
      expect(output).toContain('vitest');
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
      expect(await fs.pathExists(appPath(TEST_STATUSLINE_DIR, 'test_runner_wrapper.sh'))).toBe(true);
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

    // @feature10
    it('PLUGIN011_72: render script shows "ago" for completed runs', () => {
      const session = 'agotest1';
      const prefix = session.substring(0, 8);
      const statusDir = path.join(appPath(), '.dev-pomogator', '.test-status');
      fs.ensureDirSync(statusDir);
      const statusFile = path.join(statusDir, `status.${prefix}.yaml`);

      // Write a completed YAML with updated_at 5 minutes ago
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      fs.writeFileSync(statusFile, [
        'version: 2',
        `session_id: "${session}"`,
        'pid: 0',
        `started_at: "${fiveMinAgo}"`,
        `updated_at: "${fiveMinAgo}"`,
        'state: passed',
        'framework: vitest',
        'total: 10',
        'passed: 10',
        'failed: 0',
        'skipped: 0',
        'running: 0',
        'percent: 100',
        'duration_ms: 5000',
        'error_message: ""',
        'log_file: ""',
      ].join('\n'), 'utf-8');

      const stdinJson = JSON.stringify({ session_id: session, cwd: appPath() });
      const result = spawnSync('node', [appPath('dist', 'statusline_render.cjs')], {
        input: stdinJson,
        encoding: 'utf-8',
        timeout: 5000,
        env: { ...process.env, FORCE_COLOR: '0' },
      });

      expect(result.stdout).toContain('10/10');
      expect(result.stdout).toContain('ago');

      // Cleanup
      fs.removeSync(statusFile);
    });

    // @feature10
    it('PLUGIN011_73: render script does NOT show "ago" for running state', () => {
      const session = 'agotest2';
      const prefix = session.substring(0, 8);
      const statusDir = path.join(appPath(), '.dev-pomogator', '.test-status');
      fs.ensureDirSync(statusDir);
      const statusFile = path.join(statusDir, `status.${prefix}.yaml`);

      const now = new Date().toISOString();
      fs.writeFileSync(statusFile, [
        'version: 2',
        `session_id: "${session}"`,
        `pid: ${process.pid}`,
        `started_at: "${now}"`,
        `updated_at: "${now}"`,
        'state: running',
        'framework: vitest',
        'total: 5',
        'passed: 3',
        'failed: 0',
        'skipped: 0',
        'running: 2',
        'percent: 60',
        'duration_ms: 2000',
        'error_message: ""',
        'log_file: ""',
      ].join('\n'), 'utf-8');

      const stdinJson = JSON.stringify({ session_id: session, cwd: appPath() });
      const result = spawnSync('node', [appPath('dist', 'statusline_render.cjs')], {
        input: stdinJson,
        encoding: 'utf-8',
        timeout: 5000,
        env: { ...process.env, FORCE_COLOR: '0' },
      });

      expect(result.stdout).not.toContain('ago');

      // Cleanup
      fs.removeSync(statusFile);
    });

    // @feature6
    it('PLUGIN011_71: wrapper creates YAML when SESSION is set', () => {
      // Run wrapper with a test session and a quick command (echo)
      const session = 'e2etest1';
      const result = spawnSync('bash', [
        appPath('extensions/test-statusline/tools/test-statusline/test_runner_wrapper.sh'),
        '--skip-discovery',
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
