import os from 'node:os';
import path from 'node:path';
import { allChecks } from './checks/index.js';
import { DOCTOR_SCHEMA_VERSION } from './constants.js';
import { acquireLock, LockHeldError } from './lock.js';
import { executeChecks } from './runner.js';
import type { CheckDefinition, DoctorOptions, DoctorReport } from './types.js';

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
