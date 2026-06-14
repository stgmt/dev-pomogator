// Tests for the v3 → v4 tag predictor (FR-11: predict @FR-N for untagged scenarios).
// Pure-function coverage: the FR-11 worked example, already-tagged skip, no-confident-match
// (must NOT force a bad tag), v3/v4 FR extraction, and the stdout renderer.

import { describe, it, expect } from 'vitest';
import { predictTags, extractFrs, tokenize, renderTagSuggestions } from '../tag-predictor.ts';

const FRS = [
  { frId: 'FR-001', title: 'User login and authentication', body: 'The system SHALL allow a user to login with email and password.' },
  { frId: 'FR-002', title: 'Export report to PDF', body: 'Generate a PDF export of the dashboard.' },
];

describe('predictTags — FR-11 naming heuristic', () => {
  it('suggests @FR-001 for an untagged "User logs in" scenario (FR-11 worked example)', () => {
    const feature = 'Feature: demo\n\n  Scenario: User logs in\n    Given the login page\n';
    const [s] = predictTags(feature, FRS);
    expect(s.alreadyTagged).toBe(false);
    expect(s.suggestedTag).toBe('@FR-001'); // "logs" stems to "log" ↔ FR-001 "login"
    expect(s.frId).toBe('FR-001');
    expect(s.score).toBeGreaterThan(0);
  });

  it('skips an already-tagged scenario (no suggestion, alreadyTagged=true)', () => {
    const feature = 'Feature: demo\n\n  @FR-002\n  Scenario: Export the monthly report\n    Given a dashboard\n';
    const [s] = predictTags(feature, FRS);
    expect(s.alreadyTagged).toBe(true);
    expect(s.suggestedTag).toBeNull();
  });

  it('does NOT force a tag when no FR is relevant (suggestedTag null, below threshold)', () => {
    const feature = 'Feature: demo\n\n  Scenario: Quantum teleportation of widgets\n    Given nothing\n';
    const [s] = predictTags(feature, FRS);
    expect(s.alreadyTagged).toBe(false);
    expect(s.suggestedTag).toBeNull();
    expect(s.frId).toBeNull();
  });

  it('handles Scenario Outline and reports one suggestion per scenario', () => {
    const feature =
      'Feature: demo\n\n  Scenario: User logs in\n    Given x\n\n  Scenario Outline: Export <fmt> report\n    Given y\n';
    const out = predictTags(feature, FRS);
    expect(out).toHaveLength(2);
    expect(out[0].suggestedTag).toBe('@FR-001');
    expect(out[1].suggestedTag).toBe('@FR-002'); // "Export ... report" ↔ FR-002
  });

  it('respects a custom threshold (high threshold suppresses weak matches)', () => {
    const feature = 'Feature: demo\n\n  Scenario: User logs in somewhere else entirely today\n    Given x\n';
    // Only "logs" matches of many tokens → low score → suppressed at threshold 0.9.
    expect(predictTags(feature, FRS, { threshold: 0.9 })[0].suggestedTag).toBeNull();
  });
});

describe('tokenize', () => {
  it('lowercases, splits on non-word, drops stopwords + sub-3-char tokens', () => {
    expect(tokenize('The User logs IN to a System')).toEqual(['logs']);
  });
});

describe('extractFrs', () => {
  it('extracts both v3 (### Requirement: FR-N) and v4 (## FR-N:) headings with bodies', () => {
    const md = '### Requirement: FR-7 Marksman LSP\nbody one\n## FR-8: Semantic judge\nbody two\n';
    const frs = extractFrs(md);
    expect(frs.map((f) => f.frId)).toEqual(['FR-7', 'FR-8']);
    expect(frs[0].title).toBe('Marksman LSP');
    expect(frs[0].body).toContain('body one');
  });
});

describe('renderTagSuggestions', () => {
  it('lists only untagged scenarios with their suggestion + score', () => {
    const feature = 'Feature: demo\n\n  @FR-002\n  Scenario: Export report\n    Given a\n\n  Scenario: User logs in\n    Given b\n';
    const out = renderTagSuggestions('auth.feature', predictTags(feature, FRS));
    expect(out).toContain('User logs in');
    expect(out).toContain('@FR-001');
    expect(out).not.toContain('Export report'); // already tagged → omitted
  });

  it('returns empty string when every scenario is already tagged', () => {
    const feature = 'Feature: demo\n\n  @FR-001\n  Scenario: User logs in\n    Given a\n';
    expect(renderTagSuggestions('auth.feature', predictTags(feature, FRS))).toBe('');
  });
});
