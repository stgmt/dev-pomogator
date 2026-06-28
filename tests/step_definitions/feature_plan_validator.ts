/**
 * feature_plan_validator.ts
 *
 * Step definitions for PLUGIN007_plan-validator.feature and PLUGIN015 Spec-Test Sync subset.
 *
 * Drives the REAL plan-pomogator tools in-process (validatePlan / validatePlanPhased /
 * plan-gate helpers) and via spawn (prompt-capture.ts CLI, validate-plan.ts CLI).
 * All step patterns are REGEX, scoped with "plan-validator" prefix to avoid cross-feature
 * ambiguity. No mocks — isolation comes from V4World.tempDir per-scenario.
 *
 * @see tests/features/plugins/plan-pomogator/PLUGIN007_plan-validator.feature
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { V4World } from '../hooks/before-after.ts';
import {
  validatePlan,
  validatePlanPhased,
  type ValidationError,
} from '../../tools/plan-pomogator/validate-plan.ts';
import {
  readTemplateContent,
  checkDuplicatePlan,
  scorePromptRelevance,
  selectRelevanceWindow,
  resolvePlanFile,
  formatPromptsFromFile,
  loadUserPrompts,
} from '../../tools/plan-pomogator/plan-gate.ts';
import { PROMPT_FILE_PREFIX } from '../../tools/plan-pomogator/prompt-store.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPO_ROOT = process.env.APP_DIR ?? path.resolve(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (import.meta as any).dirname ?? __dirname,
  '..', '..',
);
const FIXTURE_PATH = path.join(REPO_ROOT, 'tools', 'plan-pomogator', 'fixtures', 'valid.plan.md');
const CAPTURE_SCRIPT = path.join(REPO_ROOT, 'tools', 'plan-pomogator', 'prompt-capture.ts');
const VALIDATE_PLAN_SCRIPT = path.join(REPO_ROOT, 'tools', 'plan-pomogator', 'validate-plan.ts');

// Read once — synchronous at module load (fixture must exist).
// Normalize CRLF → LF so regex patterns using \n are consistent across
// Windows (working tree) and Docker/Linux (copied by COPY . .).
const VALID_PLAN = fs.readFileSync(FIXTURE_PATH, 'utf-8').replace(/\r\n/g, '\n');

// ---------------------------------------------------------------------------
// World extension
// ---------------------------------------------------------------------------

interface PvWorld extends V4World {
  pvPlan: string;
  pvErrors: ValidationError[];
  pvPhased: {
    phase1: ValidationError[];
    phase2: ValidationError[];
    phase3: ValidationError[];
    phase4: ValidationError[];
  } | null;
  pvSessionId: string;
  pvPromptText: string;
  pvCaptureResult: { status: number | null; stdout: string; stderr: string } | null;
  pvDupResult: string | null;
  pvScore: number | null;
  pvWindow: string[] | null;
  pvFormatResult: string | null;
  pvLoadResult: string | null;
  pvTemplateResult: string;
  pvResolvePlanResult: string | null;
  pvRuleContent: string | null;
}

// ---------------------------------------------------------------------------
// Background step
// ---------------------------------------------------------------------------

Given(/^the plan-validator environment is configured$/, function (this: PvWorld) {
  // V4World Before hook already provides a fresh this.tempDir per scenario.
  // This step is a no-op; it exists to make the Background declaration explicit.
});

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Remove a top-level `## …<name>` section and all its lines up to the next `## `. */
function pvRemoveSection(content: string, sectionName: string): string {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionRegex = new RegExp(`^##\\s+(?:\\S+\\s+)?${escaped}(?:$|\\s)`);
  const lines = content.split('\n');
  const startIdx = lines.findIndex((l) => sectionRegex.test(l));
  if (startIdx === -1) return content;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) { endIdx = i; break; }
  }
  lines.splice(startIdx, endIdx - startIdx);
  return lines.join('\n');
}

/** Remove a `### <heading>` subsection and its lines up to the next `##` or `###`. */
function pvRemoveSubsection(content: string, heading: string): string {
  const lines = content.split('\n');
  const startIdx = lines.findIndex((l) => l.trim().startsWith(`### ${heading}`));
  if (startIdx === -1) return content;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^###?\s+/.test(lines[i])) { endIdx = i; break; }
  }
  lines.splice(startIdx, endIdx - startIdx);
  return lines.join('\n');
}

/** Replace the File Changes table rows with the given markdown rows. */
function pvBuildPlanWithFileChanges(base: string, rows: string): string {
  const paths = [...rows.matchAll(/`([^`]+)`\s*\|/g)].map((m) => m[1]);
  const pathMention = paths
    .map((p) => `1. Edit \`${p}\` — apply changes for spec-test-sync validation`)
    .join('\n');
  let plan = base.replace(/(## 🔧 Implementation Plan\n)/, `$1${pathMention}\n`);
  plan = plan.replace(
    /(## 📁 File Changes\n\| Path \| Action \| Reason \|\n\|[-|]+\|)\n[\s\S]*$/m,
    `$1\n${rows}\n`,
  );
  return plan;
}

/** Write plan text to a temp file in this.tempDir and return the path. */
function pvWritePlan(world: PvWorld): string {
  const planPath = path.join(world.tempDir, 'plan.md');
  fs.writeFileSync(planPath, world.pvPlan, 'utf-8');
  return planPath;
}

// ---------------------------------------------------------------------------
// GIVEN — plan construction
// ---------------------------------------------------------------------------

Given(/^a plan-validator plan from the valid fixture$/, function (this: PvWorld) {
  this.pvPlan = VALID_PLAN;
});

Given(/^a plan-validator plan missing the "([^"]+)" section$/, function (this: PvWorld, sectionName: string) {
  this.pvPlan = pvRemoveSection(VALID_PLAN, sectionName);
});

Given(/^a plan-validator plan missing the "([^"]+)" subsection$/, function (this: PvWorld, subsection: string) {
  this.pvPlan = pvRemoveSubsection(VALID_PLAN, subsection);
});

