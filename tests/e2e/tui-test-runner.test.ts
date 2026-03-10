import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'child_process';
import { appPath } from './helpers';

// --- Paths ---

const STATUS_DIR = '.dev-pomogator/.test-status';
const FIXTURES_DIR = 'tests/fixtures/tui-test-runner';
const SESSION_HOOK = 'extensions/tui-test-runner/tools/tui-test-runner/tui_session_start.ts';
const ADAPTERS_DIR = 'extensions/tui-test-runner/tools/tui-test-runner/adapters';

// --- Helpers ---

function readFixture(name: string): string {
  return fs.readFileSync(appPath(FIXTURES_DIR, name), 'utf-8');
}

function parseYaml(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const match = line.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

function runSessionHook(
  stdinJson: Record<string, unknown>,
  env: Record<string, string> = {},
): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('npx', ['tsx', appPath(SESSION_HOOK)], {
    input: JSON.stringify(stdinJson),
    encoding: 'utf-8',
    cwd: appPath(),
    env: { ...process.env, FORCE_COLOR: '0', ...env },
    timeout: 15000,
  });
  return { stdout: result.stdout || '', stderr: result.stderr || '', status: result.status };
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

// --- @feature7: SessionStart Hook ---

describe('SessionStart Hook', () => {
  // @feature7
  it('should create status directory and exit 0', () => {
    // Remove status dir first to verify hook creates it
    fs.removeSync(testStatusDir);

    const envFile = path.join(appPath(), '.dev-pomogator', '.test-tui-env');
    const result = runSessionHook(
      { session_id: 'test1234-abcd-5678', cwd: appPath() },
      { CLAUDE_ENV_FILE: envFile },
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('{}');
    expect(fs.pathExistsSync(testStatusDir)).toBe(true);

    // Verify env vars written
    if (fs.pathExistsSync(envFile)) {
      const envContent = fs.readFileSync(envFile, 'utf-8');
      expect(envContent).toContain('TUI_TEST_RUNNER_SESSION=test1234');
      expect(envContent).toContain('TUI_TEST_RUNNER_STATUS_DIR=');
      fs.removeSync(envFile);
    }
  });

  // @feature7
  it('should handle empty stdin gracefully', () => {
    const result = spawnSync('npx', ['tsx', appPath(SESSION_HOOK)], {
      input: '',
      encoding: 'utf-8',
      cwd: appPath(),
      env: { ...process.env, FORCE_COLOR: '0' },
      timeout: 15000,
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('{}');
  });

  // @feature7
  it('should handle invalid JSON stdin gracefully', () => {
    const result = spawnSync('npx', ['tsx', appPath(SESSION_HOOK)], {
      input: 'not json',
      encoding: 'utf-8',
      cwd: appPath(),
      env: { ...process.env, FORCE_COLOR: '0' },
      timeout: 15000,
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('{}');
  });
});

// --- @feature6: YAML Fixtures Validation ---

describe('YAML Fixtures', () => {
  // @feature6
  it('yaml-v1-running.yaml should be valid v1 format', () => {
    const content = readFixture('yaml-v1-running.yaml');
    const data = parseYaml(content);

    expect(data.version).toBe('1');
    expect(data.state).toBe('running');
    expect(data.session_id).toBe('abc12345');
    expect(parseInt(data.total)).toBeGreaterThan(0);
    expect(parseInt(data.percent)).toBeGreaterThanOrEqual(0);
    expect(parseInt(data.percent)).toBeLessThanOrEqual(100);
  });

  // @feature6
  it('yaml-v2-full.yaml should contain v2 fields', () => {
    const content = readFixture('yaml-v2-full.yaml');
    const data = parseYaml(content);

    expect(data.version).toBe('2');
    expect(data.framework).toBe('vitest');
    expect(data.log_file).toBeTruthy();
    // v1 compat fields present
    expect(data.state).toBe('running');
    expect(data.session_id).toBeTruthy();
    expect(parseInt(data.total)).toBeGreaterThan(0);
    // v2 content
    expect(content).toContain('suites:');
    expect(content).toContain('phases:');
    expect(content).toContain('tests:');
  });

  // @feature6
  it('yaml-v2-full.yaml should be backward compatible with v1 reader', () => {
    const content = readFixture('yaml-v2-full.yaml');
    // Simulate statusline_render.sh: only reads flat fields via "key: value" lines
    const data = parseYaml(content);

    // All v1 fields must be present at top level
    expect(data.version).toBeTruthy();
    expect(data.session_id).toBeTruthy();
    expect(data.state).toBeTruthy();
    expect(data.total).toBeTruthy();
    expect(data.passed).toBeTruthy();
    expect(data.percent).toBeTruthy();
    expect(data.duration_ms).toBeTruthy();
  });

  // @feature6
  it('yaml-v2-failed.yaml should contain failed tests with errors', () => {
    const content = readFixture('yaml-v2-failed.yaml');
    const data = parseYaml(content);

    expect(data.state).toBe('failed');
    expect(parseInt(data.failed)).toBeGreaterThan(0);
    expect(content).toContain('error:');
    expect(content).toContain('stack:');
  });
});

// --- @feature6: Vitest Adapter ---

describe('Vitest Adapter', () => {
  // @feature6
  it('vitest-output.txt fixture should contain expected patterns', () => {
    const content = readFixture('vitest-output.txt');

    // Should contain pass/fail/skip markers
    expect(content).toMatch(/[✓√]/);    // passed
    expect(content).toMatch(/[✗×]/);    // failed
    expect(content).toMatch(/[○↓]/);    // skipped
    // Should contain summary line
    expect(content).toMatch(/Tests?\s+\d+\s+passed/);
    expect(content).toMatch(/\d+\s+failed/);
    expect(content).toMatch(/\d+\s+total/);
  });

  // @feature6
  it('adapter types.ts should export TestEvent interface', () => {
    const content = fs.readFileSync(appPath(ADAPTERS_DIR, 'types.ts'), 'utf-8');

    expect(content).toContain('export interface TestEvent');
    expect(content).toContain('export interface TestStatusV2');
    expect(content).toContain('export interface TestStatusV1');
    expect(content).toContain("type: TestEventType");
    // v2 specific
    expect(content).toContain('TestSuiteV2');
    expect(content).toContain('PhaseV2');
    expect(content).toContain('TestResultV2');
  });

  // @feature6
  it('vitest_adapter.ts should export VitestAdapter class', () => {
    const content = fs.readFileSync(appPath(ADAPTERS_DIR, 'vitest_adapter.ts'), 'utf-8');

    expect(content).toContain('export class VitestAdapter');
    expect(content).toContain('extends AdapterBase');
    expect(content).toContain('parseLine');
    // Should handle vitest patterns
    expect(content).toContain('RE_TEST_PASS');
    expect(content).toContain('RE_TEST_FAIL');
    expect(content).toContain('RE_TEST_SKIP');
    expect(content).toContain('RE_SUMMARY');
  });
});

// --- @feature6: Extension Manifest ---

describe('Extension Manifest', () => {
  it('extension.json should be valid', () => {
    const manifest = fs.readJsonSync(
      appPath('extensions/tui-test-runner/extension.json'),
    );

    expect(manifest.name).toBe('tui-test-runner');
    expect(manifest.version).toBe('1.1.0');
    expect(manifest.platforms).toContain('claude');
    expect(manifest.tools['tui-test-runner']).toBe('tools/tui-test-runner');
    expect(manifest.toolFiles).toBeInstanceOf(Array);
    expect(manifest.toolFiles.length).toBeGreaterThan(10);
    expect(manifest.hooks).toBeInstanceOf(Array);
    expect(manifest.hooks[0].event).toBe('SessionStart');
  });
});

// --- @feature9: Launcher ---

describe('Launcher', () => {
  // @feature9
  it('launcher.ts should export detection functions', () => {
    const content = fs.readFileSync(
      appPath('extensions/tui-test-runner/tools/tui-test-runner/launcher.ts'),
      'utf-8',
    );

    expect(content).toContain('export function detectPython');
    expect(content).toContain('export function checkTextual');
    expect(content).toContain('export function launchTui');
    // Fail-open
    expect(content).toContain('process.exit(0)');
  });
});

// --- @feature1: Python TUI ---

describe('Python TUI structure', () => {
  const tuiDir = 'extensions/tui-test-runner/tools/tui-test-runner/tui';

  // @feature1
  it('should have all required Python files', () => {
    const requiredFiles = [
      '__init__.py',
      '__main__.py',
      'app.py',
      'models.py',
      'yaml_reader.py',
      'log_reader.py',
      'pyproject.toml',
      'widgets/__init__.py',
      'widgets/tests_tab.py',
      'widgets/logs_tab.py',
      'widgets/monitoring_tab.py',
      'widgets/analysis_tab.py',
    ];

    for (const file of requiredFiles) {
      expect(
        fs.pathExistsSync(appPath(tuiDir, file)),
        `Missing: ${file}`,
      ).toBe(true);
    }
  });

  // @feature1
  it('app.py should define TestRunnerApp with 4 tabs', () => {
    const content = fs.readFileSync(appPath(tuiDir, 'app.py'), 'utf-8');

    expect(content).toContain('class TestRunnerApp');
    expect(content).toContain("TabPane(\"Tests\"");
    expect(content).toContain("TabPane(\"Logs\"");
    expect(content).toContain("TabPane(\"Monitoring\"");
    expect(content).toContain("TabPane(\"Analysis\"");
  });

  // @feature8
  it('yaml_reader.py should poll with mtime checking', () => {
    const content = fs.readFileSync(appPath(tuiDir, 'yaml_reader.py'), 'utf-8');

    expect(content).toContain('class YamlReader');
    expect(content).toContain('_last_mtime');
    expect(content).toContain('yaml.safe_load');
    expect(content).toContain('class StatusChanged');
  });

  // @feature3
  it('logs_tab.py should have 20+ highlight patterns', () => {
    const content = fs.readFileSync(appPath(tuiDir, 'widgets/logs_tab.py'), 'utf-8');

    expect(content).toContain('HIGHLIGHT_PATTERNS');
    // Count regex patterns
    const patternCount = (content.match(/re\.compile/g) || []).length;
    expect(patternCount).toBeGreaterThanOrEqual(20);
  });

  // @feature5
  it('analysis_tab.py should have error categorization', () => {
    const content = fs.readFileSync(appPath(tuiDir, 'widgets/analysis_tab.py'), 'utf-8');

    expect(content).toContain('ERROR_PATTERNS');
    expect(content).toContain('Assertion');
    expect(content).toContain('Timeout');
    expect(content).toContain('Connection');
    expect(content).toContain('categorize_error');
  });
});

// --- @feature12: Test Guard Hook ---

const TEST_GUARD = 'extensions/tui-test-runner/tools/tui-test-runner/test_guard.ts';

function runTestGuard(command: string, env: Record<string, string> = {}): { stdout: string; stderr: string; status: number | null } {
  const hookInput = {
    tool_name: 'Bash',
    tool_input: { command },
  };
  const result = spawnSync('npx', ['tsx', appPath(TEST_GUARD)], {
    input: JSON.stringify(hookInput),
    encoding: 'utf-8',
    cwd: appPath(),
    env: { ...process.env, FORCE_COLOR: '0', ...env },
    timeout: 15000,
  });
  return { stdout: result.stdout || '', stderr: result.stderr || '', status: result.status };
}

describe('Test Guard Hook', () => {
  // @feature12
  it('should block direct npm test', () => {
    const result = runTestGuard('npm test');
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('permissionDecision');
    expect(result.stdout).toContain('deny');
    expect(result.stdout).toContain('/run-tests');
  });

  // @feature12
  it('should block direct pytest', () => {
    const result = runTestGuard('pytest tests/');
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('deny');
  });

  // @feature12
  it('should block direct dotnet test', () => {
    const result = runTestGuard('dotnet test MyProject.Tests');
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('deny');
  });

  // @feature12
  it('should block direct cargo test', () => {
    const result = runTestGuard('cargo test');
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('deny');
  });

  // @feature12
  it('should allow commands wrapped with test_runner_wrapper', () => {
    const result = runTestGuard('bash .dev-pomogator/tools/test-statusline/test_runner_wrapper.sh npm test');
    expect(result.status).toBe(0);
  });

  // @feature12
  it('should allow non-test commands', () => {
    const result = runTestGuard('ls -la');
    expect(result.status).toBe(0);
  });

  // @feature12
  it('should allow bypass via env var', () => {
    const result = runTestGuard('npm test', { TEST_GUARD_BYPASS: '1' });
    expect(result.status).toBe(0);
  });

  // @feature12
  it('should handle empty stdin gracefully', () => {
    const result = spawnSync('npx', ['tsx', appPath(TEST_GUARD)], {
      input: '',
      encoding: 'utf-8',
      cwd: appPath(),
      env: { ...process.env, FORCE_COLOR: '0' },
      timeout: 15000,
    });
    expect(result.status).toBe(0);
  });

  // @feature12
  it('deny message should contain usage instructions', () => {
    const result = runTestGuard('npm test');
    expect(result.stdout).toContain('/run-tests');
    expect(result.stdout).toContain('auto-detect framework');
    expect(result.stdout).toContain('vitest');
    expect(result.stdout).toContain('pytest');
    expect(result.stdout).toContain('dotnet');
    expect(result.stdout).toContain('TEST_GUARD_BYPASS');
  });
});

// --- @feature14: Dispatch ---

describe('Dispatch', () => {
  // @feature14
  it('dispatch.ts should export buildTestCommand', () => {
    const content = fs.readFileSync(
      appPath('extensions/tui-test-runner/tools/tui-test-runner/dispatch.ts'),
      'utf-8',
    );
    expect(content).toContain('export function buildTestCommand');
    expect(content).toContain('DISPATCH');
    expect(content).toContain('FILTER_FORMAT');
    expect(content).toContain('test_runner_wrapper');
  });

  // @feature14
  it('dispatch.ts should support all 6 frameworks', () => {
    const content = fs.readFileSync(
      appPath('extensions/tui-test-runner/tools/tui-test-runner/dispatch.ts'),
      'utf-8',
    );
    for (const fw of ['vitest', 'jest', 'pytest', 'dotnet', 'rust', 'go']) {
      expect(content).toContain(fw);
    }
  });

  // @feature14
  it('config.ts should detect Rust and Go', () => {
    const content = fs.readFileSync(
      appPath('extensions/tui-test-runner/tools/tui-test-runner/config.ts'),
      'utf-8',
    );
    expect(content).toContain('Cargo.toml');
    expect(content).toContain('go.mod');
  });
});

// --- @feature11: Skill ---

describe('Skill /run-tests', () => {
  // @feature11
  it('SKILL.md should exist with correct frontmatter', () => {
    const content = fs.readFileSync(
      appPath('extensions/tui-test-runner/skills/run-tests/SKILL.md'),
      'utf-8',
    );
    expect(content).toContain('name: run-tests');
    expect(content).toContain('allowed-tools:');
    expect(content).toContain('Bash');
    expect(content).toContain('/run-tests');
    expect(content).toContain('test_runner_wrapper');
  });

  // @feature13
  it('Rule centralized-test-runner.md should exist', () => {
    const content = fs.readFileSync(
      appPath('.claude/rules/centralized-test-runner.md'),
      'utf-8',
    );
    expect(content).toContain('/run-tests');
    expect(content).toContain('test_runner_wrapper');
    expect(content).toContain('TEST_GUARD_BYPASS');
  });
});
