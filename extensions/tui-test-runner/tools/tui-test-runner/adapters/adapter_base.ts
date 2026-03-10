/**
 * Abstract base for framework-specific stdout parsers.
 * Each adapter converts raw test output lines into TestEvent objects.
 */

import type { TestEvent, TestEventType } from './types.js';

export abstract class AdapterBase {
  protected suiteName: string | undefined;
  protected suiteFile: string | undefined;

  /** Parse a single stdout line. Return TestEvent if matched, null otherwise. */
  abstract parseLine(line: string): TestEvent | null;

  /** Create a TestEvent with current timestamp */
  protected event(
    type: TestEventType,
    overrides: Partial<Omit<TestEvent, 'type' | 'timestamp'>> = {},
  ): TestEvent {
    return {
      type,
      timestamp: new Date().toISOString(),
      suiteName: this.suiteName,
      suiteFile: this.suiteFile,
      ...overrides,
    };
  }

  /** Process multiple lines, yielding events */
  *processLines(lines: string[]): Generator<TestEvent> {
    for (const line of lines) {
      const ev = this.parseLine(line);
      if (ev) yield ev;
    }
  }
}