Given(/^a plan-validator plan with the "([^"]+)" section emptied$/, function (this: PvWorld, sectionName: string) {
  // Replace the section content with just the heading (empty body)
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionRegex = new RegExp(`(## (?:\\S+\\s+)?${escaped}\\s*\\n)([\\s\\S]*?)(?=\\n## |$)`);
  this.pvPlan = VALID_PLAN.replace(sectionRegex, '$1');
});

Given(/^a plan-validator plan with an extra section appended after File Changes$/, function (this: PvWorld) {
  this.pvPlan = VALID_PLAN + '\n## Extra Section\nSome extra content.\n';
});

Given(/^a plan-validator plan with sections "([^"]+)" and "([^"]+)" swapped$/, function (this: PvWorld, s1: string, s2: string) {
  // Find line numbers for s1 and s2 headings and swap their blocks
  const lines = VALID_PLAN.split('\n');
  const escaped1 = s1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escaped2 = s2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const r1 = new RegExp(`^##\\s+(?:\\S+\\s+)?${escaped1}(?:$|\\s)`);
  const r2 = new RegExp(`^##\\s+(?:\\S+\\s+)?${escaped2}(?:$|\\s)`);
  const i1 = lines.findIndex((l) => r1.test(l));
  const i2 = lines.findIndex((l) => r2.test(l));
  if (i1 === -1 || i2 === -1) { this.pvPlan = VALID_PLAN; return; }
  const e1 = (() => { for (let i = i1 + 1; i < lines.length; i++) if (/^## /.test(lines[i])) return i; return lines.length; })();
  const e2 = (() => { for (let i = i2 + 1; i < lines.length; i++) if (/^## /.test(lines[i])) return i; return lines.length; })();
  // Ensure s1 comes before s2 in the document
  const [ai, ae, bi, be] = i1 < i2 ? [i1, e1, i2, e2] : [i2, e2, i1, e1];
  const block1 = lines.slice(ai, ae);
  const block2 = lines.slice(bi, be);
  const result = [...lines.slice(0, ai), ...block2, ...lines.slice(ae, bi), ...block1, ...lines.slice(be)];
  this.pvPlan = result.join('\n');
});

Given(/^a plan-validator plan with Requirements subsections in wrong order$/, function (this: PvWorld) {
  // Swap Acceptance Criteria before FR
  this.pvPlan = pvRemoveSubsection(
    pvRemoveSubsection(VALID_PLAN, 'Acceptance Criteria (EARS)'),
    'FR (Functional Requirements)',
  ).replace(
    /### NFR/,
    '### Acceptance Criteria (EARS)\n- WHEN test THEN system SHALL respond.\n\n### FR (Functional Requirements)\n- FR-1: test requirement\n\n### NFR',
  );
});

Given(/^a plan-validator plan with a fenced code block containing a File Changes table$/, function (this: PvWorld) {
  // Insert a code block INSIDE the File Changes section (after the heading).
  // validateFileChanges checks sectionLines for lines starting with ``` and errors if found.
  this.pvPlan = VALID_PLAN.replace(
    /^(## (?:📁\s+)?File Changes\n)/m,
    '$1```\n| Path | Action | Reason |\n|------|--------|--------|\n| `foo.ts` | edit | reason |\n```\n',
  );
});

Given(/^a plan-validator plan with Impact Analysis set to "([^"]+)"$/, function (this: PvWorld, content: string) {
  // Replace the Impact Analysis section if present, or append it
  if (VALID_PLAN.includes('## Impact Analysis') || VALID_PLAN.includes('## 💥 Impact Analysis')) {
    this.pvPlan = VALID_PLAN.replace(
      /## (?:💥\s+)?Impact Analysis[\s\S]*?(?=\n## |$)/m,
      `## 💥 Impact Analysis\n${content}\n`,
    );
  } else {
    // Insert before File Changes
    this.pvPlan = VALID_PLAN.replace(
      /\n## (?:📁\s+)?File Changes/,
      `\n## 💥 Impact Analysis\n${content}\n\n## 📁 File Changes`,
    );
  }
});

Given(/^a plan-validator plan with a destructive action in File Changes without Impact Analysis$/, function (this: PvWorld) {
  // Replace the File Changes table to add a 'delete' action
  this.pvPlan = pvBuildPlanWithFileChanges(
    VALID_PLAN,
    '| `old-file.ts` | delete | Remove legacy module |\n| `new-file.ts` | create | Add new module |',
  );
});

Given(/^a plan-validator plan with File Changes containing "([^"]+)"$/, function (this: PvWorld, rows: string) {
  this.pvPlan = pvBuildPlanWithFileChanges(VALID_PLAN, rows);
});

Given(/^a plan-validator plan with the Todos section empty$/, function (this: PvWorld) {
  const lines = VALID_PLAN.split('\n');
  const startIdx = lines.findIndex((l) => /^##\s+(?:📋\s+)?Todos\s*$/.test(l));
  if (startIdx === -1) { this.pvPlan = VALID_PLAN; return; }
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) { endIdx = i; break; }
  }
  // Keep only the heading
  lines.splice(startIdx + 1, endIdx - startIdx - 1);
  this.pvPlan = lines.join('\n');
});

Given(/^a plan-validator plan with blockquotes removed from Todos$/, function (this: PvWorld) {
  this.pvPlan = VALID_PLAN.split('\n').filter((l) => !l.startsWith('>')).join('\n');
});

Given(/^a plan-validator plan with "([^"]+)" removed from Todos$/, function (this: PvWorld, field: string) {
  // Remove lines from Todos section that contain the field marker
  const lines = VALID_PLAN.split('\n');
  const todoStart = lines.findIndex((l) => /^##\s+(?:📋\s+)?Todos\s*$/.test(l));
  const fileChangesStart = lines.findIndex((l) => /^##\s+(?:📁\s+)?File Changes/.test(l));
  const end = fileChangesStart !== -1 ? fileChangesStart : lines.length;
  const fieldLower = field.toLowerCase();
  const filtered = lines.map((l, idx) => {
    if (idx > todoStart && idx < end && l.toLowerCase().includes(fieldLower + ':')) return null;
    return l;
  }).filter((l) => l !== null) as string[];
  this.pvPlan = filtered.join('\n');
});

