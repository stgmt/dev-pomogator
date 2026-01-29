#!/usr/bin/env npx tsx
/**
 * Steps Validator - Entry Point
 *
 * Hook script for Cursor/Claude Stop event.
 * Validates step definitions quality in BDD projects.
 *
 * Usage:
 *   npx tsx validate-steps.ts
 *
 * Input (stdin): JSON with workspaceRoots
 * Output (stdout): Warnings about bad steps
 * Output (file): steps-validation-report.md
 */

import { loadConfig, isEnabled } from "./config";
import { detectLanguage, hasStepDefinitions } from "./detector";
import { getParser } from "./parsers";
import { analyzeSteps } from "./analyzer";
import { generateReport, printWarnings, printSuccess } from "./reporter";
import { logError, logInfo } from "./logger";
import type { ValidationResult } from "./types";

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  try {
    // CLI argument takes priority
    const cliPath = process.argv[2];
    
    // Read stdin for hook input
    const input = cliPath ? null : await readStdin();
    const workspaceRoots = cliPath ? [cliPath] : (input?.workspaceRoots || [process.cwd()]);

    await logInfo(`Starting validation for ${workspaceRoots.length} workspace(s)`);

    for (const root of workspaceRoots) {
      await validateProject(root);
    }
  } catch (error) {
    await logError(error);
    // Exit 0 to not block user
    process.exit(0);
  }
}

/**
 * Read JSON input from stdin (non-blocking)
 */
async function readStdin(): Promise<{ workspaceRoots?: string[] } | null> {
  // Check if stdin has data
  if (process.stdin.isTTY) {
    return null;
  }

  try {
    const chunks: Buffer[] = [];

    // Set a short timeout for stdin reading
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 100);
    });

    const readPromise = new Promise<{ workspaceRoots?: string[] } | null>(
      (resolve) => {
        process.stdin.on("data", (chunk) => chunks.push(chunk));
        process.stdin.on("end", () => {
          if (chunks.length === 0) {
            resolve(null);
            return;
          }
          try {
            const data = Buffer.concat(chunks).toString("utf-8");
            resolve(JSON.parse(data));
          } catch {
            resolve(null);
          }
        });
        process.stdin.on("error", () => resolve(null));
      }
    );

    return await Promise.race([readPromise, timeoutPromise]);
  } catch {
    return null;
  }
}

/**
 * Validate a single project/workspace
 */
async function validateProject(root: string): Promise<void> {
  await logInfo(`Validating project: ${root}`);

  // 1. Load configuration
  const config = await loadConfig(root);

  // 2. Check if enabled
  if (!isEnabled(config)) {
    await logInfo("Validation disabled in config");
    return;
  }

  // 3. Detect language
  const language = await detectLanguage(root, config);

  if (!language) {
    await logInfo("No step definitions found, skipping");
    return;
  }

  await logInfo(`Detected language: ${language}`);

  // 4. Parse steps
  const parser = getParser(language, config);
  const stepFiles = await parser.findStepFiles(root);

  if (stepFiles.length === 0) {
    await logInfo("No step files found");
    return;
  }

  await logInfo(`Found ${stepFiles.length} step file(s)`);

  const steps = await parser.parseAll(root);

  if (steps.length === 0) {
    await logInfo("No step definitions parsed");
    return;
  }

  await logInfo(`Parsed ${steps.length} step(s)`);

  // 5. Analyze quality
  const result = analyzeSteps(steps, language, config, stepFiles);

  // 6. Generate report
  const reportPath = await generateReport(root, result);
  await logInfo(`Report generated: ${reportPath}`);

  // 7. Print warnings or success
  if (result.summary.bad > 0) {
    printWarnings(result);
  } else {
    printSuccess(result);
  }

  // 8. Handle on_bad_steps behavior
  if (config.onBadSteps === "error" && result.summary.bad > 0) {
    process.exit(1);
  }
}

// Run main
main().catch(async (error) => {
  await logError(error);
  process.exit(0);
});
