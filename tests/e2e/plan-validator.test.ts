/**
 * E2E tests for plan-pomogator validator hints.
 *
 * Verifies that every validation error includes an actionable hint
 * telling the user exactly how to fix the issue.
 *
 * Pattern: import validatePlan directly, mutate valid.plan.md fixture.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { validatePlan, validatePlanPhased, type ValidationError } from '../../extensions/plan-pomogator/tools/plan-pomogator/validate-plan';
import { extractFileChangePaths, scoreCandidate } from '../../extensions/plan-pomogator/tools/plan-pomogator/plan-gate';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../extensions/plan-pomogator/tools/plan-pomogator/fixtures/valid.plan.md',
);

function getValidPlan(): string {
  return fs.readFileSync(FIXTURE_PATH, 'utf-8');
}

const tempFiles: string[] = [];

function writeTempPlan(content: string): string {
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `test-plan-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
  fs.writeFileSync(tmpFile, content, 'utf-8');
  tempFiles.push(tmpFile);
  return tmpFile;
}

afterEach(() => {
  for (const f of tempFiles) {
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  }
  tempFiles.length = 0;
});

/** Remove a ## section from the plan by name */
function removeSection(content: string, sectionName: string): string {
  const lines = content.split('\n');
  const sectionRegex = new RegExp(`^## ${sectionName}\\b`);
  const startIdx = lines.findIndex((l) => sectionRegex.test(l));
  if (startIdx === -1) return content;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  lines.splice(startIdx, endIdx - startIdx);
  return lines.join('\n');
}

/** Remove a ### subsection from the plan */
function removeSubsection(content: string, subsectionHeading: string): string {
  const lines = content.split('\n');
  const startIdx = lines.findIndex((l) => l.trim().startsWith(`### ${subsectionHeading}`));
  if (startIdx === -1) return content;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^###?\s+/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  lines.splice(startIdx, endIdx - startIdx);
  return lines.join('\n');
}

/** Find errors matching a message substring */
function findErrors(errors: ValidationError[], messageSubstring: string): ValidationError[] {
  return errors.filter((e) => e.message.includes(messageSubstring));
}