Given(/^a plan-validator plan without a "([^"]+)" subsection under Definition of Done$/, function (this: PvWorld, subsection: string) {
  this.pvPlan = pvRemoveSubsection(VALID_PLAN, subsection);
});

Given(/^a plan-validator plan with Verification Plan having no backtick command$/, function (this: PvWorld) {
  // Remove lines with backtick-wrapped commands in Verification Plan
  const lines = VALID_PLAN.split('\n');
  const vpIdx = lines.findIndex((l) => l.includes('Verification Plan'));
  if (vpIdx === -1) { this.pvPlan = VALID_PLAN; return; }
  let vpEnd = lines.length;
  for (let i = vpIdx + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) { vpEnd = i; break; }
  }
  const result = lines.map((l, idx) => {
    if (idx > vpIdx && idx < vpEnd && /`[^`]+`/.test(l)) return l.replace(/`[^`]+`/g, 'test command');
    return l;
  });
  this.pvPlan = result.join('\n');
});

Given(/^a plan-validator plan with Context section missing$/, function (this: PvWorld) {
  this.pvPlan = pvRemoveSection(VALID_PLAN, 'Context');
});

Given(/^a plan-validator plan with Context placed after User Stories$/, function (this: PvWorld) {
  this.pvPlan = pvRemoveSection(VALID_PLAN, 'Context');
  const insertAfter = /## 👤 User Stories/;
  this.pvPlan = this.pvPlan.replace(
    insertAfter,
    '## 👤 User Stories\n- As a test, I want to test.\n\n## 🎯 Context\nContext moved after User Stories.\n\n### Extracted Requirements\n1. Requirement one\n2. Requirement two\n',
  );
});

Given(/^a plan-validator plan with Extracted Requirements having 1 item only$/, function (this: PvWorld) {
  this.pvPlan = VALID_PLAN.replace(
    /### Extracted Requirements\n1\.[^\n]*\n2\.[^\n]*/,
    '### Extracted Requirements\n1. Only one item here',
  );
});

Given(/^a plan-validator plan with the Extracted Requirements subsection missing$/, function (this: PvWorld) {
  this.pvPlan = pvRemoveSubsection(VALID_PLAN, 'Extracted Requirements');
});

Given(/^a plan-validator plan with the NFR Performance category removed$/, function (this: PvWorld) {
  this.pvPlan = VALID_PLAN.split('\n').filter((l) => !l.toLowerCase().startsWith('- performance')).join('\n');
});

Given(/^a plan-validator plan with all required sections present and in correct order$/, function (this: PvWorld) {
  this.pvPlan = VALID_PLAN;
});

// Prompt-capture / plan-gate steps

Given(/^the plan-validator uses session_id "([^"]+)" and prompt "([^"]*)"$/, function (this: PvWorld, sessionId: string, promptText: string) {
  this.pvSessionId = sessionId;
  this.pvPromptText = promptText;
});

// resolvePlanFile steps

Given(/^a plan-validator file path pointing to an existing file$/, function (this: PvWorld) {
  const p = path.join(this.tempDir, 'existing-plan.md');
  fs.writeFileSync(p, VALID_PLAN, 'utf-8');
  this.pvResolvePlanResult = resolvePlanFile({ planFilePath: p });
});

Given(/^a plan-validator file path that is missing from tool_input$/, function (this: PvWorld) {
  this.pvResolvePlanResult = resolvePlanFile({});
});

Given(/^a plan-validator file path pointing to a non-existent file$/, function (this: PvWorld) {
  this.pvResolvePlanResult = resolvePlanFile({ planFilePath: path.join(this.tempDir, 'no-such-plan.md') });
});

// readTemplateContent steps

Given(/^a plan-validator cwd with a template\.md present$/, function (this: PvWorld) {
  // Copy the real template.md into tempDir
  const src = path.join(REPO_ROOT, 'tools', 'plan-pomogator', 'template.md');
  const destDir = path.join(this.tempDir, 'tools', 'plan-pomogator');
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, path.join(destDir, 'template.md'));
  this.pvTemplateResult = readTemplateContent(this.tempDir);
});

Given(/^a plan-validator cwd without a template\.md$/, function (this: PvWorld) {
  this.pvTemplateResult = readTemplateContent(this.tempDir);
});

Given(/^a plan-validator cwd that is undefined$/, function (this: PvWorld) {
  this.pvTemplateResult = readTemplateContent(undefined);
});

// checkDuplicatePlan steps

Given(/^a plan-validator duplicate plan in the same directory$/, function (this: PvWorld) {
  const content = '# Duplicate Plan\n## Content\nSome content.';
  const planA = path.join(this.tempDir, 'plan-a.md');
  const planB = path.join(this.tempDir, 'plan-b.md');
  fs.writeFileSync(planA, content, 'utf-8');
  fs.writeFileSync(planB, content, 'utf-8');
  this.pvDupResult = checkDuplicatePlan(planA, content);
});

Given(/^a plan-validator unique plan in the directory$/, function (this: PvWorld) {
  const contentA = '# Plan A\n## Content\nUnique content A.';
  const contentB = '# Plan B\n## Content\nUnique content B.';
  const planA = path.join(this.tempDir, 'plan-a.md');
  const planB = path.join(this.tempDir, 'plan-b.md');
  fs.writeFileSync(planA, contentA, 'utf-8');
  fs.writeFileSync(planB, contentB, 'utf-8');
  this.pvDupResult = checkDuplicatePlan(planA, contentA);
});

// scorePromptRelevance / selectRelevanceWindow steps

Given(/^a plan-validator relevance score for mismatched plan and prompts$/, function (this: PvWorld) {
  const plan = VALID_PLAN; // real plan about validator
  const prompts = ['поговорим о котиках и природе', 'расскажи анекдот', 'какая погода в Москве'];
  this.pvScore = scorePromptRelevance(plan, prompts);
});

