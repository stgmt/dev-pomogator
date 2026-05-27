/**
 * Types for Steps Validator
 *
 * Defines core interfaces and types used across the validator.
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Supported programming languages for step definitions
 */
export type Language = "typescript" | "python" | "csharp";

/**
 * BDD step types (Gherkin keywords)
 */
export type StepType = "Given" | "When" | "Then" | "And" | "But";

/**
 * Quality status for analyzed steps
 */
export type QualityStatus = "GOOD" | "WARNING" | "BAD";

// ============================================================================
// STEP DEFINITION INTERFACES
// ============================================================================

/**
 * Parsed step definition from source code
 */
export interface StepDefinition {
  /** Step type (Given/When/Then/And/But) */
  type: StepType;

  /** Step pattern (regex or string in quotes) */
  pattern: string;

  /** Absolute path to source file */
  file: string;

  /** Line number in source file (1-based) */
  line: number;

  /** Function/method name */
  functionName: string;

  /** Function/method body content */
  body: string;
}

/**
 * Step definition with quality analysis results
 */
export interface AnalyzedStep extends StepDefinition {
  /** Quality analysis results */
  quality: StepQuality;
}

/**
 * Quality analysis details for a step
 */
export interface StepQuality {
  /** Overall quality status */
  status: QualityStatus;

  /** Whether step contains assertions */
  hasAssertion: boolean;

  /** Whether step body is empty */
  isEmpty: boolean;

  /** Whether step is marked as pending (not implemented) */
  isPending: boolean;

  /** Whether step contains only logging (Console.log, print, etc.) */
  hasOnlyLogging: boolean;

  /** Whether step contains TODO/FIXME comments */
  hasTodo: boolean;

  /** List of specific issues found */
  issues: string[];
}

// ============================================================================
// VALIDATION RESULT INTERFACES
// ============================================================================

/**
 * Complete validation result for a project
 */
export interface ValidationResult {
  /** Detected language */
  language: Language;

  /** Total number of steps analyzed */
  totalSteps: number;

  /** All analyzed steps */
  steps: AnalyzedStep[];

  /** Summary counts by status */
  summary: {
    good: number;
    warning: number;
    bad: number;
  };

  /** Files analyzed */
  filesAnalyzed: string[];

  /** Timestamp of validation */
  timestamp: string;
}

// ============================================================================
// CONFIGURATION INTERFACES
// ============================================================================

/**
 * Validator configuration from .steps-validator.yaml
 */
export interface ValidatorConfig {
  /** Enable/disable validation */
  enabled: boolean;

  /** Paths to search for step definition files, by language */
  stepPaths: Record<Language, string[]>;

  /** Custom assertion patterns to recognize, by language */
  customAssertions: Record<Language, string[]>;

  /** File patterns to ignore */
  ignore: string[];

  /** Behavior when bad steps are found */
  onBadSteps: "warn" | "error" | "ignore";

  /** Strictness level per step type */
  strictness: Record<StepType, "high" | "low" | "inherit">;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: ValidatorConfig = {
  enabled: true,
  stepPaths: {
    typescript: ["**/*.steps.ts", "**/steps/**/*.ts"],
    python: ["**/*_steps.py", "**/steps/**/*.py"],
    csharp: ["**/*Steps.cs", "**/Steps/**/*.cs", "**/StepDefinitions/**/*.cs"],
  },
  customAssertions: {
    typescript: [],
    python: [],
    csharp: [],
  },
  ignore: ["**/node_modules/**", "**/obj/**", "**/bin/**", "**/.git/**"],
  onBadSteps: "warn",
  strictness: {
    Given: "low",
    When: "low",
    Then: "high", // Then MUST have assertions
    And: "inherit",
    But: "inherit",
  },
};

// ============================================================================
// PARSER INTERFACE
// ============================================================================

/**
 * Parser interface for language-specific step definition parsing
 */
export interface Parser {
  /**
   * Find all step definition files in the project
   */
  findStepFiles(root: string): Promise<string[]>;

  /**
   * Parse all step definition files
   */
  parseAll(root: string): Promise<StepDefinition[]>;

  /**
   * Parse a single file
   */
  parseFile(filePath: string): Promise<StepDefinition[]>;
}
