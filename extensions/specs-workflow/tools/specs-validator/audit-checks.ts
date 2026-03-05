/**
 * Audit Checks for spec quality validation (TypeScript, cross-platform).
 *
 * CHECK-9:  PARTIAL_IMPL_DETECTION — FR marker + task [x] → ERROR
 * CHECK-10: TASK_FR_ATOMICITY — task covers >1 FR → WARNING
 * CHECK-11: FR_SPLIT_CONSISTENCY — FR-4a exists but FR-5a doesn't → INFO
 * CHECK-12: BDD_SCENARIO_SCOPE — FR mentions "serial" but scenario only "batch" → WARNING
 */

import fs from 'fs';
import path from 'path';

export interface AuditFinding {
  check: string;
  category: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  details?: string;
}

const PARTIAL_MARKERS = [
  'НЕ РЕАЛИЗОВАНО',
  'NOT IMPLEMENTED',
  'PARTIAL',
  'TODO: implement',
  'deferred',
  'будущее улучшение',
];

const DOMAIN_TERMS = [
  'batch', 'serial', 'IN', 'OUT', 'inbound', 'outbound',
  'create', 'update', 'delete', 'rollback', 'cancel', 'approve', 'reject',
];

function readFile(specPath: string, filename: string): string {
  const filePath = path.join(specPath, filename);
  if (!fs.existsSync(filePath)) return '';
  let content = fs.readFileSync(filePath, 'utf-8');
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
  return content;
}

/**
 * CHECK-9: PARTIAL_IMPL_DETECTION
 * FR-N has partial implementation marker but task is marked [x] → ERROR
 */