Given(/^a plan-validator relevance score for matched plan and prompts$/, function (this: PvWorld) {
  const plan = VALID_PLAN; // real plan about validation
  const prompts = [
    'сделай валидатор для планов разработки со всеми секциями',
    'нужна валидация структуры планов с actionable hints',
    'добавь проверку Requirements секции и Todos',
  ];
  this.pvScore = scorePromptRelevance(plan, prompts);
});

Given(/^a plan-validator relevance score for a plan with a pasted large block and matched prompts$/, function (this: PvWorld) {
  const plan = VALID_PLAN;
  // Huge pasted transcript that floods generic plan vocabulary (damped by freq > FLOOD=10)
  const bigPaste = Array(50).fill('контекст проекта validate-plan validator секции план').join(' ');
  // Short prompt covers the plan's key Extracted Requirements terms (undamped, freq=1)
  // so precision stays high despite the flood damping on repeated words
  const prompts = [bigPaste, 'нужен валидатор который проверяет наличие обязательных секций и выдаёт actionable hints при ошибках'];
  this.pvScore = scorePromptRelevance(plan, prompts);
});

Given(/^a plan-validator relevance score for a contaminated plan with matched prompts$/, function (this: PvWorld) {
  // A plan ABOUT a different topic (TypeScript migration) but prompts are about validator
  const contaminated = VALID_PLAN.replace(
    /### Extracted Requirements\n1\.[^\n]*\n2\.[^\n]*/,
    '### Extracted Requirements\n1. Migrate entire codebase to TypeScript\n2. Remove all JavaScript files from project',
  );
  const bigPaste = Array(50).fill('контекст проекта validate-plan validator').join(' ');
  const prompts = [bigPaste, 'нужен валидатор структуры планов'];
  this.pvScore = scorePromptRelevance(contaminated, prompts);
});

Given(/^a plan-validator window selection for a list of prompts with short tail$/, function (this: PvWorld) {
  const prompts = [
    'сделай полный рефакторинг системы валидации планов включая migrate, update, restructure, и так далее много слов',
    'да',
    '1 и 2',
  ];
  this.pvWindow = selectRelevanceWindow(prompts);
});

Given(/^a plan-validator window selection preserving chronological order$/, function (this: PvWorld) {
  const prompts = [
    'первый промпт о валидации',
    'второй промпт о секциях',
    'третий промпт о формате',
  ];
  this.pvWindow = selectRelevanceWindow(prompts);
});

// formatPromptsFromFile / loadUserPrompts steps

Given(/^a plan-validator prompt file with mixed real and task-notification entries$/, function (this: PvWorld) {
  const filePath = path.join(this.tempDir, '.plan-prompts-test-session.json');
  const data = {
    sessionId: 'test-session',
    prompts: [
      { ts: Date.now() - 2000, text: 'реальный пользовательский промпт' },
      { ts: Date.now() - 1000, text: '<task-notification type="background_task_completed">Background task done</task-notification>' },
      { ts: Date.now(), text: 'ещё один реальный промпт' },
    ],
  };
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
  this.pvFormatResult = formatPromptsFromFile(filePath);
});

Given(/^a plan-validator prompt file with only task-notification entries$/, function (this: PvWorld) {
  const filePath = path.join(this.tempDir, '.plan-prompts-only-notifications.json');
  const data = {
    sessionId: 'notif-only',
    prompts: [
      { ts: Date.now(), text: '<task-notification type="t">done</task-notification>' },
    ],
  };
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
  this.pvFormatResult = formatPromptsFromFile(filePath);
});

// Changes: field validation steps

Given(/^a plan-validator plan with changes: bullets that are too short$/, function (this: PvWorld) {
  // Find and shorten the changes: sub-bullets in Todos
  this.pvPlan = VALID_PLAN.replace(/- \*\*changes:\*\*\n([^\n]+)/, '- **changes:**\n  - Fix it');
});

Given(/^a plan-validator plan with changes: bullets containing a generic phrase$/, function (this: PvWorld) {
  this.pvPlan = VALID_PLAN.replace(
    /- \*\*changes:\*\*\n([^\n]+)/,
    '- **changes:**\n  - Update logic and fix the existing code to implement feature correctly',
  );
});

