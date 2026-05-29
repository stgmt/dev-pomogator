/**
 * Unit tests for the Gherkin parser slice (Phase 1, FR-2).
 *
 * Pin the four Phase-1 invariants: every Scenario produces exactly one
 * ScenarioNode with its source line, feature-level + scenario-level tags both
 * land on the node, a `tested-by` edge is emitted for every recognised
 * `@FR-N` / `@NFR-X-N` / `@AC-N(.M)` tag, and malformed Gherkin returns an
 * empty slice rather than throwing.
 */

import { describe, it, expect } from 'vitest';
import { parseGherkin } from '../parsers/gherkin.ts';
import type { ScenarioNode } from '../types.ts';

describe('parseGherkin — Scenario / tag / edge extraction', () => {
  it('emits one ScenarioNode per Scenario with steps + tags + line', () => {
    const source = [
      '@FR-1',
      'Feature: Auth',
      '',
      '  @AC-3',
      '  Scenario: User logs in successfully',
      '    Given a registered user',
      '    When they submit valid credentials',
      '    Then they are redirected to /home',
    ].join('\n');

    const out = parseGherkin(source, 'tests/Auth.feature');

    expect(out.nodes).toHaveLength(1);
    const scen = out.nodes[0] as ScenarioNode;
    expect(scen.type).toBe('Scenario');
    expect(scen.id).toBe('SCEN-user-logs-in-successfully');
    expect(scen.file).toBe('tests/Auth.feature');
    expect(scen.line).toBe(5); // 1-indexed; line 1 is `@FR-1`
    expect(scen.tags).toEqual(['@FR-1', '@AC-3']);
    expect(scen.steps).toEqual([
      { keyword: 'Given', text: 'a registered user' },
      { keyword: 'When', text: 'they submit valid credentials' },
      { keyword: 'Then', text: 'they are redirected to /home' },
    ]);
  });

  it('emits a `tested-by` edge for every recognised spec tag', () => {
    const source = [
      '@FR-1 @AC-3 @NFR-Performance-2 @custom-tag',
      'Feature: Auth',
      '  Scenario: Login',
      '    Given x',
      '    Then y',
    ].join('\n');

    const out = parseGherkin(source, 't.feature');

    expect(out.edges).toEqual([
      { from: 'FR-1', to: 'SCEN-login', type: 'tested-by' },
      { from: 'AC-3', to: 'SCEN-login', type: 'tested-by' },
      { from: 'NFR-Performance-2', to: 'SCEN-login', type: 'tested-by' },
      // `@custom-tag` is NOT recognised as a spec id, no edge emitted.
    ]);
  });

  it('handles dotted AC ids in tags (`@AC-N.M`)', () => {
    const source = [
      '@AC-2.1',
      'Feature: Edge',
      '  Scenario: Sub-criterion verified',
      '    Given x',
      '    Then y',
    ].join('\n');

    const out = parseGherkin(source, 't.feature');
    expect(out.edges).toEqual([
      { from: 'AC-2.1', to: 'SCEN-sub-criterion-verified', type: 'tested-by' },
    ]);
  });

  it('disambiguates duplicate scenario names with a numeric suffix', () => {
    const source = [
      'Feature: Auth',
      '  Scenario: Login',
      '    Given x',
      '    Then y',
      '  Scenario: Login',
      '    Given a',
      '    Then b',
    ].join('\n');

    const out = parseGherkin(source, 't.feature');
    expect(out.nodes.map((n) => n.id)).toEqual([
      'SCEN-login',
      'SCEN-login-2',
    ]);
  });

  it('returns an empty slice for malformed Gherkin (no throw)', () => {
    const source = 'this is not gherkin at all\n@bogus tag with spaces\nWhat?';
    const out = parseGherkin(source, 'bad.feature');
    expect(out).toEqual({ nodes: [], edges: [], anchors: [] });
  });

  it('returns an empty slice for an empty file', () => {
    const out = parseGherkin('', 'empty.feature');
    expect(out).toEqual({ nodes: [], edges: [], anchors: [] });
  });

  it('propagates only feature-level tags when scenario has none', () => {
    const source = [
      '@FR-9',
      'Feature: Only feature-level tag',
      '  Scenario: No tags here',
      '    Given x',
      '    Then y',
    ].join('\n');

    const out = parseGherkin(source, 't.feature');
    const scen = out.nodes[0] as ScenarioNode;
    expect(scen.tags).toEqual(['@FR-9']);
    expect(out.edges).toEqual([
      { from: 'FR-9', to: 'SCEN-no-tags-here', type: 'tested-by' },
    ]);
  });
});
