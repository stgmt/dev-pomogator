/**
 * Vitest stdout parser → TestEvent
 * Parses vitest output format (✓/✗/○ markers, summary lines, suite headers)
 */

import { AdapterBase } from './adapter_base.js';
import type { TestEvent } from './types.js';

// Vitest output patterns
const RE_SUITE_START = /^\s*(❯|>)\s+(.+\.(?:test|spec)\.\w+)/;
const RE_DOCKER_SUITE = /^(?:stdout|stderr)\s+\|\s+(.+\.(?:test|spec)\.\w+)/;
const RE_TEST_PASS = /^\s*(✓|√)\s+(.+?)(?:\s+(\d+)\s*ms)?$/;
const RE_TEST_FAIL = /^\s*(✗|×)\s+(.+?)(?:\s+(\d+)\s*ms)?$/;
const RE_FILE_LEVEL_RESULT = /^\s*(?:✓|√|✗|×)\s+\S+\.(?:test|spec)\.\w+\s*\(/;
const RE_TEST_SKIP = /^\s*(○|↓|SKIP|skipped)\s+(.+)$/;
const RE_SUMMARY = /Tests?\s+(\d+)\s+(passed|failed)/i;
const RE_SUMMARY_TOTAL = /(\d+)\s+total/i;
const RE_SUMMARY_FAILED = /(\d+)\s+failed/i;
const RE_SUMMARY_PASSED = /(\d+)\s+passed/i;
const RE_ERROR_LINE = /^(Error|AssertionError|TypeError|ReferenceError):/;
const RE_STACK_LINE = /^\s+at\s+/;

export class VitestAdapter extends AdapterBase {
  private pendingError: string | undefined;
  private pendingStack: string[] = [];

  parseLine(line: string): TestEvent | null {
    // Suite start (normal vitest output)
    const suiteMatch = line.match(RE_SUITE_START);
    if (suiteMatch) {
      this.suiteName = suiteMatch[2].trim();
      this.suiteFile = this.suiteName;
      return this.event('suite_start');
    }

    // Suite start (Docker output: "stdout | tests/e2e/file.test.ts > ...")
    const dockerSuiteMatch = line.match(RE_DOCKER_SUITE);
    if (dockerSuiteMatch) {
      this.suiteName = dockerSuiteMatch[1].trim();
      this.suiteFile = this.suiteName;
      return this.event('suite_start');
    }

    if (RE_FILE_LEVEL_RESULT.test(line)) {
      return null;
    }

    // Test passed
    const passMatch = line.match(RE_TEST_PASS);
    if (passMatch) {
      return this.event('test_pass', {
        testName: passMatch[2].trim(),
        duration: passMatch[3] ? parseInt(passMatch[3], 10) : undefined,
      });
    }

    // Test failed
    const failMatch = line.match(RE_TEST_FAIL);
    if (failMatch) {
      const ev = this.event('test_fail', {
        testName: failMatch[2].trim(),
        duration: failMatch[3] ? parseInt(failMatch[3], 10) : undefined,
        errorMessage: this.pendingError,
        stackTrace: this.pendingStack.length > 0 ? this.pendingStack.join('\n') : undefined,
      });
      this.pendingError = undefined;
      this.pendingStack = [];
      return ev;
    }

    // Test skipped
    const skipMatch = line.match(RE_TEST_SKIP);
    if (skipMatch) {
      return this.event('test_skip', {
        testName: skipMatch[2].trim(),
      });
    }

    // Error line (collect for next test_fail)
    if (RE_ERROR_LINE.test(line)) {
      this.pendingError = line.trim();
      this.pendingStack = [];
      return null;
    }

    // Stack trace line (collect)
    if (RE_STACK_LINE.test(line) && this.pendingError) {
      this.pendingStack.push(line.trim());
      return null;
    }

    // Summary line
     if (RE_SUMMARY.test(line)) {
       const passed = line.match(RE_SUMMARY_PASSED)?.[1];
       const failed = line.match(RE_SUMMARY_FAILED)?.[1];
       const total = line.match(RE_SUMMARY_TOTAL)?.[1];
       return this.event('summary', {
         summary: {
           passed: passed ? parseInt(passed, 10) : 0,
           failed: failed ? parseInt(failed, 10) : 0,
           total: total ? parseInt(total, 10) : 0,
         },
       });
     }

    return null;
  }
}
