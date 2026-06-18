/**
 * Unit: bdd-migrator planner — parseScenarios (tools/bdd-migrator/migrate.ts).
 *
 * The migrator tool shipped with NO tests; a 1-char id-regex bug (SRC001_05b parsed as SRC001_05,
 * colliding with its base) lived undetected until the planner was dogfooded on spec-reality-check.
 * This pins the fix + the parser's invariants (id extraction, tag-state detection, cardinality).
 */
import { describe, it, expect } from 'vitest';
import { parseScenarios } from '../migrate.ts';

const FEATURE = `Feature: X

  @feature2
  Scenario: SRC001_02 real-tagged
    Given a

  # @feature2
  Scenario: SRC001_05 comment-tagged
    Given b

  Scenario: SRC001_05b untagged suffix
    Given c
`;

describe('bdd-migrator parseScenarios', () => {
  it('keeps a letter-suffixed id distinct from its base (regression: SRC001_05b ≠ SRC001_05)', () => {
    const ids = parseScenarios(FEATURE).map((s) => s.id);
    expect(ids).toEqual(['SRC001_02', 'SRC001_05', 'SRC001_05b']);
    expect(new Set(ids).size, '05b must not collapse into 05').toBe(3);
  });

  it('detects tag-state: real @tag line vs # comment vs none', () => {
    const states = parseScenarios(FEATURE).map((s) => s.tagState);
    expect(states).toEqual(['real', 'comment', 'none']);
  });

  it('conserves cardinality: N Scenario lines → N entries (no drop, no dup)', () => {
    expect(parseScenarios(FEATURE)).toHaveLength(3);
  });
});
