import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Integration test for plan-gate Phase 5 scope-gate advisory.
 *
 * Verifies that when ExitPlanMode's planFilePath points to a plan whose
 * `## File Changes` table touches guard/policy files, plan-gate emits a
 * non-blocking stderr advisory recommending /verify-generic-scope-fix.
 *
 * Spec: plan-pomogator v2.1.0 behaviour change.
 */

const PLAN_GATE = path.resolve('extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts');

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-gate-advisory-'));
});

afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

interface GateResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function writePlan(filename: string, fileChangesRows: Array<[string, string, string]>): string {
  // Minimal valid plan per plan-pomogator schema — Phase 1-4 passing isn't required
  // for Phase 5 advisory (Phase 5 runs AFTER Phase 4 and is non-blocking either way).
  // We construct a plan that parses — Phase 1-4 may generate errors but Phase 5 still runs.
  const rowsMd = fileChangesRows.map(([p, a, r]) => `| \`${p}\` | ${a} | ${r} |`).join('\n');
  const plan = `# Test Plan

## 💬 Простыми словами

### Сейчас (как работает)
Test fixture plan.

### Как должно быть (как я понял)
Test fixture plan.

### Правильно понял?
Да.

## 🎯 Context

Test fixture plan for plan-gate Phase 5 scope-gate advisory.

### Extracted Requirements
1. Test fixture requirement one.
2. Test fixture requirement two.

## 👤 User Stories
- Как tester, я хочу проверить advisory behaviour.

## 🔀 Use Cases
- UC-1: happy path test fixture

## 📐 Requirements

### FR (Functional Requirements)
- FR-1: test behavior

### Acceptance Criteria (EARS)
- WHEN test executes THEN fixture SHALL produce expected output

### NFR (Non-Functional Requirements)
- Performance: N/A
- Security: N/A
- Reliability: N/A
- Usability: N/A

### Assumptions
- N/A

### Risks
- N/A

### Out of Scope
- N/A

## 🔧 Implementation Plan
1. Test fixture step one.
2. Test fixture step two.

## 💥 Impact Analysis

N/A — нет удалений/переименований.

## 📋 Todos

---

### 📋 \`test-task\`

> Test fixture task description for the fixture plan.

- **files:** \`src/test.ts\` *(create)*
- **changes:**
  - Test fixture change one with enough verbose text to pass actionability warnings.
- **refs:** FR-1
- **deps:** *none*

---

## ✅ Definition of Done

- [ ] Test fixture criterion

### Verification Plan

- Automated Tests:
  - \`test command\`

- Manual Verification:
  - Test fixture verification step

## 📁 File Changes
| Path | Action | Reason |
|------|--------|--------|
${rowsMd}
`;
  const fp = path.join(tmpDir, filename);
  fs.writeFileSync(fp, plan);
  return fp;
}

function runGate(planFilePath: string): GateResult {
  const input = JSON.stringify({
    tool_name: 'ExitPlanMode',
    tool_input: { planFilePath, plan: 'test' },
    cwd: tmpDir,
    session_id: 'sess-gate-advisory-test',
  });
  const result = spawnSync('npx', ['tsx', PLAN_GATE], {
    input,
    encoding: 'utf-8',
    shell: true,
    env: { ...process.env, DEVPOM_ALLOW_HOST_TESTS: '1' },
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? -1,
  };
}

describe('PLANGATESG: scope-gate advisory in plan-gate', () => {
  // @feature4
  it('PLANGATESG_10: plan with guard-file in File Changes emits scope-gate advisory to stderr', () => {
    const planFile = writePlan('guard-plan.md', [
      ['src/services/StockValidationService.ts', 'edit', 'Add stocktaking to enum'],
      ['src/utils/helper.ts', 'edit', 'Utility tweak'],
    ]);
    const result = runGate(planFile);

    expect(result.stderr).toMatch(/scope-gate advisory/i);
    expect(result.stderr).toMatch(/StockValidationService\.ts/);
    expect(result.stderr).toMatch(/verify-generic-scope-fix/);
  });

  // @feature4
  it('PLANGATESG_11: plan without guard files produces no scope-gate advisory', () => {
    const planFile = writePlan('clean-plan.md', [
      ['src/utils/helper.ts', 'edit', 'Utility tweak'],
      ['src/components/Button.tsx', 'create', 'New button component'],
    ]);
    const result = runGate(planFile);

    expect(result.stderr).not.toMatch(/scope-gate advisory/i);
  });

  // @feature4
  it('PLANGATESG_12: plan with only docs files produces no scope-gate advisory', () => {
    const planFile = writePlan('docs-plan.md', [
      ['README.md', 'edit', 'Update docs'],
      ['docs/CHANGES.md', 'edit', 'Changelog'],
    ]);
    const result = runGate(planFile);

    expect(result.stderr).not.toMatch(/scope-gate advisory/i);
  });

  // @feature4
  it('PLANGATESG_13: plan with multiple guard files lists them (truncated to 5)', () => {
    const planFile = writePlan('many-guards-plan.md', [
      ['src/services/AService.ts', 'edit', 'change'],
      ['src/services/BService.ts', 'edit', 'change'],
      ['src/validators/CValidator.ts', 'edit', 'change'],
      ['src/domain/DPolicy.ts', 'edit', 'change'],
      ['src/policies/EGuard.ts', 'edit', 'change'],
      ['src/domain/FRule.ts', 'edit', 'change'],
      ['src/utils/helper.ts', 'edit', 'change'],
    ]);
    const result = runGate(planFile);

    expect(result.stderr).toMatch(/scope-gate advisory/i);
    // At least one listed explicitly
    expect(result.stderr).toMatch(/AService\.ts/);
  });
});