Given(/^a plan-validator plan with Implementation Plan steps that are too short$/, function (this: PvWorld) {
  // Anchor to Implementation Plan heading so we replace the first impl step,
  // not the "1." item in Extracted Requirements which appears earlier in the file.
  this.pvPlan = VALID_PLAN.replace(/^(## 🔧 Implementation Plan\n)1\. .+$/m, '$11. Short step');
});

Given(/^a plan-validator plan with File Changes Reason that is too short$/, function (this: PvWorld) {
  // Match a data row (backtick-wrapped path) and replace only its Reason column.
  // The previous regex /\| (.+) \| (.+) \| (.{5,}) \|/m matched the header row first
  // ("Reason" is 6 chars ≥ 5), corrupting the header and causing a Phase 1 error before
  // Phase 4 could run.
  this.pvPlan = VALID_PLAN.replace(/(\|\s*`[^`]+`\s*\|[^|]+\|)\s*[^|]+\|/, '$1 Fix |');
});

Given(/^a plan-validator plan with no changes: field in Todos$/, function (this: PvWorld) {
  this.pvPlan = pvRemoveSubsection(VALID_PLAN, 'changes:');
  // Alternative: just remove the changes: line
  this.pvPlan = VALID_PLAN.split('\n').filter((l) => !l.trim().startsWith('- **changes:**')).join('\n');
});

Given(/^a plan-validator plan with a proper changes: field in Todos$/, function (this: PvWorld) {
  this.pvPlan = VALID_PLAN; // valid fixture already has changes: with proper content
});

// Evidence enforcement steps

Given(/^a plan-validator plan without an Источники section$/, function (this: PvWorld) {
  // Remove the Источники section from Implementation Plan
  const lines = VALID_PLAN.split('\n');
  const idx = lines.findIndex((l) => /Источники/.test(l));
  if (idx === -1) { this.pvPlan = VALID_PLAN; return; }
  let end = lines.length;
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^#{2,3}\s+/.test(lines[i])) { end = i; break; }
  }
  lines.splice(idx, end - idx);
  this.pvPlan = lines.join('\n');
});

Given(/^a plan-validator plan with an Источники section but no proof markers$/, function (this: PvWorld) {
  // The valid fixture has TWO lines under Источники, both with [ref:] markers.
  // Using `.+` only replaced the first line, leaving the second [ref:] intact —
  // so validateEvidence still found proof and emitted no warning. Splice all content.
  const lines = VALID_PLAN.split('\n');
  const idx = lines.findIndex((l) => /### 🔎 Источники/.test(l));
  if (idx !== -1) {
    let end = lines.length;
    for (let i = idx + 1; i < lines.length; i++) {
      if (/^#{2,3}\s+/.test(lines[i])) { end = i; break; }
    }
    lines.splice(idx + 1, end - (idx + 1), '- Нет пруфов, просто текст без ссылок');
  }
  this.pvPlan = lines.join('\n');
});

Given(/^a plan-validator plan with a claim in Implementation Plan without a proof marker$/, function (this: PvWorld) {
  // Add a claim bullet to Implementation Plan without [src:] marker
  this.pvPlan = VALID_PLAN.replace(
    /^(## 🔧 Implementation Plan\n)/m,
    '$1- Библиотека X поддерживает метод Y по умолчанию.\n',
  );
});

Given(/^a plan-validator plan with a claim in Implementation Plan with a proof marker$/, function (this: PvWorld) {
  this.pvPlan = VALID_PLAN.replace(
    /^(## 🔧 Implementation Plan\n)/m,
    '$1- Библиотека X поддерживает метод Y по умолчанию [src:https://example.com/docs].\n',
  );
});

// Spec-Test Sync steps (PLUGIN015)

Given(/^a plan-validator plan with tests in File Changes but no specs$/, function (this: PvWorld) {
  this.pvPlan = pvBuildPlanWithFileChanges(
    VALID_PLAN,
    '| `tests/e2e/my-feature.test.ts` | create | Add e2e tests |\n| `src/my-feature.ts` | create | Implement feature |',
  );
});

Given(/^a plan-validator plan with both tests and specs in File Changes$/, function (this: PvWorld) {
  this.pvPlan = pvBuildPlanWithFileChanges(
    VALID_PLAN,
    '| `tests/e2e/my-feature.test.ts` | create | Add e2e tests |\n| `.specs/my-feature/my-feature.feature` | edit | Update BDD scenarios |\n| `src/my-feature.ts` | create | Implement feature |',
  );
});

Given(/^a plan-validator plan with no test files in File Changes$/, function (this: PvWorld) {
  this.pvPlan = pvBuildPlanWithFileChanges(
    VALID_PLAN,
    '| `src/my-feature.ts` | create | Implement feature |',
  );
});

Given(/^a plan-validator plan with a bugfix Reason but no BDD feature file$/, function (this: PvWorld) {
  this.pvPlan = pvBuildPlanWithFileChanges(
    VALID_PLAN,
    '| `src/auth.ts` | edit | fix: correct login validation bug |',
  );
});

Given(/^a plan-validator plan with a bugfix Reason and a BDD feature file$/, function (this: PvWorld) {
  this.pvPlan = pvBuildPlanWithFileChanges(
    VALID_PLAN,
    '| `src/auth.ts` | edit | fix: correct login validation bug |\n| `tests/features/auth.feature` | edit | Add regression scenario |',
  );
});

// ---------------------------------------------------------------------------
// WHEN — actions
// ---------------------------------------------------------------------------

When(/^the plan-validator runs flat validation$/, function (this: PvWorld) {
  const planPath = pvWritePlan(this);
  this.pvErrors = validatePlan(planPath);
});

When(/^the plan-validator runs phased validation$/, function (this: PvWorld) {
  const planPath = pvWritePlan(this);
  this.pvPhased = validatePlanPhased(planPath);
});

When(/^the plan-validator runs prompt-capture$/, function (this: PvWorld) {
  const input = JSON.stringify({
    session_id: this.pvSessionId ?? '',
    prompt: this.pvPromptText ?? '',
    cwd: this.tempDir,
  });
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', CAPTURE_SCRIPT],
    {
      input,
      encoding: 'utf-8',
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        HOME: this.tempDir,
        USERPROFILE: this.tempDir,
      },
      timeout: 30_000,
    },
  );
  this.pvCaptureResult = {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
});

When(/^the plan-validator runs via CLI on the plan file$/, function (this: PvWorld) {
  const planPath = pvWritePlan(this);
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', VALIDATE_PLAN_SCRIPT, planPath],
    { encoding: 'utf-8', cwd: REPO_ROOT, timeout: 30_000 },
  );
  this.pvCaptureResult = {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
});

// ---------------------------------------------------------------------------
// THEN — assertions
// ---------------------------------------------------------------------------

// Flat validation

Then(/^the plan-validator flat validation returns no errors$/, function (this: PvWorld) {
  assert.deepEqual(this.pvErrors, [], `Expected no errors, got: ${JSON.stringify(this.pvErrors)}`);
});

Then(/^the plan-validator flat validation returns at least one error$/, function (this: PvWorld) {
  assert.ok(this.pvErrors.length > 0, 'Expected at least one error');
});

Then(/^the plan-validator flat validation returns an error containing "([^"]+)"$/, function (this: PvWorld, text: string) {
  const found = this.pvErrors.some((e) => e.message.includes(text));
  assert.ok(found, `Expected error containing "${text}", got: ${JSON.stringify(this.pvErrors.map((e) => e.message))}`);
});

Then(/^the plan-validator flat validation error for "([^"]+)" has hint containing "([^"]+)"$/, function (this: PvWorld, msgPart: string, hintPart: string) {
  const match = this.pvErrors.find((e) => e.message.includes(msgPart));
  assert.ok(match, `No error with message containing "${msgPart}"`);
  assert.ok(match.hint.includes(hintPart), `Hint "${match.hint}" does not contain "${hintPart}"`);
});

Then(/^every plan-validator flat validation error has a non-empty hint$/, function (this: PvWorld) {
  for (const e of this.pvErrors) {
    assert.ok(e.hint && e.hint.trim().length > 0, `Error has empty hint: ${JSON.stringify(e)}`);
  }
});

// Phased validation

Then(/^the plan-validator phase ([1-4]) has no errors$/, function (this: PvWorld, phase: string) {
  assert.ok(this.pvPhased, 'pvPhased is null — run phased validation first');
  const key = `phase${phase}` as keyof typeof this.pvPhased;
  const errors = this.pvPhased![key];
  assert.deepEqual(errors, [], `Expected phase${phase} to be empty, got: ${JSON.stringify(errors)}`);
});

Then(/^the plan-validator phase ([1-4]) has at least one error$/, function (this: PvWorld, phase: string) {
  assert.ok(this.pvPhased, 'pvPhased is null');
  const key = `phase${phase}` as keyof typeof this.pvPhased;
  const errors = this.pvPhased![key];
  assert.ok(errors.length > 0, `Expected phase${phase} to have errors but it was empty`);
});

Then(/^the plan-validator phase ([1-4]) has an error containing "([^"]+)"$/, function (this: PvWorld, phase: string, text: string) {
  assert.ok(this.pvPhased, 'pvPhased is null');
  const key = `phase${phase}` as keyof typeof this.pvPhased;
  const errors = this.pvPhased![key];
  const found = errors.some((e) => e.message.includes(text));
  assert.ok(found, `Expected phase${phase} error containing "${text}", got: ${JSON.stringify(errors.map((e) => e.message))}`);
});

Then(/^the plan-validator phase ([1-4]) has an error containing "([^"]+)" with hint containing "([^"]+)"$/, function (this: PvWorld, phase: string, msgPart: string, hintPart: string) {
  assert.ok(this.pvPhased, 'pvPhased is null');
  const key = `phase${phase}` as keyof typeof this.pvPhased;
  const errors = this.pvPhased![key];
  const match = errors.find((e) => e.message.includes(msgPart));
  assert.ok(match, `No phase${phase} error with message containing "${msgPart}"; got: ${JSON.stringify(errors.map((e) => e.message))}`);
  assert.ok(match.hint.includes(hintPart), `Hint "${match.hint}" does not contain "${hintPart}"`);
});

Then(/^the plan-validator phase 4 has a warning containing "([^"]+)"$/, function (this: PvWorld, text: string) {
  assert.ok(this.pvPhased, 'pvPhased is null');
  const found = this.pvPhased!.phase4.some((e) => e.message.includes(text));
  assert.ok(found, `Expected phase4 warning containing "${text}", got: ${JSON.stringify(this.pvPhased!.phase4.map((e) => e.message))}`);
});

// Prompt-capture assertions

Then(/^the plan-validator prompt-capture exits with code 0$/, function (this: PvWorld) {
  assert.ok(this.pvCaptureResult, 'No capture result — run prompt-capture first');
  assert.strictEqual(
    this.pvCaptureResult!.status,
    0,
    `prompt-capture exited with ${this.pvCaptureResult!.status}; stderr: ${this.pvCaptureResult!.stderr}`,
  );
});

Then(/^the plan-validator session file for "([^"]+)" exists with at least one prompt entry$/, function (this: PvWorld, sessionId: string) {
  const promptsDir = path.join(this.tempDir, '.dev-pomogator');
  const fileName = `${PROMPT_FILE_PREFIX}${sessionId}.json`;
  const filePath = path.join(promptsDir, fileName);
  assert.ok(fs.existsSync(filePath), `Session file not found at ${filePath}`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  assert.ok(
    Array.isArray(data.prompts) && data.prompts.length > 0,
    `Session file has no prompts: ${JSON.stringify(data)}`,
  );
});

Then(/^no plan-validator session files exist in the temp home$/, function (this: PvWorld) {
  const promptsDir = path.join(this.tempDir, '.dev-pomogator');
  if (!fs.existsSync(promptsDir)) return; // nothing written — ✓
  const files = fs.readdirSync(promptsDir).filter((f) => f.startsWith(PROMPT_FILE_PREFIX));
  assert.deepEqual(files, [], `Expected no session files, found: ${files.join(', ')}`);
});

Then(/^the plan-validator prompt-capture output contains no task-notification entries$/, function (this: PvWorld) {
  // Verify the session file has no task-notification entries
  const promptsDir = path.join(this.tempDir, '.dev-pomogator');
  if (!fs.existsSync(promptsDir)) return;
  for (const f of fs.readdirSync(promptsDir).filter((n) => n.startsWith(PROMPT_FILE_PREFIX))) {
    const data = JSON.parse(fs.readFileSync(path.join(promptsDir, f), 'utf-8'));
    for (const p of data.prompts ?? []) {
      assert.ok(
        !/^<task-notification\b/i.test(p.text),
        `Task notification leaked into session file: ${p.text}`,
      );
    }
  }
});

Then(/^loadUserPrompts returns empty for an unknown session in the plan-validator$/, function (this: PvWorld) {
  // Mutate HOME to tempDir (empty dir), then call loadUserPrompts
  const oldHome = process.env.HOME;
  const oldUserProfile = process.env.USERPROFILE;
  process.env.HOME = this.tempDir;
  process.env.USERPROFILE = this.tempDir;
  try {
    this.pvLoadResult = loadUserPrompts('unknown-session-xyz');
  } finally {
    process.env.HOME = oldHome;
    process.env.USERPROFILE = oldUserProfile;
  }
  assert.strictEqual(this.pvLoadResult, '', `Expected empty string, got: "${this.pvLoadResult}"`);
});

Then(/^formatPromptsFromFile filters out task-notification entries for the plan-validator$/, function (this: PvWorld) {
  // pvFormatResult should not be null and should not contain the task-notification text
  assert.ok(this.pvFormatResult !== null, 'Expected non-null result');
  assert.ok(
    !this.pvFormatResult!.includes('<task-notification'),
    `Task notification leaked into formatted output: ${this.pvFormatResult}`,
  );
  assert.ok(
    this.pvFormatResult!.includes('реальный'),
    `Real prompts not included in formatted output: ${this.pvFormatResult}`,
  );
});

Then(/^formatPromptsFromFile returns null for a plan-validator file with only notifications$/, function (this: PvWorld) {
  assert.strictEqual(this.pvFormatResult, null);
});

// readTemplateContent assertions

Then(/^the plan-validator template result contains "([^"]+)"$/, function (this: PvWorld, text: string) {
  assert.ok(
    this.pvTemplateResult.includes(text),
    `Template result does not contain "${text}": ${this.pvTemplateResult.substring(0, 200)}`,
  );
});

Then(/^the plan-validator template result is empty$/, function (this: PvWorld) {
  assert.strictEqual(this.pvTemplateResult, '');
});

// resolvePlanFile assertions

Then(/^the plan-validator resolve result is a non-null string$/, function (this: PvWorld) {
  assert.ok(typeof this.pvResolvePlanResult === 'string', `Expected string, got: ${this.pvResolvePlanResult}`);
});

Then(/^the plan-validator resolve result is null$/, function (this: PvWorld) {
  assert.strictEqual(this.pvResolvePlanResult, null);
});

// checkDuplicatePlan assertions

Then(/^the plan-validator duplicate check finds a match$/, function (this: PvWorld) {
  assert.ok(this.pvDupResult !== null, 'Expected duplicate to be found');
});

Then(/^the plan-validator duplicate check finds no match$/, function (this: PvWorld) {
  assert.strictEqual(this.pvDupResult, null);
});

// scorePromptRelevance assertions

Then(/^the plan-validator relevance score is at most -20$/, function (this: PvWorld) {
  assert.ok(this.pvScore !== null, 'score is null');
  assert.ok(this.pvScore! <= -20, `Expected score <= -20, got ${this.pvScore}`);
});

Then(/^the plan-validator relevance score is greater than -20$/, function (this: PvWorld) {
  assert.ok(this.pvScore !== null, 'score is null');
  assert.ok(this.pvScore! > -20, `Expected score > -20, got ${this.pvScore}`);
});

// selectRelevanceWindow assertions

Then(/^the plan-validator window includes the first substantive prompt$/, function (this: PvWorld) {
  assert.ok(this.pvWindow !== null && this.pvWindow!.length > 0, 'window is empty');
  const first = this.pvWindow![0];
  assert.ok(first.length > 10, `First window prompt too short: "${first}"`);
});

Then(/^the plan-validator window is in chronological order$/, function (this: PvWorld) {
  assert.ok(this.pvWindow !== null && this.pvWindow!.length >= 2, 'window too short');
  assert.ok(
    this.pvWindow!.includes('первый промпт о валидации'),
    `Window does not include first prompt: ${JSON.stringify(this.pvWindow)}`,
  );
  const idx1 = this.pvWindow!.indexOf('первый промпт о валидации');
  const idx2 = this.pvWindow!.indexOf('третий промпт о формате');
  assert.ok(idx1 < idx2, 'Chronological order violated');
});

// CLI spawn assertions

Then(/^the plan-validator CLI exits with code 0$/, function (this: PvWorld) {
  assert.ok(this.pvCaptureResult, 'No CLI result');
  assert.strictEqual(this.pvCaptureResult!.status, 0, `CLI exited ${this.pvCaptureResult!.status}; stderr: ${this.pvCaptureResult!.stderr}`);
});

Then(/^the plan-validator CLI exits with a non-zero code$/, function (this: PvWorld) {
  assert.ok(this.pvCaptureResult, 'No CLI result');
  assert.notStrictEqual(this.pvCaptureResult!.status, 0, 'Expected non-zero exit code');
});

// Spec-Test Sync assertions

Then(/^the plan-validator phased validation warns about tests without specs$/, function (this: PvWorld) {
  // The spec-test-sync warning (validateTestSpecSync) is a Phase-4 actionability check, so it only fires
  // through validatePlanPhased — flat validatePlan never runs it. The agent wired these to flat by mistake.
  assert.ok(this.pvPhased, 'run phased validation first');
  const all = [...this.pvPhased!.phase1, ...this.pvPhased!.phase2, ...this.pvPhased!.phase3, ...this.pvPhased!.phase4];
  const found = all.some((e) => e.message.includes('тестовые файлы') && e.message.includes('спецификаций'));
  assert.ok(found, `No spec-test-sync warning. Got: ${JSON.stringify(all.map((e) => e.message))}`);
});

Then(/^the plan-validator phased validation warns about a bugfix without a BDD feature$/, function (this: PvWorld) {
  // validateBugfixBdd is also Phase-4: a bugfix Reason (fix/bug/исправ/…) with no `.feature` in File
  // Changes warns. The agent had reused the spec-test-sync Then here, but this plan has no test files.
  assert.ok(this.pvPhased, 'run phased validation first');
  const all = [...this.pvPhased!.phase1, ...this.pvPhased!.phase2, ...this.pvPhased!.phase3, ...this.pvPhased!.phase4];
  const found = all.some((e) => e.message.includes('Багфикс') && e.message.includes('BDD'));
  assert.ok(found, `No bugfix-BDD warning. Got: ${JSON.stringify(all.map((e) => e.message))}`);
});

Then(/^the plan-validator flat validation has no spec-test-sync warning$/, function (this: PvWorld) {
  const found = this.pvErrors.some((e) => {
    const m = e.message.toLowerCase();
    return (m.includes('тест') || m.includes('test')) && (m.includes('spec') || m.includes('feature'));
  });
  assert.ok(!found, `Unexpected spec-test-sync warning: ${JSON.stringify(this.pvErrors.map((e) => e.message))}`);
});

Then(/^the plan-validator phase 4 warns about tests without specs$/, function (this: PvWorld) {
  assert.ok(this.pvPhased, 'pvPhased is null');
  const found = this.pvPhased!.phase4.some((e) => {
    const m = e.message.toLowerCase();
    return (m.includes('тест') || m.includes('test')) && (m.includes('spec') || m.includes('feature') || m.includes('спек'));
  });
  assert.ok(found, `No spec-test-sync warning in phase4: ${JSON.stringify(this.pvPhased!.phase4.map((e) => e.message))}`);
});

// ---------------------------------------------------------------------------
// GIVEN — destructive action + explicit Impact Analysis (PLUGIN007_49_02)
// ---------------------------------------------------------------------------

Given(/^a plan-validator plan with a destructive action and Impact Analysis set to "([^"]+)"$/, function (this: PvWorld, content: string) {
  // pvBuildPlanWithFileChanges installs a 'delete' row in File Changes.
  // The valid fixture has '## 💥 Impact Analysis' which /^##\s+Impact Analysis\b/
  // cannot match (emoji is not \s), so validateImpactAnalysis would see "missing".
  // We remove the emoji-prefixed heading and insert a plain '## Impact Analysis'
  // so the validator finds it and tests the N/A content instead.
  let plan = pvBuildPlanWithFileChanges(
    VALID_PLAN,
    '| `old-file.ts` | delete | Remove legacy module |',
  );
  plan = plan.replace(/\n## 💥 Impact Analysis[\s\S]*?(?=\n## )/, '\n');
  plan = plan.replace(
    /\n## (?:📁\s+)?File Changes/,
    `\n## Impact Analysis\n${content}\n\n## 📁 File Changes`,
  );
  this.pvPlan = plan;
});

// ---------------------------------------------------------------------------
// WHEN — read artifact files into pvRuleContent (PLUGIN007_36, _42, PLUGIN015_09)
// ---------------------------------------------------------------------------

When(/^the plan-validator checks the proactive-investigation rule$/, function (this: PvWorld) {
  const rulePath = path.join(REPO_ROOT, '.claude', 'rules', 'plan-pomogator', 'proactive-investigation.md');
  this.pvRuleContent = fs.readFileSync(rulePath, 'utf-8');
});

When(/^the plan-validator checks the spec-test-sync rule$/, function (this: PvWorld) {
  const rulePath = path.join(REPO_ROOT, '.claude', 'rules', 'plan-pomogator', 'spec-test-sync.md');
  this.pvRuleContent = fs.readFileSync(rulePath, 'utf-8');
});

When(/^the plan-validator checks the plugin hook registry$/, function (this: PvWorld) {
  const hooksPath = path.join(REPO_ROOT, '.claude-plugin', 'hooks.json');
  this.pvRuleContent = fs.readFileSync(hooksPath, 'utf-8');
});

// ---------------------------------------------------------------------------
// THEN — artifact assertions (PLUGIN007_36, _42, PLUGIN015_09)
// ---------------------------------------------------------------------------

Then(/^the plan-validator rule is non-empty and under (\d+) lines$/, function (this: PvWorld, maxLines: string) {
  const content = this.pvRuleContent;
  assert.ok(content && content.length > 0, 'Rule file is empty');
  const lineCount = content!.split('\n').length;
  assert.ok(
    lineCount < parseInt(maxLines, 10),
    `Rule has ${lineCount} lines, expected < ${maxLines}`,
  );
});

Then(/^the plan-validator rule contains "([^"]+)"$/, function (this: PvWorld, text: string) {
  const content = this.pvRuleContent;
  assert.ok(
    content && content.includes(text),
    `Rule does not contain "${text}". First 200 chars: ${content?.substring(0, 200) ?? '(null)'}`,
  );
});

