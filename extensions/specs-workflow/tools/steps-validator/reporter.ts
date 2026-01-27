/**
 * Report Generator for Steps Validator
 *
 * Generates Markdown report and stdout warnings.
 */

import * as fs from "fs/promises";
import * as path from "path";
import type { ValidationResult, AnalyzedStep } from "./types";

const REPORT_FILENAME = "steps-validation-report.md";

/**
 * Generate Markdown report file
 */
export async function generateReport(
  root: string,
  result: ValidationResult
): Promise<string> {
  const reportPath = path.join(root, REPORT_FILENAME);

  const content = `# Steps Validation Report

Generated: ${result.timestamp}
Language: ${result.language}

## Summary

| Status | Count |
|--------|-------|
| ✅ GOOD | ${result.summary.good} |
| ⚠️ WARNING | ${result.summary.warning} |
| ❌ BAD | ${result.summary.bad} |

**Total steps analyzed:** ${result.totalSteps}
**Files analyzed:** ${result.filesAnalyzed.length}

---

${generateBadSection(result)}

${generateWarningSection(result)}

${generateGoodSection(result)}

---

## Files Analyzed

${result.filesAnalyzed.map((f) => `- \`${path.basename(f)}\``).join("\n")}
`;

  await fs.writeFile(reportPath, content, "utf-8");
  return reportPath;
}

/**
 * Generate BAD steps section
 */
function generateBadSection(result: ValidationResult): string {
  const badSteps = result.steps.filter((s) => s.quality.status === "BAD");

  if (badSteps.length === 0) {
    return "## ❌ BAD Steps\n\nNone found! 🎉\n";
  }

  const rows = badSteps.map((step) => formatStepRow(step)).join("\n");

  return `## ❌ BAD Steps (${badSteps.length})

| File | Line | Type | Pattern | Issues |
|------|------|------|---------|--------|
${rows}
`;
}

/**
 * Generate WARNING steps section
 */
function generateWarningSection(result: ValidationResult): string {
  const warningSteps = result.steps.filter(
    (s) => s.quality.status === "WARNING"
  );

  if (warningSteps.length === 0) {
    return "## ⚠️ WARNING Steps\n\nNone found.\n";
  }

  const rows = warningSteps.map((step) => formatStepRow(step)).join("\n");

  return `## ⚠️ WARNING Steps (${warningSteps.length})

| File | Line | Type | Pattern | Issues |
|------|------|------|---------|--------|
${rows}
`;
}

/**
 * Generate GOOD steps section (collapsed)
 */
function generateGoodSection(result: ValidationResult): string {
  const goodSteps = result.steps.filter((s) => s.quality.status === "GOOD");

  if (goodSteps.length === 0) {
    return "## ✅ GOOD Steps\n\nNone found.\n";
  }

  const rows = goodSteps.map((step) => formatStepRow(step, false)).join("\n");

  return `## ✅ GOOD Steps (${goodSteps.length})

<details>
<summary>Click to expand</summary>

| File | Line | Type | Pattern |
|------|------|------|---------|
${rows}

</details>
`;
}

/**
 * Format a step as table row
 */
function formatStepRow(step: AnalyzedStep, includeIssues = true): string {
  const file = path.basename(step.file);
  const pattern = escapeMarkdown(truncate(step.pattern, 50));
  const issues = step.quality.issues.join(", ");

  if (includeIssues) {
    return `| \`${file}\` | ${step.line} | ${step.type} | \`${pattern}\` | ${issues} |`;
  }
  return `| \`${file}\` | ${step.line} | ${step.type} | \`${pattern}\` |`;
}

/**
 * Escape markdown special characters
 */
function escapeMarkdown(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/`/g, "\\`");
}

/**
 * Truncate string with ellipsis
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * Print warnings to stdout
 */
export function printWarnings(result: ValidationResult): void {
  const badSteps = result.steps.filter((s) => s.quality.status === "BAD");

  if (badSteps.length === 0) return;

  console.log("");
  console.log(
    `⚠️ Steps Validation: Found ${badSteps.length} bad step(s) (Then without assertions)`
  );

  // Show first 5 bad steps
  const toShow = badSteps.slice(0, 5);
  for (const step of toShow) {
    const file = path.basename(step.file);
    console.log(`   - ${file}:${step.line} ${step.type}('${step.pattern}')`);
  }

  if (badSteps.length > 5) {
    console.log(`   ... and ${badSteps.length - 5} more`);
  }

  console.log(`See ${REPORT_FILENAME} for details.`);
  console.log("");
}

/**
 * Print success message
 */
export function printSuccess(result: ValidationResult): void {
  if (result.summary.bad === 0 && result.summary.warning === 0) {
    console.log(
      `✅ Steps Validation: All ${result.totalSteps} steps are good!`
    );
  } else if (result.summary.bad === 0) {
    console.log(
      `✅ Steps Validation: ${result.totalSteps} steps analyzed, ${result.summary.warning} warning(s)`
    );
  }
}

export default { generateReport, printWarnings, printSuccess };
