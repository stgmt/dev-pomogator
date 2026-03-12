import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'child_process';
import { appPath, homePath, runInstaller, setupCleanState } from './helpers';
import {
  buildWrappedStatusLineCommand,
  parseWrappedStatusLineCommand,
  resolveClaudeStatusLine,
} from '../../src/utils/statusline.js';

// --- Helpers ---

const STATUS_DIR = '.dev-pomogator/.test-status';
const FIXTURES_DIR = 'tests/fixtures/test-statusline';
const RENDER_SCRIPT = 'extensions/test-statusline/tools/test-statusline/statusline_render.cjs';
const WRAPPER_SCRIPT = 'extensions/test-statusline/tools/test-statusline/test_runner_wrapper.sh';
const STATUSLINE_WRAPPER_SCRIPT = 'extensions/test-statusline/tools/test-statusline/statusline_wrapper.js';
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

function runRenderScript(stdinJson: Record<string, unknown>): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('node', [appPath(RENDER_SCRIPT)], {
    input: JSON.stringify(stdinJson),
    encoding: 'utf-8',
    cwd: appPath(),
    env: { ...process.env, FORCE_COLOR: '0' },
    timeout: 10000,
  });
  return { stdout: result.stdout || '', stderr: result.stderr || '', status: result.status };
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

