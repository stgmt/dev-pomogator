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
import { glob } from "glob";
import type { StepDefinition, StepType, ValidatorConfig } from "../types";

// ============================================================================
// REGEX PATTERNS - Based on real ZohoIntegrationClient.Tests analysis
// ============================================================================

/**
 * Pattern to match C# step definition attributes
 * Matches: [Given(@"...")], [When(@"...")], [Then(@"...")], [StepDefinition(@"...")]
 * Also: [And(@"...")], [But(@"...")]
 * Supports both regular strings ("...") and verbatim strings (@"...")
 * In verbatim strings, "" represents an escaped quote
 */
const STEP_ATTRIBUTE_PATTERN =
  /\[(Given|When|Then|And|But|StepDefinition)\s*\(\s*@?"((?:[^"\\]|\\.|"")*)"\s*\)\]/g;

/**
 * Pattern to extract method signature after step attribute
 * Matches: public void MethodName(...) or public async Task MethodName(...)
 * Now captures the entire signature up to the opening brace
 */
const METHOD_SIGNATURE_WITH_BODY_PATTERN =
  /\]\s*(?:public\s+)?(?:async\s+)?(?:Task|void)\s+(\w+)\s*\([^)]*\)\s*\{/;

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

  // Conditional throw patterns (common assertion pattern in zoho tests)
  // Pattern 1: if (...) { ... throw ... } - throw anywhere inside if block
  /if\s*\([^)]+\)\s*\{[\s\S]*?throw\s+new\s+(InvalidOperationException|ArgumentException|ArgumentNullException)/,
  
  // Pattern 2: if (...) throw ... (single line without braces)
  /if\s*\([^)]+\)\s+throw\s+new\s+(InvalidOperationException|ArgumentException)/,

  // Pattern 3: Any throw InvalidOperationException/ArgumentException = conditional assertion
  // If method throws these exceptions, it's validating something
  /throw\s+new\s+InvalidOperationException\s*\(/,
  /throw\s+new\s+ArgumentException\s*\(/,
  /throw\s+new\s+ArgumentNullException\s*\(/,

  // Method delegation pattern - calls another Then/Assert/Verify method
  // e.g., ThenResultContainsItems(count), AssertValidResponse(), VerifyData()
  /\b(Then|Assert|Verify|Check|Validate)\w+\s*\([^)]*\)\s*;/,

  // Playwright assertions (implicit - throws on failure)
  /\.WaitFor(URL|Selector|Function|LoadState)Async\s*\(/,
  /\.Expect\w*Async\s*\(/,
  /await\s+Expect\s*\(/,
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
// WARNING PATTERNS - Potentially problematic (независимо от assertions)
// ============================================================================

export const CSHARP_WARNING_PATTERNS: RegExp[] = [
  // TODO/FIXME comments - всегда warning
  /\/\/\s*(TODO|FIXME|HACK|XXX|BUG)\b/i,
  /\/\*\s*(TODO|FIXME|HACK|XXX|BUG)\b/i,

  // STUBBED/SKIPPED в коде - указывает на заглушку
  /\/\/.*STUBBED/i,
  /\/\/.*SKIPPED/i,
  /Console\.WriteLine.*STUBBED/i,
  /Console\.WriteLine.*SKIP/i,
];

// ============================================================================
// LOGGING PATTERNS - Только для определения "hasOnlyLogging"
// Console.WriteLine сам по себе НЕ плохой!
// BAD только если: Then + ТОЛЬКО логи + НЕТ assertions
// ============================================================================

export const CSHARP_LOGGING_PATTERNS: RegExp[] = [
  /Console\.(WriteLine|Write)\s*\(/,
  /Debug\.(WriteLine|Write|Print)\s*\(/,
  /_logger\.(Log|LogInformation|LogDebug|LogWarning|LogError|LogTrace)\s*\(/,
  /\bLog(Information|Debug|Warning|Error|Trace)\s*\(/,
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
    const steps: StepDefinition[] = [];

    // Reset regex lastIndex for global patterns
    STEP_ATTRIBUTE_PATTERN.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = STEP_ATTRIBUTE_PATTERN.exec(content)) !== null) {
      const rawType = match[1];
      const pattern = match[2];
      const matchIndex = match.index;
      const lineNumber = this.getLineNumber(content, matchIndex);

      // Find method signature and body opening brace
      const afterAttribute = content.slice(matchIndex);
      const methodMatch = afterAttribute.match(METHOD_SIGNATURE_WITH_BODY_PATTERN);
      
      if (!methodMatch) {
        // Skip if can't find method signature
        continue;
      }
      
      const methodName = methodMatch[1];
      
      // Normalize step type - for StepDefinition, infer from method name
      const stepType = this.normalizeStepType(rawType, methodName);
      
      // Find opening brace position (it's at the end of the matched pattern)
      const openBraceOffset = matchIndex + methodMatch.index! + methodMatch[0].length - 1;
      
      // Extract method body starting from the opening brace
      const body = this.extractMethodBody(content, openBraceOffset);

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
   * Normalize step type (StepDefinition -> based on method name, or keep original)
   * For [StepDefinition] attribute, infer type from method name prefix (Then*, When*, Given*)
   */
  private normalizeStepType(rawType: string, methodName?: string): StepType {
    // For StepDefinition, infer type from method name
    if (rawType === "StepDefinition" && methodName) {
      if (methodName.startsWith("Then")) return "Then";
      if (methodName.startsWith("When")) return "When";
      if (methodName.startsWith("Given")) return "Given";
      // Default to Given if method name doesn't have standard prefix
      return "Given";
    }

    const typeMap: Record<string, StepType> = {
      Given: "Given",
      When: "When",
      Then: "Then",
      And: "And",
      But: "But",
      StepDefinition: "Given", // Fallback if no method name
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
   * Extract method body from content starting at the opening brace position
   * 
   * FIXED: Now starts from the opening brace of the method body,
   * not from the attribute (which may contain {string} placeholders)
   */
  private extractMethodBody(content: string, openBraceIndex: number): string {
    // Track brace depth to find matching closing brace
    let depth = 0;
    let bodyEnd = openBraceIndex;

    for (let i = openBraceIndex; i < content.length; i++) {
      const char = content[i];

      // Skip string literals to avoid counting braces inside strings
      if (char === '"') {
        // Check for verbatim string @"..."
        if (i > 0 && content[i - 1] === "@") {
          // Find end of verbatim string (handle "" escape)
          i++;
          while (i < content.length) {
            if (content[i] === '"') {
              if (content[i + 1] === '"') {
                i++; // Skip escaped quote
              } else {
                break;
              }
            }
            i++;
          }
          continue;
        }
        // Regular string - find end
        i++;
        while (i < content.length && content[i] !== '"') {
          if (content[i] === "\\") i++; // Skip escape
          i++;
        }
        continue;
      }

      // Skip char literals
      if (char === "'") {
        i++;
        if (content[i] === "\\") i++;
        i++; // closing quote
        continue;
      }

      // Skip single-line comments
      if (char === "/" && content[i + 1] === "/") {
        while (i < content.length && content[i] !== "\n") i++;
        continue;
      }

      // Skip multi-line comments
      if (char === "/" && content[i + 1] === "*") {
        i += 2;
        while (i < content.length && !(content[i] === "*" && content[i + 1] === "/")) {
          i++;
        }
        i++; // skip closing */
        continue;
      }

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
    const body = content.slice(openBraceIndex + 1, bodyEnd).trim();
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
 * Check if step body contains warning patterns (TODO, FIXME, STUBBED, etc.)
 */
export function hasWarningPattern(body: string): boolean {
  return CSHARP_WARNING_PATTERNS.some((pattern) => pattern.test(body));
}

/**
 * Check if step body contains logging calls
 */
export function hasLogging(body: string): boolean {
  return CSHARP_LOGGING_PATTERNS.some((pattern) => pattern.test(body));
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
 *
 * ВАЖНО: Console.WriteLine сам по себе НЕ плохой!
 * BAD только если:
 *   1. Это Then step (проверка)
 *   2. Есть Console.WriteLine/Debug.Write/etc
 *   3. НЕТ assertions (Assert.*, throw check, .Should())
 *
 * Примеры:
 *   - Console.WriteLine + Assert.Equal → GOOD (лог + assertion)
 *   - Console.WriteLine только → BAD для Then
 *   - Console.WriteLine только → OK для Given/When (не обязаны проверять)
 */
export function hasOnlyLogging(body: string): boolean {
  // Проверяем есть ли логирование
  const hasLoggingCall = CSHARP_LOGGING_PATTERNS.some((p) => p.test(body));
  if (!hasLoggingCall) return false;

  // Проверяем есть ли assertions
  const hasAssertionCall = hasAssertion(body);

  // "Only logging" = есть логи И нет assertions
  return hasLoggingCall && !hasAssertionCall;
}

export default CSharpParser;
