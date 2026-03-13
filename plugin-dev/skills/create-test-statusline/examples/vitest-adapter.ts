/**
 * Vitest stdout adapter — parses vitest output into TestEvent objects.
 * This is a TypeScript REFERENCE implementation for studying the pattern.
 * For use in the CJS wrapper, port the parseLine logic to plain JavaScript.
 *
 * Source: extracted from extensions/tui-test-runner/tools/tui-test-runner/adapters/vitest_adapter.ts
 */

// --- TestEvent interface ---
// Shared by all adapters. The wrapper consumes these to update YAML status.
interface TestEvent {
  type: 'suite_start' | 'suite_end' | 'test_start' | 'test_pass'
      | 'test_fail' | 'test_skip' | 'summary' | 'error' | 'log';
  suiteName?: string;
  suiteFile?: string;
  testName?: string;
  duration?: number;      // milliseconds
  errorMessage?: string;
  stackTrace?: string;
  summary?: {
    total: number;
    passed: number;
    failed: number;
  };
}

// --- Vitest output patterns ---
// These match vitest's default reporter output.
// Unicode markers (✓/✗/○) and ASCII fallbacks (√/×/↓) are both supported.
const RE_SUITE_START = /^\s*(?:❯|>)\s+(.+\.(?:test|spec)\.\w+)/;
const RE_TEST_PASS  = /^\s*(?:✓|√|PASS)\s+(.+?)(?:\s+(\d+)\s*ms)?$/;
const RE_TEST_FAIL  = /^\s*(?:✗|×|FAIL)\s+(.+?)(?:\s+(\d+)\s*ms)?$/;
const RE_TEST_SKIP  = /^\s*(?:○|↓|SKIP|skipped)\s+(.+)$/;
const RE_SUMMARY    = /Tests?\s+(\d+)\s+(passed|failed)/i;
const RE_SUMMARY_TOTAL  = /(\d+)\s+total/i;
const RE_SUMMARY_FAILED = /(\d+)\s+failed/i;
const RE_SUMMARY_PASSED = /(\d+)\s+passed/i;
const RE_ERROR_LINE = /^(Error|AssertionError|TypeError|ReferenceError):/;
const RE_STACK_LINE = /^\s+at\s+/;

// --- Adapter state ---
// Minimal state: current suite name and pending error (to attach to next test_fail).
let currentSuite = '';
let pendingError: string | undefined;
let pendingStack: string[] = [];

/**
 * Parse one line of vitest stdout output.
 * Returns a TestEvent if the line matches a known pattern, or null.
 */
export function parseLine(line: string): TestEvent | null {
  // Suite start (file header)
  const suiteMatch = line.match(RE_SUITE_START);
  if (suiteMatch) {
    currentSuite = suiteMatch[1].trim();
    return { type: 'suite_start', suiteName: currentSuite, suiteFile: currentSuite };
  }

  // Test passed
  const passMatch = line.match(RE_TEST_PASS);
  if (passMatch) {
    return {
      type: 'test_pass',
      suiteName: currentSuite,
      testName: passMatch[1].trim(),
      duration: passMatch[2] ? parseInt(passMatch[2], 10) : undefined,
    };
  }

  // Test failed
  const failMatch = line.match(RE_TEST_FAIL);
  if (failMatch) {
    const event: TestEvent = {
      type: 'test_fail',
      suiteName: currentSuite,
      testName: failMatch[1].trim(),
      duration: failMatch[2] ? parseInt(failMatch[2], 10) : undefined,
      errorMessage: pendingError,
      stackTrace: pendingStack.length > 0 ? pendingStack.join('\n') : undefined,
    };
    pendingError = undefined;
    pendingStack = [];
    return event;
  }

  // Test skipped
  const skipMatch = line.match(RE_TEST_SKIP);
  if (skipMatch) {
    return { type: 'test_skip', suiteName: currentSuite, testName: skipMatch[1].trim() };
  }

  // Error line (collect for next test_fail)
  if (RE_ERROR_LINE.test(line)) {
    pendingError = line.trim();
    pendingStack = [];
    return null;
  }

  // Stack trace line (collect)
  if (RE_STACK_LINE.test(line) && pendingError) {
    pendingStack.push(line.trim());
    return null;
  }

  // Summary line
  if (RE_SUMMARY.test(line)) {
    const passed = line.match(RE_SUMMARY_PASSED)?.[1];
    const failed = line.match(RE_SUMMARY_FAILED)?.[1];
    const total = line.match(RE_SUMMARY_TOTAL)?.[1];
    return {
      type: 'summary',
      summary: {
        passed: passed ? parseInt(passed, 10) : 0,
        failed: failed ? parseInt(failed, 10) : 0,
        total: total ? parseInt(total, 10) : 0,
      },
    };
  }

  return null;
}
