/**
 * VSGF001_42-45 step definitions — plan-gate Phase 5 scope-gate advisory.
 *
 * Migrated from tests/unit/plan-gate-scope-advisory.test.ts. plan-gate.ts hosts the scope-gate
 * logic (see .specs/verify-generic-scope-fix/FR.md FR-4 + the `plan-gate.ts` pattern refs): when
 * an ExitPlanMode plan's `## File Changes` table touches guard/policy files, plan-gate emits a
 * NON-blocking stderr advisory recommending /verify-generic-scope-fix. Drives the REAL plan-gate.ts.
 *
 * @see .specs/verify-generic-scope-fix/verify-generic-scope-fix.feature @feature4
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
const PLAN_GATE = path.join(REPO_ROOT, 'tools', 'plan-pomogator', 'plan-gate.ts');

interface PgWorld extends V4World { pgRows?: Array<[string, string, string]>; pgStderr?: string }

function buildPlan(rows: Array<[string, string, string]>): string {
  const rowsMd = rows.map(([p, a, r]) => `| \`${p}\` | ${a} | ${r} |`).join('\n');
  return [
    '# Test Plan', '',
    '## 💬 Простыми словами', '',
    '### Сейчас (как работает)', 'Test fixture plan.', '',
    '### Как должно быть (как я понял)', 'Test fixture plan.', '',
    '### Правильно понял?', 'Да.', '',
    '## 🎯 Context', '', 'Test fixture plan for plan-gate Phase 5 scope-gate advisory.', '',
    '### Extracted Requirements', '1. Test fixture requirement one.', '2. Test fixture requirement two.', '',
    '## 👤 User Stories', '- Как tester, я хочу проверить advisory behaviour.', '',
    '## 🔀 Use Cases', '- UC-1: happy path test fixture', '',
    '## 📐 Requirements', '',
    '### FR (Functional Requirements)', '- FR-1: test behavior', '',
    '### Acceptance Criteria (EARS)', '- WHEN test executes THEN fixture SHALL produce expected output', '',
    '### NFR (Non-Functional Requirements)', '- Performance: N/A', '- Security: N/A', '- Reliability: N/A', '- Usability: N/A', '',
    '### Assumptions', '- N/A', '',
    '### Risks', '- N/A', '',
    '### Out of Scope', '- N/A', '',
    '## 🔧 Implementation Plan', '1. Test fixture step one.', '2. Test fixture step two.', '',
    '## 💥 Impact Analysis', '', 'N/A — нет удалений/переименований.', '',
    '## 📋 Todos', '', '---', '',
    '### 📋 `test-task`', '',
    '> Test fixture task description for the fixture plan.', '',
    '- **files:** `src/test.ts` *(create)*',
    '- **changes:**',
    '  - Test fixture change one with enough verbose text to pass actionability warnings.',
    '- **refs:** FR-1',
    '- **deps:** *none*', '', '---', '',
    '## ✅ Definition of Done', '', '- [ ] Test fixture criterion', '',
    '### Verification Plan', '',
    '- Automated Tests:', '  - `test command`', '',
    '- Manual Verification:', '  - Test fixture verification step', '',
    '## 📁 File Changes',
    '| Path | Action | Reason |',
    '|------|--------|--------|',
    rowsMd, '',
  ].join('\n');
}

function runPlanGate(this: PgWorld): void {
  const tmpDir = this.tempDir;
  const planFile = path.join(tmpDir, 'plan.md');
  fs.writeFileSync(planFile, buildPlan(this.pgRows ?? []));
  const input = JSON.stringify({ tool_name: 'ExitPlanMode', tool_input: { planFilePath: planFile, plan: 'test' }, cwd: tmpDir, session_id: 'sess-pg-advisory' });
  const r = spawnSync('npx', ['tsx', PLAN_GATE], { input, encoding: 'utf-8', shell: true, cwd: REPO_ROOT });
  this.pgStderr = r.stderr || '';
}

Given(/^a plan whose File Changes touch a guard file and a plain utility file$/, function (this: PgWorld) {
  this.pgRows = [['src/services/StockValidationService.ts', 'edit', 'Add stocktaking to enum'], ['src/utils/helper.ts', 'edit', 'Utility tweak']];
});

Given(/^a plan whose File Changes touch only non-guard code files$/, function (this: PgWorld) {
  this.pgRows = [['src/utils/helper.ts', 'edit', 'Utility tweak'], ['src/components/Button.tsx', 'create', 'New button component']];
});

Given(/^a plan whose File Changes touch only documentation files$/, function (this: PgWorld) {
  this.pgRows = [['README.md', 'edit', 'Update docs'], ['docs/CHANGES.md', 'edit', 'Changelog']];
});

Given(/^a plan whose File Changes touch several guard files$/, function (this: PgWorld) {
  this.pgRows = [
    ['src/services/AService.ts', 'edit', 'change'], ['src/services/BService.ts', 'edit', 'change'],
    ['src/validators/CValidator.ts', 'edit', 'change'], ['src/domain/DPolicy.ts', 'edit', 'change'],
    ['src/policies/EGuard.ts', 'edit', 'change'], ['src/domain/FRule.ts', 'edit', 'change'],
    ['src/utils/helper.ts', 'edit', 'change'],
  ];
});

When(/^plan-gate evaluates the ExitPlanMode for that plan$/, function (this: PgWorld) {
  runPlanGate.call(this);
});

Then(/^the plan-gate stderr carries a scope-gate advisory naming "([^"]+)" and "([^"]+)"$/, function (this: PgWorld, file: string, ref: string) {
  assert.match(this.pgStderr ?? '', /scope-gate advisory/i);
  assert.ok((this.pgStderr ?? '').includes(file), `advisory must name ${file}: ${this.pgStderr}`);
  assert.ok((this.pgStderr ?? '').includes(ref), `advisory must name ${ref}: ${this.pgStderr}`);
});

Then(/^the plan-gate stderr carries a scope-gate advisory naming "([^"]+)"$/, function (this: PgWorld, file: string) {
  assert.match(this.pgStderr ?? '', /scope-gate advisory/i);
  assert.ok((this.pgStderr ?? '').includes(file), `advisory must name ${file}: ${this.pgStderr}`);
});

Then(/^the plan-gate stderr carries no scope-gate advisory$/, function (this: PgWorld) {
  assert.doesNotMatch(this.pgStderr ?? '', /scope-gate advisory/i);
});