export function checkPartialImpl(specPath: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const frContent = readFile(specPath, 'FR.md');
  const tasksContent = readFile(specPath, 'TASKS.md');
  if (!frContent || !tasksContent) return findings;

  // Find FR-N sections with partial markers
  const frSections = frContent.split(/^## /m).slice(1);
  for (const section of frSections) {
    const idMatch = section.match(/^(FR-\d+[a-z]?)/);
    if (!idMatch) continue;
    const frId = idMatch[1];

    for (const marker of PARTIAL_MARKERS) {
      if (section.toLowerCase().includes(marker.toLowerCase())) {
        // Check if task referencing this FR is [x]
        const tasksLines = tasksContent.split('\n');
        for (const line of tasksLines) {
          if (/^\s*-\s*\[x\]/i.test(line) && line.includes(frId)) {
            findings.push({
              check: 'PARTIAL_IMPL_DETECTION',
              category: 'ERRORS',
              severity: 'ERROR',
              message: `PARTIAL_IMPL: ${frId} has partial implementation marker '${marker}' but task is marked complete [x]`,
              details: 'Either remove the marker from FR.md or uncheck the task in TASKS.md',
            });
            break;
          }
        }
        break; // one marker per FR is enough
      }
    }
  }

  return findings;
}

/**
 * CHECK-10: TASK_FR_ATOMICITY
 * A single task references >1 FR → WARNING
 */
export function checkTaskAtomicity(specPath: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const tasksContent = readFile(specPath, 'TASKS.md');
  if (!tasksContent) return findings;

  const taskLines = tasksContent.split('\n').filter(l => /^\s*-\s*\[[ x]\]/.test(l));

  for (const line of taskLines) {
    const frRefs = line.match(/FR-\d+[a-z]?/g);
    if (!frRefs) continue;
    const unique = [...new Set(frRefs)];
    if (unique.length > 1) {
      findings.push({
        check: 'TASK_FR_ATOMICITY',
        category: 'LOGIC_GAPS',
        severity: 'WARNING',
        message: `TASK_ATOMICITY: Task covers multiple FRs: ${unique.join(', ')}`,
        details: `Task: ${line.trim()}`,
      });
    }
  }

  return findings;
}

/**
 * CHECK-11: FR_SPLIT_CONSISTENCY
 * FR-4a exists but adjacent FR-5 has no sub-variants → INFO
 */
export function checkFrSplitConsistency(specPath: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const frContent = readFile(specPath, 'FR.md');
  if (!frContent) return findings;

  // Extract all FR IDs
  const frIds = [...frContent.matchAll(/## FR-(\d+)([a-z])?/g)];
  const frNumbers = new Map<number, string[]>(); // number → [sub-variants]

  for (const m of frIds) {
    const num = parseInt(m[1], 10);
    const variant = m[2] || '';
    if (!frNumbers.has(num)) frNumbers.set(num, []);
    if (variant) frNumbers.get(num)!.push(variant);
  }

  // Find FRs with sub-variants
  const splitFRs = [...frNumbers.entries()].filter(([, variants]) => variants.length > 0);

  for (const [splitNum, variants] of splitFRs) {
    // Check adjacent FRs (±1)
    for (const offset of [-1, 1]) {
      const adjacentNum = splitNum + offset;
      const adjacentVariants = frNumbers.get(adjacentNum);
      if (adjacentVariants !== undefined && adjacentVariants.length === 0) {
        const splitList = variants.map(v => `FR-${splitNum}${v}`).join(', ');
        findings.push({
          check: 'FR_SPLIT_CONSISTENCY',
          category: 'INCONSISTENCY',
          severity: 'INFO',
          message: `FR_SPLIT_CONSISTENCY: FR-${splitNum} has sub-variant(s) (${splitList}) but adjacent FR-${adjacentNum} does not`,
          details: `Review whether FR-${adjacentNum} should also be split`,
        });
      }
    }
  }

  return findings;
}

/**
 * CHECK-12: BDD_SCENARIO_SCOPE
 * FR mentions domain term but BDD scenario doesn't cover it → WARNING
 */
export function checkBddScenarioScope(specPath: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const frContent = readFile(specPath, 'FR.md');
  if (!frContent) return findings;

  // Find .feature file
  const files = fs.readdirSync(specPath);
  const featureFile = files.find(f => f.endsWith('.feature'));
  if (!featureFile) return findings;
  const featureContent = readFile(specPath, featureFile);
  if (!featureContent) return findings;

  // Parse FR sections with @featureN tags
  const frSections = frContent.split(/^## /m).slice(1);

  for (const section of frSections) {
    const idMatch = section.match(/^(FR-\d+[a-z]?)/);
    const tagMatch = section.match(/@feature(\d+[a-z]?)/);
    if (!idMatch || !tagMatch) continue;

    const frId = idMatch[1];
    const featureTag = `@feature${tagMatch[1]}`;

    // Extract domain terms from FR
    const frTerms = DOMAIN_TERMS.filter(t =>
      section.toLowerCase().includes(t.toLowerCase())
    );
    if (frTerms.length === 0) continue;

    // Extract scenario text for this @featureN
    const scenarioRegex = new RegExp(
      `#\\s*${featureTag}\\s*\\n\\s*Scenario[^]*?(?=\\n\\s*#\\s*@feature|\\n\\s*#\\s*$|$)`,
      'gi'
    );
    const scenarioMatches = featureContent.match(scenarioRegex);
    if (!scenarioMatches) continue;

    const scenarioText = scenarioMatches.join('\n').toLowerCase();

    // Check which FR terms are missing from scenarios
    const missingTerms = frTerms.filter(t => !scenarioText.includes(t.toLowerCase()));
    const presentTerms = frTerms.filter(t => scenarioText.includes(t.toLowerCase()));

    if (missingTerms.length > 0 && presentTerms.length > 0) {
      findings.push({
        check: 'BDD_SCENARIO_SCOPE',
        category: 'LOGIC_GAPS',
        severity: 'WARNING',
        message: `BDD_SCENARIO_SCOPE: ${frId} mentions '${missingTerms.join("', '")}' but ${featureTag} scenarios only cover '${presentTerms.join("', '")}'`,
      });
    }
  }

  return findings;
}

/**
 * Run all 4 audit checks on a spec directory.
 */
export function runAllChecks(specPath: string): AuditFinding[] {
  return [
    ...checkPartialImpl(specPath),
    ...checkTaskAtomicity(specPath),
    ...checkFrSplitConsistency(specPath),
    ...checkBddScenarioScope(specPath),
  ];
}
