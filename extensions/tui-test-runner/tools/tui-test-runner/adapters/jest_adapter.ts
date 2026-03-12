/**
 * Jest stdout parser → TestEvent
 * Parses Jest output format (PASS/FAIL file headers, ✓/✕ test lines)
 */

import { AdapterBase } from './adapter_base.js';
import type { TestEvent } from './types.js';

const RE_SUITE_PASS = /^\s*(PASS)\s+(.+)$/;
const RE_SUITE_FAIL = /^\s*(FAIL)\s+(.+)$/;
const RE_TEST_PASS = /^\s*(✓|√)\s+(.+?)\s*(?:\((\d+)\s*ms\))?$/;
const RE_TEST_FAIL = /^\s*(✕|✗|×)\s+(.+?)\s*(?:\((\d+)\s*ms\))?$/;
const RE_TEST_SKIP = /^\s*(○|⊘)\s+(.+)$/;
const RE_SUMMARY = /Tests:\s+/;
const RE_SUMMARY_PASSED = /(\d+)\s+passed/;
const RE_SUMMARY_FAILED = /(\d+)\s+failed/;
const RE_SUMMARY_TOTAL = /(\d+)\s+total/;

export class JestAdapter extends AdapterBase {
  parseLine(line: string): TestEvent | null {
    const suitePassMatch = line.match(RE_SUITE_PASS);
    if (suitePassMatch) {
      this.suiteName = suitePassMatch[2].trim();
      this.suiteFile = this.suiteName;
      return this.event('suite_start');
    }

    const suiteFailMatch = line.match(RE_SUITE_FAIL);
    if (suiteFailMatch) {
      this.suiteName = suiteFailMatch[2].trim();
      this.suiteFile = this.suiteName;
      return this.event('suite_start');
    }

    const passMatch = line.match(RE_TEST_PASS);
    if (passMatch) {
      return this.event('test_pass', {
        testName: passMatch[2].trim(),
        duration: passMatch[3] ? parseInt(passMatch[3], 10) : undefined,
      });
    }

    const failMatch = line.match(RE_TEST_FAIL);
    if (failMatch) {
      return this.event('test_fail', {
        testName: failMatch[2].trim(),
        duration: failMatch[3] ? parseInt(failMatch[3], 10) : undefined,
      });
    }

    const skipMatch = line.match(RE_TEST_SKIP);
    if (skipMatch) {
      return this.event('test_skip', { testName: skipMatch[2].trim() });
    }

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