// ---------------------------------------------------------------------------
// @feature4: Valid plan
// ---------------------------------------------------------------------------
describe('PLUGIN007_04 Valid plan', () => {
  it('should pass with zero errors for valid.plan.md fixture', () => {
    const errors = validatePlan(FIXTURE_PATH);
    expect(errors).toHaveLength(0);
  });

  it('every error has a non-empty hint field', () => {
    // Break the plan and verify all errors have hints
    const broken = removeSection(getValidPlan(), 'User Stories');
    const tmpFile = writeTempPlan(broken);
    const errors = validatePlan(tmpFile);
    expect(errors.length).toBeGreaterThan(0);
    for (const error of errors) {
      expect(error.hint).toBeDefined();
      expect(error.hint.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// @feature5: Missing sections
// ---------------------------------------------------------------------------
describe('PLUGIN007_05 Missing section hints', () => {
  it('should hint "Добавь: ## User Stories" when User Stories is missing', () => {
    const plan = removeSection(getValidPlan(), 'User Stories');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'Отсутствует секция: User Stories');
    expect(found.length).toBe(1);
    expect(found[0].hint).toBe('Добавь: ## User Stories');
  });

  it('should hint "Добавь: ## Requirements" when Requirements is missing', () => {
    const plan = removeSection(getValidPlan(), 'Requirements');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'Отсутствует секция: Requirements');
    expect(found.length).toBe(1);
    expect(found[0].hint).toBe('Добавь: ## Requirements');
  });

  it('should hint "Добавь: ## Todos" when Todos is missing', () => {
    const plan = removeSection(getValidPlan(), 'Todos');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'Отсутствует секция: Todos');
    expect(found.length).toBe(1);
    expect(found[0].hint).toBe('Добавь: ## Todos');
  });

  it('should hint "Добавь: ## File Changes" when File Changes is missing', () => {
    const plan = removeSection(getValidPlan(), 'File Changes');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'Отсутствует секция: File Changes');
    expect(found.length).toBe(1);
    expect(found[0].hint).toContain('## File Changes');
  });
});

// ---------------------------------------------------------------------------
// @feature6: Requirements subsections
// ---------------------------------------------------------------------------
describe('PLUGIN007_06 Requirements subsection hints', () => {
  it('should hint with exact heading when FR subsection is missing', () => {
    const plan = removeSubsection(getValidPlan(), 'FR (Functional Requirements)');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'В Requirements отсутствует подраздел: FR');
    expect(found.length).toBe(1);
    expect(found[0].hint).toBe('Добавь: ### FR (Functional Requirements)');
  });

  it('should hint with exact heading when Acceptance Criteria is missing', () => {
    const plan = removeSubsection(getValidPlan(), 'Acceptance Criteria (EARS)');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'В Requirements отсутствует подраздел: Acceptance Criteria');
    expect(found.length).toBe(1);
    expect(found[0].hint).toBe('Добавь: ### Acceptance Criteria (EARS)');
  });

  it('should hint with exact heading when NFR is missing', () => {
    const plan = removeSubsection(getValidPlan(), 'NFR (Non-Functional Requirements)');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'В Requirements отсутствует подраздел: NFR');
    expect(found.length).toBe(1);
    expect(found[0].hint).toBe('Добавь: ### NFR (Non-Functional Requirements)');
  });

  it('should hint with exact heading when Assumptions is missing', () => {
    const plan = removeSubsection(getValidPlan(), 'Assumptions');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'В Requirements отсутствует подраздел: Assumptions');
    expect(found.length).toBe(1);
    expect(found[0].hint).toBe('Добавь: ### Assumptions');
  });

  it('should hint to add NFR category when missing', () => {
    // Remove "Performance" from NFR using line-by-line filter (handles \r\n)
    let plan = getValidPlan();
    plan = plan.split(/\r?\n/).filter((l) => !l.includes('Performance')).join('\n');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'В NFR отсутствует категория: Performance');
    expect(found.length).toBe(1);
    expect(found[0].hint).toContain('Performance');
    expect(found[0].hint).toContain('NFR');
  });
});

// ---------------------------------------------------------------------------
// @feature7: Todos validation
// ---------------------------------------------------------------------------
describe('PLUGIN007_07 Todos hints', () => {
  it('should hint with template.md reference when Todos is empty', () => {
    // Replace Todos content with empty
    let plan = getValidPlan();
    const lines = plan.split(/\r?\n/);
    const todosIdx = lines.findIndex((l) => /^## Todos\s*$/.test(l));
    const nextSectionIdx = lines.findIndex((l, i) => i > todosIdx && /^## /.test(l));
    // Remove everything between ## Todos and next section
    lines.splice(todosIdx + 1, nextSectionIdx - todosIdx - 1);
    plan = lines.join('\n');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'Секция Todos не содержит ни одной задачи');
    expect(found.length).toBe(1);
    expect(found[0].hint).toContain('template.md');
  });

  it('should hint about indentation when description is not indented', () => {
    let plan = getValidPlan();
    // Replace indented description with unindented
    plan = plan.replace(/  description:/, 'description:');
    const errors = validatePlan(writeTempPlan(plan));
    const indentErrors = errors.filter((e) =>
      e.message.includes('вложенными строками') || e.message.includes('вложенной строкой'),
    );
    expect(indentErrors.length).toBeGreaterThan(0);
    expect(indentErrors[0].hint).toContain('2+');
  });

  it('should hint about files: when missing from description', () => {
    let plan = getValidPlan();
    // Remove "files:" from description line
    plan = plan.replace(/files:/, 'fiiiles:');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'отсутствует files:');
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].hint).toContain('files:');
  });

  it('should hint about Requirements refs: when missing', () => {
    let plan = getValidPlan();
    plan = plan.replace(/Requirements refs:/i, 'Reqs:');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'отсутствует Requirements refs:');
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].hint).toContain('Requirements refs:');
  });

  it('should hint about dependencies when missing', () => {
    let plan = getValidPlan();
    // Remove dependencies line using line-by-line filter (handles \r\n)
    plan = plan.split(/\r?\n/).filter((l) => !l.trim().startsWith('dependencies:')).join('\n');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'отсутствует dependencies');
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].hint).toContain('dependencies:');
  });
});

