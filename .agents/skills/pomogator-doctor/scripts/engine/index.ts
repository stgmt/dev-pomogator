import fs from 'node:fs';
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
    if (!installed || report.summary.critical === 0) {
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