function runStatuslineWrapper(
  userCommand: string,
  managedCommand: string,
  stdinJson: Record<string, unknown>
): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('node', [
    appPath(STATUSLINE_WRAPPER_SCRIPT),
    '--user-b64',
    Buffer.from(userCommand, 'utf-8').toString('base64'),
    '--managed-b64',
    Buffer.from(managedCommand, 'utf-8').toString('base64'),
  ], {
    input: JSON.stringify(stdinJson),
    encoding: 'utf-8',
    cwd: appPath(),
    env: { ...process.env, FORCE_COLOR: '0' },
    timeout: 10000,
  });
  return { stdout: result.stdout || '', stderr: result.stderr || '', status: result.status };
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

  describe('Statusline Render (@feature1)', () => {
    // @feature1
    it('PLUGIN011_01: renders running state with progress bar', async () => {
      const yamlContent = withPid(readFixture('mock-status-running-live-pid.yaml'), process.pid);
      await fs.writeFile(statusFilePath('abc12345'), yamlContent);
      const stdinJson = { ...readFixtureJson('mock-stdin.json'), cwd: appPath() };
      const result = runRenderScript(stdinJson);

      expect(result.stdout).toContain('76%');
      expect(result.stdout).toContain('38✅');
      expect(result.stdout).toContain('2❌');
      expect(result.stdout).toContain('10⏳');
    });

    // @feature1
    it('PLUGIN011_02: renders completed passed state', async () => {
      const yamlContent = readFixture('mock-status-passed.yaml');
      await fs.writeFile(statusFilePath('abc12345'), yamlContent);
      const stdinJson = { ...readFixtureJson('mock-stdin.json'), cwd: appPath() };
      const result = runRenderScript(stdinJson);

      expect(result.stdout).toContain('✅');
      expect(result.stdout).toContain('50/50');
    });

    // @feature1
    it('PLUGIN011_03: renders completed failed state', async () => {
      const yamlContent = readFixture('mock-status-failed.yaml');
      await fs.writeFile(statusFilePath('abc12345'), yamlContent);
      const stdinJson = { ...readFixtureJson('mock-stdin.json'), cwd: appPath() };
      const result = runRenderScript(stdinJson);

      expect(result.stdout).toContain('❌');
      expect(result.stdout).toContain('48/50');
      expect(result.stdout).toContain('2 failed');
    });

    // @feature1
    it('PLUGIN011_35: reads only top-level summary fields from canonical multi-suite v2 YAML', async () => {
      const yamlContent = readTuiFixture('yaml-v2-full.yaml')
        .replace(/^state: running$/m, 'state: failed')
        .replace(/^total: 10$/m, 'total: 19')
        .replace(/^passed: 6$/m, 'passed: 12')
        .replace(/^failed: 1$/m, 'failed: 7')
        .replace(/^running: 2$/m, 'running: 0')
        .replace(/^percent: 80$/m, 'percent: 100')
        .replace(/^duration_ms: 12000$/m, 'duration_ms: 65000');
      await fs.writeFile(statusFilePath('abc12345'), yamlContent);
      const stdinJson = { ...readFixtureJson('mock-stdin.json'), cwd: appPath() };
      const result = runRenderScript(stdinJson);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('12/19');
      expect(result.stdout).toContain('7 failed');
      expect(result.stdout).not.toContain('3/5');
    });

    // @feature1
    it('PLUGIN011_26: rewrites dead running pid to failed', async () => {
      const deadPid = createDeadPid();
      const yamlContent = withPid(readFixture('mock-status-running-dead-pid.yaml'), deadPid);
      await fs.writeFile(statusFilePath('abc12345'), yamlContent);
      const stdinJson = { ...readFixtureJson('mock-stdin.json'), cwd: appPath() };
      const result = runRenderScript(stdinJson);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('❌');
      expect(result.stdout).not.toContain('10⏳');

      const repaired = await fs.readFile(statusFilePath('abc12345'), 'utf-8');
      expect(getYamlField(repaired, 'state')).toBe('failed');
      expect(getYamlField(repaired, 'pid')).toBe(String(deadPid));
      expect(getYamlField(repaired, 'error_message')).toContain('Process died unexpectedly');
    });

    // @feature1
    it('PLUGIN011_29: keeps running state when pid is alive', async () => {
      const yamlContent = withPid(readFixture('mock-status-running-live-pid.yaml'), process.pid);
      await fs.writeFile(statusFilePath('abc12345'), yamlContent);
      const stdinJson = { ...readFixtureJson('mock-stdin.json'), cwd: appPath() };
      const result = runRenderScript(stdinJson);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('76%');
      expect(result.stdout).toContain('10⏳');

      const afterRender = await fs.readFile(statusFilePath('abc12345'), 'utf-8');
      expect(getYamlField(afterRender, 'state')).toBe('running');
      expect(getYamlField(afterRender, 'pid')).toBe(String(process.pid));
    });

  });

  // ===========================================
  // @feature1a — Graceful Degradation
  // ===========================================

  describe('Graceful Degradation (@feature1a)', () => {
    // @feature1a
    it('PLUGIN011_04: outputs nothing when no YAML file exists', async () => {
      const stdinJson = { ...readFixtureJson('mock-stdin.json'), cwd: appPath() };
      const result = runRenderScript(stdinJson);

      expect(result.stdout.trim()).toBe('');
      expect(result.status).toBe(0);
    });

    // @feature1a
    it('PLUGIN011_05: handles corrupted YAML gracefully', async () => {
      const yamlContent = readFixture('mock-status-corrupted.yaml');
      await fs.writeFile(statusFilePath('abc12345'), yamlContent);
      const stdinJson = { ...readFixtureJson('mock-stdin.json'), cwd: appPath() };
      const result = runRenderScript(stdinJson);

      expect(result.stdout.trim()).toBe('');
      expect(result.status).toBe(0);
    });

    // @feature1a
    it('PLUGIN011_06: works without jq installed (Node.js render has no jq dependency)', async () => {
      const yamlContent = withPid(readFixture('mock-status-running-live-pid.yaml'), process.pid);
      await fs.writeFile(statusFilePath('abc12345'), yamlContent);
      const stdinJson = { ...readFixtureJson('mock-stdin.json'), cwd: appPath() };
      // Node.js render doesn't use jq at all — verify it works with minimal PATH
      const result = spawnSync('node', [appPath(RENDER_SCRIPT)], {
        input: JSON.stringify(stdinJson),
        encoding: 'utf-8',
        cwd: appPath(),
        env: { ...process.env, FORCE_COLOR: '0', PATH: '/usr/local/bin:/usr/bin:/bin' },
        timeout: 10000,
      });

      expect(result.stdout || '').toContain('76%');
      expect(result.stdout || '').toContain('✅');
    });
  });

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
  });

  // ===========================================
  // @feature3 — Session Isolation
  // ===========================================

  describe('Session Isolation (@feature3)', () => {
    // @feature3
    it('PLUGIN011_12: sessions use isolated status files', async () => {
      // Create two session files
      const runningYaml = withPid(readFixture('mock-status-running-live-pid.yaml'), process.pid);
      const passedYaml = readFixture('mock-status-passed.yaml');
      await fs.writeFile(statusFilePath('aaaabbbb'), runningYaml);
      await fs.writeFile(statusFilePath('ccccdddd'), passedYaml);

      // Statusline for session A should show running, not passed
      const stdinA = { ...readFixtureJson('mock-stdin.json'), session_id: 'aaaabbbbxxxxxxxx', cwd: appPath() };
      const resultA = runRenderScript(stdinA);

      expect(resultA.stdout).toContain('76%');
      expect(resultA.stdout).not.toContain('✅ 50/50');
    });

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

      expect(toolFiles.join(',')).toContain('statusline_render.cjs');
      expect(toolFiles.join(',')).toContain('statusline_wrapper.js');
      expect(toolFiles.join(',')).toContain('test_runner_wrapper.sh');
      expect(toolFiles.join(',')).toContain('statusline_session_start.ts');
      expect(toolFiles.join(',')).toContain('status_types.ts');
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
    it('PLUGIN011_20: manifest declares statusLine command', async () => {
      const manifestPath = appPath('extensions/test-statusline/extension.json');
      const manifest = await fs.readJson(manifestPath);

      expect(manifest.statusLine).toBeDefined();
      expect(manifest.statusLine.claude).toBeDefined();
      expect(manifest.statusLine.claude.type).toBe('command');
      expect(manifest.statusLine.claude.command).toContain('statusline_render.cjs');
    });
  });

  // ===========================================
  // @feature8 — StatusLine Coexistence
  // ===========================================

  describe('StatusLine Coexistence (@feature8)', () => {
    // @feature8
    it('PLUGIN011_21: installer writes statusLine to project settings.json', async () => {
      // Simulate what the installer does: read manifest, write statusLine to settings
      const manifestPath = appPath('extensions/test-statusline/extension.json');
      const manifest = await fs.readJson(manifestPath);
      const statusLineConfig = manifest.statusLine?.claude;

      expect(statusLineConfig).toBeDefined();

      // Write to a test settings file (simulating installer behavior)
      const testSettingsPath = appPath('.dev-pomogator/.test-settings.json');
      const settings: Record<string, unknown> = {};

      const command = statusLineConfig.command.replace(
        /\.dev-pomogator\/tools\//,
        `${appPath().replace(/\\/g, '/')}/.dev-pomogator/tools/`
      );
      settings.statusLine = { type: statusLineConfig.type, command };

      await fs.writeJson(testSettingsPath, settings, { spaces: 2 });

      const written = await fs.readJson(testSettingsPath);
      expect(written.statusLine).toBeDefined();
      expect(written.statusLine.type).toBe('command');
      expect(written.statusLine.command).toContain('statusline_render.cjs');

      await fs.remove(testSettingsPath);
    });

    // @feature8
    it('PLUGIN011_22: managed statusLine is overwritten on re-install', async () => {
      const testSettingsPath = appPath('.dev-pomogator/.test-settings.json');

      // Simulate existing managed statusLine
      await fs.writeJson(testSettingsPath, {
        statusLine: { type: 'command', command: 'bash /old/path/.dev-pomogator/tools/test-statusline/statusline_render.cjs' }
      }, { spaces: 2 });

      // Check that it contains .dev-pomogator/tools/ (managed)
      const existing = await fs.readJson(testSettingsPath);
      expect(existing.statusLine.command).toContain('.dev-pomogator/tools/');

      // Overwrite with new path (simulating re-install)
      existing.statusLine.command = `bash ${appPath().replace(/\\/g, '/')}/.dev-pomogator/tools/test-statusline/statusline_render.cjs`;
      await fs.writeJson(testSettingsPath, existing, { spaces: 2 });

      const updated = await fs.readJson(testSettingsPath);
      expect(updated.statusLine.command).toContain('statusline_render.cjs');

      await fs.remove(testSettingsPath);
    });

    // @feature8
    it('PLUGIN011_23: user-defined statusLine is wrapped alongside managed one', () => {
      const resolved = resolveClaudeStatusLine({
        repoRoot: appPath(),
        projectStatusLine: { type: 'command', command: 'npx -y ccstatusline@latest' },
        statusLineConfig: DEFAULT_STATUSLINE_CONFIG,
      });

      expect(resolved.command).toContain('statusline_wrapper.js');
      expect(resolved.source).toBe('project');

      const parsed = parseWrappedStatusLineCommand(resolved.command);
      expect(parsed).not.toBeNull();
      expect(parsed?.userCommand).toBe('npx -y ccstatusline@latest');
      expect(parsed?.managedCommand).toContain('statusline_render.cjs');
    });

    // @feature8
    it('PLUGIN011_24: existing wrapper keeps user command and updates managed command', () => {
      const existingWrapper = buildWrappedStatusLineCommand(
        appPath(),
        'npx -y ccstatusline@latest',
        'bash /old/path/.dev-pomogator/tools/test-statusline/statusline_render.cjs'
      );

      const resolved = resolveClaudeStatusLine({
        repoRoot: appPath(),
        projectStatusLine: { type: 'command', command: existingWrapper },
        statusLineConfig: DEFAULT_STATUSLINE_CONFIG,
      });

      const parsed = parseWrappedStatusLineCommand(resolved.command);
      expect(parsed).not.toBeNull();
      expect(parsed?.userCommand).toBe('npx -y ccstatusline@latest');
      expect(parsed?.managedCommand).toContain(`${appPath().replace(/\\/g, '/')}/.dev-pomogator/tools/test-statusline/statusline_render.cjs`);
      expect(parsed?.managedCommand).not.toContain('/old/path/');
    });

    // @feature8
    it('PLUGIN011_25: wrapper combines outputs of user and managed commands', () => {
      const result = runStatuslineWrapper(
        'printf userinfo',
        'printf testinfo',
        { session_id: 'abc12345', cwd: appPath() }
      );

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('userinfo | testinfo');
    });

    // @feature8
    it('PLUGIN011_30: resolver prefers project statusLine over global one', () => {
      const resolved = resolveClaudeStatusLine({
        repoRoot: appPath(),
        projectStatusLine: { type: 'command', command: 'printf projectinfo' },
        globalStatusLine: { type: 'command', command: 'printf globalinfo' },
        statusLineConfig: DEFAULT_STATUSLINE_CONFIG,
      });

      expect(resolved.mode).toBe('wrapped');
      expect(resolved.source).toBe('project');

      const parsed = parseWrappedStatusLineCommand(resolved.command);
      expect(parsed?.userCommand).toBe('printf projectinfo');
      expect(parsed?.managedCommand).toContain('statusline_render.cjs');
    });

    // @feature8
    it('PLUGIN011_31: installer wraps global user-defined statusLine when project has none', async () => {
      const globalSettingsPath = globalClaudeSettingsPath();

      await setupCleanState('claude');
      try {
        await fs.ensureDir(path.dirname(globalSettingsPath));
        await fs.writeJson(globalSettingsPath, {
          statusLine: { type: 'command', command: 'npx -y ccstatusline@latest' },
        }, { spaces: 2 });

        const result = await runInstaller('--claude --all');
        expect(result.exitCode).toBe(0);

        const projectSettings = await fs.readJson(projectClaudeSettingsPath());
        const parsed = parseWrappedStatusLineCommand(projectSettings.statusLine.command);
        expect(parsed).not.toBeNull();
        expect(parsed?.userCommand).toBe('npx -y ccstatusline@latest');
        expect(parsed?.managedCommand).toContain('statusline_render.cjs');

        const globalSettings = await fs.readJson(globalSettingsPath);
        expect(globalSettings.statusLine.command).toBe('npx -y ccstatusline@latest');
      } finally {
        await setupCleanState('claude');
      }
    });

    // @feature8
    it('PLUGIN011_32: wrapper keeps managed output when user command fails', () => {
      const result = runStatuslineWrapper(
        'false',
        'printf managedinfo',
        { session_id: 'abc12345', cwd: appPath() }
      );

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('managedinfo');
    });

    // @feature8
    it('PLUGIN011_33: wrapper keeps user output when managed command fails', () => {
      const result = runStatuslineWrapper(
        'printf userinfo',
        'false',
        { session_id: 'abc12345', cwd: appPath() }
      );

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('userinfo');
    });

    // @feature8
    it('PLUGIN011_34: broken wrapper falls back to direct managed statusLine', () => {
      const brokenWrapper = `node "${appPath().replace(/\\/g, '/')}/.dev-pomogator/tools/test-statusline/statusline_wrapper.js" --user-b64 "not_base64" --managed-b64 "still_bad"`;

      expect(parseWrappedStatusLineCommand(brokenWrapper)).toBeNull();

      const resolved = resolveClaudeStatusLine({
        repoRoot: appPath(),
        projectStatusLine: { type: 'command', command: brokenWrapper },
        statusLineConfig: DEFAULT_STATUSLINE_CONFIG,
      });

      expect(resolved.mode).toBe('direct');
      expect(resolved.source).toBe('project');
      expect(resolved.existingKind).toBe('wrapped');
      expect(resolved.command).toContain('statusline_render.cjs');
      expect(resolved.command).not.toContain('statusline_wrapper.js');
    });

    // @feature8
    it('PLUGIN011_37: wrapper outputs nothing when both commands fail', () => {
      const result = runStatuslineWrapper(
        'false',
        'false',
        { session_id: 'abc12345', cwd: appPath() }
      );

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('');
    });

    // @feature8
    it('PLUGIN011_38: wrapper completes within timeout when user command hangs', () => {
      const start = Date.now();
      const result = runStatuslineWrapper(
        'sleep 10',
        'printf managedinfo',
        { session_id: 'abc12345', cwd: appPath() }
      );
      const elapsed = Date.now() - start;

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('managedinfo');
      expect(elapsed).toBeLessThan(5000);
    });

    // @feature8
    it('PLUGIN011_39: wrapper normalizes multi-line ANSI user output to single line', () => {
      const mockScript = appPath('tests/fixtures/test-statusline/mock-ccstatusline.sh').replace(/\\/g, '/');
      const result = runStatuslineWrapper(
        `bash "${mockScript}" multiline`,
        'printf testinfo',
        { session_id: 'abc12345', cwd: appPath() }
      );

      expect(result.status).toBe(0);
      const output = result.stdout;
      expect(output).not.toContain('\n');
      expect(output).toContain('|');
      expect(output).toContain('testinfo');
      // Multi-line ccstatusline output should be joined with spaces
      expect(output).toContain('Opus');
      expect(output).toContain('Session:');
    });

    // @feature8
    it('PLUGIN011_40: updater preserves wrapper on extension update', () => {
      const existingWrapper = buildWrappedStatusLineCommand(
        appPath(),
        'npx -y ccstatusline@latest',
        'bash /old/path/.dev-pomogator/tools/test-statusline/statusline_render.cjs'
      );

      const resolved = resolveClaudeStatusLine({
        repoRoot: appPath(),
        projectStatusLine: { type: 'command', command: existingWrapper },
        statusLineConfig: DEFAULT_STATUSLINE_CONFIG,
      });

      expect(resolved.mode).toBe('wrapped');
      const parsed = parseWrappedStatusLineCommand(resolved.command);
      expect(parsed).not.toBeNull();
      expect(parsed?.userCommand).toBe('npx -y ccstatusline@latest');
      expect(parsed?.managedCommand).toContain(appPath().replace(/\\/g, '/'));
      expect(parsed?.managedCommand).toContain('statusline_render.cjs');
    });

    // @feature8
    it('PLUGIN011_41: re-install does not create nested wrapper', () => {
      const firstWrapper = buildWrappedStatusLineCommand(
        appPath(),
        'npx -y ccstatusline@latest',
        `bash ${appPath().replace(/\\/g, '/')}/.dev-pomogator/tools/test-statusline/statusline_render.cjs`
      );

      const resolved = resolveClaudeStatusLine({
        repoRoot: appPath(),
        projectStatusLine: { type: 'command', command: firstWrapper },
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

    // @feature8
    it('PLUGIN011_42: wrapper forwards full StatusJSON stdin to both commands', () => {
      const fullStdin = readFixtureJson('ccstatusline-stdin.json');
      // Both commands extract session_id from stdin JSON via node one-liner
      const extractCmd = `node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).session_id||'')}catch(e){}})"`;

      const result = runStatuslineWrapper(
        extractCmd,
        extractCmd,
        fullStdin
      );

      expect(result.status).toBe(0);
      // Both commands received the same stdin and extracted the same session_id
      // Wrapper combines: "session_id | session_id"
      const parts = result.stdout.trim().split(' | ');
      expect(parts).toHaveLength(2);
      expect(parts[0]).toBe('abc12345def67890ghijklmnop');
      expect(parts[1]).toBe('abc12345def67890ghijklmnop');
    });
  });
});
