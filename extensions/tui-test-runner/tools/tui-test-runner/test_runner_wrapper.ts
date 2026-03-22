#!/usr/bin/env node
/**
 * Canonical v2 test runner wrapper.
 */

import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestEvent, TestFramework } from './adapters/types.js';
import { CargoAdapter } from './adapters/cargo_adapter.js';
import { DotnetAdapter } from './adapters/dotnet_adapter.js';
import { GoTestAdapter } from './adapters/go_test_adapter.js';
import { JestAdapter } from './adapters/jest_adapter.js';
import { PytestAdapter } from './adapters/pytest_adapter.js';
import { VitestAdapter } from './adapters/vitest_adapter.js';
import { detectFramework } from './config.js';
import { YamlWriter } from './yaml_writer.js';

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

function discoverTestCount(framework: TestFramework, projectRoot: string): number {
  const config = DISCOVERY_COMMANDS[framework];
  if (!config) return 0;

  try {
    const result = spawnSync(config.cmd[0], config.cmd.slice(1), {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 60000,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', VITEST_LIST: '1' },
      shell: true,
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
  const result = spawnSync(commandArgs[0], commandArgs.slice(1), {
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
  const statusDir = path.join(projectRoot, '.dev-pomogator', '.test-status');
  const statusFile = path.join(statusDir, `status.${prefix}.yaml`);
  const logFile = path.join(statusDir, `test.${prefix}.log`);
  const logFileForYaml = path.posix.join('.dev-pomogator', '.test-status', `test.${prefix}.log`);
  const framework = resolveFramework(parsed.framework, projectRoot);

  fs.mkdirSync(statusDir, { recursive: true });
  fs.writeFileSync(logFile, '', 'utf-8');

  const discoveryTotal = discoverTestCount(framework, projectRoot);

  const writer = new YamlWriter(statusFile, prefix, framework, logFileForYaml, 1000, process.pid);
  if (discoveryTotal > 0) {
    writer.setDiscoveryTotal(discoveryTotal);
  }
  writer.write();

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
  const child = spawn(parsed.commandArgs[0], parsed.commandArgs.slice(1), {
    cwd: projectRoot,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env, ...parsed.childEnv },
  });

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
