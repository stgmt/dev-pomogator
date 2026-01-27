/**
 * Step Quality Analyzer
 *
 * Analyzes parsed step definitions and determines their quality status.
 * Uses language-specific patterns from parsers.
 */

import type {
  StepDefinition,
  AnalyzedStep,
  StepQuality,
  QualityStatus,
  Language,
  ValidatorConfig,
  ValidationResult,
} from "./types";

import {
  hasAssertion as hasCSharpAssertion,
  hasBadPattern as hasCSharpBadPattern,
  hasWarningPattern as hasCSharpWarningPattern,
  hasOnlyLogging as hasCSharpOnlyLogging,
  isEmptyBody as isCSharpEmptyBody,
  hasTodoComment as hasCSharpTodoComment,
  isPendingStep as isCSharpPendingStep,
} from "./parsers/csharp-parser";

// ============================================================================
// TYPESCRIPT PATTERNS
// ============================================================================

const TS_ASSERTION_PATTERNS: RegExp[] = [
  // Jest/Vitest expect()
  /\bexpect\s*\(/,
  /\.toBe\s*\(/,
  /\.toEqual\s*\(/,
  /\.toContain\s*\(/,
  /\.toHaveText\s*\(/,
  /\.toHaveLength\s*\(/,
  /\.toBeTruthy\s*\(/,
  /\.toBeFalsy\s*\(/,
  /\.toBeNull\s*\(/,
  /\.toBeDefined\s*\(/,
  /\.toThrow\s*\(/,

  // Playwright expect
  /\.toHaveURL\s*\(/,
  /\.toBeVisible\s*\(/,
  /\.toBeEnabled\s*\(/,

  // Node assert
  /\bassert\s*\(/,
  /assert\.(equal|strictEqual|deepEqual|ok|throws)\s*\(/,

  // throw with condition
  /if\s*\([^)]+\)\s*\{?\s*throw\s+new\s+Error\s*\(/,
];

const TS_BAD_PATTERNS: RegExp[] = [
  /throw\s+new\s+Error\s*\(\s*['"]Pending/i,
  /throw\s+new\s+Error\s*\(\s*['"]Not implemented/i,
  /^\s*return\s*;?\s*$/m,
];

const TS_WARNING_PATTERNS: RegExp[] = [
  /\/\/\s*(TODO|FIXME|HACK|XXX)\b/i,
  /console\.(log|warn|error)\s*\(/,
];

const TS_LOGGING_PATTERNS: RegExp[] = [
  /console\.(log|warn|error|info|debug)\s*\(/,
];

// ============================================================================
// PYTHON PATTERNS
// ============================================================================

const PY_ASSERTION_PATTERNS: RegExp[] = [
  /\bassert\s+/,
  /pytest\.raises\s*\(/,
  /\.should\./,
  /self\.assert/,
  /self\.assertEqual/,
  /self\.assertTrue/,
  /self\.assertFalse/,
  /self\.assertIn/,
  /self\.assertRaises/,
];

const PY_BAD_PATTERNS: RegExp[] = [
  /^\s*pass\s*$/m,
  /raise\s+NotImplementedError/,
  /pytest\.skip\s*\(/,
];

const PY_WARNING_PATTERNS: RegExp[] = [
  /#\s*(TODO|FIXME|HACK|XXX)\b/i,
  /print\s*\(/,
];

const PY_LOGGING_PATTERNS: RegExp[] = [
  /print\s*\(/,
  /logging\.(info|debug|warning|error)\s*\(/,
];

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Analyze a single step definition
 */
export function analyzeStep(
  step: StepDefinition,
  language: Language,
  config: ValidatorConfig
): AnalyzedStep {
  const issues: string[] = [];

  // Get language-specific analysis
  const analysis = analyzeByLanguage(step.body, language, config);

  // Determine status based on step type and analysis
  let status: QualityStatus = "GOOD";

  // Check for empty body
  if (analysis.isEmpty) {
    status = "BAD";
    issues.push("Empty body");
  }

  // Check for pending/not implemented
  if (analysis.isPending) {
    status = "BAD";
    issues.push("Pending implementation");
  }

  // Check for bad patterns
  if (analysis.hasBadPattern && !analysis.hasAssertion) {
    status = "BAD";
    issues.push("Bad pattern detected");
  }

  // For Then steps, assertions are required
  if (step.type === "Then" || isInheritedThen(step, config)) {
    if (!analysis.hasAssertion && !analysis.isEmpty && !analysis.isPending) {
      if (analysis.hasOnlyLogging) {
        status = "BAD";
        issues.push("Only logging, no assertion");
      } else if (!analysis.hasBadPattern) {
        status = "BAD";
        issues.push("No assertion found");
      }
    }
  }

  // Check for warnings (TODO, FIXME, etc.)
  if (analysis.hasTodo) {
    if (status !== "BAD") status = "WARNING";
    issues.push("TODO/FIXME comment found");
  }

  if (analysis.hasWarningPattern && !analysis.hasTodo) {
    if (status !== "BAD") status = "WARNING";
    issues.push("Warning pattern detected");
  }

  return {
    ...step,
    quality: {
      status,
      hasAssertion: analysis.hasAssertion,
      isEmpty: analysis.isEmpty,
      isPending: analysis.isPending,
      hasOnlyLogging: analysis.hasOnlyLogging,
      hasTodo: analysis.hasTodo,
      issues,
    },
  };
}

/**
 * Check if And/But step inherits Then strictness
 */
function isInheritedThen(
  step: StepDefinition,
  config: ValidatorConfig
): boolean {
  if (step.type !== "And" && step.type !== "But") return false;

  const strictness = config.strictness?.[step.type];
  return strictness === "inherit" || strictness === "high";
}

/**
 * Analyze step body by language
 */
function analyzeByLanguage(
  body: string,
  language: Language,
  config: ValidatorConfig
): {
  hasAssertion: boolean;
  hasBadPattern: boolean;
  hasWarningPattern: boolean;
  hasOnlyLogging: boolean;
  isEmpty: boolean;
  isPending: boolean;
  hasTodo: boolean;
} {
  const customAssertions = config.customAssertions?.[language] || [];

  switch (language) {
    case "csharp":
      return {
        hasAssertion: hasCSharpAssertion(body, customAssertions),
        hasBadPattern: hasCSharpBadPattern(body),
        hasWarningPattern: hasCSharpWarningPattern(body),
        hasOnlyLogging: hasCSharpOnlyLogging(body),
        isEmpty: isCSharpEmptyBody(body),
        isPending: isCSharpPendingStep(body),
        hasTodo: hasCSharpTodoComment(body),
      };

    case "typescript":
      return analyzeTypeScript(body, customAssertions);

    case "python":
      return analyzePython(body, customAssertions);

    default:
      return {
        hasAssertion: false,
        hasBadPattern: false,
        hasWarningPattern: false,
        hasOnlyLogging: false,
        isEmpty: body.trim() === "",
        isPending: false,
        hasTodo: false,
      };
  }
}

/**
 * Analyze TypeScript step body
 */
function analyzeTypeScript(body: string, customAssertions: string[]) {
  const allAssertionPatterns = [
    ...TS_ASSERTION_PATTERNS,
    ...customAssertions.map((p) => new RegExp(p)),
  ];

  const hasAssertion = allAssertionPatterns.some((p) => p.test(body));
  const hasBadPattern = TS_BAD_PATTERNS.some((p) => p.test(body));
  const hasWarningPattern = TS_WARNING_PATTERNS.some((p) => p.test(body));
  const hasLogging = TS_LOGGING_PATTERNS.some((p) => p.test(body));
  const isEmpty =
    body.trim() === "" || /^\s*return\s*;?\s*$/.test(body.trim());
  const isPending = /throw\s+new\s+Error\s*\(\s*['"]Pending/i.test(body);
  const hasTodo = /\/\/\s*(TODO|FIXME|HACK|XXX)\b/i.test(body);

  return {
    hasAssertion,
    hasBadPattern,
    hasWarningPattern,
    hasOnlyLogging: hasLogging && !hasAssertion,
    isEmpty,
    isPending,
    hasTodo,
  };
}

/**
 * Analyze Python step body
 */
function analyzePython(body: string, customAssertions: string[]) {
  const allAssertionPatterns = [
    ...PY_ASSERTION_PATTERNS,
    ...customAssertions.map((p) => new RegExp(p)),
  ];

  const hasAssertion = allAssertionPatterns.some((p) => p.test(body));
  const hasBadPattern = PY_BAD_PATTERNS.some((p) => p.test(body));
  const hasWarningPattern = PY_WARNING_PATTERNS.some((p) => p.test(body));
  const hasLogging = PY_LOGGING_PATTERNS.some((p) => p.test(body));
  const isEmpty = body.trim() === "" || body.trim() === "pass";
  const isPending = /raise\s+NotImplementedError/.test(body);
  const hasTodo = /#\s*(TODO|FIXME|HACK|XXX)\b/i.test(body);

  return {
    hasAssertion,
    hasBadPattern,
    hasWarningPattern,
    hasOnlyLogging: hasLogging && !hasAssertion,
    isEmpty,
    isPending,
    hasTodo,
  };
}

/**
 * Analyze all steps and produce validation result
 */
export function analyzeSteps(
  steps: StepDefinition[],
  language: Language,
  config: ValidatorConfig,
  filesAnalyzed: string[]
): ValidationResult {
  const analyzedSteps = steps.map((step) =>
    analyzeStep(step, language, config)
  );

  const summary = {
    good: analyzedSteps.filter((s) => s.quality.status === "GOOD").length,
    warning: analyzedSteps.filter((s) => s.quality.status === "WARNING").length,
    bad: analyzedSteps.filter((s) => s.quality.status === "BAD").length,
  };

  return {
    language,
    totalSteps: analyzedSteps.length,
    steps: analyzedSteps,
    summary,
    filesAnalyzed,
    timestamp: new Date().toISOString(),
  };
}

export default analyzeSteps;
