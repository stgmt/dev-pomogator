/**
 * go test stdout parser -> TestEvent.
 */

import { AdapterBase } from './adapter_base.js';
import type { TestEvent } from './types.js';

const RE_TEST_START = /^=== RUN\s+(.+)$/;
const RE_TEST_RESULT = /^--- (PASS|FAIL|SKIP):\s+(.+?)(?:\s+\(([\d.]+)s\))?$/;

export class GoAdapter extends AdapterBase {
  constructor() {
    super();
    this.suiteName = 'go';
    this.suiteFile = 'go';
  }

  parseLine(line: string): TestEvent | null {
    const startMatch = line.match(RE_TEST_START);
    if (startMatch) {
      return this.event('test_start', { testName: startMatch[1].trim() });
    }

    const resultMatch = line.match(RE_TEST_RESULT);
    if (resultMatch) {
      const durationSeconds = resultMatch[3] ? Number.parseFloat(resultMatch[3]) : undefined;
      const duration = durationSeconds !== undefined ? Math.round(durationSeconds * 1000) : undefined;

      switch (resultMatch[1]) {
        case 'PASS':
          return this.event('test_pass', { testName: resultMatch[2].trim(), duration });
        case 'FAIL':
          return this.event('test_fail', { testName: resultMatch[2].trim(), duration });
        case 'SKIP':
          return this.event('test_skip', { testName: resultMatch[2].trim(), duration });
        default:
          return null;
      }
    }

    return null;
  }
}
