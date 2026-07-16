import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { allChecks } from './checks/index.js';
import { DOCTOR_SCHEMA_VERSION } from './constants.js';
import { acquireLock, LockHeldError } from './lock.js';
import { buildHookOutput, exitCodeFor, formatChalk, formatJson } from './reporter.js';
import { executeChecks } from './runner.js';
import type { CheckDefinition, DoctorOptions, DoctorReport, HookOutput } from './types.js';

export { LockHeldError } from './lock.js';
export type {
  CheckContext,
  CheckDefinition,
  CheckGroup,
  CheckResult,
  DoctorOptions,
  DoctorReport,
  HookOutput,
  PluginLoaderState,
  Severity,
} from './types.js';

export async function runDoctor(
  options: DoctorOptions = {},
  checks: CheckDefinition[] = allChecks,
): Promise<DoctorReport> {
  const homeDir = options.homeDir ?? os.homedir();
  const lockPath = path.join(homeDir, '.dev-pomogator', 'doctor.lock');

  const lock = acquireLock(lockPath);
  try {
    return await executeChecks(options, checks);
  } finally {
    lock.release();
  }
}

/**
 * Quiet mode for the SessionStart hook: run all checks and return the one-line banner payload
 * (silent when everything is OK, ≤100-char warning otherwise). Fail-open — any error (incl. a held
 * lock from a concurrent run) yields a silent continue so a session is never blocked.
 */
export async function runQuiet(
  options: DoctorOptions = {},
  checks: CheckDefinition[] = allChecks,
): Promise<HookOutput> {
  try {
    const report = await runDoctor({ ...options, quiet: true }, checks);
    // SessionStart is minimally intrusive: it nags ONLY on a CRITICAL issue in an INSTALLED
    // environment. Two quiet cases (scenarios POMOGATORDOCTOR001_04 / _05):
    //  - an uninstalled/bare home (no ~/.dev-pomogator/config.json) has nothing actionable to
    //    report — "config not found" there is expected, not an error;
    //  - warnings alone come from optional / self-healing components (native statusline,
    //    claude-mem, .gitignore, pre-commit, session-pilot server) that the interactive
    //    /pomogator-doctor surfaces — they must not banner at every session start.
    // The banner-on-warning contract of buildHookOutput itself is unchanged (interactive path).
    const homeDir = options.homeDir ?? os.homedir();
    const installed = fs.existsSync(path.join(homeDir, '.dev-pomogator', 'config.json'));
    const actionableCritical = report.results.some(
      (result) => result.severity === 'critical' && result.group !== 'needs-external',
    );
    if (!installed || !actionableCritical) {
      return { continue: true, suppressOutput: true };
    }
    return buildHookOutput(report);
  } catch {
    return { continue: true, suppressOutput: true };
  }
}

/** Verbose mode for `/pomogator-doctor`: full severity-grouped chalk report as a string. */
export async function runVerbose(
  options: DoctorOptions = {},
  checks: CheckDefinition[] = allChecks,
): Promise<string> {
  const report = await runDoctor(options, checks);
  return formatChalk(report);
}

interface CliArgs {
  json: boolean;
  fix: boolean;
  hook: boolean;
  extension?: string;
}

function usage(): string {
  return 'Usage: pomogator-doctor [--json] [--extension=<name>] [--fix]';
}

function parseCliArgs(args: string[]): CliArgs {
  const parsed: CliArgs = { json: false, fix: false, hook: false };
  for (const arg of args) {
    if (arg === '--json') parsed.json = true;
    else if (arg === '--fix') parsed.fix = true;
    else if (arg === '--hook') parsed.hook = true;
    else if (arg.startsWith('--extension=') && arg.length > '--extension='.length) {
      parsed.extension = arg.slice('--extension='.length);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

async function main(args = process.argv.slice(2)): Promise<void> {
  let cli: CliArgs;
  try {
    cli = parseCliArgs(args);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
    process.exitCode = 2;
    return;
  }

  process.env.DEV_POMOGATOR_DOCTOR_BUNDLE = '1';
  if (cli.hook) {
    let input = '';
    if (!process.stdin.isTTY) {
      for await (const chunk of process.stdin) input += String(chunk);
    }
    let projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    try {
      const payload = JSON.parse(input) as { cwd?: unknown };
      if (typeof payload.cwd === 'string' && payload.cwd.trim()) projectRoot = payload.cwd;
    } catch {
      // Hook input is best-effort.
    }
    const output = await Promise.race([
      runQuiet({ projectRoot, homeDir: process.env.HOME || process.env.USERPROFILE, fix: false }),
      new Promise<HookOutput>((resolve) => setTimeout(
        () => resolve({ continue: true, suppressOutput: true }),
        10_000,
      )),
    ]);
    process.stdout.write(`${JSON.stringify(output)}\n`);
    return;
  }

  const report = await runDoctor({
    projectRoot: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
    homeDir: process.env.HOME || process.env.USERPROFILE,
    extension: cli.extension,
    fix: cli.fix,
  });
  process.stdout.write(`${cli.json ? formatJson(report) : formatChalk(report)}\n`);
  process.exitCode = exitCodeFor(report);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  void main().catch((error) => {
    process.stderr.write(`pomogator-doctor failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}

export function lockPathFor(homeDir: string): string {
  return path.join(homeDir, '.dev-pomogator', 'doctor.lock');
}

export function emptyReport(): DoctorReport {
  return {
    results: [],
    durationMs: 0,
    gatedOut: [],
    installedExtensions: [],
    summary: { ok: 0, warnings: 0, critical: 0, total: 0, relevantOf: 0 },
    reinstallableIssues: [],
    manualIssues: [],
    schemaVersion: DOCTOR_SCHEMA_VERSION,
  };
}
