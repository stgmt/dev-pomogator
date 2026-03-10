/**
 * pytest stdout parser → TestEvent
 * Parses pytest output format (PASSED/FAILED/SKIPPED markers, :: path separators)
 */

import { AdapterBase } from './adapter_base.js';
import type { TestEvent } from './types.js';

const RE_COLLECTING = /^collecting\s+\.\.\./;
const RE_TEST_RESULT = /^(.+?::.*?)\s+(PASSED|FAILED|SKIPPED|ERROR)(?:\s+\[.*?\])?\s*$/;
const RE_SHORT_RESULT = /^\s*(PASSED|FAILED|SKIPPED|ERROR)\s+(.+)$/;
const RE_PROGRESS = /^\s*(.+?)\s+(PASSED|FAILED|SKIPPED|ERROR)\s+\[\s*(\d+)%\]/;
const RE_SUMMARY = /^=+\s+(.+?)\s+=+$/;
const RE_SUMMARY_COUNTS = /(\d+)\s+(passed|failed|skipped|error|warning)/g;
const RE_ERROR_HEADER = /^(E\s+|>\s+)/;

export class PytestAdapter extends AdapterBase {
  parseLine(line: string): TestEvent | null {
    // Test result with progress: test_file.py::test_name PASSED [ 50%]
    const progressMatch = line.match(RE_PROGRESS);
    if (progressMatch) {
      return this.parseResult(progressMatch[1].trim(), progressMatch[2]);
    }

    // Test result: test_file.py::TestClass::test_name PASSED
    const resultMatch = line.match(RE_TEST_RESULT);
    if (resultMatch) {
      return this.parseResult(resultMatch[1].trim(), resultMatch[2]);
    }

    // Short format: PASSED test_name
    const shortMatch = line.match(RE_SHORT_RESULT);
    if (shortMatch) {
      return this.parseResult(shortMatch[2].trim(), shortMatch[1]);
    }

    // Summary line: ===== 5 passed, 1 failed in 2.34s =====
    if (RE_SUMMARY.test(line)) {
      const counts: Record<string, number> = {};
      let m;
      while ((m = RE_SUMMARY_COUNTS.exec(line)) !== null) {
        counts[m[2]] = parseInt(m[1], 10);
      }
      return this.event('summary', {
        testName: `passed:${counts.passed || 0} failed:${counts.failed || 0} total:${(counts.passed || 0) + (counts.failed || 0) + (counts.skipped || 0)}`,
      });
    }

    return null;
  }

  private parseResult(fullName: string, status: string): TestEvent {
    // Extract suite and test from pytest :: format
    const parts = fullName.split('::');
    const file = parts[0];
    const testName = parts.slice(1).join('::') || fullName;
    this.suiteName = file;
    this.suiteFile = file;

    const statusMap: Record<string, TestEvent['type']> = {
      'PASSED': 'test_pass',
      'FAILED': 'test_fail',
      'SKIPPED': 'test_skip',
      'ERROR': 'test_fail',
    };

    return this.event(statusMap[status] || 'test_fail', { testName });
  }
}
