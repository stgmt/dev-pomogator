/**
 * Reporter
 * 
 * Generates validation-report.md and stdout warnings
 */

import fs from 'fs';
import path from 'path';
import type { MatchResult, MatchSummary } from './matcher';
import { calculateSummary, filterByStatus } from './matcher';

/**
 * Options for report generation
 */
export interface ReportOptions {
  /** Absolute path to the spec directory */
  specPath: string;
  /** Name of the spec */
  specName: string;
  /** Match results */
  results: MatchResult[];
}

/**
 * Generate validation-report.md in the spec directory
 */
export function generateReport(options: ReportOptions): void {
  const { specPath, specName, results } = options;
  const summary = calculateSummary(results);
  
  const reportPath = path.join(specPath, 'validation-report.md');
  const content = buildReportContent(specName, results, summary);
  
  try {
    fs.writeFileSync(reportPath, content, 'utf-8');
  } catch (err) {
    // Log error but don't throw
    console.error(`[specs-validator] Failed to write report: ${err}`);
  }
}

/**
 * Build the markdown content for the report
 */
function buildReportContent(
  specName: string,
  results: MatchResult[],
  summary: MatchSummary
): string {
  const timestamp = new Date().toISOString();
  const lines: string[] = [];

  // Header
  lines.push('# Specs Validation Report');
  lines.push('');
  lines.push(`Feature: ${specName}`);
  lines.push(`Generated: ${timestamp}`);
  lines.push('');

  // Coverage Summary Table
  lines.push('## Coverage Summary');
  lines.push('');
  lines.push('| @featureN | MD Source | .feature | Status |');
  lines.push('|-----------|-----------|----------|--------|');
  
  for (const result of results) {
    const mdSource = result.mdSource 
      ? `${result.mdSource.source}` 
      : '-';
    const featureSource = result.featureSource 
      ? `Scenario: ${result.featureSource.scenario.substring(0, 30)}` 
      : '-';
    lines.push(`| ${result.tag} | ${mdSource} | ${featureSource} | ${result.status} |`);
  }
  
  lines.push('');
  lines.push(`Total: ${summary.total} tags, ${summary.covered} covered, ${summary.notCovered} uncovered, ${summary.orphan} orphan`);
  lines.push('');

  // NOT_COVERED section
  const notCovered = filterByStatus(results, 'NOT_COVERED');
  if (notCovered.length > 0) {
    lines.push('## NOT_COVERED (требования без сценариев)');
    lines.push('');
    
    for (const result of notCovered) {
      lines.push(`### ${result.tag}`);
      if (result.mdSource) {
        lines.push(`- Source: ${result.mdSource.file}:${result.mdSource.line} \`${result.mdSource.source}: ${result.mdSource.text}\``);
      }
      lines.push(`- Missing: No Scenario with \`# ${result.tag}\` in .feature file`);
      lines.push(`- Action: Add \`# ${result.tag}\` before corresponding Scenario`);
      lines.push('');
    }
  }

  // ORPHAN section
  const orphan = filterByStatus(results, 'ORPHAN');
  if (orphan.length > 0) {
    lines.push('## ORPHAN (сценарии без требований)');
    lines.push('');
    
    for (const result of orphan) {
      lines.push(`### ${result.tag}`);
      if (result.featureSource) {
        lines.push(`- Source: ${result.featureSource.file}:${result.featureSource.line} \`# ${result.tag}\``);
        lines.push(`- Scenario: ${result.featureSource.scenario}`);
      }
      lines.push(`- Missing: No FR/AC/UC with \`${result.tag}\` in MD files`);
      lines.push(`- Action: Add \`${result.tag}\` to corresponding requirement in FR.md or ACCEPTANCE_CRITERIA.md`);
      lines.push('');
    }
  }

  // COVERED section
  const covered = filterByStatus(results, 'COVERED');
  if (covered.length > 0) {
    lines.push('## COVERED (полностью связанные)');
    lines.push('');
    
    for (const result of covered) {
      const mdPart = result.mdSource ? result.mdSource.source : '?';
      const featurePart = result.featureSource ? result.featureSource.scenario : '?';
      lines.push(`- ${result.tag}: ${mdPart} ↔ Scenario: ${featurePart}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Print warnings to stdout for NOT_COVERED and ORPHAN tags
 */
export function printWarnings(results: MatchResult[]): void {
  const notCovered = filterByStatus(results, 'NOT_COVERED');
  const orphan = filterByStatus(results, 'ORPHAN');

  // Only print if there are issues
  if (notCovered.length === 0 && orphan.length === 0) {
    return;
  }

  console.log('');
  console.log('[specs-validator] Обнаружены проблемы покрытия:');

  for (const result of notCovered) {
    const source = result.mdSource 
      ? `${result.mdSource.file}:${result.mdSource.line}` 
      : 'unknown';
    console.log(`  ⚠️  NOT_COVERED: ${result.tag} в ${source} не имеет Scenario`);
  }

  for (const result of orphan) {
    const source = result.featureSource 
      ? `${result.featureSource.file}:${result.featureSource.line}` 
      : 'unknown';
    console.log(`  ⚠️  ORPHAN: ${result.tag} в ${source} не имеет требования`);
  }

  console.log('');
}
