/**
 * @feature1/@feature2/@feature3/@feature8 — tests-create-update BDD migration (FR-M1/P3).
 * PLUGIN016_01..05 migrated as ARTIFACT-STRUCTURE scenarios.
 * PLUGIN016_06..11 migrated: _06/_07 artifact-class, _08/_09/_10/_11 runtime-class
 * (import the real functions and call them — mutation-checkable).
 *
 * @see .specs/tests-create-update/tests-create-update.feature
 * @see .claude/rules/gotchas/verify-divergent-contracts.md
 */
import { Given, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import '../hooks/before-after.ts';

const REPO = process.cwd();
const TCU_SKILL = path.join(REPO, '.claude', 'skills', 'tests-create-update', 'SKILL.md');
const COMPLIANCE_CHECK = path.join(REPO, 'tools', 'test-quality', 'compliance_check.ts');
const HOOKS_JSON = path.join(REPO, '.claude-plugin', 'hooks.json');

function tcuSkill(): string {
  return fs.readFileSync(TCU_SKILL, 'utf-8');
}

// ---------------------------------------------------------------------------
// Shared Givens (scenarios 01–07)
// ---------------------------------------------------------------------------

Given(/^the tests-create-update skill and its compliance hook are present in the repo$/, function () {
  assert.ok(fs.existsSync(TCU_SKILL), 'tests-create-update SKILL.md must be present');
  assert.ok(fs.existsSync(COMPLIANCE_CHECK), 'tools/test-quality/compliance_check.ts must be present');
  assert.ok(fs.existsSync(HOOKS_JSON), '.claude-plugin/hooks.json must be present');
});

Given(/^the tests-create-update SKILL\.md$/, function () {
  // content read lazily in each Then (keeps steps independent)
});

// ---------------------------------------------------------------------------
// _01 — SKILL.md frontmatter (artifact)
// ---------------------------------------------------------------------------

Then(/^it declares "name: tests-create-update" and an "allowed-tools" field$/, function () {
  const c = tcuSkill();
  assert.match(c, /name: tests-create-update/);
  assert.match(c, /allowed-tools/);
});

// ---------------------------------------------------------------------------
// _02 — Assertion Selection Table (artifact)
// ---------------------------------------------------------------------------

Then(/^it contains an "Assertion Selection Table" with BAD and GOOD columns$/, function () {
  const c = tcuSkill();
  assert.match(c, /Assertion Selection Table/);
  assert.ok(c.includes('| BAD'), 'BAD column');
  assert.ok(c.includes('| GOOD'), 'GOOD column');
});

// ---------------------------------------------------------------------------
// _03 — NEVER anti-pattern rules (artifact)
// ---------------------------------------------------------------------------

Then(/^it lists every catalogued "NEVER" anti-pattern rule$/, function () {
  const c = tcuSkill();
  const rules = [
    'NEVER use `pathExists()`',
    'NEVER use `readdir().length > 0`',
    'NEVER use `toBeDefined()`',
    'NEVER use `res.ok`',
    'NEVER use `if (!condition) return`',
    'NEVER read source file',
    'NEVER define helper',
    'NEVER use chained `.GetProperty()`',
    'NEVER put `if/else` inside test body',
    'NEVER put assertions inside `forEach`',
    'NEVER call async function without `await`',
    'NEVER wrap test body in `try/catch`',
    'NEVER write `try { fn() } catch',
    'NEVER write `it()` with zero `expect()`',
    'NEVER compute expected value using same logic',
    'NEVER use `setTimeout`',
  ];
  const missing = rules.filter((r) => !c.includes(r));
  assert.deepEqual(missing, [], `missing NEVER rules: ${missing.join(' | ')}`);
});

// ---------------------------------------------------------------------------
// _04 — compliance checklist (artifact)
// ---------------------------------------------------------------------------

Then(/^it contains the compliance checklist items and an "X\/16 PASS" line$/, function () {
  const c = tcuSkill();
  for (const item of [
    'No source scan',
    'Content validation',
    'No conditional assertions',
    'No missing await',
    'Has assertions',
    'No tautological assert',
    'No arbitrary sleep',
    'No trivial input',
  ]) {
    assert.ok(c.includes(item), `compliance checklist item: ${item}`);
  }
  assert.match(c, /X\/16 PASS/);
});

// ---------------------------------------------------------------------------
// _05 — skill file exists (artifact)
// ---------------------------------------------------------------------------

Then(/^the file \.claude\/skills\/tests-create-update\/SKILL\.md exists$/, function () {
  assert.ok(fs.existsSync(TCU_SKILL));
});

// ---------------------------------------------------------------------------
// _06 — plugin hooks.json wires compliance_check on PostToolUse Write|Edit (artifact)
// ---------------------------------------------------------------------------

Then(
  /^the plugin hooks register compliance_check on PostToolUse with matcher "Write\|Edit"$/,
  function () {
    const raw = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf-8')) as {
      hooks: Record<string, Array<{ matcher?: string; hooks?: Array<{ command?: string }> }>>;
    };
    const ptuEntries = (raw.hooks ?? raw)['PostToolUse'] ?? [];
    const entry = ptuEntries.find((e) =>
      (e.hooks ?? []).some((h) => (h.command ?? '').includes('compliance_check')),
    );
    assert.ok(entry, 'PostToolUse must have an entry with compliance_check in its hooks');
    assert.strictEqual(entry.matcher, 'Write|Edit', 'compliance_check must be registered on Write|Edit');
  },
);

