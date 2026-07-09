/**
 * migrate.ts vitest-twin attribution tests (FR-M1 dogfood 2026-06-21). The inventory shipped
 * matching ONLY `tests/e2e/<slug>.test.ts` by slug-name, so a non-slug twin was invisible:
 * `tests/e2e/test-guard.test.ts` drives the tui-test-runner hook `tools/tui-test-runner/test_guard.ts`
 * but is not named by the slug, so `migrate.ts --spec tui-test-runner` never surfaced it and the agent
 * had to be told out-of-band. These pin the content-attribution helper that closes that gap. Drives the
 * REAL exported `testAttributesToSpec` — no mocks.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { testAttributesToSpec, isComponentHomed, toolImportSymbols, classifyTestBody, mutationSurfaceTargets } from '../migrate.ts';
import { parseGherkin } from '../../spec-graph/parsers/gherkin.ts';
import { prepareFeatureForWiring, wireFeature } from '../../../scripts/wire-feature.mjs';

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

// Under BDD-only, a vitest twin driving a stryker `mutate` target is the mutation kill-surface — it is
// MIGRATED (Scenario Outline + stryker.bdd + verify-kill), not kept. The planner must flag it so the
// agent uses that technique (dogfood 2026-06-21: the old keep-vitest guard wrongly told it to keep).
describe('MIGRATE003: mutation-surface detection (BDD-only policy)', () => {
  it('MIGRATE003_01: a test importing a stryker mutate target is flagged as mutation-surface', () => {
    const target = '.claude/skills/strong-tests/scripts/detect-invariant-candidates.ts';
    const src = `import { scan } from '../../.claude/skills/strong-tests/scripts/detect-invariant-candidates.ts';`;
    expect(mutationSurfaceTargets([src], [target])).toEqual([target]);
  });

  it('MIGRATE003_02: a test that does NOT touch any mutate target is not flagged', () => {
    const target = '.claude/skills/strong-tests/scripts/detect-invariant-candidates.ts';
    const src = `import { somethingElse } from '../../tools/other/mod.ts';`;
    expect(mutationSurfaceTargets([src], [target])).toEqual([]);
  });

  it('MIGRATE003_03: no mutate targets configured → never flagged (empty list is safe)', () => {
    const src = `import { scan } from '../../.claude/skills/strong-tests/scripts/detect-invariant-candidates.ts';`;
    expect(mutationSurfaceTargets([src], [])).toEqual([]);
  });
});

// The wire helper is the last mile of the BDD migrator: comment tags are safe while a feature is
// half-migrated, but once the feature is wired they must become real Gherkin tags or the graph sees no
// tested-by edge. These tests drive the exported helper directly (no shell, no shared cucumber.json).
describe('MIGRATE004: wire-feature comment tag promotion (P28-7 / FR-51d)', () => {
  const validFrs = new Set(['51']);

  it('MIGRATE004_01: promotes an immediately-attached comment feature tag with its control tag', () => {
    const feature = `Feature: X

  # @feature51 @manual
  Scenario: SPECGEN004_518 comment-tagged
    Given x
`;
    const promoted = prepareFeatureForWiring(feature, validFrs);

    expect(promoted.errors).toEqual([]);
    expect(promoted.promotedCount).toBe(1);
    expect(promoted.content).toContain('  @feature51 @manual\n  Scenario: SPECGEN004_518 comment-tagged');
    expect(promoted.content).not.toContain('# @feature51');
  });

  it('MIGRATE004_02: is idempotent once tags are already real', () => {
    const feature = `Feature: X

  @feature51 @manual
  Scenario: SPECGEN004_518 already-real
    Given x
`;
    const promoted = prepareFeatureForWiring(feature, validFrs);

    expect(promoted.errors).toEqual([]);
    expect(promoted.changed).toBe(false);
    expect(promoted.promotedCount).toBe(0);
    expect(promoted.content).toBe(feature);
  });

  it('MIGRATE004_03: rejects an unknown feature number before changing content', () => {
    const feature = `Feature: X

  # @feature999
  Scenario: SPECGEN004_518 wrong-number
    Given x
`;
    const promoted = prepareFeatureForWiring(feature, validFrs);

    expect(promoted.errors).toEqual(['line 3: @feature999 has no same-spec FR-999']);
    expect(promoted.changed).toBe(false);
    expect(promoted.content).toBe(feature);
  });

  it('MIGRATE004_04: promoted tags build the real same-spec tested-by edge', () => {
    const feature = `Feature: X

  # @feature51
  Scenario: SPECGEN004_518 promoted edge
    Given x
`;
    const promoted = prepareFeatureForWiring(feature, validFrs);
    const slice = parseGherkin(promoted.content, '.specs/demo/demo.feature');

    expect(slice.edges).toContainEqual({
      from: 'demo:FR-51',
      to: 'demo:SCEN-specgen004-518-promoted-edge',
      type: 'tested-by',
    });
  });

  it('MIGRATE004_05: wireFeature promotes and wires under the same locked operation', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-feature-'));
    try {
      fs.mkdirSync(path.join(root, '.specs', 'demo'), { recursive: true });
      fs.writeFileSync(path.join(root, '.specs', 'demo', 'FR.md'), '## FR-51\n\nDemo\n');
      fs.writeFileSync(
        path.join(root, '.specs', 'demo', 'demo.feature'),
        `Feature: X

  # @feature51 @wip
  Scenario: SPECGEN004_518 locked write
    Given x
`,
      );
      fs.writeFileSync(path.join(root, 'cucumber.json'), '{"default":{"paths":[]}}\n');

      const message = wireFeature('demo', root);

      expect(message).toContain('promoted 1 tag line(s)');
      expect(fs.readFileSync(path.join(root, '.specs', 'demo', 'demo.feature'), 'utf8')).toContain('\n  @feature51 @wip\n');
      expect(JSON.parse(fs.readFileSync(path.join(root, 'cucumber.json'), 'utf8')).default.paths).toEqual(['.specs/demo/demo.feature']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('MIGRATE004_06: wireFeature refuses a wrong feature number before touching either file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-feature-invalid-'));
    try {
      fs.mkdirSync(path.join(root, '.specs', 'demo'), { recursive: true });
      fs.writeFileSync(path.join(root, '.specs', 'demo', 'FR.md'), '## FR-51\n\nDemo\n');
      const beforeFeature = `Feature: X

  # @feature999
  Scenario: SPECGEN004_518 wrong locked write
    Given x
`;
      const beforeCfg = '{"default":{"paths":[]}}\n';
      fs.writeFileSync(path.join(root, '.specs', 'demo', 'demo.feature'), beforeFeature);
      fs.writeFileSync(path.join(root, 'cucumber.json'), beforeCfg);

      expect(() => wireFeature('demo', root)).toThrow('@feature999 has no same-spec FR-999');
      expect(fs.readFileSync(path.join(root, '.specs', 'demo', 'demo.feature'), 'utf8')).toBe(beforeFeature);
      expect(fs.readFileSync(path.join(root, 'cucumber.json'), 'utf8')).toBe(beforeCfg);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
