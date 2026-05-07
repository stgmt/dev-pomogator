#!/usr/bin/env node
/**
 * Canonical v2 test runner wrapper.
 */

import crossSpawn from 'cross-spawn';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestEvent, TestFramework } from './adapters/types.ts';
import { CargoAdapter } from './adapters/cargo_adapter.ts';
import { DotnetAdapter } from './adapters/dotnet_adapter.ts';
import { GoTestAdapter } from './adapters/go_test_adapter.ts';
import { JestAdapter } from './adapters/jest_adapter.ts';
import { PytestAdapter } from './adapters/pytest_adapter.ts';
import { VitestAdapter } from './adapters/vitest_adapter.ts';
import { detectFramework } from './config.ts';
import { YamlWriter } from './yaml_writer.ts';

const SESSION = process.env.TEST_STATUSLINE_SESSION || '';
const PROJECT = process.env.TEST_STATUSLINE_PROJECT || process.cwd();

const KNOWN_FRAMEWORKS = new Set<TestFramework>([
  'vitest',
  'jest',
  'pytest',
  'dotnet',
  'rust',
  'go',
  'unknown',
]);

interface ParsedArgs {
  framework?: TestFramework;
  childEnv: Record<string, string>;
  commandArgs: string[];
}

function parseArgs(args: string[]): ParsedArgs {
  let framework: TestFramework | undefined;
  let commandStart = args.length;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') {
      commandStart = i + 1;
      break;
    }

    if (arg === '--framework' && i + 1 < args.length) {
      const candidate = args[i + 1] as TestFramework;
      framework = KNOWN_FRAMEWORKS.has(candidate) ? candidate : 'unknown';
      i++;
      continue;
    }

    if (arg.startsWith('--framework=')) {
      const candidate = arg.slice('--framework='.length) as TestFramework;
      framework = KNOWN_FRAMEWORKS.has(candidate) ? candidate : 'unknown';
      continue;
    }

    commandStart = i;
    break;
  }

  const childEnv: Record<string, string> = {};
  const commandArgs = args.slice(commandStart);
  while (commandArgs.length > 0) {
    const match = commandArgs[0].match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      break;
    }
    childEnv[match[1]] = match[2];
    commandArgs.shift();
  }

  return {
    framework,
    childEnv,
    commandArgs,
  };
}

function getAdapter(framework: TestFramework): { parseLine: (line: string) => TestEvent | null } {
  switch (framework) {
    case 'vitest':
      return new VitestAdapter();
    case 'jest':
      return new JestAdapter();
    case 'pytest':
      return new PytestAdapter();
    case 'dotnet':
      return new DotnetAdapter();
    case 'rust':
      return new CargoAdapter();
    case 'go':
      return new GoTestAdapter();
    default:
      throw new Error(`Unsupported framework adapter: ${framework}`);
  }
}

function resolveFramework(explicitFramework: TestFramework | undefined, projectRoot: string): TestFramework {
  if (explicitFramework && explicitFramework !== 'unknown') {
    return explicitFramework;
  }

  const detected = detectFramework(projectRoot);
  return detected;
}

const DISCOVERY_COMMANDS: Partial<Record<TestFramework, { cmd: string[]; count: (out: string) => number }>> = {
  vitest: {
    cmd: ['npx', 'vitest', 'list', '--json'],
    count: (out) => {
      try {
        const data = JSON.parse(out);
        if (Array.isArray(data)) return data.length;
      } catch {
        // Fallback: count non-empty non-indented lines
        return out.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith(' ')).length;
      }
      return 0;
    },
  },
  jest: {
    cmd: ['npx', 'jest', '--listTests'],
    count: (out) => out.split(/\r?\n/).filter((l) => l.trim()).length,
  },
  pytest: {
    cmd: ['python3', '-m', 'pytest', '--collect-only', '-q'],
    count: (out) => out.split(/\r?\n/).filter((l) => l.includes('::')).length,
  },
  dotnet: {
    cmd: ['dotnet', 'test', '--list-tests', '-v=q'],
    count: (out) => out.split(/\r?\n/).filter((l) => l.startsWith('    ')).length,
  },
  rust: {
    cmd: ['cargo', 'test', '--', '--list'],
    count: (out) => out.split(/\r?\n/).filter((l) => l.includes(': test')).length,
  },
  go: {
    cmd: ['go', 'test', '-list', '.*', './...'],
    count: (out) => out.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('ok')).length,
  },
};

/**
 * Extract file filter args from the test command (e.g. ['npx','vitest','run','file1.ts'] → ['file1.ts']).
 * Non-flag args after the framework subcommand (run, list, test, etc.) are file filters.
 */
