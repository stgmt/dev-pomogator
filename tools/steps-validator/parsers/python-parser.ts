/**
 * Python Step Definition Parser
 *
 * Parses step definitions from Python files:
 * - Behave: @given('pattern') def step_name(context): ...
 * - pytest-bdd: @given('pattern') def step_name(): ...
 */

import * as fs from "fs/promises";
import { glob } from "glob";
import type { StepDefinition, StepType, ValidatorConfig, Parser } from "../types";

// ============================================================================
// REGEX PATTERNS
// ============================================================================

/**
 * Pattern to match Python step decorators
 * Matches: @given('...'), @when('...'), @then('...'), @step('...')
 */
const DECORATOR_PATTERN =
  /@(given|when|then|step)\s*\(\s*(['"])(.+?)\2\s*\)/gi;

/**
 * Pattern to match function definition after decorator
 */
const FUNCTION_DEF_PATTERN = /def\s+(\w+)\s*\([^)]*\)\s*:/;

// ============================================================================
// PARSER CLASS
// ============================================================================

export class PythonParser implements Parser {
  private config: ValidatorConfig;

  constructor(config: ValidatorConfig) {
    this.config = config;
  }

  /**
   * Find all Python step definition files
   */
  async findStepFiles(root: string): Promise<string[]> {
    const patterns = this.config.stepPaths?.python || [
      "**/*_steps.py",
      "**/steps/**/*.py",
      "**/step_defs/**/*.py",
    ];

    const ignorePatterns = this.config.ignore || [
      "**/__pycache__/**",
      "**/venv/**",
      "**/.venv/**",
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
        console.error(`[PythonParser] Error parsing ${file}:`, error);
      }
    }

    return allSteps;
  }

  /**
   * Parse a single Python file
   */
  async parseFile(filePath: string): Promise<StepDefinition[]> {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");
    const steps: StepDefinition[] = [];

    DECORATOR_PATTERN.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = DECORATOR_PATTERN.exec(content)) !== null) {
      const rawType = match[1].toLowerCase();
      const stepType = this.normalizeStepType(rawType);
      const pattern = match[3];
      const matchIndex = match.index;
      const lineNumber = this.getLineNumber(content, matchIndex);

      // Find function name
      const afterDecorator = content.slice(matchIndex);
      const funcMatch = afterDecorator.match(FUNCTION_DEF_PATTERN);
      const functionName = funcMatch ? funcMatch[1] : "unknown";

      // Extract function body
      const body = this.extractFunctionBody(content, matchIndex);

      steps.push({
        type: stepType,
        pattern: pattern,
        file: filePath,
        line: lineNumber,
        functionName: functionName,
        body: body,
      });
    }

    return steps;
  }

  /**
   * Normalize step type
   */
  private normalizeStepType(rawType: string): StepType {
    const typeMap: Record<string, StepType> = {
      given: "Given",
      when: "When",
      then: "Then",
      step: "Given", // Generic step, treat as Given
    };
    return typeMap[rawType] || "Given";
  }

  /**
   * Get line number for character index
   */
  private getLineNumber(content: string, index: number): number {
    return content.slice(0, index).split("\n").length;
  }

  /**
   * Extract function body (Python uses indentation)
   */
  private extractFunctionBody(content: string, decoratorIndex: number): string {
    const afterDecorator = content.slice(decoratorIndex);
    const lines = afterDecorator.split("\n");

    // Find the def line
    let defLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*def\s+\w+/.test(lines[i])) {
        defLineIndex = i;
        break;
      }
    }

    if (defLineIndex === -1) return "";

    // Get base indentation of def line
    const defLine = lines[defLineIndex];
    const defIndent = defLine.match(/^(\s*)/)?.[1].length || 0;

    // Collect body lines (more indented than def)
    const bodyLines: string[] = [];
    for (let i = defLineIndex + 1; i < lines.length; i++) {
      const line = lines[i];

      // Empty lines are part of body
      if (line.trim() === "") {
        bodyLines.push(line);
        continue;
      }

      // Check indentation
      const lineIndent = line.match(/^(\s*)/)?.[1].length || 0;

      // If less or equal indentation, we've exited the function
      if (lineIndent <= defIndent) {
        break;
      }

      bodyLines.push(line);
    }

    return bodyLines.join("\n").trim();
  }
}

export default PythonParser;
