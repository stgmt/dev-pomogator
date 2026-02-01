/**
 * Configuration loader for Steps Validator
 *
 * Loads and merges configuration from .steps-validator.yaml
 */

import * as fs from "fs/promises";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import type { ValidatorConfig, Language, StepType } from "./types";
import { DEFAULT_CONFIG } from "./types";

const CONFIG_FILENAME = ".steps-validator.yaml";
const CONFIG_FILENAME_ALT = ".steps-validator.yml";

/**
 * Load configuration from project root
 */
export async function loadConfig(root: string): Promise<ValidatorConfig> {
  // Try both .yaml and .yml extensions
  const configPaths = [
    path.join(root, CONFIG_FILENAME),
    path.join(root, CONFIG_FILENAME_ALT),
  ];

  for (const configPath of configPaths) {
    try {
      const content = await fs.readFile(configPath, "utf-8");
      const userConfig = parseYaml(content) as Partial<UserConfig>;
      return mergeConfig(userConfig);
    } catch (error) {
      // File doesn't exist or can't be read, continue
      continue;
    }
  }

  // No config file found, use defaults
  return DEFAULT_CONFIG;
}

/**
 * User-facing config format (snake_case)
 */
interface UserConfig {
  enabled?: boolean;
  step_paths?: {
    typescript?: string[];
    python?: string[];
    csharp?: string[];
  };
  custom_assertions?: {
    typescript?: string[];
    python?: string[];
    csharp?: string[];
  };
  ignore?: string[];
  on_bad_steps?: "warn" | "error" | "ignore";
  strictness?: {
    Given?: "high" | "low" | "inherit";
    When?: "high" | "low" | "inherit";
    Then?: "high" | "low" | "inherit";
    And?: "high" | "low" | "inherit";
    But?: "high" | "low" | "inherit";
  };
}

/**
 * Merge user config with defaults
 */
function mergeConfig(userConfig: Partial<UserConfig>): ValidatorConfig {
  return {
    enabled: userConfig.enabled ?? DEFAULT_CONFIG.enabled,

    stepPaths: {
      typescript:
        userConfig.step_paths?.typescript ?? DEFAULT_CONFIG.stepPaths.typescript,
      python:
        userConfig.step_paths?.python ?? DEFAULT_CONFIG.stepPaths.python,
      csharp:
        userConfig.step_paths?.csharp ?? DEFAULT_CONFIG.stepPaths.csharp,
    },

    customAssertions: {
      typescript:
        userConfig.custom_assertions?.typescript ??
        DEFAULT_CONFIG.customAssertions.typescript,
      python:
        userConfig.custom_assertions?.python ??
        DEFAULT_CONFIG.customAssertions.python,
      csharp:
        userConfig.custom_assertions?.csharp ??
        DEFAULT_CONFIG.customAssertions.csharp,
    },

    ignore: userConfig.ignore ?? DEFAULT_CONFIG.ignore,

    onBadSteps: userConfig.on_bad_steps ?? DEFAULT_CONFIG.onBadSteps,

    strictness: {
      Given: userConfig.strictness?.Given ?? DEFAULT_CONFIG.strictness.Given,
      When: userConfig.strictness?.When ?? DEFAULT_CONFIG.strictness.When,
      Then: userConfig.strictness?.Then ?? DEFAULT_CONFIG.strictness.Then,
      And: userConfig.strictness?.And ?? DEFAULT_CONFIG.strictness.And,
      But: userConfig.strictness?.But ?? DEFAULT_CONFIG.strictness.But,
    },
  };
}

/**
 * Check if validation is enabled
 */
export function isEnabled(config: ValidatorConfig): boolean {
  return config.enabled !== false;
}

export default loadConfig;
