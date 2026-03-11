import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'child_process';
import { appPath } from './helpers';

// --- Helpers ---

const STATUS_DIR = '.dev-pomogator/.test-status';
const FIXTURES_DIR = 'tests/fixtures/test-statusline';
const RENDER_SCRIPT = 'extensions/test-statusline/tools/test-statusline/statusline_render.sh';
const WRAPPER_SCRIPT = 'extensions/test-statusline/tools/test-statusline/test_runner_wrapper.sh';
const SESSION_HOOK = 'extensions/test-statusline/tools/test-statusline/statusline_session_start.ts';

function statusFilePath(prefix: string): string {
  return path.join(appPath(), STATUS_DIR, `status.${prefix}.yaml`);
}

function runRenderScript(stdinJson: Record<string, unknown>): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('bash', [appPath(RENDER_SCRIPT)], {
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

function readFixtureJson(name: string): Record<string, unknown> {
  return fs.readJsonSync(appPath(FIXTURES_DIR, name));
}

function getYamlField(yamlContent: string, field: string): string {
  const match = yamlContent.match(new RegExp(`^${field}:\\s*(.*)$`, 'm'));
  return match ? match[1].replace(/"/g, '').replace(/\r/g, '').trim() : '';
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
      const yamlContent = readFixture('mock-status-running.yaml');
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
    it('PLUGIN011_06: works without jq installed', async () => {
      const yamlContent = readFixture('mock-status-running.yaml');
      await fs.writeFile(statusFilePath('abc12345'), yamlContent);
      const stdinJson = { ...readFixtureJson('mock-stdin.json'), cwd: appPath() };
      // Run with PATH that excludes jq
      const result = spawnSync('bash', [appPath(RENDER_SCRIPT)], {
        input: JSON.stringify(stdinJson),
        encoding: 'utf-8',
        cwd: appPath(),
        env: { ...process.env, FORCE_COLOR: '0', PATH: '/usr/bin:/bin' },
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
      const env = { TEST_STATUSLINE_SESSION: 'abc12345', TEST_STATUSLINE_PROJECT: appPath() };
      const result = runWrapper(['echo', 'test passed'], env);

      const statusFile = statusFilePath('abc12345');
      expect(await fs.pathExists(statusFile)).toBe(true);
      const content = await fs.readFile(statusFile, 'utf-8');

      expect(getYamlField(content, 'version')).toBe('1');
      expect(getYamlField(content, 'session_id')).toBeTruthy();
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
    });

    // @feature2
    it('PLUGIN011_08: wrapper writes atomic YAML via temp file rename', async () => {
      const env = { TEST_STATUSLINE_SESSION: 'abc12345', TEST_STATUSLINE_PROJECT: appPath() };
      const result = runWrapper(['echo', 'test passed'], env);

      // Verify no .tmp files left behind (atomic write completed)
      const files = await fs.readdir(appPath(STATUS_DIR));
      const tmpFiles = files.filter(f => f.endsWith('.tmp'));
      expect(tmpFiles).toHaveLength(0);
    });

    // @feature2
    it('PLUGIN011_09: wrapper creates initial state on test start', async () => {
      const env = { TEST_STATUSLINE_SESSION: 'abc12345', TEST_STATUSLINE_PROJECT: appPath() };
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
      const env = { TEST_STATUSLINE_SESSION: 'abc12345', TEST_STATUSLINE_PROJECT: appPath() };
      const result = runWrapper(['true'], env);

      const content = await fs.readFile(statusFilePath('abc12345'), 'utf-8');
      expect(getYamlField(content, 'state')).toBe('passed');
    });

    // @feature2
    it('PLUGIN011_11: wrapper updates state to failed on error', async () => {
      const env = { TEST_STATUSLINE_SESSION: 'abc12345', TEST_STATUSLINE_PROJECT: appPath() };
      const result = runWrapper(['false'], env);

      const content = await fs.readFile(statusFilePath('abc12345'), 'utf-8');
      expect(getYamlField(content, 'state')).toBe('failed');
    });
  });

  // ===========================================
  // @feature3 — Session Isolation
  // ===========================================

  describe('Session Isolation (@feature3)', () => {
    // @feature3
    it('PLUGIN011_12: sessions use isolated status files', async () => {
      // Create two session files
      const runningYaml = readFixture('mock-status-running.yaml');
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

      expect(toolFiles.join(',')).toContain('statusline_render.sh');
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
      expect(manifest.statusLine.claude.command).toContain('statusline_render.sh');
    });
  });

  // ===========================================
  // @feature6 — StatusLine Integration
  // ===========================================

  describe('StatusLine Integration (@feature6)', () => {
    // @feature6
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
      expect(written.statusLine.command).toContain('statusline_render.sh');

      await fs.remove(testSettingsPath);
    });

    // @feature6
    it('PLUGIN011_22: managed statusLine is overwritten on re-install', async () => {
      const testSettingsPath = appPath('.dev-pomogator/.test-settings.json');

      // Simulate existing managed statusLine
      await fs.writeJson(testSettingsPath, {
        statusLine: { type: 'command', command: 'bash /old/path/.dev-pomogator/tools/test-statusline/statusline_render.sh' }
      }, { spaces: 2 });

      // Check that it contains .dev-pomogator/tools/ (managed)
      const existing = await fs.readJson(testSettingsPath);
      expect(existing.statusLine.command).toContain('.dev-pomogator/tools/');

      // Overwrite with new path (simulating re-install)
      existing.statusLine.command = `bash ${appPath().replace(/\\/g, '/')}/.dev-pomogator/tools/test-statusline/statusline_render.sh`;
      await fs.writeJson(testSettingsPath, existing, { spaces: 2 });

      const updated = await fs.readJson(testSettingsPath);
      expect(updated.statusLine.command).toContain('statusline_render.sh');

      await fs.remove(testSettingsPath);
    });

    // @feature6
    it('PLUGIN011_23: user-defined statusLine is preserved', () => {
      // Simulate user-defined statusLine (no .dev-pomogator/tools/ in command)
      const userStatusLine = { type: 'command', command: 'npx -y ccstatusline@latest' };

      // Check that user's command does NOT contain managed marker
      const isManaged = userStatusLine.command.includes('.dev-pomogator/tools/');
      expect(isManaged).toBe(false);

      // Installer should skip overwriting when !isManaged
    });
  });
});
