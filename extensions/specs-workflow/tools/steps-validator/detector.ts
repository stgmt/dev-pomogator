/**
 * Language Detector for Steps Validator
 *
 * Automatically detects which BDD framework/language is used in the project.
 */

import { glob } from "glob";
import type { Language, ValidatorConfig } from "./types";

/**
 * Detect the primary BDD language used in the project
 *
 * Priority:
 * 1. TypeScript (Cucumber.js, Playwright BDD)
 * 2. Python (Behave, pytest-bdd)
 * 3. C# (Reqnroll, SpecFlow)
 *
 * Returns null if no step definitions found.
 */
export async function detectLanguage(
  root: string,
  config: ValidatorConfig
): Promise<Language | null> {
  // Check TypeScript first
  const tsPatterns = config.stepPaths?.typescript || [
    "**/*.steps.ts",
    "**/steps/**/*.ts",
  ];

  for (const pattern of tsPatterns) {
    const files = await glob(pattern, {
      cwd: root,
      ignore: config.ignore,
    });
    if (files.length > 0) {
      console.log(`[Detector] Found TypeScript step files: ${files.length}`);
      return "typescript";
    }
  }

  // Check Python
  const pyPatterns = config.stepPaths?.python || [
    "**/*_steps.py",
    "**/steps/**/*.py",
  ];

  for (const pattern of pyPatterns) {
    const files = await glob(pattern, {
      cwd: root,
      ignore: config.ignore,
    });
    if (files.length > 0) {
      console.log(`[Detector] Found Python step files: ${files.length}`);
      return "python";
    }
  }

  // Check C#
  const csPatterns = config.stepPaths?.csharp || [
    "**/*Steps.cs",
    "**/Steps/**/*.cs",
    "**/StepDefinitions/**/*.cs",
  ];

  for (const pattern of csPatterns) {
    const files = await glob(pattern, {
      cwd: root,
      ignore: config.ignore,
    });
    if (files.length > 0) {
      console.log(`[Detector] Found C# step files: ${files.length}`);
      return "csharp";
    }
  }

  console.log("[Detector] No step definition files found");
  return null;
}

/**
 * Check if project has step definitions (for opt-out activation)
 */
export async function hasStepDefinitions(
  root: string,
  config: ValidatorConfig
): Promise<boolean> {
  const language = await detectLanguage(root, config);
  return language !== null;
}

export default detectLanguage;