// ---------------------------------------------------------------------------
// @feature8: Verification Plan
// ---------------------------------------------------------------------------
describe('PLUGIN007_08 Verification Plan hints', () => {
  it('should hint to add ### Verification Plan when missing', () => {
    const plan = removeSubsection(getValidPlan(), 'Verification Plan');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'В DoD отсутствует секция Verification Plan');
    expect(found.length).toBe(1);
    expect(found[0].hint).toBe('Добавь: ### Verification Plan');
  });

  it('should hint about backtick format when command is missing', () => {
    let plan = getValidPlan();
    // Replace the backtick command line with plain text
    plan = plan.replace(/- `[^`]+`/, '- run tests');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'Automated Tests должны содержать хотя бы одну команду в backticks');
    expect(found.length).toBe(1);
    expect(found[0].hint).toContain('- `');
  });
});

// ---------------------------------------------------------------------------
// File Changes
// ---------------------------------------------------------------------------
describe('PLUGIN007_09 File Changes hints', () => {
  it('should hint about relative path when absolute path found', () => {
    let plan = getValidPlan();
    plan = plan.replace(
      /\| `.dev-pomogator[^|]+\|/,
      '| `C:\\Users\\test\\file.ts` |',
    );
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'Абсолютный путь');
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].hint).toContain('относительный');
  });

  it('should hint about allowed actions when invalid action found', () => {
    let plan = getValidPlan();
    plan = plan.replace(/\| create \|/, '| destroy |');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'Недопустимый Action');
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].hint).toContain('create, edit, delete');
  });

  it('should hint about empty table when no data rows', () => {
    let plan = getValidPlan();
    // Remove all data rows from File Changes table
    const lines = plan.split(/\r?\n/);
    const headerIdx = lines.findIndex((l) => /\|\s*Path\s*\|\s*Action\s*\|\s*Reason\s*\|/.test(l));
    if (headerIdx !== -1) {
      // Remove everything after the separator line
      const separatorIdx = headerIdx + 1;
      let endIdx = lines.length;
      for (let i = separatorIdx + 1; i < lines.length; i++) {
        if (!lines[i].includes('|')) {
          endIdx = i;
          break;
        }
      }
      lines.splice(separatorIdx + 1, endIdx - separatorIdx - 1);
    }
    plan = lines.join('\n');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'не содержит строк данных');
    expect(found.length).toBe(1);
    expect(found[0].hint).toContain('path/to/file');
  });
});

// ---------------------------------------------------------------------------
// Section order
// ---------------------------------------------------------------------------
describe('PLUGIN007_10 Section order hints', () => {
  it('should hint with expected order when File Changes is not last', () => {
    let plan = getValidPlan();
    // Add a ## section after File Changes
    plan += '\n## Extra Section\nSome content\n';
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'File Changes должна быть последней');
    expect(found.length).toBe(1);
    expect(found[0].hint).toContain('Перенеси');
  });

  it('should hint with section order when sections are swapped', () => {
    const plan = getValidPlan();
    const lines = plan.split(/\r?\n/);
    // Find User Stories and Use Cases sections, swap them
    const usIdx = lines.findIndex((l) => /^## User Stories\b/.test(l));
    const ucIdx = lines.findIndex((l) => /^## Use Cases\b/.test(l));
    const reqIdx = lines.findIndex((l) => /^## Requirements\b/.test(l));
    // Extract sections
    const usLines = lines.slice(usIdx, ucIdx);
    const ucLines = lines.slice(ucIdx, reqIdx);
    // Swap: put Use Cases first, then User Stories
    const swapped = [
      ...lines.slice(0, usIdx),
      ...ucLines,
      ...usLines,
      ...lines.slice(reqIdx),
    ].join('\n');
    const errors = validatePlan(writeTempPlan(swapped));
    const found = findErrors(errors, 'находится не в требуемом порядке');
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].hint).toContain('User Stories');
  });
});

// ---------------------------------------------------------------------------
// Impact Analysis
// ---------------------------------------------------------------------------
describe('PLUGIN007_11 Impact Analysis hints', () => {
  it('should error when destructive action has no Impact Analysis section', () => {
    let plan = getValidPlan();
    // Change action from "create" to "delete" to trigger destructive check
    plan = plan.replace(/\| create \|/, '| delete |');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'отсутствует секция Impact Analysis');
    expect(found.length).toBe(1);
    expect(found[0].hint).toContain('## Impact Analysis');
  });

  it('should error when Impact Analysis is N/A with destructive actions', () => {
    let plan = getValidPlan();
    // Change action to delete
    plan = plan.replace(/\| create \|/, '| delete |');
    // Insert Impact Analysis section with N/A before Todos
    const lines = plan.split(/\r?\n/);
    const todosIdx = lines.findIndex((l) => /^## Todos\b/.test(l));
    lines.splice(todosIdx, 0, '## Impact Analysis', '', 'N/A', '');
    plan = lines.join('\n');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'Impact Analysis содержит N/A');
    expect(found.length).toBe(1);
    expect(found[0].hint).toContain('Keyword');
  });
});

// ---------------------------------------------------------------------------
// Fenced code-block in File Changes
// ---------------------------------------------------------------------------
describe('PLUGIN007_12 Fenced code-block hints', () => {
  it('should error when File Changes table is inside fenced block', () => {
    let plan = getValidPlan();
    const lines = plan.split(/\r?\n/);
    const fcIdx = lines.findIndex((l) => /^## File Changes\b/.test(l));
    // Insert ``` after ## File Changes heading
    lines.splice(fcIdx + 1, 0, '```');
    // Add closing ``` at end
    lines.push('```');
    plan = lines.join('\n');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'fenced code-block');
    expect(found.length).toBe(1);
    expect(found[0].hint).toContain('```');
  });
});