function extractFileFilters(commandArgs: string[]): string[] {
  // Skip command name (npx) and framework binary (vitest) and subcommand (run)
  // Take non-flag args that look like file paths
  const filters: string[] = [];
  let pastSubcommand = false;
  for (let i = 0; i < commandArgs.length; i++) {
    const arg = commandArgs[i];
    // Skip known prefixes: npx, framework binary, subcommands
    if (i < 2) continue;
    if (!pastSubcommand && ['run', 'list', 'test', '--', '-m'].includes(arg)) {
      pastSubcommand = true;
      continue;
    }
    // Skip flags and their values
    if (arg.startsWith('-')) {
      // Skip flag value if it's a key-value flag (e.g. -t "filter")
      if (i + 1 < commandArgs.length && !commandArgs[i + 1].startsWith('-')) i++;
      continue;
    }
    // Remaining non-flag args are file filters
    if (arg.includes('/') || arg.endsWith('.ts') || arg.endsWith('.js') || arg.endsWith('.py') || arg.endsWith('.rs')) {
      filters.push(arg);
    }
  }
  return filters;
}

function discoverTestCount(framework: TestFramework, projectRoot: string, commandArgs: string[] = []): number {
  const config = DISCOVERY_COMMANDS[framework];
  if (!config) return 0;

  // Pass file filter args to discovery so total matches actual filtered run
  const fileFilters = extractFileFilters(commandArgs);
  const discoveryCmd = [...config.cmd, ...fileFilters];

  try {
    const result = crossSpawn.sync(discoveryCmd[0], discoveryCmd.slice(1), {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 60000,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', VITEST_LIST: '1' },
    });
    if (result.status !== 0 || !result.stdout) {
      if (result.stderr) {
        process.stderr.write(`[discovery] ${framework}: ${result.stderr.slice(0, 200)}\n`);
      }
      return 0;
    }
    const count = config.count(result.stdout);
    if (count > 0) {
      process.stderr.write(`[discovery] ${framework}: ${count} tests found\n`);
    }
    return count;
  } catch (err) {
    process.stderr.write(`[discovery] ${framework}: ${err instanceof Error ? err.message : String(err)}\n`);
    return 0;
  }
}

function passthrough(commandArgs: string[], childEnv: Record<string, string>): number {
  const result = crossSpawn.sync(commandArgs[0], commandArgs.slice(1), {
    stdio: 'inherit',
    cwd: PROJECT,
    env: { ...process.env, ...childEnv },
  });
  return result.status ?? 1;
}

