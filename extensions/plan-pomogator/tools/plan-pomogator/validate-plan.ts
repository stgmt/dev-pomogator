#!/usr/bin/env npx tsx
import fs from 'fs';
import path from 'path';

export interface ValidationError {
  line: number;
  message: string;
  hint: string;
}

export interface ValidationResult {
  phase1: ValidationError[];
  phase2: ValidationError[];
  phase3: ValidationError[];
  phase4: ValidationError[];
}

// Emoji prefixes are optional in section headings (e.g. "## 🎯 Context" or "## Context")
// Emoji prefixes match concrete emojis from template.md (source of truth)
export const REQUIRED_SECTIONS: Array<{ name: string; regex: RegExp }> = [
  { name: 'Простыми словами', regex: /^##\s+(?:💬\s+)?Простыми словами\s*$/ },
  { name: 'Context', regex: /^##\s+(?:🎯\s+)?Context\s*$/ },
  { name: 'User Stories', regex: /^##\s+(?:👤\s+)?User Stories\s*$/ },
  { name: 'Use Cases', regex: /^##\s+(?:🔀\s+)?Use Cases\s*$/ },
  { name: 'Requirements', regex: /^##\s+(?:📐\s+)?Requirements\s*$/ },
  { name: 'Implementation Plan', regex: /^##\s+(?:🔧\s+)?Implementation Plan\s*$/ },
  { name: 'Todos', regex: /^##\s+(?:📋\s+)?Todos\s*$/ },
  { name: 'Definition of Done', regex: /^##\s+(?:✅\s+)?Definition of Done\b.*$/ },
  { name: 'File Changes', regex: /^##\s+(?:📁\s+)?File Changes\b.*$/ },
];

const SECTION_ORDER_HINT = 'Порядок: ' + REQUIRED_SECTIONS.map((s) => s.name).join(' → ');

const DESTRUCTIVE_ACTIONS = new Set(['delete', 'rename', 'move', 'replace']);

const REQUIRED_REQUIREMENTS_SUBSECTIONS: Array<{ name: string; regex: RegExp; heading: string }> = [
  { name: 'FR', regex: /^###\s+FR\s+\(Functional Requirements\)\s*$/, heading: '### FR (Functional Requirements)' },
  { name: 'Acceptance Criteria', regex: /^###\s+Acceptance Criteria\s+\(EARS\)\s*$/, heading: '### Acceptance Criteria (EARS)' },
  { name: 'NFR', regex: /^###\s+NFR\s+\(Non-Functional Requirements\)\s*$/, heading: '### NFR (Non-Functional Requirements)' },
  { name: 'Assumptions', regex: /^###\s+Assumptions\s*$/, heading: '### Assumptions' },
];

const SUBSECTION_ORDER_HINT = 'Порядок: ' + REQUIRED_REQUIREMENTS_SUBSECTIONS.map((s) => s.name).join(' → ');

const NFR_CATEGORIES = ['Performance', 'Security', 'Reliability', 'Usability'];
const ALLOWED_ACTIONS = new Set(['create', 'edit', 'delete', 'rename', 'move', 'replace']);

function readFileLines(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.split(/\r?\n/);
}

function addError(errors: ValidationError[], lineIndex: number, message: string, hint: string): void {
  errors.push({ line: Math.max(1, lineIndex + 1), message, hint });
}

export function findHeadingIndex(lines: string[], regex: RegExp): number {
  return lines.findIndex((line) => regex.test(line.trim()));
}

function nextHeadingIndex(lines: string[], startIndex: number, regex: RegExp): number {
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    if (regex.test(lines[i].trim())) {
      return i;
    }
  }
  return lines.length;
}

function getSectionRange(lines: string[], startIndex: number): { start: number; end: number } {
  const endIndex = nextHeadingIndex(lines, startIndex, /^##\s+/);
  return { start: startIndex, end: endIndex };
}

function validateSections(lines: string[], errors: ValidationError[]): Map<string, number> {
  const indices = new Map<string, number>();
  let lastIndex = -1;

  for (const section of REQUIRED_SECTIONS) {
    const index = findHeadingIndex(lines, section.regex);
    if (index === -1) {
      addError(errors, 0, `Отсутствует секция: ${section.name}`, `Добавь: ## ${section.name}`);
      continue;
    }
    indices.set(section.name, index);
    if (index < lastIndex) {
      addError(errors, index, `Секция "${section.name}" находится не в требуемом порядке`, SECTION_ORDER_HINT);
    }
    lastIndex = Math.max(lastIndex, index);
  }

  const fileChangesIndex = indices.get('File Changes');
  if (fileChangesIndex !== undefined) {
    const nextAfterFileChanges = nextHeadingIndex(lines, fileChangesIndex, /^##\s+/);
    if (nextAfterFileChanges < lines.length) {
      addError(errors, fileChangesIndex, 'Секция File Changes должна быть последней', 'Перенеси ## File Changes в конец документа');
    }
  }

  return indices;
}

function validateRequirements(lines: string[], indices: Map<string, number>, errors: ValidationError[]): void {
  const requirementsIndex = indices.get('Requirements');
  if (requirementsIndex === undefined) {
    return;
  }

  const { start, end } = getSectionRange(lines, requirementsIndex);
  const sectionLines = lines.slice(start, end);

  const subsectionIndices: number[] = [];
  for (const subsection of REQUIRED_REQUIREMENTS_SUBSECTIONS) {
    const idx = sectionLines.findIndex((line) => subsection.regex.test(line.trim()));
    if (idx === -1) {
      addError(errors, start, `В Requirements отсутствует подраздел: ${subsection.name}`, `Добавь: ${subsection.heading}`);
    } else {
      subsectionIndices.push(start + idx);
    }
  }

  // Проверка порядка подразделов, если все найдены
  if (subsectionIndices.length === REQUIRED_REQUIREMENTS_SUBSECTIONS.length) {
    for (let i = 1; i < subsectionIndices.length; i += 1) {
      if (subsectionIndices[i] < subsectionIndices[i - 1]) {
        addError(errors, subsectionIndices[i], 'Нарушен порядок подразделов в Requirements', SUBSECTION_ORDER_HINT);
        break;
      }
    }
  }

  const nfrIndexRelative = sectionLines.findIndex((line) =>
    /^###\s+NFR\s+\(Non-Functional Requirements\)\s*$/.test(line.trim()),
  );
  if (nfrIndexRelative !== -1) {
    const nfrStart = start + nfrIndexRelative;
    const nfrEnd = nextHeadingIndex(lines, nfrStart, /^###\s+|^##\s+/);
    const nfrLines = lines.slice(nfrStart, nfrEnd).join(' ');
    for (const category of NFR_CATEGORIES) {
      const regex = new RegExp(`\\b${category}\\b`, 'i');
      if (!regex.test(nfrLines)) {
        addError(errors, nfrStart, `В NFR отсутствует категория: ${category}`, `Добавь "- ${category}: ..." в секцию NFR`);
      }
    }
  }
}

/**
 * Extract todo ID from heading format: `### 📋 \`my-task-id\`` or `### \`my-task-id\``
 * Uses strict kebab-case: no trailing hyphens, no consecutive hyphens.
 */
function extractTodoId(line: string): string | null {
  const match = line.match(/^###\s+(?:\S+\s+)?`([a-z0-9]+(?:-[a-z0-9]+)*)`\s*$/);
  return match ? match[1] : null;
}

function isTodoStart(line: string): boolean {
  return extractTodoId(line) !== null;
}

function validateTodos(lines: string[], indices: Map<string, number>, errors: ValidationError[]): void {
  const todosIndex = indices.get('Todos');
  if (todosIndex === undefined) {
    return;
  }

  const { start, end } = getSectionRange(lines, todosIndex);
  const sectionLines = lines.slice(start, end);

  let hasTodo = false;

  for (let i = 0; i < sectionLines.length; i += 1) {
    const line = sectionLines[i];
    const todoId = extractTodoId(line);
    if (!todoId) {
      continue;
    }
    hasTodo = true;

    // Find todo block boundaries (until next todo start)
    const nextTodoIndex = sectionLines
      .slice(i + 1)
      .findIndex((nextLine) => isTodoStart(nextLine));
    const todoEnd = nextTodoIndex === -1 ? sectionLines.length : i + 1 + nextTodoIndex;

    const blockLines = sectionLines.slice(i + 1, todoEnd);

    // Blockquote description + list items for fields (non-blockquote lines)
    const hasDescription = blockLines.some((l) => /^>\s+\S/.test(l));
    const fieldLines = blockLines.filter((l) => !l.startsWith('>'));
    const fieldText = fieldLines.join('\n').toLowerCase();
    const hasFiles = /\bfiles:/.test(fieldText);
    const hasRefs = /\brefs:/.test(fieldText);
    const hasChanges = /\bchanges:/.test(fieldText);
    const hasDeps = /\bdeps:/.test(fieldText);

    if (!hasDescription) {
      addError(errors, start + i, `Для todo "${todoId}" отсутствует description`, 'Добавь описание в blockquote: > описание задачи');
    }
    if (!hasFiles) {
      addError(errors, start + i, `В todo "${todoId}" отсутствует files:`, 'Добавь: - **files:** `path` *(action)*');
    }
    if (!hasChanges) {
      addError(errors, start + i, `В todo "${todoId}" отсутствует changes:`, 'Добавь: - **changes:** с конкретными изменениями (что найти/добавить/удалить)');
    }
    if (!hasRefs) {
      addError(errors, start + i, `В todo "${todoId}" отсутствует refs:`, 'Добавь: - **refs:** FR-1');
    }
    if (!hasDeps) {
      addError(errors, start + i, `Для todo "${todoId}" отсутствует deps:`, 'Добавь: - **deps:** *none* или - **deps:** `other-task`');
    }
  }

  if (!hasTodo) {
    addError(errors, start, 'Секция Todos не содержит ни одной задачи', 'Добавь задачу: ### 📋 `my-task` (формат: см. template.md)');
  }
}

function validateVerificationPlan(lines: string[], indices: Map<string, number>, errors: ValidationError[]): void {
  const dodIndex = indices.get('Definition of Done');
  if (dodIndex === undefined) {
    return;
  }

  const { start, end } = getSectionRange(lines, dodIndex);
  const sectionLines = lines.slice(start, end);
  const verificationIndex = sectionLines.findIndex((line) =>
    /^###\s+Verification Plan\b/.test(line.trim()),
  );
  if (verificationIndex === -1) {
    addError(errors, start, 'В DoD отсутствует секция Verification Plan', 'Добавь: ### Verification Plan');
    return;
  }

  const verificationStart = start + verificationIndex;
  const verificationEnd = nextHeadingIndex(lines, verificationStart, /^###\s+|^##\s+/);
  const verificationLines = lines.slice(verificationStart, verificationEnd);

  const automatedIndex = verificationLines.findIndex((line) =>
    /Automated Tests/i.test(line),
  );
  if (automatedIndex === -1) {
    addError(errors, verificationStart, 'В Verification Plan отсутствует Automated Tests', 'Добавь: - Automated Tests:');
    return;
  }

  let hasCommand = false;
  for (let i = automatedIndex + 1; i < verificationLines.length; i += 1) {
    const line = verificationLines[i].trim();
    if (/Manual Verification/i.test(line) || /^###\s+|^##\s+/.test(line)) {
      break;
    }
    if (line.startsWith('- `') && line.includes('`')) {
      hasCommand = true;
      break;
    }
  }

  if (!hasCommand) {
    addError(errors, verificationStart, 'Automated Tests должны содержать хотя бы одну команду в backticks', 'Формат: - `npx tsx ...` (строка начинается с "- `")');
  }
}

interface ParsedRow {
  path: string;
  action: string;
  lineOffset: number;
}

/**
 * Parse File Changes markdown table into structured rows.
 * Returns null if no valid table found.
 */
function parseFileChangesTable(
  lines: string[],
  indices: Map<string, number>,
): { rows: ParsedRow[]; sectionStart: number; headerLine: number } | null {
  const fileChangesIndex = indices.get('File Changes');
  if (fileChangesIndex === undefined) return null;

  const { start, end } = getSectionRange(lines, fileChangesIndex);
  const sectionLines = lines.slice(start, end);

  const headerIndex = sectionLines.findIndex((line) =>
    /^\|\s*Path\s*\|\s*Action\s*\|\s*Reason\s*\|/.test(line.trim()),
  );
  if (headerIndex === -1) return null;

  const afterSeparator = sectionLines.slice(headerIndex + 2);
  const rows: ParsedRow[] = [];
  for (let i = 0; i < afterSeparator.length; i += 1) {
    if (!afterSeparator[i].includes('|')) continue;
    const columns = afterSeparator[i].split('|').map((c) => c.trim()).filter(Boolean);
    if (columns.length < 2) continue;
    rows.push({
      path: columns[0].replace(/`/g, ''),
      action: columns[1].replace(/`/g, '').toLowerCase(),
      lineOffset: start + headerIndex + 2 + i,
    });
  }

  return { rows, sectionStart: start, headerLine: start + headerIndex };
}

function validateFileChanges(lines: string[], indices: Map<string, number>, errors: ValidationError[]): void {
  const fileChangesIndex = indices.get('File Changes');
  if (fileChangesIndex === undefined) return;

  const { start } = getSectionRange(lines, fileChangesIndex);
  const sectionEnd = nextHeadingIndex(lines, fileChangesIndex, /^##\s+/);
  const sectionLines = lines.slice(start, sectionEnd);

  for (let i = 0; i < sectionLines.length; i += 1) {
    if (/^```/.test(sectionLines[i].trim())) {
      addError(errors, start + i, 'File Changes не должен быть внутри fenced code-block', 'Убери ``` вокруг таблицы');
      break;
    }
  }

  const parsed = parseFileChangesTable(lines, indices);
  if (!parsed) {
    addError(errors, start, 'В File Changes отсутствует таблица Path/Action/Reason', 'Добавь: | Path | Action | Reason |');
    return;
  }
  if (parsed.rows.length === 0) {
    addError(errors, parsed.headerLine, 'Таблица File Changes не содержит строк данных', 'Добавь строку: | path/to/file | create | причина |');
    return;
  }

  for (const row of parsed.rows) {
    if (/^[a-zA-Z]:\\/.test(row.path) || row.path.startsWith('/') || row.path.startsWith('\\\\')) {
      addError(errors, row.lineOffset, `Абсолютный путь в File Changes: ${row.path}`, 'Используй относительный путь (без C:\\ или /)');
    }
    if (row.path === '') {
      addError(errors, row.lineOffset, 'Пустой Path в File Changes', 'Укажи путь к файлу в колонке Path');
    }
    if (row.action && !ALLOWED_ACTIONS.has(row.action) && row.path.toLowerCase() !== 'tbd') {
      addError(errors, row.lineOffset, `Недопустимый Action в File Changes: ${row.action}`, 'Допустимые: create, edit, delete, rename, move, replace');
    }
  }
}

/**
 * Check if File Changes contains destructive actions (delete/rename/move/replace)
 * and if so, verify Impact Analysis section exists.
 */
function validateImpactAnalysis(lines: string[], indices: Map<string, number>, errors: ValidationError[]): void {
  const parsed = parseFileChangesTable(lines, indices);
  if (!parsed || parsed.rows.length === 0) return;

  const hasDestructiveAction = parsed.rows.some((row) => DESTRUCTIVE_ACTIONS.has(row.action));
  if (!hasDestructiveAction) return;

  // File Changes has destructive actions — check for Impact Analysis
  const impactIndex = findHeadingIndex(lines, /^##\s+Impact Analysis\b/);
  if (impactIndex === -1) {
    addError(errors, parsed.sectionStart, 'File Changes содержит delete/rename/move/replace, но отсутствует секция Impact Analysis', 'Добавь: ## Impact Analysis с таблицей | Keyword | Files Found | Action in Plan |');
    return;
  }

  // Check that Impact Analysis is not just N/A when destructive actions exist
  const impactEnd = nextHeadingIndex(lines, impactIndex, /^##\s+/);
  const impactLines = lines.slice(impactIndex, impactEnd).join('\n');
  if (/N\/A/i.test(impactLines) && !impactLines.includes('|')) {
    addError(errors, impactIndex, 'Impact Analysis содержит N/A, но File Changes имеет delete/rename/move — нужна таблица Keyword/Files', 'Замени N/A на таблицу: | Keyword | Files Found | Action in Plan |');
  }
}

/**
 * Phase 2: Validate Context section content.
 * Checks for ### Extracted Requirements with at least 2 numbered items.
 */
function validateContextContent(lines: string[], indices: Map<string, number>, errors: ValidationError[]): void {
  const contextIndex = indices.get('Context');
  if (contextIndex === undefined) return;

  const { start, end } = getSectionRange(lines, contextIndex);
  const sectionLines = lines.slice(start, end);

  // Check for ### Extracted Requirements subsection
  const extractedIdx = sectionLines.findIndex((line) =>
    /^###\s+Extracted Requirements\s*$/.test(line.trim()),
  );
  if (extractedIdx === -1) {
    addError(
      errors,
      start,
      'В Context отсутствует подсекция ### Extracted Requirements',
      'Перечитай ВСЕ сообщения пользователя в диалоге и перечисли каждое требование нумерованным списком в ### Extracted Requirements',
    );
    return;
  }

  // Count numbered items (1. text, 2. text, etc.)
  const extractedAbsStart = start + extractedIdx + 1;
  const extractedAbsEnd = nextHeadingIndex(lines, start + extractedIdx, /^###\s+|^##\s+/);
  const extractedLines = lines.slice(extractedAbsStart, extractedAbsEnd);

  let numberedCount = 0;
  for (const line of extractedLines) {
    if (/^\d+\.\s+\S/.test(line.trim())) {
      numberedCount += 1;
    }
  }

  if (numberedCount < 2) {
    addError(
      errors,
      start + extractedIdx,
      `Extracted Requirements содержит ${numberedCount} пунктов (минимум 2)`,
      'Перечитай ВСЕ сообщения пользователя и добавь каждое требование как нумерованный пункт (1. ..., 2. ...)',
    );
  }
}

/**
 * Phase 1: Validate Простыми словами section content.
 * Section is mandatory via REQUIRED_SECTIONS, but this function additionally
 * checks that the section is not empty (heading without content).
 * Empty section breaks UX — reviewer would not see the human-friendly summary.
 */
function validateHumanSummarySection(
  lines: string[],
  indices: Map<string, number>,
  errors: ValidationError[],
): void {
  const sectionIndex = indices.get('Простыми словами');
  if (sectionIndex === undefined) return; // missing section already reported by validateSections

  const range = getSectionRange(lines, sectionIndex);
  const contentLines = lines.slice(range.start + 1, range.end);

  const hasContent = contentLines.some((line) => line.trim().length > 0);
  if (!hasContent) {
    addError(
      errors,
      range.start,
      'Секция Простыми словами пуста',
      'Добавь три подсекции: ### Сейчас (как работает), ### Как должно быть (как я понял), ### Правильно понял?',
    );
  }
}

const CROSS_REF_THRESHOLD = 0.5; // >50% of File Changes paths must be mentioned in plan body

/**
 * Phase 3: Cross-reference validation.
 * Checks that File Changes paths are actually mentioned in the plan body
 * (Implementation Plan, Todos, Context, Requirements sections).
 * Detects stale/contaminated plans where File Changes come from a previous task.
 */
function validateCrossReferences(lines: string[], indices: Map<string, number>, errors: ValidationError[]): void {
  const parsed = parseFileChangesTable(lines, indices);
  if (!parsed || parsed.rows.length === 0) return;

  const fileChangesIndex = indices.get('File Changes') ?? lines.length;
  const bodyLines = lines.slice(0, fileChangesIndex);
  const bodyText = bodyLines.join('\n').toLowerCase();

  const unmentioned: string[] = [];

  for (const row of parsed.rows) {
    const filePath = row.path.toLowerCase();
    if (!filePath || filePath === 'tbd') continue;

    const baseName = path.basename(filePath).toLowerCase();

    // Check if full path or basename appears in plan body
    const fullPathFound = bodyText.includes(filePath);
    const baseNameFound = baseName.length >= 2 && bodyText.includes(baseName);

    if (!fullPathFound && !baseNameFound) {
      unmentioned.push(row.path);
    }
  }

  const totalPaths = parsed.rows.filter((r) => r.path && r.path.toLowerCase() !== 'tbd').length;
  if (totalPaths === 0) return;

  const unmentionedRatio = unmentioned.length / totalPaths;

  if (unmentionedRatio > CROSS_REF_THRESHOLD) {
    const pathList = unmentioned.slice(0, 5).join(', ');
    const more = unmentioned.length > 5 ? ` (и ещё ${unmentioned.length - 5})` : '';
    addError(
      errors,
      parsed.sectionStart,
      `Потенциальная контаминация: ${unmentioned.length} из ${totalPaths} путей в File Changes не упомянуты в плане: ${pathList}${more}`,
      'Проверь что File Changes относится к текущей задаче. Каждый путь должен быть в Implementation Plan или Todos.',
    );
  }
}

// ---------------------------------------------------------------------------
// Phase 4: Actionability validation (warnings, non-blocking)
// ---------------------------------------------------------------------------

const GENERIC_PHRASES = [
  'update logic', 'fix code', 'edit file', 'implement feature',
  'add support', 'modify file', 'change code', 'update file',
  'make changes', 'adjust code', 'обновить логику', 'изменить файл',
  'добавить поддержку', 'исправить код',
];

const MIN_CHANGES_WORDS = 10;
const MIN_IMPL_STEP_WORDS = 12;
const MIN_REASON_WORDS = 5;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function containsGenericPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return GENERIC_PHRASES.some((phrase) => lower.includes(phrase));
}

function validateTodoChangesContent(
  lines: string[], indices: Map<string, number>, warnings: ValidationError[],
): void {
  const todosIndex = indices.get('Todos');
  if (todosIndex === undefined) return;

  const { start, end } = getSectionRange(lines, todosIndex);
  const sectionLines = lines.slice(start, end);

  for (let i = 0; i < sectionLines.length; i += 1) {
    const todoId = extractTodoId(sectionLines[i]);
    if (!todoId) continue;

    const nextTodoIdx = sectionLines.slice(i + 1).findIndex((l) => isTodoStart(l));
    const todoEnd = nextTodoIdx === -1 ? sectionLines.length : i + 1 + nextTodoIdx;
    const blockLines = sectionLines.slice(i + 1, todoEnd);

    // Find changes: field
    let changesFieldIdx = -1;
    for (let j = 0; j < blockLines.length; j += 1) {
      if (/\bchanges:/i.test(blockLines[j])) {
        changesFieldIdx = j;
        break;
      }
    }
    if (changesFieldIdx === -1) continue; // Phase 1 handles missing changes:

    // Collect sub-bullets (indented lines starting with -)
    const bullets: { text: string; lineIdx: number }[] = [];
    for (let j = changesFieldIdx + 1; j < blockLines.length; j += 1) {
      const bLine = blockLines[j];
      if (/^\s+-\s+/.test(bLine)) {
        bullets.push({ text: bLine.replace(/^\s+-\s+/, '').trim(), lineIdx: start + i + 1 + j });
      } else if (/^\s*-\s*\*\*\w+:\*\*/.test(bLine) || bLine.trim() === '' || bLine.trim() === '---') {
        break;
      }
    }

    if (bullets.length === 0) {
      addError(warnings, start + i, `Todo "${todoId}" имеет пустое changes: без конкретных изменений`,
        'Добавь sub-bullets: - {конкретное изменение}');
      continue;
    }

    for (const bullet of bullets) {
      const wc = countWords(bullet.text);
      if (wc < MIN_CHANGES_WORDS) {
        addError(warnings, bullet.lineIdx,
          `Todo changes bullet слишком краткий (${wc} слов, мин. ${MIN_CHANGES_WORDS})`,
          'Опиши конкретно: что найти, что добавить/удалить/заменить, в какой функции/секции');
      }
      if (containsGenericPhrase(bullet.text)) {
        addError(warnings, bullet.lineIdx,
          'Todo changes bullet содержит generic фразу',
          'Замени на конкретное описание изменения (файл, функция, что именно менять)');
      }
    }
  }
}

function validateImplStepDetail(
  lines: string[], indices: Map<string, number>, warnings: ValidationError[],
): void {
  const implIndex = indices.get('Implementation Plan');
  if (implIndex === undefined) return;

  const { start, end } = getSectionRange(lines, implIndex);
  for (let i = start + 1; i < end; i += 1) {
    const line = lines[i].trim();
    const match = line.match(/^\d+\.\s+(.+)$/);
    if (!match) continue;

    const stepText = match[1];
    const wc = countWords(stepText);
    if (wc < MIN_IMPL_STEP_WORDS) {
      addError(warnings, i,
        `Implementation Plan шаг слишком краткий (${wc} слов, мин. ${MIN_IMPL_STEP_WORDS})`,
        'Опиши шаг подробнее: что, где, как, зачем');
    }
    if (containsGenericPhrase(stepText)) {
      addError(warnings, i,
        'Implementation Plan шаг содержит generic фразу',
        'Замени "update logic" / "fix code" на конкретное описание');
    }
  }
}

function validateFileChangesReasonQuality(
  lines: string[], indices: Map<string, number>, warnings: ValidationError[],
): void {
  const fileChangesIndex = indices.get('File Changes');
  if (fileChangesIndex === undefined) return;

  const { start } = getSectionRange(lines, fileChangesIndex);
  const sectionEnd = nextHeadingIndex(lines, fileChangesIndex, /^##\s+/);
  const sectionLines = lines.slice(start, sectionEnd);

  const headerIndex = sectionLines.findIndex((line) =>
    /^\|\s*Path\s*\|\s*Action\s*\|\s*Reason\s*\|/.test(line.trim()),
  );
  if (headerIndex === -1) return;

  const afterSeparator = sectionLines.slice(headerIndex + 2);
  for (let i = 0; i < afterSeparator.length; i += 1) {
    if (!afterSeparator[i].includes('|')) continue;
    const columns = afterSeparator[i].split('|').map((c) => c.trim()).filter(Boolean);
    if (columns.length < 3) continue;
    const reason = columns[2].replace(/`/g, '');
    const lineIdx = start + headerIndex + 2 + i;
    const wc = countWords(reason);

    if (wc < MIN_REASON_WORDS) {
      addError(warnings, lineIdx,
        `File Changes Reason слишком краткий (${wc} слов, мин. ${MIN_REASON_WORDS})`,
        'Опиши зачем файл меняется, не только "Update."');
    }
    if (containsGenericPhrase(reason)) {
      addError(warnings, lineIdx,
        'File Changes Reason содержит generic фразу',
        'Замени на конкретное описание причины');
    }
  }
}

const BUGFIX_TRIGGERS = /\b(fix|bug|баг|исправ|hotfix|regression)\b/i;

function validateTestSpecSync(
  lines: string[], indices: Map<string, number>, warnings: ValidationError[],
): void {
  const parsed = parseFileChangesTable(lines, indices);
  if (!parsed || parsed.rows.length === 0) return;

  const testPaths = parsed.rows.filter((r) => /^tests\//.test(r.path));
  const specPaths = parsed.rows.filter((r) => /^\.specs\//.test(r.path) || /\.feature$/.test(r.path));

  if (testPaths.length > 0 && specPaths.length === 0) {
    addError(warnings, parsed.sectionStart,
      `File Changes содержит тестовые файлы (${testPaths.length}) но не содержит спецификаций (.specs/ или .feature) — обнови спеки при изменении тестов`,
      'Добавь .specs/ файлы или .feature при изменении тестов');
  }
}

function validateBugfixBdd(
  lines: string[], indices: Map<string, number>, warnings: ValidationError[],
): void {
  const fileChangesIndex = indices.get('File Changes');
  if (fileChangesIndex === undefined) return;

  const { start } = getSectionRange(lines, fileChangesIndex);
  const sectionEnd = nextHeadingIndex(lines, fileChangesIndex, /^##\s+/);
  const sectionLines = lines.slice(start, sectionEnd);

  const headerIndex = sectionLines.findIndex((line) =>
    /^\|\s*Path\s*\|\s*Action\s*\|\s*Reason\s*\|/.test(line.trim()),
  );
  if (headerIndex === -1) return;

  const afterSeparator = sectionLines.slice(headerIndex + 2);
  let hasBugfix = false;
  let bugfixLineIdx = 0;
  let hasFeature = false;

  for (let i = 0; i < afterSeparator.length; i += 1) {
    if (!afterSeparator[i].includes('|')) continue;
    const columns = afterSeparator[i].split('|').map((c) => c.trim()).filter(Boolean);
    if (columns.length < 3) continue;

    const path = columns[0].replace(/`/g, '');
    const reason = columns[2].replace(/`/g, '');

    if (/\.feature$/.test(path)) hasFeature = true;
    if (BUGFIX_TRIGGERS.test(reason) && !hasBugfix) {
      hasBugfix = true;
      bugfixLineIdx = start + headerIndex + 2 + i;
    }
  }

  if (hasBugfix && !hasFeature) {
    addError(warnings, bugfixLineIdx,
      'Багфикс в File Changes без BDD сценария — добавь .feature файл для регрессионного теста',
      'Создай или обнови .feature с Scenario для этого бага');
  }
}

function validateActionability(
  lines: string[], indices: Map<string, number>, warnings: ValidationError[],
): void {
  validateTodoChangesContent(lines, indices, warnings);
  validateImplStepDetail(lines, indices, warnings);
  validateFileChangesReasonQuality(lines, indices, warnings);
  validateTestSpecSync(lines, indices, warnings);
  validateBugfixBdd(lines, indices, warnings);
}

/**
 * Validate plan with two-phase approach:
 * - Phase 1: Structural validation (sections, format, tables)
 * - Phase 2: Context content validation (only when Phase 1 is clean)
 * - Phase 3: Cross-reference validation (only when Phase 1+2 are clean)
 *
 * Returns flat error array for backward compatibility.
 */
export function validatePlan(filePath: string): ValidationError[] {
  const result = validatePlanPhased(filePath);
  if (result.phase1.length > 0) return result.phase1;
  if (result.phase2.length > 0) return result.phase2;
  return result.phase3;
}

/**
 * Validate plan returning Phase 1 and Phase 2 errors separately.
 * Phase 2 only runs when Phase 1 has 0 errors.
 */
export function validatePlanPhased(filePathOrLines: string | string[]): ValidationResult {
  const phase1: ValidationError[] = [];
  const lines = Array.isArray(filePathOrLines) ? filePathOrLines : readFileLines(filePathOrLines);

  const indices = validateSections(lines, phase1);
  validateHumanSummarySection(lines, indices, phase1);
  validateRequirements(lines, indices, phase1);
  validateTodos(lines, indices, phase1);
  validateVerificationPlan(lines, indices, phase1);
  validateFileChanges(lines, indices, phase1);
  validateImpactAnalysis(lines, indices, phase1);

  // Phase 2: only when Phase 1 is clean
  const phase2: ValidationError[] = [];
  if (phase1.length === 0) {
    validateContextContent(lines, indices, phase2);
  }

  // Phase 3: only when Phase 1+2 are clean
  const phase3: ValidationError[] = [];
  if (phase1.length === 0 && phase2.length === 0) {
    validateCrossReferences(lines, indices, phase3);
  }

  // Phase 4: actionability warnings (only when Phase 1+2+3 are clean)
  const phase4: ValidationError[] = [];
  if (phase1.length === 0 && phase2.length === 0 && phase3.length === 0) {
    validateActionability(lines, indices, phase4);
  }

  return { phase1, phase2, phase3, phase4 };
}

function printUsage(): void {
  console.log('Usage: npx tsx tools/plan-pomogator/validate-plan.ts <path-to-plan.md>');
}

function main(): void {
  const args = process.argv.slice(2).filter(Boolean);
  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  let hasErrors = false;
  for (const inputPath of args) {
    const resolvedPath = path.resolve(process.cwd(), inputPath);
    if (!fs.existsSync(resolvedPath)) {
      console.error(`Файл не найден: ${resolvedPath}`);
      hasErrors = true;
      continue;
    }

    const result = validatePlanPhased(resolvedPath);
    const errors = result.phase1.length > 0 ? result.phase1
      : result.phase2.length > 0 ? result.phase2
      : result.phase3;
    if (errors.length > 0) {
      hasErrors = true;
      const phase = result.phase1.length > 0 ? 'Phase 1 (структура)'
        : result.phase2.length > 0 ? 'Phase 2 (требования)'
        : 'Phase 3 (кросс-ссылки)';
      console.error(`${phase} ошибки в плане: ${resolvedPath}`);
      for (const error of errors) {
        console.error(`  line ${error.line}: ${error.message}`);
        console.error(`    💡 ${error.hint}`);
      }
      console.error('');
    } else {
      if (result.phase4.length > 0) {
        console.warn(`Phase 4 (actionability) предупреждения: ${resolvedPath}`);
        for (const warning of result.phase4) {
          console.warn(`  line ${warning.line}: ${warning.message}`);
          console.warn(`    💡 ${warning.hint}`);
        }
        console.log(`OK (${result.phase4.length} warnings): ${resolvedPath}`);
      } else {
        console.log(`OK: ${resolvedPath}`);
      }
    }
  }

  if (hasErrors) {
    process.exit(1);
  }
}

// Run CLI only when invoked directly (not when imported as module)
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main();
}
