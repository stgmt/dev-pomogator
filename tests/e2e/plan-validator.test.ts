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
import { validatePlan, validatePlanPhased, REQUIRED_SECTIONS, findHeadingIndex, type ValidationError } from '../../extensions/plan-pomogator/tools/plan-pomogator/validate-plan';
import { readTemplateContent, checkDuplicatePlan, scorePromptRelevance, resolvePlanFile } from '../../extensions/plan-pomogator/tools/plan-pomogator/plan-gate';

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

/** Find section index by name using production REQUIRED_SECTIONS regex */
function findSection(lines: string[], name: string): number {
  const section = REQUIRED_SECTIONS.find((s) => s.name === name);
  if (section) return findHeadingIndex(lines, section.regex);
  return lines.findIndex((l) => new RegExp(`^##\\s+(?:\\S+\\s+)?${name}\\b`).test(l));
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
  const sectionRegex = new RegExp(`^##\\s+(?:\\S+\\s+)?${sectionName}\\b`);
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
    const todosIdx = findSection(lines, 'Todos');
    const nextSectionIdx = lines.findIndex((l, i) => i > todosIdx && /^## /.test(l));
    // Remove everything between ## Todos and next section
    lines.splice(todosIdx + 1, nextSectionIdx - todosIdx - 1);
    plan = lines.join('\n');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'Секция Todos не содержит ни одной задачи');
    expect(found.length).toBe(1);
    expect(found[0].hint).toContain('template.md');
  });

  it('should hint about description when blockquote is missing', () => {
    let plan = getValidPlan();
    // Remove blockquote line (> description)
    plan = plan.split(/\r?\n/).filter((l) => !/^>\s+/.test(l)).join('\n');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'отсутствует description');
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].hint).toContain('blockquote');
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

  it('should hint about refs: when missing', () => {
    let plan = getValidPlan();
    plan = plan.replace(/refs:/gi, 'rrrefs:');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'отсутствует refs:');
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].hint).toContain('refs:');
  });

  it('should hint about changes: when missing', () => {
    let plan = getValidPlan();
    plan = plan.split(/\r?\n/).filter((l) => !l.includes('changes:')).join('\n');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'отсутствует changes:');
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].hint).toContain('changes:');
  });

  it('should hint about deps: when missing', () => {
    let plan = getValidPlan();
    plan = plan.split(/\r?\n/).filter((l) => !l.includes('deps:')).join('\n');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'отсутствует deps:');
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].hint).toContain('deps:');
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
    const usIdx = findSection(lines, 'User Stories');
    const ucIdx = lines.findIndex((l) => /^##\s+(?:\S+\s+)?Use Cases\b/.test(l));
    const reqIdx = findSection(lines, 'Requirements');
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
    const todosIdx = findSection(lines, 'Todos');
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
    const fcIdx = findSection(lines, 'File Changes');
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
    const implIdx = findSection(lines, 'Implementation Plan');
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
    const ctxIdx = findSection(lines, 'Context');
    const usIdx = findSection(lines, 'User Stories');
    const ucIdx = lines.findIndex((l) => /^##\s+(?:\S+\s+)?Use Cases\b/.test(l));
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
// @feature17: resolvePlanFile — deterministic plan file resolution
// ---------------------------------------------------------------------------

describe('PLUGIN007_17 resolvePlanFile', () => {
  it('PLUGIN007_17_01: returns planFilePath when file exists', () => {
    // Use a known existing file as test
    const existingFile = path.resolve(__dirname, '../../extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts');
    const result = resolvePlanFile({ planFilePath: existingFile });
    expect(result).toBe(existingFile);
  });

  it('PLUGIN007_17_02: returns null when planFilePath is missing', () => {
    expect(resolvePlanFile({})).toBeNull();
    expect(resolvePlanFile(undefined)).toBeNull();
    expect(resolvePlanFile({ allowedPrompts: [] })).toBeNull();
  });

  it('PLUGIN007_17_03: returns null when planFilePath points to non-existent file', () => {
    const result = resolvePlanFile({ planFilePath: '/tmp/non-existent-plan-12345.md' });
    expect(result).toBeNull();
  });

  it('PLUGIN007_17_04: handles path with native separators', () => {
    // On Windows, Claude Code sends backslash paths; on Linux, forward slashes.
    // resolvePlanFile passes the path to fs.accessSync which handles both natively.
    const existingFile = path.resolve(__dirname, '../../extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts');
    const result = resolvePlanFile({ planFilePath: existingFile });
    expect(result).toBe(existingFile);
  });
});

// ---------------------------------------------------------------------------
// @feature2: readTemplateContent — template injection in deny messages
// ---------------------------------------------------------------------------

describe('PLUGIN007_22 readTemplateContent', () => {
  // @feature2
  it('PLUGIN007_22: returns template content with header when cwd has template.md', () => {
    const cwd = path.resolve(__dirname, '../..');
    const result = readTemplateContent(cwd);
    expect(result).toContain('Шаблон правильного формата:');
    expect(result).toContain('## Context');
    expect(result).toContain('## File Changes');
  });

  // @feature2
  it('PLUGIN007_23: returns empty string when cwd has no template.md (fail-open)', () => {
    const result = readTemplateContent(os.tmpdir());
    expect(result).toBe('');
  });

  // @feature2
  it('PLUGIN007_23b: returns empty string when cwd is undefined', () => {
    const result = readTemplateContent(undefined);
    expect(result).toBe('');
  });
});

// ---------------------------------------------------------------------------
// @feature1: Rule content checks — pre-flight checklist, Phase 2, replace
// ---------------------------------------------------------------------------

describe('PLUGIN007_20 Rule contains pre-flight checklist', () => {
  const rulePath = path.resolve(__dirname, '../../extensions/plan-pomogator/claude/rules/plan-pomogator.md');
  const ruleContent = fs.readFileSync(rulePath, 'utf-8');

  // @feature1
  it('PLUGIN007_20: rule contains Pre-flight Checklist section', () => {
    expect(ruleContent).toContain('Pre-flight Checklist');
    expect(ruleContent).toContain('Extracted Requirements');
    expect(ruleContent).toContain('Verification Plan');
  });

  // @feature4
  it('PLUGIN007_21: rule documents Phase 2 validation', () => {
    expect(ruleContent).toContain('Phase 2');
    expect(ruleContent).toContain('Extracted Requirements');
    expect(ruleContent).toMatch(/минимум 2/i);
  });

  // @feature1
  it('PLUGIN007_24: rule contains active instruction to read template', () => {
    expect(ruleContent).toContain('Перед написанием плана');
    expect(ruleContent).toContain('.dev-pomogator/tools/plan-pomogator/template.md');
  });

  // @feature1
  it('PLUGIN007_25: rule lists replace as destructive action', () => {
    expect(ruleContent).toContain('delete/rename/move/replace');
  });
});

// ---------------------------------------------------------------------------
// @feature5: Phase 0 — Duplicate Detection
// ---------------------------------------------------------------------------

describe('PLUGIN007_27 checkDuplicatePlan', () => {
  const tmpDir = path.join(os.tmpdir(), 'plan-gate-dup-test-' + Date.now());

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch { /* ok */ }
  });

  // @feature5
  it('PLUGIN007_27: detects duplicate plan file', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const content = '# Test Plan\n\n## Context\nSome content here.';
    const planA = path.join(tmpDir, 'plan-a.md');
    const planB = path.join(tmpDir, 'plan-b.md');
    fs.writeFileSync(planA, content);
    fs.writeFileSync(planB, content);

    const result = checkDuplicatePlan(planA, content);
    expect(result).toBe('plan-b.md');
  });

  // @feature5
  it('PLUGIN007_28: returns null for unique plan', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const planA = path.join(tmpDir, 'plan-a.md');
    const planB = path.join(tmpDir, 'plan-b.md');
    fs.writeFileSync(planA, '# Plan A unique content');
    fs.writeFileSync(planB, '# Plan B different content');

    const result = checkDuplicatePlan(planA, '# Plan A unique content');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// @feature6: Phase 2.5 — Prompt Relevance Gate
// ---------------------------------------------------------------------------

describe('PLUGIN007_29 scorePromptRelevance hard check', () => {
  // @feature6
  it('PLUGIN007_29: returns <= -20 for mismatched plan and prompts', () => {
    const planContent = `## Context\n\n### Extracted Requirements\n1. Optimize Docker build caching for faster builds\n2. Split Dockerfile into base and application layers\n`;
    const prompts = ['plan-gate anti-copy protection duplicate detection'];
    const score = scorePromptRelevance(planContent, prompts);
    expect(score).toBeLessThanOrEqual(-20);
  });

  // @feature6
  it('PLUGIN007_30: returns > -20 for matching plan and prompts', () => {
    const planContent = `## Context\n\n### Extracted Requirements\n1. Detect duplicate plan files via SHA-256 comparison\n2. Block plans with low prompt relevance overlap\n`;
    const prompts = ['duplicate detection plan-gate SHA-256 comparison prompt relevance'];
    const score = scorePromptRelevance(planContent, prompts);
    expect(score).toBeGreaterThan(-20);
  });
});

// ---------------------------------------------------------------------------
// @feature31: Phase 1 — changes: field required
// ---------------------------------------------------------------------------
describe('PLUGIN007_31 changes: field validation', () => {
  // @feature31
  it('PLUGIN007_31_01: should error when changes: is missing from todo', () => {
    let plan = getValidPlan();
    // Remove all lines containing "changes:" and sub-bullets
    const lines = plan.split(/\r?\n/);
    const filtered: string[] = [];
    let skipBullets = false;
    for (const line of lines) {
      if (/\bchanges:\b/i.test(line)) {
        skipBullets = true;
        continue;
      }
      if (skipBullets && /^\s+-\s+/.test(line)) {
        continue;
      }
      skipBullets = false;
      filtered.push(line);
    }
    plan = filtered.join('\n');
    const errors = validatePlan(writeTempPlan(plan));
    const found = findErrors(errors, 'отсутствует changes:');
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].hint).toContain('changes:');
  });

  // @feature31
  it('PLUGIN007_31_02: should pass when changes: has concrete sub-bullets', () => {
    const errors = validatePlan(FIXTURE_PATH);
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// @feature32: Phase 4 — Actionability warnings
// ---------------------------------------------------------------------------
describe('PLUGIN007_32 Actionability warnings (Phase 4)', () => {
  // @feature32
  it('PLUGIN007_32_01: should warn when changes: bullet is too short', () => {
    let plan = getValidPlan();
    // Replace first changes bullet with short text
    plan = plan.replace(
      /- Реализовать функцию `validateSections\(\)`.+$/m,
      '- Обновить код',
    );
    const result = validatePlanPhased(writeTempPlan(plan));
    expect(result.phase1).toHaveLength(0);
    const found = findErrors(result.phase4, 'слишком краткий');
    expect(found.length).toBeGreaterThan(0);
  });

  // @feature32
  it('PLUGIN007_32_02: should warn when changes: bullet contains generic phrase', () => {
    let plan = getValidPlan();
    plan = plan.replace(
      /- Реализовать функцию `validateSections\(\)`.+$/m,
      '- Update logic and implement feature for the plan validation system module processing',
    );
    const result = validatePlanPhased(writeTempPlan(plan));
    expect(result.phase1).toHaveLength(0);
    const found = findErrors(result.phase4, 'generic фразу');
    expect(found.length).toBeGreaterThan(0);
  });

  // @feature32
  it('PLUGIN007_32_03: should warn when Implementation Plan step is too short', () => {
    let plan = getValidPlan();
    plan = plan.replace(
      /1\. Создать `validate-plan\.ts`.+$/m,
      '1. Добавить валидатор.',
    );
    const result = validatePlanPhased(writeTempPlan(plan));
    const found = findErrors(result.phase4, 'Implementation Plan шаг слишком краткий');
    expect(found.length).toBeGreaterThan(0);
  });

  // @feature32
  it('PLUGIN007_32_04: should warn when File Changes Reason is too short', () => {
    let plan = getValidPlan();
    plan = plan.replace(
      /Скрипт многофазной валидации.+\|/,
      'Update. |',
    );
    const result = validatePlanPhased(writeTempPlan(plan));
    const found = findErrors(result.phase4, 'File Changes Reason слишком краткий');
    expect(found.length).toBeGreaterThan(0);
  });

  // @feature32
  it('PLUGIN007_32_05: Phase 4 only runs when Phase 1-3 are clean', () => {
    const plan = removeSection(getValidPlan(), 'User Stories');
    const result = validatePlanPhased(writeTempPlan(plan));
    expect(result.phase1.length).toBeGreaterThan(0);
    expect(result.phase4).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// @feature36: Proactive-investigation rule content verification
// ---------------------------------------------------------------------------

describe('PLUGIN007_36: Proactive-investigation rule', () => {
  const RULE_SOURCE = path.resolve(
    __dirname,
    '../../extensions/plan-pomogator/claude/rules/proactive-investigation.md',
  );
  const RULE_INSTALLED = path.resolve(
    __dirname,
    '../../.claude/rules/pomogator/proactive-investigation.md',
  );
  const ruleContent = fs.readFileSync(RULE_SOURCE, 'utf-8');

  // @feature36
  it('PLUGIN007_36_01: rule exists in source of truth', () => {
    expect(fs.existsSync(RULE_SOURCE)).toBe(true);
  });

  // @feature36
  it('PLUGIN007_36_02: rule exists in installed location', () => {
    expect(fs.existsSync(RULE_INSTALLED)).toBe(true);
  });

  // @feature36
  it('PLUGIN007_36_03: rule contains banned phrases', () => {
    expect(ruleContent).toContain('ЗАПРЕЩЕНО');
    expect(ruleContent).toContain('Посмотреть?');
    expect(ruleContent).toContain('Проверить?');
    expect(ruleContent).toContain('Хотите чтобы я проверил?');
  });

  // @feature36
  it('PLUGIN007_36_04: rule contains evidence format table', () => {
    expect(ruleContent).toContain('Evidence формат');
    expect(ruleContent).toContain('grep');
    expect(ruleContent).toContain('скриншот');
    expect(ruleContent).toContain('UNVERIFIED');
  });

  // @feature36
  it('PLUGIN007_36_05: extension manifest includes proactive-investigation', () => {
    const manifestPath = path.resolve(
      __dirname,
      '../../extensions/plan-pomogator/extension.json',
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.rules.claude).toContain('claude/rules/proactive-investigation.md');
  });

  // @feature36
  it('PLUGIN007_36_06: rule is under 80 lines', () => {
    const lineCount = ruleContent.split('\n').length;
    expect(lineCount).toBeLessThan(80);
  });
});

// ---------------------------------------------------------------------------
// @feature42: Installer normalizes array matcher to pipe string
// ---------------------------------------------------------------------------

describe('PLUGIN007_42: Installer normalizes array matcher to pipe string', () => {
  it('PLUGIN007_42_01: extension.json claude hooks contain PreToolUse and UserPromptSubmit', () => {
    const manifestPath = path.resolve(
      __dirname,
      '../../extensions/plan-pomogator/extension.json',
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const claudeHooks = manifest.hooks?.claude;

    // Verify plan-pomogator hooks: PreToolUse for ExitPlanMode, UserPromptSubmit for prompt-capture
    // PostToolUse for mark-plan-session was removed (planFilePath is now deterministic)
    expect(claudeHooks).toBeDefined();
    expect(claudeHooks.PreToolUse).toBeDefined();
    expect(claudeHooks.PreToolUse.matcher).toBe('ExitPlanMode');
    expect(claudeHooks.UserPromptSubmit).toBeDefined();
    // PostToolUse hook for mark-plan-session.sh was removed
    expect(claudeHooks.PostToolUse).toBeUndefined();
  });
});
