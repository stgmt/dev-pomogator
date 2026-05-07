/**
 * Phase 0 Step 4: Baseline test run (FR-5, AC-5).
 *
 * Invokes `/run-tests` skill (НЕ raw `pytest`/`npm test` — правило `centralized-test-runner`).
 * Captures passed/failed/duration as baseline for regression comparison later.
 *
 * Edge cases:
 *  - `testFramework == null` → skip Step 4 (no framework detected in Step 2 recon)
 *  - `--skip-baseline-tests` flag → skipped_by_user=true
 *  - Exit code 127 (command not found) → throw BaselineAbortError with hint to install deps
 *
 * See .specs/onboard-repo-phase0/{FR.md#fr-5, AC.md#ac-5}.
 */

import type { BaselineTestResult } from '../lib/types.ts';


export interface BaselineTestsContext {
  projectPath: string;
  testFramework: string | null;
  testCommand: string | null;
  viaSkill?: string | null;
  skipByUser?: boolean;
  installHint?: string;
}


export interface RunTestsInvocationResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  passed: number;
  failed: number;
  skipped: number;
  failedTestIds: string[];
}


export interface BaselineTestsDeps {
  invokeRunTests: (ctx: BaselineTestsContext) => Promise<RunTestsInvocationResult>;
}


export class BaselineAbortError extends Error {
  constructor(public readonly hint: string) {
    super(hint);
    this.name = 'BaselineAbortError';
  }
}


export async function runBaselineTests(
  ctx: BaselineTestsContext,
  deps: BaselineTestsDeps,
): Promise<BaselineTestResult> {
  if (ctx.skipByUser === true) {
    return {
      framework: ctx.testFramework,
      command: ctx.testCommand ?? '',
      via_skill: ctx.viaSkill ?? 'run-tests',
      passed: 0,
      failed: 0,
      skipped: 0,
      duration_s: 0,
      failed_test_ids: [],
      reason_if_null: 'skipped_by_user',
      skipped_by_user: true,
    };
  }

  if (!ctx.testFramework) {
    return {
      framework: null,
      command: '',
      via_skill: null,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration_s: 0,
      failed_test_ids: [],
      reason_if_null: 'no test framework detected',
      skipped_by_user: false,
    };
  }

  const result = await deps.invokeRunTests(ctx);

  if (result.exitCode === 127) {
    const hint = ctx.installHint
      ? `Install dependencies: ${ctx.installHint}`
      : `Install dependencies for ${ctx.testFramework} (command not found)`;
    throw new BaselineAbortError(hint);
  }

  return {
    framework: ctx.testFramework,
    command: ctx.testCommand ?? '',
    via_skill: ctx.viaSkill ?? 'run-tests',
    passed: result.passed,
    failed: result.failed,
    skipped: result.skipped,
    duration_s: Math.round((result.durationMs / 1000) * 10) / 10,
    failed_test_ids: result.failedTestIds,
    reason_if_null: null,
    skipped_by_user: false,
  };
}


export function parseBaselineOutput(raw: {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}): Pick<RunTestsInvocationResult, 'passed' | 'failed' | 'skipped' | 'failedTestIds'> {
  const output = `${raw.stdout}\n${raw.stderr}`;
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  const pytestMatch = output.match(/(\d+)\s+passed/);
  if (pytestMatch) passed = parseInt(pytestMatch[1], 10);
  const pytestFailed = output.match(/(\d+)\s+failed/);
  if (pytestFailed) failed = parseInt(pytestFailed[1], 10);
  const pytestSkipped = output.match(/(\d+)\s+skipped/);
  if (pytestSkipped) skipped = parseInt(pytestSkipped[1], 10);

  const vitestSummary = output.match(/Tests\s+(?:(\d+)\s+failed)?\s*\|?\s*(\d+)\s+passed/);
  if (vitestSummary && passed === 0 && failed === 0) {
    if (vitestSummary[1]) failed = parseInt(vitestSummary[1], 10);
    passed = parseInt(vitestSummary[2], 10);
  }

  const failedTestIds: string[] = [];
  const failIdPattern = /(?:FAIL|FAILED)\s+(\S+)/g;
  let idMatch: RegExpExecArray | null;
  while ((idMatch = failIdPattern.exec(output)) !== null) {
    failedTestIds.push(idMatch[1]);
  }

  return { passed, failed, skipped, failedTestIds: [...new Set(failedTestIds)] };
}