// ---------------------------------------------------------------------------
// _07 — compliance_check.ts file exists and is non-trivial (artifact)
// ---------------------------------------------------------------------------

Then(
  /^tools\/test-quality\/compliance_check\.ts is non-trivial and contains scanAntiPatterns and isTestFile$/,
  function () {
    const stat = fs.statSync(COMPLIANCE_CHECK);
    assert.ok(stat.size > 1000, `compliance_check.ts must be >1000 bytes (got ${stat.size})`);
    const c = fs.readFileSync(COMPLIANCE_CHECK, 'utf-8');
    assert.ok(c.includes('scanAntiPatterns'), 'must export scanAntiPatterns');
    assert.ok(c.includes('isTestFile'), 'must export isTestFile');
  },
);

// ---------------------------------------------------------------------------
// _08 — scanner detects existence-only pattern (RUNTIME — drives real engine)
// ---------------------------------------------------------------------------

Then(/^the compliance scanner flags a pathExists-only call as an "existence-only" violation$/, async function () {
  // Import the real scanAntiPatterns function (not a source-scan)
  const mod = await import('../../tools/test-quality/compliance_check.ts');
  const { scanAntiPatterns } = mod as { scanAntiPatterns: (c: string, f: string) => Array<{ rule: string }> };

  // A test that only checks pathExists without reading the file content
  const badSnippet = `
    it('test', async () => {
      expect(await fs.pathExists('/some/path')).toBe(true);
    });
  `;
  const matches = scanAntiPatterns(badSnippet, 'test.ts');
  const found = matches.find((m) => m.rule === 'existence-only');
  assert.ok(found, `scanAntiPatterns should flag existence-only for pathExists call; got: ${JSON.stringify(matches)}`);
});

// ---------------------------------------------------------------------------
// _09 — scanner detects weak-assertion pattern (RUNTIME — drives real engine)
// ---------------------------------------------------------------------------

Then(/^the compliance scanner flags a lone toBeDefined as a "weak-assertion" violation$/, async function () {
  const mod = await import('../../tools/test-quality/compliance_check.ts');
  const { scanAntiPatterns } = mod as { scanAntiPatterns: (c: string, f: string) => Array<{ rule: string }> };

  // A test that only asserts toBeDefined without a stronger follow-up assertion
  const badSnippet = `
    it('test', () => {
      expect(result).toBeDefined();
    });
  `;
  const matches = scanAntiPatterns(badSnippet, 'test.ts');
  const found = matches.find((m) => m.rule === 'weak-assertion');
  assert.ok(found, `scanAntiPatterns should flag weak-assertion for lone toBeDefined; got: ${JSON.stringify(matches)}`);
});

// ---------------------------------------------------------------------------
// _10 — isTestFile recognises test-file patterns (RUNTIME — drives real engine)
// ---------------------------------------------------------------------------

Then(/^the compliance hook classifies test\.ts, test\.cs and Steps\.cs as test files$/, async function () {
  const mod = await import('../../tools/test-quality/compliance_check.ts');
  const { isTestFile } = mod as { isTestFile: (p: string) => boolean };

  assert.ok(isTestFile('tests/foo.test.ts'), 'foo.test.ts should be a test file');
  assert.ok(isTestFile('src/FooSteps.cs'), 'FooSteps.cs should be a test file');
  assert.ok(isTestFile('src/Foo.test.cs'), 'Foo.test.cs should be a test file');
  assert.ok(!isTestFile('src/foo.ts'), 'plain foo.ts should NOT be a test file');
});

// ---------------------------------------------------------------------------
// _11 — per-session cooldown works (RUNTIME — drives real engine)
// ---------------------------------------------------------------------------

Then(/^the compliance hook's cooldown logic returns true for a recent timestamp$/, async function () {
  const { isWithinCooldown } = await import('../../tools/_shared/marker-utils.ts');

  const recentTimestamp = new Date(Date.now() - 60_000).toISOString(); // 1 minute ago
  const cooldownMinutes = 30; // same as COOLDOWN_MINUTES in compliance_check.ts
  assert.ok(
    isWithinCooldown(recentTimestamp, cooldownMinutes),
    'isWithinCooldown should return true for a timestamp within the cooldown window',
  );

  const oldTimestamp = new Date(Date.now() - 2 * 60 * 60_000).toISOString(); // 2 hours ago
  assert.ok(
    !isWithinCooldown(oldTimestamp, cooldownMinutes),
    'isWithinCooldown should return false for a timestamp outside the cooldown window',
  );
});
