import os from 'node:os';
import path from 'node:path';
import { allChecks } from './checks/index.js';
import { DOCTOR_SCHEMA_VERSION } from './constants.js';
import { acquireLock, LockHeldError } from './lock.js';
import { buildHookOutput, formatChalk } from './reporter.js';
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
