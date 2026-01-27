/**
 * TypeScript Step Definition Parser
 *
 * Parses step definitions from TypeScript files:
 * - Cucumber.js: Given('pattern', async function() { ... })
 * - Playwright BDD: Given('pattern', async ({ page }) => { ... })
 */

import * as fs from "fs/promises";
import { glob } from "glob";
import type { StepDefinition, StepType, ValidatorConfig, Parser } from "../types";

// ============================================================================
// REGEX PATTERNS
// ============================================================================

/**
 * Pattern to match TypeScript step definitions
 * Matches: Given('...', ...), When('...', ...), Then('...', ...)
 */
const STEP_PATTERN =
  /(Given|When|Then|And|But)\s*\(\s*(['"`])(.+?)\2\s*,/g;

/**
 * Pattern to extract function body
 */
const FUNCTION_START_PATTERN =
  /(?:async\s+)?(?:function\s*\([^)]*\)|(?:\([^)]*\)|[^=]+)\s*=>)\s*\{/;

// ============================================================================
// PARSER CLASS
// ============================================================================

export class TypeScriptParser implements Parser {
  private config: ValidatorConfig;

  constructor(config: ValidatorConfig) {
    this.config = config;
  }

  /**
   * Find all TypeScript step definition files
   */
  async findStepFiles(root: string): Promise<string[]> {
    const patterns = this.config.stepPaths?.typescript || [
      "**/*.steps.ts",
      "**/steps/**/*.ts",
    ];

    const ignorePatterns = this.config.ignore || [
      "**/node_modules/**",
      "**/dist/**",
      "**/*.d.ts",
    ];

    const allFiles: string[] = [];

    for (const pattern of patterns) {
      const files = await glob(pattern, {
        cwd: root,
        ignore: ignorePatterns,
        absolute: true,
      });
      allFiles.push(...files);
    }

    return [...new Set(allFiles)];
  }

  /**
   * Parse all step definition files
   */
  async parseAll(root: string): Promise<StepDefinition[]> {
    const files = await this.findStepFiles(root);
    const allSteps: StepDefinition[] = [];

    for (const file of files) {
      try {
        const steps = await this.parseFile(file);
        allSteps.push(...steps);
      } catch (error) {
        console.error(`[TypeScriptParser] Error parsing ${file}:`, error);
      }
    }

    return allSteps;
  }

  /**
   * Parse a single TypeScript file
   */
  async parseFile(filePath: string): Promise<StepDefinition[]> {
    const content = await fs.readFile(filePath, "utf-8");
    const steps: StepDefinition[] = [];

    STEP_PATTERN.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = STEP_PATTERN.exec(content)) !== null) {
      const stepType = match[1] as StepType;
      const pattern = match[3];
      const matchIndex = match.index;
      const lineNumber = this.getLineNumber(content, matchIndex);

      // Extract function body
      const body = this.extractFunctionBody(content, matchIndex + match[0].length);

      steps.push({
        type: stepType,
        pattern: pattern,
        file: filePath,
        line: lineNumber,
        functionName: `${stepType}_${lineNumber}`,
        body: body,
      });
    }

    return steps;
  }

  /**
   * Get line number for character index
   */
  private getLineNumber(content: string, index: number): number {
    return content.slice(0, index).split("\n").length;
  }

  /**
   * Extract function body from content
   */
  private extractFunctionBody(content: string, startIndex: number): string {
    const remaining = content.slice(startIndex);

    // Find the opening brace of the function
    const funcMatch = remaining.match(FUNCTION_START_PATTERN);
    if (!funcMatch) return "";

    const braceStart = remaining.indexOf("{", funcMatch.index);
    if (braceStart === -1) return "";

    // Track brace depth
    let depth = 0;
    let bodyEnd = braceStart;

    for (let i = braceStart; i < remaining.length; i++) {
      const char = remaining[i];
      if (char === "{") depth++;
      else if (char === "}") {
        depth--;
        if (depth === 0) {
          bodyEnd = i;
          break;
        }
      }
    }

    return remaining.slice(braceStart + 1, bodyEnd).trim();
  }
}

export default TypeScriptParser;
