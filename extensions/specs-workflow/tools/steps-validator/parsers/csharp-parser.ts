/**
 * C# (Reqnroll/SpecFlow) Step Definition Parser
 *
 * Парсит step definitions из C# файлов:
 * - [Given(@"pattern")] / [When(@"pattern")] / [Then(@"pattern")]
 * - [StepDefinition(@"pattern")] - универсальный атрибут
 * - [And(@"pattern")] / [But(@"pattern")]
 *
 * Основано на анализе реального проекта: ZohoIntegrationClient.Tests
 */

import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";
import type { StepDefinition, StepType, ValidatorConfig } from "../types";

// ============================================================================
// REGEX PATTERNS - Based on real ZohoIntegrationClient.Tests analysis
// ============================================================================

/**
 * Pattern to match C# step definition attributes
 * Matches: [Given(@"...")], [When(@"...")], [Then(@"...")], [StepDefinition(@"...")]
 * Also: [And(@"...")], [But(@"...")]
 */
const STEP_ATTRIBUTE_PATTERN =
  /\[(Given|When|Then|And|But|StepDefinition)\s*\(\s*@?"((?:[^"\\]|\\.)*)"\s*\)\]/g;

/**
 * Pattern to extract method signature after step attribute
 * Matches: public void MethodName(...) or public async Task MethodName(...)
 */
const METHOD_SIGNATURE_PATTERN =
  /\]\s*(?:public\s+)?(?:async\s+)?(?:Task|void)\s+(\w+)\s*\([^)]*\)/;

// ============================================================================
// ASSERTION PATTERNS - What makes a step "GOOD"
// ============================================================================

