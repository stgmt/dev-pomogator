#!/usr/bin/env npx tsx
import fs from 'fs';
import path from 'path';

interface ValidationError {
  line: number;
  message: string;
}

const REQUIRED_SECTIONS: Array<{ name: string; regex: RegExp }> = [
  { name: 'User Stories', regex: /^##\s+User Stories\s*$/ },
  { name: 'Use Cases', regex: /^##\s+Use Cases\s*$/ },
  { name: 'Requirements', regex: /^##\s+Requirements\s*$/ },
  { name: 'Implementation Plan', regex: /^##\s+Implementation Plan\s*$/ },
  { name: 'Todos', regex: /^##\s+Todos\s*$/ },
  { name: 'Definition of Done', regex: /^##\s+Definition of Done\b.*$/ },
  { name: 'File Changes', regex: /^##\s+File Changes\b.*$/ },
];

const REQUIRED_REQUIREMENTS_SUBSECTIONS: Array<{ name: string; regex: RegExp }> = [
  { name: 'FR', regex: /^###\s+FR\s+\(Functional Requirements\)\s*$/ },
  { name: 'Acceptance Criteria', regex: /^###\s+Acceptance Criteria\s+\(EARS\)\s*$/ },
  { name: 'NFR', regex: /^###\s+NFR\s+\(Non-Functional Requirements\)\s*$/ },
  { name: 'Assumptions', regex: /^###\s+Assumptions\s*$/ },
];

const NFR_CATEGORIES = ['Performance', 'Security', 'Reliability', 'Usability'];
const ALLOWED_ACTIONS = new Set(['create', 'edit', 'delete', 'rename', 'move', 'replace']);

function readFileLines(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.split(/\r?\n/);
}

function addError(errors: ValidationError[], lineIndex: number, message: string): void {
  errors.push({ line: Math.max(1, lineIndex + 1), message });
}

function findHeadingIndex(lines: string[], regex: RegExp): number {
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
      addError(errors, 0, `Отсутствует секция: ${section.name}`);
      continue;
    }
    indices.set(section.name, index);
    if (index < lastIndex) {
      addError(errors, index, `Секция "${section.name}" находится не в требуемом порядке`);
    }
    lastIndex = Math.max(lastIndex, index);
  }

  const fileChangesIndex = indices.get('File Changes');
  if (fileChangesIndex !== undefined) {
    const nextAfterFileChanges = nextHeadingIndex(lines, fileChangesIndex, /^##\s+/);
    if (nextAfterFileChanges < lines.length) {
      addError(errors, fileChangesIndex, 'Секция File Changes должна быть последней');
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
      addError(errors, start, `В Requirements отсутствует подраздел: ${subsection.name}`);
    } else {
      subsectionIndices.push(start + idx);
    }
  }

  // Проверка порядка подразделов, если все найдены
  if (subsectionIndices.length === REQUIRED_REQUIREMENTS_SUBSECTIONS.length) {
    for (let i = 1; i < subsectionIndices.length; i += 1) {
      if (subsectionIndices[i] < subsectionIndices[i - 1]) {
        addError(errors, subsectionIndices[i], 'Нарушен порядок подразделов в Requirements');
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
        addError(errors, nfrStart, `В NFR отсутствует категория: ${category}`);
      }
    }
  }
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
    if (/^description:/.test(line.trim()) || /^dependencies:/.test(line.trim())) {
      addError(errors, start + i, 'description/dependencies должны быть вложенными строками');
    }
  }

  for (let i = 0; i < sectionLines.length; i += 1) {
    const line = sectionLines[i];
    const idMatch = line.match(/^- id:\s+([a-z0-9][a-z0-9-]*)\s*$/);
    if (!idMatch) {
      continue;
    }
    hasTodo = true;
    const todoId = idMatch[1];
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(todoId)) {
      addError(errors, start + i, `Некорректный id в Todos: ${todoId}`);
    }

    let hasDescription = false;
    let hasDependencies = false;
    let descriptionLine = '';
    const nextTodoIndex = sectionLines
      .slice(i + 1)
      .findIndex((nextLine) => /^- id:\s+/.test(nextLine.trim()));
    const todoEnd = nextTodoIndex === -1 ? sectionLines.length : i + 1 + nextTodoIndex;

    for (let j = i + 1; j < todoEnd; j += 1) {
      const todoLine = sectionLines[j];
      if (/^\s{2,}description:/.test(todoLine)) {
        hasDescription = true;
        descriptionLine = todoLine;
      }
      if (/^\s{2,}dependencies:/.test(todoLine)) {
        hasDependencies = true;
      }
      if (/^\s*description:/.test(todoLine.trim()) && !/^\s{2,}description:/.test(todoLine)) {
        addError(errors, start + j, 'description должна быть вложенной строкой');
      }
      if (/^\s*dependencies:/.test(todoLine.trim()) && !/^\s{2,}dependencies:/.test(todoLine)) {
        addError(errors, start + j, 'dependencies должны быть вложенной строкой');
      }
    }

    if (!hasDescription) {
      addError(errors, start + i, `Для todo "${todoId}" отсутствует description`);
    } else {
      if (!descriptionLine.includes('files:')) {
        addError(errors, start + i, `В description todo "${todoId}" отсутствует files:`);
      }
      if (!descriptionLine.toLowerCase().includes('requirements refs:')) {
        addError(errors, start + i, `В description todo "${todoId}" отсутствует Requirements refs:`);
      }
    }

    if (!hasDependencies) {
      addError(errors, start + i, `Для todo "${todoId}" отсутствует dependencies`);
    }
  }

  if (!hasTodo) {
    addError(errors, start, 'Секция Todos не содержит ни одной задачи');
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
    addError(errors, start, 'В DoD отсутствует секция Verification Plan');
    return;
  }

  const verificationStart = start + verificationIndex;
  const verificationEnd = nextHeadingIndex(lines, verificationStart, /^###\s+|^##\s+/);
  const verificationLines = lines.slice(verificationStart, verificationEnd);

  const automatedIndex = verificationLines.findIndex((line) =>
    /Automated Tests/i.test(line),
  );
  if (automatedIndex === -1) {
    addError(errors, verificationStart, 'В Verification Plan отсутствует Automated Tests');
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
    addError(errors, verificationStart, 'Automated Tests должны содержать хотя бы одну команду в backticks');
  }
}

function validateFileChanges(lines: string[], indices: Map<string, number>, errors: ValidationError[]): void {
  const fileChangesIndex = indices.get('File Changes');
  if (fileChangesIndex === undefined) {
    return;
  }

  const { start, end } = getSectionRange(lines, fileChangesIndex);
  const sectionLines = lines.slice(start, end);

  for (let i = 0; i < sectionLines.length; i += 1) {
    if (/^```/.test(sectionLines[i].trim())) {
      addError(errors, start + i, 'File Changes не должен быть внутри fenced code-block');
      break;
    }
  }

  const headerIndex = sectionLines.findIndex((line) =>
    /^\|\s*Path\s*\|\s*Action\s*\|\s*Reason\s*\|/.test(line.trim()),
  );
  if (headerIndex === -1) {
    addError(errors, start, 'В File Changes отсутствует таблица Path/Action/Reason');
    return;
  }

  const separatorIndex = headerIndex + 1;
  const dataRows = sectionLines.slice(separatorIndex + 1).filter((line) => line.includes('|'));
  if (dataRows.length === 0) {
    addError(errors, start + headerIndex, 'Таблица File Changes не содержит строк данных');
    return;
  }

  for (let i = 0; i < dataRows.length; i += 1) {
    const row = dataRows[i];
    const columns = row.split('|').map((item) => item.trim()).filter(Boolean);
    if (columns.length < 3) {
      continue;
    }
    const rawPath = columns[0].replace(/`/g, '');
    const action = columns[1].replace(/`/g, '').toLowerCase();
    if (/^[a-zA-Z]:\\/.test(rawPath) || rawPath.startsWith('/') || rawPath.startsWith('\\\\')) {
      addError(errors, start + separatorIndex + 1 + i, `Абсолютный путь в File Changes: ${rawPath}`);
    }
    if (rawPath === '') {
      addError(errors, start + separatorIndex + 1 + i, 'Пустой Path в File Changes');
    }
    if (action && !ALLOWED_ACTIONS.has(action) && rawPath.toLowerCase() !== 'tbd') {
      addError(errors, start + separatorIndex + 1 + i, `Недопустимый Action в File Changes: ${action}`);
    }
  }
}

function validatePlan(filePath: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const lines = readFileLines(filePath);

  const indices = validateSections(lines, errors);
  validateRequirements(lines, indices, errors);
  validateTodos(lines, indices, errors);
  validateVerificationPlan(lines, indices, errors);
  validateFileChanges(lines, indices, errors);

  return errors;
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

    const errors = validatePlan(resolvedPath);
    if (errors.length > 0) {
      hasErrors = true;
      console.error(`Ошибки в плане: ${resolvedPath}`);
      for (const error of errors) {
        console.error(`  line ${error.line}: ${error.message}`);
      }
      console.error('');
    } else {
      console.log(`OK: ${resolvedPath}`);
    }
  }

  if (hasErrors) {
    process.exit(1);
  }
}

main();
