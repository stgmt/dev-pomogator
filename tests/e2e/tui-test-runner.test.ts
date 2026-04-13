import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';
import { parse as parseYaml } from 'yaml';
import { appPath, getPythonRunner, runPythonJson, runTsx } from './helpers';

const STATUS_DIR = '.dev-pomogator/.test-status';
const FIXTURES_DIR = 'tests/fixtures/tui-test-runner';
// Use installed path where _shared/hook-utils.js is available (extensions/ lacks _shared/ at this level)
const SESSION_HOOK = '.dev-pomogator/tools/tui-test-runner/tui_session_start.ts';
const WRAPPER = 'extensions/tui-test-runner/tools/tui-test-runner/test_runner_wrapper.ts';
const TUI_ROOT = 'extensions/tui-test-runner/tools/tui-test-runner';

let testStatusDir: string;

const ANALYZE_STATUS_SCRIPT = fs.readFileSync(path.join(__dirname, '../fixtures/tui-test-runner/analyze-status-script.py'), 'utf-8');
const STRICT_MODEL_SCRIPT = fs.readFileSync(path.join(__dirname, '../fixtures/tui-test-runner/strict-model-validator.py'), 'utf-8');
const LOG_READER_SCRIPT = fs.readFileSync(path.join(__dirname, '../fixtures/tui-test-runner/log-reader-script.py'), 'utf-8');

beforeEach(async () => {
  testStatusDir = appPath(STATUS_DIR);
  await fs.ensureDir(testStatusDir);
});

afterEach(async () => {
  if (await fs.pathExists(testStatusDir)) {
    await fs.remove(testStatusDir);
  }
});

function readFixture(name: string): string {
  return fs.readFileSync(appPath(FIXTURES_DIR, name), 'utf-8');
}

function runSessionHook(
  stdinJson: Record<string, unknown>,
  env: Record<string, string> = {},
) {
  return runTsx(SESSION_HOOK, { input: stdinJson, env });
}

function runWrapper(
  args: string[],
  env: Record<string, string> = {},
) {
  return runTsx(WRAPPER, { args, env, timeout: 20000 });
}

async function importAdapterModule(relativePath: string) {
  return import(pathToFileURL(appPath(relativePath)).href);
}