function createEvent(type: TestEvent['type'], errorMessage: string): TestEvent {
  return {
    type,
    errorMessage,
    timestamp: new Date().toISOString(),
  };
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.commandArgs.length === 0) {
    process.stderr.write('Usage: test_runner_wrapper.ts [--framework <name>] -- <test-command>\n');
    return 1;
  }

  if (!SESSION) {
    return passthrough(parsed.commandArgs, parsed.childEnv);
  }

  const prefix = SESSION.length >= 8 ? SESSION.slice(0, 8) : SESSION;
  const projectRoot = path.resolve(PROJECT);
  const statusDirRel = process.env.TEST_STATUS_DIR || '.dev-pomogator/.test-status';
  const statusDir = path.join(projectRoot, statusDirRel);
  const statusFile = path.join(statusDir, `status.${prefix}.yaml`);
  const logFile = path.join(statusDir, `test.${prefix}.log`);
  const logFileForYaml = statusDirRel.replace(/\\/g, '/') + `/test.${prefix}.log`;
  const framework = resolveFramework(parsed.framework, projectRoot);

  fs.mkdirSync(statusDir, { recursive: true });
  fs.writeFileSync(logFile, '', 'utf-8');

  // Skip discovery in Docker ENTRYPOINT mode — vitest list conflicts with vitest run in same container.
  // Discovery total will be 0; wrapper relies on adapter-parsed counts instead.
  const skipDiscovery = process.env.TEST_SKIP_DISCOVERY === '1' || process.env.DEV_POMOGATOR_TEST_IN_DOCKER === '1';
  const discoveryTotal = skipDiscovery ? 0 : discoverTestCount(framework, projectRoot, parsed.commandArgs);

  const writer = new YamlWriter(statusFile, prefix, framework, logFileForYaml, 1000, process.pid);
  if (discoveryTotal > 0) {
    writer.setDiscoveryTotal(discoveryTotal);
  }
  writer.write();

  // Centralized marker creation (Task Pattern: wrapper = sole lifecycle owner)
  // Session prefix from session.env (single source of truth, written by SessionStart hook)
  const markerDir = path.join(projectRoot, '.dev-pomogator');
  let sessionPrefix = '';
  try {
    const sessionEnvPath = path.join(markerDir, '.test-status', 'session.env');
    const envContent = fs.readFileSync(sessionEnvPath, 'utf-8');
    const match = envContent.match(/^TEST_STATUSLINE_SESSION=(.+)$/m);
    if (match) sessionPrefix = match[1].trim();
  } catch { /* no session.env — use legacy marker */ }

  const markerName = sessionPrefix ? `.bg-task-active.${sessionPrefix}` : '.bg-task-active';
  const markerPath = path.join(markerDir, markerName);

  // Zombie cleanup: if existing marker has dead PID → delete before creating new
  try {
    if (fs.existsSync(markerPath)) {
      const existing = fs.readFileSync(markerPath, 'utf-8').trim();
      const existingPid = parseInt(existing.split(' ')[0], 10);
      if (existingPid && existingPid !== process.pid) {
        try { process.kill(existingPid, 0); } catch {
          // PID dead → stale marker
          fs.unlinkSync(markerPath);
          process.stderr.write(`[marker] CLEANED stale marker pid=${existingPid}\n`);
        }
      }
    }
  } catch { /* ignore */ }

  try {
    fs.mkdirSync(markerDir, { recursive: true });
    fs.writeFileSync(markerPath, `${process.pid} ${new Date().toISOString()}\n`);
    process.stderr.write(`[marker] CREATED ${markerPath} pid=${process.pid}\n`);
  } catch { /* fail-open: marker is best-effort */ }

  // Cleanup marker on exit (normal + crash + signal)
  const cleanupMarker = (reason: string) => {
    try {
      fs.unlinkSync(markerPath);
      process.stderr.write(`[marker] DELETED ${markerPath} reason=${reason}\n`);
    } catch { /* ignore */ }
  };
  process.on('exit', (code) => cleanupMarker(`exit(${code})`));
  process.on('SIGTERM', () => { cleanupMarker('SIGTERM'); process.exit(143); });
  process.on('SIGINT', () => { cleanupMarker('SIGINT'); process.exit(130); });

  let adapter;
  try {
    adapter = getAdapter(framework);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    writer.processEvent(createEvent('error', message));
    writer.finalize(2);
    return 2;
  }

  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  const child = crossSpawn(parsed.commandArgs[0], parsed.commandArgs.slice(1), {
    cwd: projectRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...parsed.childEnv },
  });

  // Close stdin immediately — child tests spawn hooks that call readStdin(),
  // and inherited stdin would hang waiting for input that never comes.
  child.stdin?.end();

  // Heartbeat: update YAML every 2s even when no test output arrives (Docker buffering workaround)
  const heartbeat = setInterval(() => {
    writer.write();
  }, 2000);

  let childError: string | null = null;
  const buffers: Record<'stdout' | 'stderr', string> = {
    stdout: '',
    stderr: '',
  };

  const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

  const parseLines = (streamName: 'stdout' | 'stderr', text: string): void => {
    buffers[streamName] += text;
    const lines = buffers[streamName].split(/\r?\n/);
    buffers[streamName] = lines.pop() ?? '';

    let changed = false;
    for (const line of lines) {
      const event = adapter.parseLine(stripAnsi(line));
      if (!event) {
        continue;
      }
      writer.processEvent(event);
      changed = true;
    }

    if (changed) {
      writer.markRunning(); // building → running on first test event
      writer.writeIfNeeded();
    }
  };

  child.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf-8');
    process.stdout.write(text);
    logStream.write(text);
    parseLines('stdout', text);
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf-8');
    process.stderr.write(text);
    logStream.write(text);
    parseLines('stderr', text);
  });

  child.on('error', (error) => {
    childError = error.message;
    writer.processEvent(createEvent('error', error.message));
    writer.write();
  });

  const flushRemainders = (): void => {
    for (const key of ['stdout', 'stderr'] as const) {
      const line = buffers[key].trimEnd();
      if (!line) {
        continue;
      }
      const event = adapter.parseLine(stripAnsi(line));
      if (event) {
        writer.processEvent(event);
      }
      buffers[key] = '';
    }
  };

  return new Promise<number>((resolve) => {
    child.on('close', (code, signal) => {
      clearInterval(heartbeat);
      flushRemainders();

      const exitCode = childError
        ? 1
        : code !== null
          ? code
          : signal
            ? 1
            : 0;

      if (childError) {
        writer.processEvent(createEvent('error', childError));
      }

      logStream.end(() => {
        writer.finalize(exitCode);
        resolve(exitCode);
      });
    });
  });
}

main().then((code) => process.exit(code));