// ---------------------------------------------------------------------------
// Requirements subsection order
// ---------------------------------------------------------------------------
describe('PLUGIN007_13 Requirements subsection order hints', () => {
  it('should error when subsections are out of order', () => {
    const plan = getValidPlan();
    const lines = plan.split(/\r?\n/);
    // Find FR and NFR subsections, swap them
    const frIdx = lines.findIndex((l) => /^### FR\b/.test(l));
    const acIdx = lines.findIndex((l) => /^### Acceptance Criteria\b/.test(l));
    const nfrIdx = lines.findIndex((l) => /^### NFR\b/.test(l));
    const assIdx = lines.findIndex((l) => /^### Assumptions\b/.test(l));
    const implIdx = lines.findIndex((l) => /^## Implementation Plan\b/.test(l));
    // Extract FR and NFR sections
    const frSection = lines.slice(frIdx, acIdx);
    const acSection = lines.slice(acIdx, nfrIdx);
    const nfrSection = lines.slice(nfrIdx, assIdx);
    const assSection = lines.slice(assIdx, implIdx);
    // Reorder: NFR first, then AC, then FR, then Assumptions
    const reordered = [
      ...lines.slice(0, frIdx),
      ...nfrSection,
      ...acSection,
      ...frSection,
      ...assSection,
      ...lines.slice(implIdx),
    ].join('\n');
    const errors = validatePlan(writeTempPlan(reordered));
    const found = findErrors(errors, 'Нарушен порядок подразделов');
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].hint).toContain('FR');
  });
});

// ---------------------------------------------------------------------------
// Phase 2: Context & Extracted Requirements
// ---------------------------------------------------------------------------
describe('PLUGIN007_14 Phase 2: Context section validation', () => {
  it('should require ## Context section (Phase 1 structural check)', () => {
    // Remove Context from a valid plan
    const plan = removeSection(getValidPlan(), 'Context');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'Отсутствует секция: Context');
    expect(found.length).toBe(1);
    expect(found[0].hint).toBe('Добавь: ## Context');
  });

  it('should place Context before User Stories in section order', () => {
    // Swap Context and User Stories
    const plan = getValidPlan();
    const lines = plan.split(/\r?\n/);
    const ctxIdx = lines.findIndex((l) => /^## Context\b/.test(l));
    const usIdx = lines.findIndex((l) => /^## User Stories\b/.test(l));
    const ucIdx = lines.findIndex((l) => /^## Use Cases\b/.test(l));
    // Extract sections
    const ctxLines = lines.slice(ctxIdx, usIdx);
    const usLines = lines.slice(usIdx, ucIdx);
    // Swap: User Stories first, then Context
    const swapped = [
      ...lines.slice(0, ctxIdx),
      ...usLines,
      ...ctxLines,
      ...lines.slice(ucIdx),
    ].join('\n');
    const errors = validatePlan(writeTempPlan(swapped));
    const found = findErrors(errors, 'находится не в требуемом порядке');
    expect(found.length).toBeGreaterThan(0);
  });
});

describe('PLUGIN007_15 Phase 2: Extracted Requirements validation', () => {
  it('should not show Phase 2 errors when Phase 1 has errors', () => {
    // Remove both Context AND User Stories → Phase 1 errors only
    let plan = removeSection(getValidPlan(), 'Context');
    plan = removeSection(plan, 'User Stories');
    const result = validatePlanPhased(writeTempPlan(plan));
    expect(result.phase1.length).toBeGreaterThan(0);
    expect(result.phase2.length).toBe(0);
  });

  it('should error when Context has no Extracted Requirements subsection', () => {
    let plan = getValidPlan();
    // Remove ### Extracted Requirements from Context
    plan = removeSubsection(plan, 'Extracted Requirements');
    const result = validatePlanPhased(writeTempPlan(plan));
    expect(result.phase1.length).toBe(0);
    expect(result.phase2.length).toBeGreaterThan(0);
    const found = findErrors(result.phase2, 'отсутствует подсекция ### Extracted Requirements');
    expect(found.length).toBe(1);
    expect(found[0].hint).toContain('Перечитай ВСЕ сообщения пользователя');
  });

  it('should error when Extracted Requirements has fewer than 2 items', () => {
    let plan = getValidPlan();
    // Replace Extracted Requirements with only 1 item
    const lines = plan.split(/\r?\n/);
    const erIdx = lines.findIndex((l) => /^### Extracted Requirements/.test(l));
    // Find next heading after Extracted Requirements
    let endIdx = lines.length;
    for (let i = erIdx + 1; i < lines.length; i++) {
      if (/^###?\s+/.test(lines[i])) {
        endIdx = i;
        break;
      }
    }
    // Replace content with single item
    lines.splice(erIdx + 1, endIdx - erIdx - 1, '1. Единственное требование', '');
    plan = lines.join('\n');
    const result = validatePlanPhased(writeTempPlan(plan));
    expect(result.phase1.length).toBe(0);
    expect(result.phase2.length).toBe(1);
    expect(result.phase2[0].message).toContain('1 пунктов (минимум 2)');
    expect(result.phase2[0].hint).toContain('нумерованный пункт');
  });

  it('should pass Phase 2 when Extracted Requirements has 2+ items', () => {
    // Valid fixture already has 2 items
    const result = validatePlanPhased(FIXTURE_PATH);
    expect(result.phase1.length).toBe(0);
    expect(result.phase2.length).toBe(0);
  });
});

describe('PLUGIN007_16 Phase gating: validatePlan backward compatibility', () => {
  it('should return Phase 1 errors when both phases have issues', () => {
    // Remove Context (Phase 1 error) — validatePlan should only show Phase 1
    const plan = removeSection(getValidPlan(), 'Context');
    const errors = validatePlan(writeTempPlan(plan));
    const contextErrors = findErrors(errors, 'Отсутствует секция: Context');
    expect(contextErrors.length).toBe(1);
    // Should NOT contain Phase 2 errors
    const phase2Errors = findErrors(errors, 'Extracted Requirements');
    expect(phase2Errors.length).toBe(0);
  });

  it('should return Phase 2 errors only when Phase 1 is clean', () => {
    let plan = getValidPlan();
    // Remove Extracted Requirements subsection (Phase 2 issue, Phase 1 clean)
    plan = removeSubsection(plan, 'Extracted Requirements');
    const errors = validatePlan(writeTempPlan(plan));
    // Should contain Phase 2 error
    const found = findErrors(errors, 'Extracted Requirements');
    expect(found.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// @feature17: Plan-gate content-based scoring — extractFileChangePaths
// ---------------------------------------------------------------------------

describe('PLUGIN007_17 extractFileChangePaths', () => {
  it('extracts paths from File Changes table', () => {
    const content = `## File Changes

| Path | Action | Reason |
|------|--------|--------|
| \`extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts\` | edit | Add scoring |
| \`tests/e2e/plan-validator.test.ts\` | edit | Add tests |
| \`.dev-pomogator/tools/plan-pomogator/plan-gate.ts\` | edit | Deploy |
`;
    const paths = extractFileChangePaths(content);
    expect(paths).toHaveLength(3);
    expect(paths).toContain('extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts');
    expect(paths).toContain('tests/e2e/plan-validator.test.ts');
    expect(paths).toContain('.dev-pomogator/tools/plan-pomogator/plan-gate.ts');
  });

  it('returns empty array when no File Changes section', () => {
    const content = '## User Stories\n\nSome content here';
    expect(extractFileChangePaths(content)).toHaveLength(0);
  });

  it('returns empty array for empty File Changes table', () => {
    const content = `## File Changes

| Path | Action | Reason |
|------|--------|--------|
`;
    expect(extractFileChangePaths(content)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// @feature18: Plan-gate content-based scoring — scoreCandidate matching project
// ---------------------------------------------------------------------------

describe('PLUGIN007_18 scoreCandidate matching project', () => {
  it('returns positive score for plan referencing existing project files', () => {
    const content = `## File Changes

| Path | Action | Reason |
|------|--------|--------|
| \`extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts\` | edit | Fix scoring |
| \`package.json\` | edit | Update deps |
`;
    // cwd is this project's root — these files exist
    const cwd = path.resolve(__dirname, '../..');
    const score = scoreCandidate(content, cwd);
    expect(score).toBeGreaterThan(0);
  });

  it('adds score for project basename mention', () => {
    const cwd = path.resolve(__dirname, '../..');
    const projectName = path.basename(cwd); // "dev-pomogator"
    const content = `Working on ${projectName} project improvements.\n\n## File Changes\n\n| Path | Action | Reason |\n|------|--------|--------|\n`;
    const score = scoreCandidate(content, cwd);
    expect(score).toBe(5); // basename mention only, no existing file paths
  });
});

// ---------------------------------------------------------------------------
// @feature19: Plan-gate content-based scoring — scoreCandidate non-matching
// ---------------------------------------------------------------------------

describe('PLUGIN007_19 scoreCandidate non-matching project', () => {
  it('returns zero for plan referencing files from a different project', () => {
    const content = `## File Changes

| Path | Action | Reason |
|------|--------|--------|
| \`src/controllers/zoho-inventory.ts\` | create | New controller |
| \`lib/warehouse/bin-locations.py\` | edit | Add feature |
`;
    const cwd = path.resolve(__dirname, '../..');
    const score = scoreCandidate(content, cwd);
    expect(score).toBe(0);
  });

  it('returns zero when plan has no File Changes and no project name', () => {
    const content = '## Context\n\nSome generic plan.\n\n## User Stories\n\nAs a user...';
    const cwd = path.resolve(__dirname, '../..');
    const score = scoreCandidate(content, cwd);
    expect(score).toBe(0);
  });
});
