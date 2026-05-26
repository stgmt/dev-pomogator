/**
 * Pure markdown/gherkin parsers for variant matrix audit.
 * Regex-based, no AST. Mirror existing specs-generator-core.mjs patterns.
 */

export interface DecisionTableRow {
  idx: number;
  variant: string;
  trigger: string;
  expectedParam: string;
  testRef: string;
  coverage: 'covered' | 'excluded' | 'pending' | string;
  outOfScopeReason?: string;
}

export interface ExamplesRow {
  rowNum: number;
  columns: Record<string, string>;
}

export interface VariantTask {
  taskId: string;
  axis: string;
  value: string;
  refs: string[];
}

/**
 * Parse markdown table rows из AC content для given FR.
 * Looks for table с columns Variant + Coverage (any order).
 */
export function parseDecisionTable(
  acContent: string,
  frId: string,
): DecisionTableRow[] {
  // Find AC sections that reference frId.
  const sections = extractACSectionsForFR(acContent, frId);
  if (sections.length === 0) {
    // Also check whole content for table — agent might place table outside FR-scoped AC.
    return parseTableFromText(acContent);
  }

  for (const section of sections) {
    const rows = parseTableFromText(section);
    if (rows.length > 0) return rows;
  }

  return [];
}

function extractACSectionsForFR(content: string, frId: string): string[] {
  const lines = content.split('\n');
  const sections: string[] = [];
  let currentSection: string[] | null = null;
  let currentFRRef: string | null = null;

  const acHeaderRe = /^##\s+AC-\d+\s*\(([^)]+)\)/;

  for (const line of lines) {
    const match = acHeaderRe.exec(line);
    if (match) {
      if (currentSection && currentFRRef === frId) {
        sections.push(currentSection.join('\n'));
      }
      currentFRRef = match[1].trim();
      currentSection = [line];
    } else if (currentSection) {
      currentSection.push(line);
    }
  }

  if (currentSection && currentFRRef === frId) {
    sections.push(currentSection.join('\n'));
  }

  return sections;
}

function parseTableFromText(text: string): DecisionTableRow[] {
  const lines = text.split('\n');
  // Find header row containing Variant + Coverage columns.
  let headerIdx = -1;
  let columnIndices: Record<string, number> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith('|')) continue;
    const cells = parseTableRow(line);
    const hasVariant = cells.some((c) => /^variant$/i.test(c.trim()));
    const hasCoverage = cells.some((c) => /^coverage$/i.test(c.trim()));
    if (hasVariant && hasCoverage) {
      headerIdx = i;
      cells.forEach((c, idx) => {
        columnIndices[c.trim().toLowerCase()] = idx;
      });
      break;
    }
  }

  if (headerIdx === -1) return [];

  // Skip separator row (line after header).
  const rows: DecisionTableRow[] = [];
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith('|')) break;
    const cells = parseTableRow(line);
    if (cells.length === 0) break;

    const idx = parseInt(cells[columnIndices['#']]?.trim() ?? '0', 10) || rows.length + 1;
    const variant = cells[columnIndices['variant']]?.trim() ?? '';
    const triggerCol = findColumn(columnIndices, ['trigger condition', 'trigger']);
    const trigger = triggerCol >= 0 ? (cells[triggerCol]?.trim() ?? '') : '';
    const expectedCol = findColumn(columnIndices, [
      'expected param',
      'expected behavior',
      'expected',
    ]);
    const expectedParam = expectedCol >= 0 ? (cells[expectedCol]?.trim() ?? '') : '';
    const testRefCol = findColumn(columnIndices, ['test ref (@featuren)', 'test ref', 'test']);
    const testRef = testRefCol >= 0 ? (cells[testRefCol]?.trim() ?? '') : '';
    const coverage = (cells[columnIndices['coverage']]?.trim() ?? '').toLowerCase();

    if (!variant || variant === '---') continue;

    const row: DecisionTableRow = {
      idx,
      variant,
      trigger,
      expectedParam,
      testRef,
      coverage,
    };

    const oosMatch = /\[OUT_OF_SCOPE:\s*([^\]]+)\]/i.exec(line);
    if (oosMatch) {
      row.outOfScopeReason = oosMatch[1].trim();
    }

    rows.push(row);
  }

  return rows;
}