function writeTempStatus(name: string, content: string): string {
  const filePath = appPath(STATUS_DIR, name);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

describe('PLUGIN012: TUI Test Runner', () => {
  describe('SessionStart Hook', () => {
    // @feature7
    it('writes canonical TEST_STATUSLINE env contract', () => {
      const envFile = path.join(appPath(), '.dev-pomogator', '.test-tui-env');
      const result = runSessionHook(
        { session_id: 'test1234-abcd-5678', cwd: appPath() },
        { CLAUDE_ENV_FILE: envFile },
      );

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('{}');
      expect(fs.pathExistsSync(testStatusDir)).toBe(true);

      const envContent = fs.readFileSync(envFile, 'utf-8');
      expect(envContent).toContain('TEST_STATUSLINE_SESSION=test1234');
      expect(envContent).toContain(`TEST_STATUSLINE_PROJECT=${appPath()}`);

      fs.removeSync(envFile);
    });
  });

  describe('Canonical Fixtures', () => {
    // @feature6
    it('yaml-v2-running.yaml is a canonical v2 status fixture', () => {
      const data = parseYaml(readFixture('yaml-v2-running.yaml')) as Record<string, unknown>;

      expect(data.version).toBe(2);
      expect(data.framework).toBe('vitest');
      expect(data.session_id).toBe('abc12345');
      expect(data.pid).toBeTruthy();
      expect(data.log_file).toBeTruthy();
      expect(data.suites).toEqual([]);
      expect(data.phases).toEqual([]);
    });

    // @feature6
    it('yaml-v2-full.yaml keeps top-level summary alongside suites and phases', () => {
      const data = parseYaml(readFixture('yaml-v2-full.yaml')) as Record<string, any>;

      expect(data.version).toBe(2);
      expect(data.total).toBe(10);
      expect(data.passed).toBe(6);
      expect(data.failed).toBe(1);
      expect(data.running).toBe(2);
      expect(Array.isArray(data.suites)).toBe(true);
      expect(data.suites[0].tests[1].error).toContain('AssertionError');
      expect(Array.isArray(data.phases)).toBe(true);
    });

    // @feature6
    it('YamlWriter keeps live counters accurate and round-trips escaped payloads', async () => {
      const { YamlWriter } = await importAdapterModule(
        'extensions/tui-test-runner/tools/tui-test-runner/yaml_writer.ts',
      );

      const statusPath = appPath(STATUS_DIR, 'status.writer.yaml');
      const logPath = String.raw`C:\tmp\test-output.log`;
      const suiteFile = String.raw`C:\repo\tests\auth.test.ts`;
      const writer = new YamlWriter(statusPath, 'abc12345', 'vitest', logPath, 0, 4321);
      writer.setDiscoveryTotal(2); // simulate pre-discovery found 2 tests
      writer.markRunning(); // simulate wrapper transition building → running

      writer.processEvent({
        type: 'suite_start',
        suiteName: 'auth',
        suiteFile,
        timestamp: new Date().toISOString(),
      });
      writer.processEvent({
        type: 'test_start',
        suiteName: 'auth',
        suiteFile,
        testName: 'should keep running',
        timestamp: new Date().toISOString(),
      });
      writer.processEvent({
        type: 'test_pass',
        suiteName: 'auth',
        suiteFile,
        testName: 'should already pass',
        duration: 5,
        timestamp: new Date().toISOString(),
      });
      writer.write();

      const live = parseYaml(await fs.readFile(statusPath, 'utf-8')) as Record<string, any>;
      expect(live.total).toBe(2);
      expect(live.passed).toBe(1);
      expect(live.running).toBe(1);
      expect(live.percent).toBe(50);

      writer.processEvent({
        type: 'test_fail',
        suiteName: 'auth',
        suiteFile,
        testName: 'should keep running',
        duration: 12,
        errorMessage: 'Assertion "path" failed',
        stackTrace: `Error: boom\n    at ${suiteFile}:42:5`,
        timestamp: new Date().toISOString(),
      });
      writer.finalize(1);

      const finalStatus = parseYaml(await fs.readFile(statusPath, 'utf-8')) as Record<string, any>;
      expect(finalStatus.version).toBe(2);
      expect(finalStatus.pid).toBe(4321);
      expect(finalStatus.log_file).toBe(logPath);
      expect(finalStatus.state).toBe('failed');
      expect(finalStatus.total).toBe(2);
      expect(finalStatus.failed).toBe(1);
      expect(finalStatus.percent).toBe(100); // 100% = all tests completed (percent is completion, not success rate)
      expect(finalStatus.suites[0].file).toBe(suiteFile);
      expect(finalStatus.suites[0].tests[0].stack).toContain(suiteFile);
      expect(finalStatus.suites[0].tests[0].error).toBe('Assertion "path" failed');
    });

    // @feature11
    it('YamlWriter.write() is no-op after finalize() — duration frozen', async () => {
      const { YamlWriter } = await importAdapterModule(
        'extensions/tui-test-runner/tools/tui-test-runner/yaml_writer.ts',
      );

      const statusPath = appPath(STATUS_DIR, 'status.frozen.yaml');
      const writer = new YamlWriter(statusPath, 'frozen01', 'vitest', 'log.txt', 0, 9999);

      writer.processEvent({
        type: 'test_pass',
        suiteName: 'suite',
        testName: 'test1',
        duration: 100,
        timestamp: new Date().toISOString(),
      });
      writer.finalize(0);

      const afterFinalize = parseYaml(await fs.readFile(statusPath, 'utf-8')) as Record<string, any>;
      const frozenDuration = afterFinalize.duration_ms;
      const frozenState = afterFinalize.state;

      expect(frozenState).toBe('passed');
      expect(frozenDuration).toBeGreaterThanOrEqual(0);

      // Attempt writes after finalize — should be no-ops
      writer.write();
      writer.writeIfNeeded();

      const afterExtraWrites = parseYaml(await fs.readFile(statusPath, 'utf-8')) as Record<string, any>;
      expect(afterExtraWrites.duration_ms).toBe(frozenDuration);
      expect(afterExtraWrites.state).toBe('passed');
    });

    // @feature12
    it('YamlWriter uses discoveryTotal for real progress during running', async () => {
      const { YamlWriter } = await importAdapterModule(
        'extensions/tui-test-runner/tools/tui-test-runner/yaml_writer.ts',
      );

      const statusPath = appPath(STATUS_DIR, 'status.discovery.yaml');
      const writer = new YamlWriter(statusPath, 'discov01', 'vitest', 'log.txt', 0, 9999);
      writer.setDiscoveryTotal(100);
      writer.markRunning(); // simulate wrapper transition building → running
      writer.processEvent({
        type: 'test_pass',
        suiteName: 'suite',
        testName: 'test1',
        duration: 10,
        timestamp: new Date().toISOString(),
      });
      writer.write();

      const running = parseYaml(await fs.readFile(statusPath, 'utf-8')) as Record<string, any>;
      // total should be 100 (from discovery), not 1 (from discovered)
      expect(running.total).toBe(100);
      expect(running.passed).toBe(1);
      expect(running.percent).toBe(1); // 1/100 = 1%
      expect(running.state).toBe('running');
    });

    // @feature12
    it('YamlWriter uses total=0 during running without discovery or summary', async () => {
      const { YamlWriter } = await importAdapterModule(
        'extensions/tui-test-runner/tools/tui-test-runner/yaml_writer.ts',
      );

      const statusPath = appPath(STATUS_DIR, 'status.nodiscovery.yaml');
      const writer = new YamlWriter(statusPath, 'nodisc01', 'vitest', 'log.txt', 0, 9999);
      writer.markRunning(); // simulate wrapper transition building → running
      // No setDiscoveryTotal() call
      writer.processEvent({
        type: 'test_pass',
        suiteName: 'suite',
        testName: 'test1',
        duration: 10,
        timestamp: new Date().toISOString(),
      });
      writer.write();

      const running = parseYaml(await fs.readFile(statusPath, 'utf-8')) as Record<string, any>;
      // total should be 0 (unknown), not 1 (discovered)
      expect(running.total).toBe(0);
      expect(running.percent).toBe(0);
    });
  });

  describe('Wrapper Runtime', () => {
    // @feature6
    it('writes canonical v2 status and populates the advertised log file', () => {
      const scriptPath = appPath(STATUS_DIR, 'wrapper-runtime-script.js');
      fs.copyFileSync(path.join(__dirname, '../fixtures/tui-test-runner/vitest-pass-fail-output.js'), scriptPath);

      const result = runWrapper(
        ['node', scriptPath],
        {
          TEST_STATUSLINE_SESSION: 'wrap1234',
          TEST_STATUSLINE_PROJECT: appPath(),
          TEST_SKIP_DISCOVERY: '1',
          TEST_STATUS_DIR: STATUS_DIR,
        },
      );

      expect(result.status).toBe(1);

      const status = parseYaml(
        fs.readFileSync(appPath(STATUS_DIR, 'status.wrap1234.yaml'), 'utf-8'),
      ) as Record<string, any>;
      const logContent = fs.readFileSync(appPath(STATUS_DIR, 'test.wrap1234.log'), 'utf-8');

      expect(status.version).toBe(2);
      expect(status.pid).toEqual(expect.any(Number));
      expect(status.framework).toBe('vitest');
      expect(status.state).toBe('failed');
      expect(status.total).toBe(2);
      expect(status.passed).toBe(1);
      expect(status.failed).toBe(1);
      expect(status.log_file).toBe('.dev-pomogator/.test-status/test.wrap1234.log');
      expect(logContent).toContain('✓ alpha 5 ms');
      expect(logContent).toContain('✗ beta 7 ms');
      expect(logContent).toContain('stderr-line');
    });
  });

  describe('Strict v2 Consumers', () => {
    // @feature6
    it('strict v2 model rejects legacy or incomplete payloads', () => {
      const invalidStatusPath = writeTempStatus('status.invalid.yaml',
        fs.readFileSync(path.join(__dirname, '../fixtures/tui-test-runner/invalid-status-v1.yaml'), 'utf-8'));

      const result = runPythonJson(STRICT_MODEL_SCRIPT, {
        package_root: appPath(TUI_ROOT),
        status_file: invalidStatusPath,
      });

      expect(result).toEqual({ accepted: false });
    });

    // @feature3
    it('LogReader reads appended log lines', () => {
      const logPath = appPath(STATUS_DIR, 'test.reader.log');
      fs.writeFileSync(logPath, 'line one\nline two\n', 'utf-8');

      const result = runPythonJson(LOG_READER_SCRIPT, {
        package_root: appPath(TUI_ROOT),
        log_file: logPath,
      });

      expect(result.lines).toEqual(['line one', 'line two']);
    });
  });

  describe('Analysis Runtime', () => {
    // @feature5
    it('Analysis pipeline categorizes failures from runtime fixture data', () => {
      const projectRoot = appPath(FIXTURES_DIR, 'project');
      const result = runPythonJson(ANALYZE_STATUS_SCRIPT, {
        package_root: appPath(TUI_ROOT),
        status_file: appPath(FIXTURES_DIR, 'yaml-v2-failed.yaml'),
        project_root: projectRoot,
        user_patterns_path: path.join(projectRoot, '.dev-pomogator', 'patterns.yaml'),
      });

      expect(result.failed).toBeGreaterThan(0);
      expect(result.pattern_ids).toContain('timeout');
      expect(result.pattern_ids).toContain('connection_refused');
    });
  });

  describe('Launcher Runtime', () => {
    // @feature9
    it('Python package entrypoint is launchable via python -m tui', () => {
      const runner = getPythonRunner();
      const tuiParentDir = appPath(TUI_ROOT);
      const result = spawnSync(runner.command, [...runner.prefixArgs, '-m', 'tui', '--help'], {
        encoding: 'utf-8',
        cwd: tuiParentDir,
        timeout: 10000,
      });

      expect(result.status).toBe(0);
      expect(result.stdout || result.stderr).toContain('--status-file');
    });
  });

  describe('Adapter Runtime', () => {
    // @feature6
    it('Vitest adapter parses pass/fail/skip events from fixture output', async () => {
      const { VitestAdapter } = await importAdapterModule(
        'extensions/tui-test-runner/tools/tui-test-runner/adapters/vitest_adapter.ts',
      );
      const adapter = new VitestAdapter();
      const events = Array.from(adapter.processLines(readFixture('vitest-output.txt').split(/\r?\n/)));

      expect(events.some((event: any) => event.type === 'test_pass')).toBe(true);
      expect(events.some((event: any) => event.type === 'test_fail')).toBe(true);
      expect(events.some((event: any) => event.type === 'test_skip')).toBe(true);
      expect(events.some((event: any) => event.type === 'summary')).toBe(true);
    });

    // @feature10
    it('Jest, pytest, dotnet, cargo, and go adapters emit runtime events', async () => {
      const [
        { JestAdapter },
        { PytestAdapter },
        { DotnetAdapter },
        { CargoAdapter },
        { GoTestAdapter },
      ] = await Promise.all([
        importAdapterModule('extensions/tui-test-runner/tools/tui-test-runner/adapters/jest_adapter.ts'),
        importAdapterModule('extensions/tui-test-runner/tools/tui-test-runner/adapters/pytest_adapter.ts'),
        importAdapterModule('extensions/tui-test-runner/tools/tui-test-runner/adapters/dotnet_adapter.ts'),
        importAdapterModule('extensions/tui-test-runner/tools/tui-test-runner/adapters/cargo_adapter.ts'),
        importAdapterModule('extensions/tui-test-runner/tools/tui-test-runner/adapters/go_test_adapter.ts'),
      ]);

      const jestEvents = Array.from(new JestAdapter().processLines(readFixture('jest-output-sample.txt').split(/\r?\n/)));
      const pytestEvents = Array.from(new PytestAdapter().processLines(readFixture('pytest-output-sample.txt').split(/\r?\n/)));
      const dotnetEvents = Array.from(new DotnetAdapter().processLines(readFixture('dotnet-output-sample.txt').split(/\r?\n/)));
      const cargoEvents = Array.from(new CargoAdapter().processLines(readFixture('cargo-output-sample.txt').split(/\r?\n/)));
      const goEvents = Array.from(new GoTestAdapter().processLines(readFixture('go-test-output-sample.txt').split(/\r?\n/)));

      expect(jestEvents.some((event: any) => event.type === 'summary')).toBe(true);
      expect(pytestEvents.some((event: any) => event.type === 'test_pass')).toBe(true);
      expect(pytestEvents.some((event: any) => event.type === 'summary')).toBe(true);
      expect(dotnetEvents.some((event: any) => event.type === 'summary')).toBe(true);
      expect(cargoEvents.some((event: any) => event.type === 'test_fail')).toBe(true);
      expect(goEvents.some((event: any) => event.type === 'test_start')).toBe(true);
      expect(goEvents.some((event: any) => event.type === 'test_fail')).toBe(true);
    });

    // @feature10
    it('Dotnet adapter parses verbose output with leading-whitespace summary', async () => {
      const { DotnetAdapter } = await importAdapterModule(
        'extensions/tui-test-runner/tools/tui-test-runner/adapters/dotnet_adapter.ts',
      );
      const adapter = new DotnetAdapter();
      const events = Array.from(
        adapter.processLines(readFixture('dotnet-output-verbose.txt').split(/\r?\n/)),
      );

      const passes = events.filter((e: any) => e.type === 'test_pass');
      const fails = events.filter((e: any) => e.type === 'test_fail');
      const skips = events.filter((e: any) => e.type === 'test_skip');
      const summaries = events.filter((e: any) => e.type === 'summary');

      expect(passes).toHaveLength(3);
      expect(fails).toHaveLength(1);
      expect(skips).toHaveLength(1);
      expect(summaries.length).toBeGreaterThanOrEqual(1);

      const lastSummary = summaries[summaries.length - 1] as any;
      expect(lastSummary.summary.total).toBe(5);
      expect(lastSummary.summary.passed).toBe(3);
      expect(lastSummary.summary.failed).toBe(1);
      expect(lastSummary.summary.skipped).toBe(1);
    });

    // @feature10
    it('Dotnet adapter parses minimal single-line summary', async () => {
      const { DotnetAdapter } = await importAdapterModule(
        'extensions/tui-test-runner/tools/tui-test-runner/adapters/dotnet_adapter.ts',
      );
      const adapter = new DotnetAdapter();
      const events = Array.from(
        adapter.processLines(readFixture('dotnet-output-minimal.txt').split(/\r?\n/)),
      );

      const summaries = events.filter((e: any) => e.type === 'summary');
      expect(summaries.length).toBeGreaterThanOrEqual(1);

      const lastSummary = summaries[summaries.length - 1] as any;
      expect(lastSummary.summary.total).toBe(4);
      expect(lastSummary.summary.passed).toBe(3);
      expect(lastSummary.summary.failed).toBe(0);
      expect(lastSummary.summary.skipped).toBe(1);
    });

    // @feature10
    it('Regression: all adapters continue to emit correct event counts', async () => {
      const [
        { VitestAdapter },
        { JestAdapter },
        { PytestAdapter },
        { DotnetAdapter },
        { CargoAdapter },
        { GoTestAdapter },
      ] = await Promise.all([
        importAdapterModule('extensions/tui-test-runner/tools/tui-test-runner/adapters/vitest_adapter.ts'),
        importAdapterModule('extensions/tui-test-runner/tools/tui-test-runner/adapters/jest_adapter.ts'),
        importAdapterModule('extensions/tui-test-runner/tools/tui-test-runner/adapters/pytest_adapter.ts'),
        importAdapterModule('extensions/tui-test-runner/tools/tui-test-runner/adapters/dotnet_adapter.ts'),
        importAdapterModule('extensions/tui-test-runner/tools/tui-test-runner/adapters/cargo_adapter.ts'),
        importAdapterModule('extensions/tui-test-runner/tools/tui-test-runner/adapters/go_test_adapter.ts'),
      ]);

      // Vitest from fixture
      const vitestEvents = Array.from(
        new VitestAdapter().processLines(readFixture('vitest-output.txt').split(/\r?\n/)),
      );
      expect(vitestEvents.filter((e: any) => e.type === 'test_pass')).toHaveLength(3);
      expect(vitestEvents.filter((e: any) => e.type === 'test_fail')).toHaveLength(1);
      expect(vitestEvents.filter((e: any) => e.type === 'test_skip')).toHaveLength(1);

      // Adapter fixtures (same fixtures as first test — regression check)
      const jestEvents = Array.from(new JestAdapter().processLines(readFixture('jest-output-sample.txt').split(/\r?\n/)));
      expect(jestEvents.filter((e: any) => e.type === 'test_pass')).toHaveLength(1);
      expect(jestEvents.filter((e: any) => e.type === 'test_fail')).toHaveLength(1);

      const pytestEvents = Array.from(new PytestAdapter().processLines(readFixture('pytest-output-sample.txt').split(/\r?\n/)));
      expect(pytestEvents.filter((e: any) => e.type === 'test_pass')).toHaveLength(1);
      expect(pytestEvents.filter((e: any) => e.type === 'test_fail')).toHaveLength(1);

      const dotnetEvents = Array.from(new DotnetAdapter().processLines(readFixture('dotnet-output-sample.txt').split(/\r?\n/)));
      expect(dotnetEvents.filter((e: any) => e.type === 'test_pass')).toHaveLength(1);
      expect(dotnetEvents.filter((e: any) => e.type === 'test_fail')).toHaveLength(1);
      const dotnetSummary = dotnetEvents.filter((e: any) => e.type === 'summary').pop() as any;
      expect(dotnetSummary.summary.total).toBe(2);
      expect(dotnetSummary.summary.passed).toBe(1);
      expect(dotnetSummary.summary.failed).toBe(1);

      const cargoEvents = Array.from(new CargoAdapter().processLines(readFixture('cargo-output-sample.txt').split(/\r?\n/)));
      expect(cargoEvents.filter((e: any) => e.type === 'test_pass')).toHaveLength(1);
      expect(cargoEvents.filter((e: any) => e.type === 'test_fail')).toHaveLength(1);

      const goEvents = Array.from(new GoTestAdapter().processLines(readFixture('go-test-output-sample.txt').split(/\r?\n/)));
      expect(goEvents.filter((e: any) => e.type === 'test_pass')).toHaveLength(1);
      expect(goEvents.filter((e: any) => e.type === 'test_fail')).toHaveLength(1);
    });
  });

  describe('Cross-Platform Spawn', () => {
    // @feature14
    it('wrapper spawns npx child commands cross-platform (shell resolution)', () => {
      const result = runWrapper(
        ['npx', '--version'],
        {
          TEST_STATUSLINE_SESSION: 'xplat01',
          TEST_STATUSLINE_PROJECT: appPath(),
          TEST_SKIP_DISCOVERY: '1',
        },
      );
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });

    // @feature14
    it('passthrough spawns npx child commands cross-platform', () => {
      const result = runWrapper(
        ['npx', '--version'],
        {
          // No TEST_STATUSLINE_SESSION → passthrough mode
          TEST_STATUSLINE_PROJECT: appPath(),
        },
      );
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('Dispatch Runtime', () => {
    // @feature13
    it('passes the canonical framework argument into the wrapper command', async () => {
      process.env.TEST_STATUSLINE_SESSION = 'dispatch1';

      const { buildTestCommand } = await importAdapterModule(
        'extensions/tui-test-runner/tools/tui-test-runner/dispatch.ts',
      );
      const command = buildTestCommand({ framework: 'pytest', filter: 'auth', docker: true });

      expect(command.command).toContain('--framework pytest --');
      expect(command.command).toContain('test_runner_wrapper.cjs');
      expect(command.command).toContain('python -m pytest -k "auth"');
      expect(command.dockerProjectName).toBe('devpom-test-dispatch1');
    });
  });
});