Then(/^the plan-validator rule contains banned phrases and evidence format$/, function (this: PvWorld) {
  const content = this.pvRuleContent ?? '';
  // Rule must list ЗАПРЕЩЕНО, a concrete banned phrase (Посмотреть?),
  // an Evidence format section, and the [UNVERIFIED] marker.
  assert.ok(content.includes('ЗАПРЕЩЕНО'), 'Rule missing ЗАПРЕЩЕНО section');
  assert.ok(content.includes('Посмотреть?'), 'Rule missing "Посмотреть?" banned phrase');
  assert.ok(content.includes('Evidence'), 'Rule missing Evidence section');
  assert.ok(content.includes('UNVERIFIED'), 'Rule missing [UNVERIFIED] marker');
});

Then(/^the plan-validator plugin registry has a plan-gate PreToolUse hook$/, function (this: PvWorld) {
  // Drives the REAL .claude-plugin/hooks.json via pvRuleContent set in the When step.
  const content = this.pvRuleContent ?? '';
  const parsed = JSON.parse(content) as {
    hooks: Record<string, Array<{ matcher: string; hooks: Array<{ command: string }> }>>;
  };
  const preToolUse = parsed.hooks?.PreToolUse ?? [];
  const hasPlanGate = preToolUse.some(
    (entry) =>
      Array.isArray(entry.hooks) &&
      entry.hooks.some(
        (h) => typeof h.command === 'string' && h.command.includes('plan-gate.ts'),
      ),
  );
  assert.ok(
    hasPlanGate,
    `No plan-gate.ts PreToolUse hook found in hooks.json. ` +
      `PreToolUse matchers: ${JSON.stringify(preToolUse.map((e) => e.matcher))}`,
  );
});

Then(/^the plan-validator spec-test-sync rule contains key terms$/, function (this: PvWorld) {
  // Drives the REAL spec-test-sync.md rule file (artifact scenario).
  const content = this.pvRuleContent ?? '';
  assert.ok(content.includes('File Changes'), 'spec-test-sync rule missing "File Changes"');
  assert.ok(content.toLowerCase().includes('tests'), 'spec-test-sync rule missing "tests"');
  assert.ok(
    content.includes('Bugfix') || content.includes('bugfix') || content.includes('баг') || content.includes('fix'),
    'spec-test-sync rule missing bugfix term',
  );
});
