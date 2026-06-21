/**
 * migrate.ts vitest-twin attribution tests (FR-M1 dogfood 2026-06-21). The inventory shipped
 * matching ONLY `tests/e2e/<slug>.test.ts` by slug-name, so a non-slug twin was invisible:
 * `tests/e2e/test-guard.test.ts` drives the tui-test-runner hook `tools/tui-test-runner/test_guard.ts`
 * but is not named by the slug, so `migrate.ts --spec tui-test-runner` never surfaced it and the agent
 * had to be told out-of-band. These pin the content-attribution helper that closes that gap. Drives the
 * REAL exported `testAttributesToSpec` — no mocks.
 */
import { describe, it, expect } from 'vitest';
import { testAttributesToSpec, isComponentHomed, toolImportSymbols, classifyTestBody } from '../migrate.ts';

describe('MIGRATE001: vitest-twin attribution by spec code dir (dogfood 2026-06-21)', () => {
  it('MIGRATE001_01: attributes a test that references the spec code dir tools/<slug>/', () => {
    const src = `const GUARD_SCRIPT = 'tools/tui-test-runner/test_guard.ts';`;
    expect(testAttributesToSpec(src, 'tui-test-runner')).toBe(true);
  });

  it('MIGRATE001_02: attributes a test that imports from .claude/skills/<slug>/', () => {
    const src = `import { detect } from '../../.claude/skills/answer-simple/scripts/jargon.ts';`;
    expect(testAttributesToSpec(src, 'answer-simple')).toBe(true);
  });

  it('MIGRATE001_03: does NOT attribute when the slug appears only as prose, not a code path', () => {
    const src = `// regression for the tui-test-runner spec\nimport { h } from './helpers.ts';`;
    expect(testAttributesToSpec(src, 'tui-test-runner')).toBe(false);
  });

  it('MIGRATE001_04: is prefix-safe — a sibling slug dir does not cross-attribute', () => {
    const src = `const p = 'tools/tui-test-runner-v2/foo.ts';`;
    expect(testAttributesToSpec(src, 'tui-test-runner')).toBe(false);
  });

  it('MIGRATE001_05: escapes regex metacharacters in the slug (no accidental wildcard match)', () => {
    // a literal-dot slug must match literally, not as the regex "any char".
    expect(testAttributesToSpec(`x = 'tools/a.b/c.ts';`, 'a.b')).toBe(true);
    expect(testAttributesToSpec(`x = 'tools/aXb/c.ts';`, 'a.b')).toBe(false);
  });

  // A test homed under one component must not be content-attributed to another it only mentions as a
  // fixture string (dogfood 2026-06-21: migrate.test.ts pulled into answer-simple by a fixture path).
  it('MIGRATE001_06: a test under a component dir is component-homed (excluded from cross-attribution)', () => {
    expect(isComponentHomed('tools/bdd-migrator/__tests__/migrate.test.ts')).toBe(true);
    expect(isComponentHomed('.claude/skills/answer-simple/__tests__/x.test.ts')).toBe(true);
  });

  it('MIGRATE001_07: a test under tests/e2e or tests/unit is NOT component-homed (content-attribution applies)', () => {
    expect(isComponentHomed('tests/e2e/test-guard.test.ts')).toBe(false);
    expect(isComponentHomed('tests/unit/plan-gate-scope-advisory.test.ts')).toBe(false);
  });
});

// Production code lives under .claude/{skills,rules,…}/<x>/scripts/ as well as tools/. A test that
// imports + calls such a symbol IN-PROCESS is a real engine driver (runtime), not 'unknown'. The
// old tools/-only symbol scan mis-labelled them → a false needs-triage U: count for skill-homed specs
// (dogfood 2026-06-21: strong-tests' 48 Stryker-kill-surface tests calling scan()/nestedLoopCount()/
// suggestInvariants() from .claude/skills/strong-tests/scripts/ all showed as 'unknown').
describe('MIGRATE002: skill-homed production imports classify as runtime (dogfood 2026-06-21)', () => {
  it('MIGRATE002_01: toolImportSymbols captures a symbol imported from .claude/skills/<x>/scripts/', () => {
    const src = `import { scan, nestedLoopCount } from '../../.claude/skills/strong-tests/scripts/detect-invariant-candidates.ts';`;
    expect(toolImportSymbols(src)).toEqual(expect.arrayContaining(['scan', 'nestedLoopCount']));
  });

  it('MIGRATE002_02: still captures the legacy tools/ import (no regression)', () => {
    const src = `import { ensureSkillListingBudget } from '../../tools/skill-listing-budget/ensure.ts';`;
    expect(toolImportSymbols(src)).toContain('ensureSkillListingBudget');
  });

  it('MIGRATE002_03: an in-process call to a .claude-imported symbol is runtime, not unknown', () => {
    // scan() does NOT match the verb-prefix heuristic → it relied on the symbol list, which the
    // tools/-only scan missed. This is the exact strong-tests U:48 case.
    const src = `import { scan } from '../../.claude/skills/strong-tests/scripts/detect-invariant-candidates.ts';`;
    const syms = toolImportSymbols(src);
    const body = `it('scans', () => { const r = scan(code, 'ts'); expect(r.length).toBe(2); });`;
    expect(classifyTestBody(body, syms)).toBe('runtime');
  });

  it('MIGRATE002_04: a body that drives nothing real is still unknown (no over-classification)', () => {
    const body = `it('adds', () => { expect(1 + 1).toBe(2); });`;
    expect(classifyTestBody(body, [])).toBe('unknown');
  });
});
