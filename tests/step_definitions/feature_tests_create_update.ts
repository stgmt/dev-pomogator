/**
 * @feature1/@feature2/@feature3 — tests-create-update BDD migration (FR-M1/P3, 4th spec).
 * PLUGIN016_01..05 migrated as ARTIFACT-STRUCTURE scenarios (the .feature was rewritten from
 * aspirational agent-behaviour to what's verifiable — the vitest is the real contract). Each step
 * reads the REAL repo SKILL.md and asserts its structure (read-only, local-safe). _06..11 @wip.
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
function tcuSkill(): string {
  return fs.readFileSync(TCU_SKILL, 'utf-8');
}

Given(/^the tests-create-update skill and its compliance hook are present in the repo$/, function () {
  assert.ok(fs.existsSync(TCU_SKILL), 'tests-create-update SKILL.md must be present');
});
Given(/^the tests-create-update SKILL\.md$/, function () {
  // content read lazily in each Then (keeps steps independent)
});

Then(/^it declares "name: tests-create-update" and an "allowed-tools" field$/, function () {
  const c = tcuSkill();
  assert.match(c, /name: tests-create-update/);
  assert.match(c, /allowed-tools/);
});
Then(/^it contains an "Assertion Selection Table" with BAD and GOOD columns$/, function () {
  const c = tcuSkill();
  assert.match(c, /Assertion Selection Table/);
  assert.ok(c.includes('| BAD'), 'BAD column');
  assert.ok(c.includes('| GOOD'), 'GOOD column');
});
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
Then(/^the file \.claude\/skills\/tests-create-update\/SKILL\.md exists$/, function () {
  assert.ok(fs.existsSync(TCU_SKILL));
});
