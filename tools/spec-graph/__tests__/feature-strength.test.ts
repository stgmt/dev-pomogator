import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { placeholderScenarios, featureStrengthFindings } from '../feature-strength.ts';
import { validateSpecChange } from '../../spec-mcp-server/mutations.ts';

// The scenario-writer skeleton (prose <...> steps + [TBD] marker) — the exact thing the gate exists to refuse.
const SKELETON = `Feature: strength-fixture

  @feature1
  Scenario: FR-1 something
    Given \`<precondition or initial state>\`
    When \`<action or event>\`
    Then \`<expected observable result>\`

    # [TBD] scenario-writer placeholder.
`;

// A fully-written feature: a happy path + a negative (matches §6: negatives ≥ happy-path).
const REAL = `Feature: strength-fixture

  @feature1
  Scenario: FR-1 happy path
    Given a configured widget
    When the user saves
    Then the record persists

  @feature1
  Scenario: FR-1 rejects empty input
    Given an empty form
    When the user saves
    Then an error is shown
`;

// A Scenario Outline whose params are single-token <amount>/<result> bound to Examples — legitimate, must NOT flag.
const OUTLINE = `Feature: outline-safe

  @feature1
  Scenario Outline: FR-1 charges <amount>
    Given a balance of <amount>
    When charged
    Then the balance is <result>

    Examples:
      | amount | result |
      | 10     | 0      |
`;

describe('feature-strength: placeholder detection (precise — never a fuzzy signal)', () => {
  it('flags a scenario-writer skeleton (a step that is wholly a prose <...> placeholder)', () => {
    expect(placeholderScenarios(SKELETON).length).toBe(1);
  });

  it('INVARIANT: a fully-written scenario is never flagged', () => {
    expect(placeholderScenarios(REAL)).toEqual([]);
  });

  it('precision guard: a Scenario Outline <amount> param (single token, no whitespace) is NOT flagged', () => {
    // this is THE over-fire trap — a real Outline param looks like a placeholder but is legitimate
    expect(placeholderScenarios(OUTLINE)).toEqual([]);
  });

  it('precision guard: a mid-text <param> step ("user enters <amount>") is NOT flagged', () => {
    const f = `Feature: x\n\n  @feature1\n  Scenario: real\n    Given a user\n    When user enters <amount>\n    Then it is charged\n`;
    expect(placeholderScenarios(f)).toEqual([]);
  });

  it('precision guard: a single-token bare placeholder "<state>" (no whitespace) is NOT flagged', () => {
    const f = `Feature: x\n\n  @feature1\n  Scenario: real\n    Given <state>\n    When acted\n    Then ok\n`;
    expect(placeholderScenarios(f)).toEqual([]);
  });

  it('flags a create_spec template-style scaffold (whole-step {curly} placeholders)', () => {
    // mirrors tools/specs-generator/templates/feature.template
    const f = `Feature: x\n\n  @FR-1\n  Scenario: scaffolded\n    Given {контекст}\n    When {действие}\n    Then {ожидаемый результат}\n`;
    expect(placeholderScenarios(f).length).toBe(1);
  });

  it('precision guard: a mid-text brace step (Given a config {"k":"v"}) is NOT flagged', () => {
    const f = `Feature: x\n\n  @FR-1\n  Scenario: real\n    Given a config {"k":"v"}\n    When applied\n    Then it loads\n`;
    expect(placeholderScenarios(f)).toEqual([]);
  });

  it('returns [] for an empty / scenario-less / unparseable feature', () => {
    expect(placeholderScenarios('')).toEqual([]);
    expect(placeholderScenarios('Feature: empty\n')).toEqual([]);
    expect(placeholderScenarios('not gherkin at all {[(')).toEqual([]);
  });
});

describe('feature-strength: net-new scoping (legacy must not brick unrelated edits)', () => {
  it('new doc (current=null) with a skeleton → finding', () => {
    expect(featureStrengthFindings(null, SKELETON).length).toBeGreaterThanOrEqual(1);
  });

  it('new doc with real scenarios → no finding', () => {
    expect(featureStrengthFindings(null, REAL)).toEqual([]);
  });

  it('MUTATION GUARD (> not >=): legacy skeleton KEPT (current==next) → no net-new finding', () => {
    // if the count check were `>=` instead of `>`, this would wrongly fire — pins the comparator
    expect(featureStrengthFindings(SKELETON, SKELETON).filter((f) => f.message.includes('PLACEHOLDER'))).toEqual([]);
  });

  it('filling a skeleton in (placeholder count drops) → no finding', () => {
    expect(featureStrengthFindings(SKELETON, REAL)).toEqual([]);
  });

  it('adding a skeleton to a real doc (count rises) → finding', () => {
    expect(featureStrengthFindings(REAL, SKELETON).length).toBeGreaterThanOrEqual(1);
  });

  it('net-new [TBD] marker fires; a pre-existing [TBD] kept does not', () => {
    const realWithTbd = REAL.replace('Then the record persists', 'Then the record persists\n    # [TBD] tighten this');
    // current has no [TBD], next adds one → fires
    expect(featureStrengthFindings(REAL, realWithTbd).some((f) => f.message.includes('TBD'))).toBe(true);
    // [TBD] present in both → not net-new → silent
    expect(featureStrengthFindings(realWithTbd, realWithTbd).some((f) => f.message.includes('TBD'))).toBe(false);
  });
});

describe('feature-strength: MCP door integration (the real validateSpecChange consumer)', () => {
  function makeTmpSpec(): { root: string; slug: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-door-'));
    const slug = 'strength-fixture';
    const dir = path.join(root, '.specs', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'FR.md'), '# FR\n\n## FR-1 Widget saves\n\nThe widget SHALL persist on save.\n');
    return { root, slug };
  }

  it('door REFUSES a .feature write that introduces a skeleton (strength layer, ok=false)', () => {
    const { root, slug } = makeTmpSpec();
    try {
      const res = validateSpecChange(root, slug, `${slug}.feature`, { content: SKELETON });
      const strength = res.findings.filter((f) => f.layer === 'strength');
      expect(strength.length).toBeGreaterThanOrEqual(1);
      expect(res.ok).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('door adds NO strength finding for a fully-written .feature', () => {
    const { root, slug } = makeTmpSpec();
    try {
      const res = validateSpecChange(root, slug, `${slug}.feature`, { content: REAL });
      expect(res.findings.filter((f) => f.layer === 'strength')).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('gate is .feature-only: a .md write never gets a strength finding', () => {
    const { root, slug } = makeTmpSpec();
    try {
      const res = validateSpecChange(root, slug, 'FR.md', {
        content: '# FR\n\n## FR-1 Widget saves\n\nThe widget SHALL persist on save and `<placeholder with spaces>` stays prose.\n',
      });
      expect(res.findings.filter((f) => f.layer === 'strength')).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
