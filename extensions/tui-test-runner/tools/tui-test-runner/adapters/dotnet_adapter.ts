/**
 * dotnet test stdout parser → TestEvent
 * Parses dotnet test output (Passed/Failed markers, namespace.class.method format)
 */

import { AdapterBase } from './adapter_base.ts';
import type { TestEvent } from './types.ts';

const RE_TEST_PASSED = /^\s*Passed\s+(.+?)(?:\s+\[(\d+)\s*(?:ms|s)\])?$/;
const RE_TEST_FAILED = /^\s*Failed\s+(.+?)(?:\s+\[(\d+)\s*(?:ms|s)\])?$/;
const RE_TEST_SKIPPED = /^\s*Skipped\s+(.+)$/;
const RE_SUMMARY = /^\s*(Total tests|Passed|Failed|Skipped):\s*(\d+)/;
const RE_MINIMAL_SUMMARY =
  /^(Passed|Failed)!\s+-\s+Failed:\s*(\d+),\s*Passed:\s*(\d+),\s*Skipped:\s*(\d+),\s*Total:\s*(\d+)/;
const RE_TEST_RUN = /^Test Run (Successful|Failed)/;
const RE_DURATION = /Total time:\s*([\d.]+)\s*(Seconds|Minutes)/i;
const RE_ERROR = /^\s+(Expected|Assert|Exception|Error|at\s)/;

export class DotnetAdapter extends AdapterBase {
  private summaryStats: Record<'passed' | 'failed' | 'skipped' | 'total', number> = {
    passed: 0,
    failed: 0,
    skipped: 0,
    total: 0,
  };

  parseLine(line: string): TestEvent | null {
    const passMatch = line.match(RE_TEST_PASSED);
    if (passMatch) {
      const { suite, test } = this.splitDotnetName(passMatch[1].trim());
      this.suiteName = suite;
      return this.event('test_pass', {
        testName: test,
        duration: passMatch[2] ? this.parseDuration(passMatch[2], line) : undefined,
      });
    }

    const failMatch = line.match(RE_TEST_FAILED);
    if (failMatch) {
      const { suite, test } = this.splitDotnetName(failMatch[1].trim());
      this.suiteName = suite;
      return this.event('test_fail', {
        testName: test,
        duration: failMatch[2] ? this.parseDuration(failMatch[2], line) : undefined,
      });
    }

    const skipMatch = line.match(RE_TEST_SKIPPED);
    if (skipMatch) {
      const { suite, test } = this.splitDotnetName(skipMatch[1].trim());
      this.suiteName = suite;
      return this.event('test_skip', { testName: test });
    }

    const summaryMatch = line.match(RE_SUMMARY);
    if (summaryMatch) {
      const key = summaryMatch[1].toLowerCase();
      const value = parseInt(summaryMatch[2], 10);
      if (key === 'total tests') this.summaryStats.total = value;
      if (key === 'passed') this.summaryStats.passed = value;
      if (key === 'failed') this.summaryStats.failed = value;
      if (key === 'skipped') this.summaryStats.skipped = value;
      return this.event('summary', {
        summary: {
          total: this.summaryStats.total,
          passed: this.summaryStats.passed,
          failed: this.summaryStats.failed,
          skipped: this.summaryStats.skipped,
        },
      });
    }

    const minimalMatch = line.match(RE_MINIMAL_SUMMARY);
    if (minimalMatch) {
      this.summaryStats.failed = parseInt(minimalMatch[2], 10);
      this.summaryStats.passed = parseInt(minimalMatch[3], 10);
      this.summaryStats.skipped = parseInt(minimalMatch[4], 10);
      this.summaryStats.total = parseInt(minimalMatch[5], 10);
      return this.event('summary', {
        summary: {
          total: this.summaryStats.total,
          passed: this.summaryStats.passed,
          failed: this.summaryStats.failed,
          skipped: this.summaryStats.skipped,
        },
      });
    }

    if (RE_TEST_RUN.test(line)) {
      return this.event('summary', {
        summary: {
          total: this.summaryStats.total,
          passed: this.summaryStats.passed,
          failed: this.summaryStats.failed,
          skipped: this.summaryStats.skipped,
        },
      });
    }

    return null;
  }

  /** Split dotnet Namespace.Class.Method into suite/test */
  private splitDotnetName(fullName: string): { suite: string; test: string } {
    const lastDot = fullName.lastIndexOf('.');
    if (lastDot === -1) return { suite: 'default', test: fullName };
    return {
      suite: fullName.substring(0, lastDot),
      test: fullName.substring(lastDot + 1),
    };
  }

  private parseDuration(value: string, line: string): number {
    const num = parseInt(value, 10);
    if (line.includes('s]') && !line.includes('ms]')) return num * 1000;
    return num;
  }
}