function findColumn(indices: Record<string, number>, candidates: string[]): number {
  for (const c of candidates) {
    if (c in indices) return indices[c];
  }
  return -1;
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return [];
  const cells = trimmed.split('|').slice(1, -1);
  return cells;
}

/**
 * Parse Examples table rows из .feature content для given featureTag.
 */
export function parseExamplesTable(
  featureContent: string,
  featureTag: string,
): ExamplesRow[] {
  const lines = featureContent.split('\n');
  let inTaggedScenario = false;
  let inExamples = false;
  let headerCells: string[] = [];
  const rows: ExamplesRow[] = [];

  const tagRe = new RegExp(`(^|\\s)${escapeRegex(featureTag)}(\\s|$)`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (tagRe.test(line)) {
      inTaggedScenario = true;
      continue;
    }

    if (
      inTaggedScenario &&
      /^\s*Scenario(?:\s+Outline)?:/i.test(line) &&
      !/Outline/.test(line)
    ) {
      // Plain Scenario without Outline — no Examples expected.
      inTaggedScenario = false;
      continue;
    }

    if (inTaggedScenario && /^\s*Scenario\s+Outline:/i.test(line)) {
      // Stay in scenario, continue scanning for Examples.
      continue;
    }

    if (inTaggedScenario && /^\s*Examples:\s*$/i.test(line)) {
      inExamples = true;
      headerCells = [];
      continue;
    }

    if (inExamples) {
      const cells = parseTableRow(line);
      if (cells.length === 0) {
        // Empty/non-table line — exit Examples block.
        inExamples = false;
        inTaggedScenario = false;
        continue;
      }
      if (headerCells.length === 0) {
        headerCells = cells.map((c) => c.trim());
        continue;
      }
      // Skip rows that look like comments
      if (cells.every((c) => !c.trim() || c.trim().startsWith('#'))) continue;

      const columns: Record<string, string> = {};
      headerCells.forEach((h, idx) => {
        columns[h] = (cells[idx] ?? '').trim();
      });
      rows.push({ rowNum: rows.length + 1, columns });
    }
  }

  return rows;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse variant tasks из TASKS.md content для given featureTag.
 * Looks for tasks с tracer line `_Variant: {axis}={value}_`.
 */
export function parseVariantTasks(
  tasksContent: string,
  featureTag: string,
): VariantTask[] {
  const lines = tasksContent.split('\n');
  const tasks: VariantTask[] = [];
  const tagRe = new RegExp(escapeRegex(featureTag));
  // Task line accepts both formats:
  //   `- [ ] T01: title -- @feature1 — Status: ...` (colon after taskId)
  //   `- [ ] T1 -- @feature1 — Status: ...` (whitespace after taskId)
  const taskHeaderRe = /^-\s*\[\s*[xX ]?\s*\]\s+(\w+)(?::|\s)/;
  const variantTracerRe = /_Variant:\s*(\w+)\s*=\s*([^_]+)_/i;

  let pendingTask: { taskId: string; refs: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const taskMatch = taskHeaderRe.exec(line);
    if (taskMatch && tagRe.test(line)) {
      const refsMatch = line.match(/@\w+/g) ?? [];
      pendingTask = {
        taskId: taskMatch[1],
        refs: refsMatch,
      };
      continue;
    }

    if (pendingTask) {
      const variantMatch = variantTracerRe.exec(line);
      if (variantMatch) {
        tasks.push({
          taskId: pendingTask.taskId,
          axis: variantMatch[1],
          value: variantMatch[2].trim(),
          refs: pendingTask.refs,
        });
        pendingTask = null;
        continue;
      }
      // If reach next task line without finding tracer, drop pending.
      if (/^-\s*\[\s*[xX ]?\s*\]/.test(line)) {
        pendingTask = null;
      }
    }
  }

  return tasks;
}
