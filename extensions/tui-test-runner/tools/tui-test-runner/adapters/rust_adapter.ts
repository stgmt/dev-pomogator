/**
 * cargo test stdout parser -> TestEvent.
 */

import { AdapterBase } from './adapter_base.ts';
import type { TestEvent } from './types.ts';

const RE_TEST_RESULT = /^test\s+(.+?)\s+\.\.\.\s+(ok|FAILED|ignored)$/;
const RE_SUMMARY = /^test result:\s+(ok|FAILED)\.\s+(.+)$/;
const RE_SUMMARY_COUNTS = /(\d+)\s+(passed|failed|ignored)/g;

export class RustAdapter extends AdapterBase {
  parseLine(line: string): TestEvent | null {
    const resultMatch = line.match(RE_TEST_RESULT);
    if (resultMatch) {
      const { suite, test } = this.splitRustName(resultMatch[1].trim());
      this.suiteName = suite;
      this.suiteFile = suite;

      switch (resultMatch[2]) {
        case 'ok':
          return this.event('test_pass', { testName: test });
        case 'FAILED':
          return this.event('test_fail', { testName: test });
        case 'ignored':
          return this.event('test_skip', { testName: test });
        default:
          return null;
      }
    }

    if (RE_SUMMARY.test(line)) {
      const counts: Record<string, number> = {};
      let match: RegExpExecArray | null;
      while ((match = RE_SUMMARY_COUNTS.exec(line)) !== null) {
        counts[match[2]] = parseInt(match[1], 10);
      }
      return this.event('summary', {
        summary: {
          passed: counts.passed || 0,
          failed: counts.failed || 0,
          skipped: counts.ignored || 0,
          total: (counts.passed || 0) + (counts.failed || 0) + (counts.ignored || 0),
        },
      });
    }

    return null;
  }

  private splitRustName(fullName: string): { suite: string; test: string } {
    const lastSep = fullName.lastIndexOf('::');
    if (lastSep === -1) {
      return { suite: 'rust', test: fullName };
    }

    return {
      suite: fullName.substring(0, lastSep),
      test: fullName.substring(lastSep + 2),
    };
  }
}
