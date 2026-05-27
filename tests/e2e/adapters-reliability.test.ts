import { describe, it, expect } from 'vitest';
import { JestAdapter } from '../../extensions/tui-test-runner/tools/tui-test-runner/adapters/jest_adapter.ts';
import { PytestAdapter } from '../../extensions/tui-test-runner/tools/tui-test-runner/adapters/pytest_adapter.ts';
import { DotnetAdapter } from '../../extensions/tui-test-runner/tools/tui-test-runner/adapters/dotnet_adapter.ts';
import { CargoAdapter } from '../../extensions/tui-test-runner/tools/tui-test-runner/adapters/cargo_adapter.ts';
import { GoTestAdapter } from '../../extensions/tui-test-runner/tools/tui-test-runner/adapters/go_test_adapter.ts';
import { GenericAdapter } from '../../extensions/tui-test-runner/tools/tui-test-runner/adapters/generic_adapter.ts';

// FBOL003 — Adapter parsing reliability (5 frameworks + generic)
// Synthetic-input reliability benchmark (FR-15 expansion v0.3.0).
// Each adapter receives known framework output samples → events compared with expectations.
// Proxy for full e2e reliability — covers parsing correctness when actual test projects unavailable.

describe('FBOL003: Adapter parsing reliability (5 frameworks + generic)', () => {
  // @feature15
  it('FBOL003_01: JestAdapter parses PASS/FAIL/skip + summary', () => {
    const adapter = new JestAdapter();
    const lines = [
      'PASS tests/utils/parse.test.ts',
      '  ✓ parses valid input (5 ms)',
      '  ✕ fails on empty (10 ms)',
      '  ○ skipped edge case',
      'Tests:       1 failed, 1 passed, 1 skipped, 3 total',
    ];
    const events = lines.map((l) => adapter.parseLine(l)).filter(Boolean);
    expect(events).toHaveLength(5);
    expect(events[0]?.type).toBe('suite_start');
    expect(events[1]?.type).toBe('test_pass');
    expect(events[1]?.duration).toBe(5);
    expect(events[2]?.type).toBe('test_fail');
    expect(events[2]?.duration).toBe(10);
    expect(events[3]?.type).toBe('test_skip');
    expect(events[4]?.type).toBe('summary');
    expect(events[4]?.summary).toEqual({ passed: 1, failed: 1, total: 3 });
  });

  // @feature15
  it('FBOL003_02: PytestAdapter parses verbose output', () => {
    const adapter = new PytestAdapter();
    const lines = [
      'tests/test_parse.py::test_valid PASSED                                    [ 33%]',
      'tests/test_parse.py::test_empty FAILED                                    [ 66%]',
      'tests/test_parse.py::test_edge SKIPPED                                    [100%]',
    ];
    const events = lines.map((l) => adapter.parseLine(l)).filter(Boolean);
    expect(events.length).toBeGreaterThanOrEqual(3);
    const types = events.map((e) => e?.type);
    expect(types).toContain('test_pass');
    expect(types).toContain('test_fail');
    expect(types).toContain('test_skip');
  });

  // @feature15
  it('FBOL003_03: DotnetAdapter parses xunit/mstest output', () => {
    const adapter = new DotnetAdapter();
    const lines = [
      '  Passed Pomogator.Tests.ParseTests.ParsesValid [5 ms]',
      '  Failed Pomogator.Tests.ParseTests.FailsEmpty [12 ms]',
      '  Skipped Pomogator.Tests.ParseTests.EdgeCase',
    ];
    const events = lines.map((l) => adapter.parseLine(l)).filter(Boolean);
    expect(events.length).toBeGreaterThanOrEqual(3);
    const types = events.map((e) => e?.type);
    expect(types).toContain('test_pass');
    expect(types).toContain('test_fail');
    expect(types).toContain('test_skip');
  });

  // @feature15
  it('FBOL003_04: CargoAdapter parses test result lines', () => {
    const adapter = new CargoAdapter();
    const lines = [
      'test tests::parses_valid ... ok',
      'test tests::fails_on_empty ... FAILED',
      'test tests::edge_case ... ignored',
    ];
    const events = lines.map((l) => adapter.parseLine(l)).filter(Boolean);
    expect(events.length).toBeGreaterThanOrEqual(3);
    const types = events.map((e) => e?.type);
    expect(types).toContain('test_pass');
    expect(types).toContain('test_fail');
    expect(types).toContain('test_skip');
  });

  // @feature15
  it('FBOL003_05: GoTestAdapter parses go test output', () => {
    const adapter = new GoTestAdapter();
    const lines = [
      '=== RUN   TestParsesValid',
      '--- PASS: TestParsesValid (0.05s)',
      '=== RUN   TestFailsOnEmpty',
      '--- FAIL: TestFailsOnEmpty (0.12s)',
      '=== RUN   TestEdgeCase',
      '--- SKIP: TestEdgeCase (0.00s)',
    ];
    const events = lines.map((l) => adapter.parseLine(l)).filter(Boolean);
    const types = events.map((e) => e?.type);
    expect(types).toContain('test_pass');
    expect(types).toContain('test_fail');
    expect(types).toContain('test_skip');
  });

  // @feature11
  it('FBOL003_06: GenericAdapter returns null for ANY line (passthrough)', () => {
    const adapter = new GenericAdapter();
    const lines = [
      'Building...',
      'Compiled successfully',
      '✓ Done',
      'Error: something broke',
      'PASS tests/foo.test.ts',  // Would parse for Jest, must NOT parse for generic
      '✓ test passed (5 ms)',     // Would parse for Jest, must NOT parse for generic
    ];
    const events = lines.map((l) => adapter.parseLine(l));
    expect(events.every((e) => e === null)).toBe(true);
  });
});