export const CSHARP_ASSERTION_PATTERNS: RegExp[] = [
  // xUnit Assert.*
  /\bAssert\.(Equal|True|False|NotNull|Null|NotEmpty|Empty|Contains|DoesNotContain|StartsWith|EndsWith|Same|NotSame|Throws|ThrowsAsync|All|Collection|Single|InRange|NotInRange|Matches|IsType|IsNotType|IsAssignableFrom)\s*[<(]/,

  // FluentAssertions .Should()
  /\.Should\(\)\./,
  /\.Should\(\)/,
  /Should\.(Be|NotBe|BeEquivalentTo|Contain|NotContain|HaveCount|BeEmpty|NotBeEmpty|BeNull|NotBeNull|Throw|Match|StartWith|EndWith|HaveLength)/,

  // NUnit Assert.*
  /\bAssert\.(That|AreEqual|AreNotEqual|IsTrue|IsFalse|IsNull|IsNotNull|IsEmpty|IsNotEmpty|Throws|DoesNotThrow|Greater|Less|Positive|Negative|Zero)\s*\(/,

  // MSTest Assert.*
  /\bAssert\.(AreEqual|AreNotEqual|IsTrue|IsFalse|IsNull|IsNotNull|ThrowsException|ThrowsExceptionAsync)\s*[<(]/,

  // throw InvalidOperationException with check (common pattern in zoho tests)
  /if\s*\([^)]+\)\s*\{?\s*throw\s+new\s+(InvalidOperationException|ArgumentException|ArgumentNullException)\s*\(/,

  // Direct throw with condition check (validated assertion)
  /throw\s+new\s+InvalidOperationException\s*\(\s*\$?"[^"]*NOT FOUND/i,
  /throw\s+new\s+InvalidOperationException\s*\(\s*\$?"[^"]*mismatch/i,
  /throw\s+new\s+InvalidOperationException\s*\(\s*\$?"[^"]*should/i,
];

// ============================================================================
// BAD PATTERNS - What makes a step "BAD"
// ============================================================================

export const CSHARP_BAD_PATTERNS: RegExp[] = [
  // Pending step exceptions (Reqnroll/SpecFlow)
  /throw\s+new\s+PendingStepException\s*\(/,
  /ScenarioContext\.Pending\s*\(\s*\)/,
  /ScenarioContext\.StepIsPending\s*\(\s*\)/,

  // Not implemented
  /throw\s+new\s+NotImplementedException\s*\(/,
  /throw\s+new\s+NotSupportedException\s*\(/,

  // Empty body or just braces
  /^\s*\{\s*\}\s*$/m,

  // Only return without value
  /^\s*return\s*;\s*$/m,

  // Skip without assertion (just return in Then)
  /^\s*return\s+Task\.CompletedTask\s*;\s*$/m,
];

// ============================================================================
// WARNING PATTERNS - Potentially problematic
// ============================================================================

export const CSHARP_WARNING_PATTERNS: RegExp[] = [
  // Console output without assertion (like in LoggingAssertionSteps)
  /Console\.(WriteLine|Write)\s*\(/,
  /Debug\.(WriteLine|Write|Print)\s*\(/,

  // Logger calls without assertion
  /_logger\.(Log|LogInformation|LogDebug|LogWarning|LogError|LogTrace)\s*\(/,
  /\bLog(Information|Debug|Warning|Error|Trace)\s*\(/,

  // TODO/FIXME comments
  /\/\/\s*(TODO|FIXME|HACK|XXX|BUG)\b/i,
  /\/\*\s*(TODO|FIXME|HACK|XXX|BUG)\b/i,

  // STUBBED/SKIPPED comments (found in SmartApiAssertionSteps)
  /\/\/.*STUBBED/i,
  /\/\/.*SKIPPED/i,
  /Console\.WriteLine.*STUBBED/i,
  /Console\.WriteLine.*SKIP/i,

  // Early return without check
  /if\s*\([^)]+\)\s*\{?\s*return\s*;/,
];

// ============================================================================
// PARSER CLASS
// ============================================================================

export class CSharpParser {
  private config: ValidatorConfig;

  constructor(config: ValidatorConfig) {
    this.config = config;
  }

  /**
   * Find all C# step definition files in the project
   */
  async findStepFiles(root: string): Promise<string[]> {
    const patterns = this.config.stepPaths?.csharp || [
      "**/*Steps.cs",
      "**/Steps/**/*.cs",
      "**/StepDefinitions/**/*.cs",
    ];

    const ignorePatterns = this.config.ignore || [
      "**/obj/**",
      "**/bin/**",
      "**/node_modules/**",
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

    // Deduplicate
    return [...new Set(allFiles)];
  }

  /**
   * Parse all step definition files in the project
   */
  async parseAll(root: string): Promise<StepDefinition[]> {
    const files = await this.findStepFiles(root);
    const allSteps: StepDefinition[] = [];

    for (const file of files) {
      try {
        const steps = await this.parseFile(file);
        allSteps.push(...steps);
      } catch (error) {
        // Log error but continue parsing other files
        console.error(`[CSharpParser] Error parsing ${file}:`, error);
      }
    }

    return allSteps;
  }

  /**
   * Parse a single C# file and extract step definitions
   */
  async parseFile(filePath: string): Promise<StepDefinition[]> {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");
    const steps: StepDefinition[] = [];

    // Reset regex lastIndex for global patterns
    STEP_ATTRIBUTE_PATTERN.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = STEP_ATTRIBUTE_PATTERN.exec(content)) !== null) {
      const stepType = this.normalizeStepType(match[1]);
      const pattern = match[2];
      const matchIndex = match.index;
      const lineNumber = this.getLineNumber(content, matchIndex);

      // Find method name
      const afterAttribute = content.slice(matchIndex);
      const methodMatch = afterAttribute.match(METHOD_SIGNATURE_PATTERN);
      const methodName = methodMatch ? methodMatch[1] : "UnknownMethod";

      // Extract method body
      const body = this.extractMethodBody(content, matchIndex);

      steps.push({
        type: stepType,
        pattern: pattern,
        file: filePath,
        line: lineNumber,
        functionName: methodName,
        body: body,
      });
    }

    return steps;
  }

  /**
   * Normalize step type (StepDefinition -> based on pattern, or keep original)
   */
  private normalizeStepType(rawType: string): StepType {
    const typeMap: Record<string, StepType> = {
      Given: "Given",
      When: "When",
      Then: "Then",
      And: "And",
      But: "But",
      StepDefinition: "Given", // StepDefinition is universal, treat as Given for analysis
    };

    return typeMap[rawType] || "Given";
  }

  /**
   * Get line number for a given character index
   */
  private getLineNumber(content: string, index: number): number {
    const upToIndex = content.slice(0, index);
    return upToIndex.split("\n").length;
  }

  /**
   * Extract method body from content starting at attribute position
   * Handles nested braces correctly
   */
  private extractMethodBody(content: string, attributeIndex: number): string {
    const afterAttribute = content.slice(attributeIndex);

    // Find opening brace of method body
    const openBraceIndex = afterAttribute.indexOf("{");
    if (openBraceIndex === -1) return "";

    // Track brace depth to find matching closing brace
    let depth = 0;
    let bodyStart = openBraceIndex;
    let bodyEnd = openBraceIndex;

    for (let i = openBraceIndex; i < afterAttribute.length; i++) {
      const char = afterAttribute[i];

      if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
        if (depth === 0) {
          bodyEnd = i;
          break;
        }
      }
    }

    // Extract body content (without outer braces)
    const body = afterAttribute.slice(bodyStart + 1, bodyEnd).trim();
    return body;
  }
}

// ============================================================================
// ANALYSIS HELPERS
// ============================================================================

/**
 * Check if step body contains assertions
 */
export function hasAssertion(
  body: string,
  customPatterns: string[] = []
): boolean {
  const allPatterns = [
    ...CSHARP_ASSERTION_PATTERNS,
    ...customPatterns.map((p) => new RegExp(p)),
  ];

  return allPatterns.some((pattern) => pattern.test(body));
}

/**
 * Check if step body contains only bad patterns (no assertions)
 */
export function hasBadPattern(body: string): boolean {
  return CSHARP_BAD_PATTERNS.some((pattern) => pattern.test(body));
}

/**
 * Check if step body contains warning patterns
 */
export function hasWarningPattern(body: string): boolean {
  return CSHARP_WARNING_PATTERNS.some((pattern) => pattern.test(body));
}

/**
 * Check if step body is effectively empty
 */
export function isEmptyBody(body: string): boolean {
  const trimmed = body.trim();

  // Empty or just whitespace
  if (trimmed === "") return true;

  // Only comments
  if (/^(\/\/[^\n]*\n?|\s*)+$/.test(trimmed)) return true;

  // Only return statement
  if (/^return\s*(Task\.CompletedTask)?;?\s*$/.test(trimmed)) return true;

  return false;
}

/**
 * Check if step contains TODO/FIXME comments
 */
export function hasTodoComment(body: string): boolean {
  return /\/\/\s*(TODO|FIXME|HACK|XXX)\b/i.test(body);
}

/**
 * Check if step is marked as pending
 */
export function isPendingStep(body: string): boolean {
  return (
    /PendingStepException/.test(body) ||
    /ScenarioContext\.(Pending|StepIsPending)/.test(body) ||
    /NotImplementedException/.test(body)
  );
}

/**
 * Check if step contains only logging (Console.WriteLine) without assertions
 */
export function hasOnlyLogging(body: string): boolean {
  const hasLogging = /Console\.(WriteLine|Write)\s*\(/.test(body);
  const hasAssertions = hasAssertion(body);

  return hasLogging && !hasAssertions;
}

export default CSharpParser;
