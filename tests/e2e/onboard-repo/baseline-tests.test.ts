/**
 * Phase 5 Green tests: baseline test run (@feature5).
 * Covers: ONBOARD007 (invoke /run-tests skill), ONBOARD008 (no framework skip),
 * ONBOARD009 (--skip-baseline-tests flag).
 *
 * `/run-tests` skill invocation is DI-injected (invokeRunTests callback) so tests
 * control output deterministically без реального test framework execution.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { runBeforeEach, type BeforeEachContext } from './hooks/before-each.ts';
import { runAfterEach } from './hooks/after-each.ts';
import { runTestsMock } from '../../fixtures/skills/run-tests-mock.ts';
import {
  runBaselineTests,
  parseBaselineOutput,
  BaselineAbortError,
  type BaselineTestsDeps,
  type RunTestsInvocationResult,
} from '../../../extensions/onboard-repo/tools/onboard-repo/steps/baseline-tests.ts';


function depsReturning(result: RunTestsInvocationResult): BaselineTestsDeps {
  return {
    invokeRunTests: async () => result,
  };
}


function depsExit127(): BaselineTestsDeps {
  return {
    invokeRunTests: async () => ({
      exitCode: 127,
      stdout: '',
      stderr: 'command not found: pytest',
      durationMs: 5,
      passed: 0,
      failed: 0,
      skipped: 0,
      failedTestIds: [],
    }),
  };
}


describe('Phase 5: Baseline tests (@feature5)', () => {
  let ctx: BeforeEachContext;

  afterEach(async () => {
    if (ctx) await runAfterEach(ctx);
  });

  // @feature5 ONBOARD007
  it('ONBOARD007: invokes /run-tests skill, records passed/failed/duration', async () => {
    ctx = await runBeforeEach('fake-python-api');

    let invoked = false;
    const deps: BaselineTestsDeps = {
      invokeRunTests: async (invocationCtx) => {
        invoked = true;
        expect(invocationCtx.testFramework).toBe('pytest');
        expect(invocationCtx.testCommand).toBe('uv run pytest');
        return {
          exitCode: 0,
          stdout: '',
          stderr: '',
          durationMs: 47_000,
          passed: 145,
          failed: 2,
          skipped: 8,
          failedTestIds: ['tests/integration/auth_test.py::test_refresh', 'tests/integration/db_test.py::test_migration'],
        };
      },
    };

    const result = await runBaselineTests(
      {
        projectPath: ctx.tmpdir,
        testFramework: 'pytest',
        testCommand: 'uv run pytest',
        viaSkill: 'run-tests',
      },
      deps,
    );

    expect(invoked).toBe(true);
    expect(result.framework).toBe('pytest');
    expect(result.via_skill).toBe('run-tests');
    expect(result.passed).toBe(145);
    expect(result.failed).toBe(2);
    expect(result.skipped).toBe(8);
    expect(result.duration_s).toBe(47);
    expect(result.failed_test_ids).toHaveLength(2);
    expect(result.skipped_by_user).toBe(false);
    expect(result.reason_if_null).toBeNull();
  });

  // @feature5 ONBOARD007 через F-20 mock
  it('ONBOARD007: works with F-20 runTestsMock fixture', async () => {
    ctx = await runBeforeEach('fake-python-api');
    runTestsMock.register({ framework: 'pytest', passed: 145, failed: 2, duration_s: 47 });

    const deps: BaselineTestsDeps = {
      invokeRunTests: async () => {
        const mockResult = runTestsMock.invoke();
        return {
          exitCode: 0,
          stdout: '',
          stderr: '',
          durationMs: mockResult.duration_s * 1000,
          passed: mockResult.passed,
          failed: mockResult.failed,
          skipped: mockResult.skipped,
          failedTestIds: mockResult.failed_test_ids,
        };
      },
    };

    const result = await runBaselineTests(
      { projectPath: ctx.tmpdir, testFramework: 'pytest', testCommand: 'uv run pytest' },
      deps,
    );

    expect(result.passed).toBe(145);
    expect(result.failed).toBe(2);
    expect(result.duration_s).toBe(47);
  });

  // @feature5 ONBOARD008 no framework
  it('ONBOARD008: no test framework → skip with reason', async () => {
    ctx = await runBeforeEach('fake-no-tests');

    let invoked = false;
    const deps: BaselineTestsDeps = {
      invokeRunTests: async () => {
        invoked = true;
        throw new Error('should not be called when framework is null');
      },
    };

    const result = await runBaselineTests(
      { projectPath: ctx.tmpdir, testFramework: null, testCommand: null },
      deps,
    );

    expect(invoked).toBe(false);
    expect(result.framework).toBeNull();
    expect(result.reason_if_null).toBe('no test framework detected');
    expect(result.via_skill).toBeNull();
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(0);
  });

  // @feature5 ONBOARD009 skip flag
  it('ONBOARD009: --skip-baseline-tests flag records skipped_by_user=true', async () => {
    ctx = await runBeforeEach('fake-python-api');

    let invoked = false;
    const deps: BaselineTestsDeps = {
      invokeRunTests: async () => {
        invoked = true;
        throw new Error('should not be called when skipByUser=true');
      },
    };

    const result = await runBaselineTests(
      {
        projectPath: ctx.tmpdir,
        testFramework: 'pytest',
        testCommand: 'uv run pytest',
        skipByUser: true,
      },
      deps,
    );

    expect(invoked).toBe(false);
    expect(result.skipped_by_user).toBe(true);
    expect(result.framework).toBe('pytest');
    expect(result.reason_if_null).toBe('skipped_by_user');
  });

  // @feature5 AC-5 exit 127
  it('exit code 127 → BaselineAbortError with install hint', async () => {
    ctx = await runBeforeEach('fake-python-api');

    await expect(
      runBaselineTests(
        {
          projectPath: ctx.tmpdir,
          testFramework: 'pytest',
          testCommand: 'uv run pytest',
          installHint: 'uv sync --group dev',
        },
        depsExit127(),
      ),
    ).rejects.toThrow(BaselineAbortError);

    await expect(
      runBaselineTests(
        {
          projectPath: ctx.tmpdir,
          testFramework: 'pytest',
          testCommand: 'uv run pytest',
          installHint: 'uv sync --group dev',
        },
        depsExit127(),
      ),
    ).rejects.toThrow(/Install dependencies.*uv sync/);
  });

  // @feature5 exit 127 without explicit installHint uses framework-based hint
  it('exit 127 without installHint → generic hint with framework name', async () => {
    ctx = await runBeforeEach('fake-python-api');

    await expect(
      runBaselineTests(
        { projectPath: ctx.tmpdir, testFramework: 'pytest', testCommand: 'pytest' },
        depsExit127(),
      ),
    ).rejects.toThrow(/pytest.*not found/);
  });

  // parser unit tests
  it('parseBaselineOutput: extracts pytest passed/failed counts', () => {
    const parsed = parseBaselineOutput({
      stdout: '=========================== 145 passed, 2 failed, 8 skipped in 47.23s ============================',
      stderr: '',
      exitCode: 1,
      durationMs: 47_230,
    });
    expect(parsed.passed).toBe(145);
    expect(parsed.failed).toBe(2);
    expect(parsed.skipped).toBe(8);
  });

  it('parseBaselineOutput: extracts failed test ids', () => {
    const parsed = parseBaselineOutput({
      stdout: [
        '=================== FAILURES ===================',
        'FAILED tests/unit/foo_test.py::test_a',
        'FAILED tests/integration/bar_test.py::test_b',
        '2 failed, 10 passed',
      ].join('\n'),
      stderr: '',
      exitCode: 1,
      durationMs: 1000,
    });
    expect(parsed.failedTestIds).toContain('tests/unit/foo_test.py::test_a');
    expect(parsed.failedTestIds).toContain('tests/integration/bar_test.py::test_b');
    expect(parsed.passed).toBe(10);
    expect(parsed.failed).toBe(2);
  });

  it('parseBaselineOutput: extracts vitest summary', () => {
    const parsed = parseBaselineOutput({
      stdout: 'Tests  2 failed | 48 passed (50)',
      stderr: '',
      exitCode: 1,
      durationMs: 3000,
    });
    expect(parsed.passed).toBe(48);
    expect(parsed.failed).toBe(2);
  });

  // @feature5 full pipeline via mock + parser
  it('full baseline run → record duration rounded to 0.1s', async () => {
    ctx = await runBeforeEach('fake-python-api');

    const deps = depsReturning({
      exitCode: 0,
      stdout: '100 passed in 3.47s',
      stderr: '',
      durationMs: 3_467,
      passed: 100,
      failed: 0,
      skipped: 0,
      failedTestIds: [],
    });

    const result = await runBaselineTests(
      { projectPath: ctx.tmpdir, testFramework: 'pytest', testCommand: 'pytest' },
      deps,
    );

    expect(result.duration_s).toBe(3.5);
    expect(result.passed).toBe(100);
  });
});
