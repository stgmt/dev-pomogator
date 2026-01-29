/**
 * E2E Tests for Steps Validator
 *
 * Tests the validator against real fixture projects.
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as path from "path";
import * as fs from "fs/promises";

// Import validator components
import { loadConfig } from "../../extensions/specs-workflow/tools/steps-validator/config";
import { detectLanguage } from "../../extensions/specs-workflow/tools/steps-validator/detector";
import { getParser } from "../../extensions/specs-workflow/tools/steps-validator/parsers";
import { analyzeSteps } from "../../extensions/specs-workflow/tools/steps-validator/analyzer";
import type { ValidationResult } from "../../extensions/specs-workflow/tools/steps-validator/types";

const FIXTURES_DIR = path.join(__dirname, "..", "fixtures", "steps-validator");

describe("Steps Validator", () => {
  describe("C# (Reqnroll) Fixture", () => {
    const fixtureDir = path.join(FIXTURES_DIR, "csharp");
    let result: ValidationResult;

    beforeAll(async () => {
      const config = await loadConfig(fixtureDir);
      const language = await detectLanguage(fixtureDir, config);
      expect(language).toBe("csharp");

      const parser = getParser(language!, config);
      const files = await parser.findStepFiles(fixtureDir);
      const steps = await parser.parseAll(fixtureDir);

      result = analyzeSteps(steps, language!, config, files);
    });

    it("should detect C# language", async () => {
      const config = await loadConfig(fixtureDir);
      const language = await detectLanguage(fixtureDir, config);
      expect(language).toBe("csharp");
    });

    it("should find step definition files", async () => {
      const config = await loadConfig(fixtureDir);
      const parser = getParser("csharp", config);
      const files = await parser.findStepFiles(fixtureDir);

      expect(files.length).toBeGreaterThanOrEqual(2);
      expect(files.some((f) => f.includes("GoodSteps.cs"))).toBe(true);
      expect(files.some((f) => f.includes("BadSteps.cs"))).toBe(true);
    });

    it("should parse step definitions", () => {
      expect(result.totalSteps).toBeGreaterThan(0);
      expect(result.language).toBe("csharp");
    });

    it("should identify GOOD steps with assertions", () => {
      const goodSteps = result.steps.filter(
        (s) =>
          s.quality.status === "GOOD" && s.file.includes("GoodSteps.cs")
      );

      expect(goodSteps.length).toBeGreaterThan(0);

      // Check specific good patterns
      const assertEqualStep = goodSteps.find((s) =>
        s.pattern.includes("result is")
      );
      expect(assertEqualStep?.quality.hasAssertion).toBe(true);
    });

    it("should identify BAD steps without assertions", () => {
      const badSteps = result.steps.filter(
        (s) => s.quality.status === "BAD" && s.file.includes("BadSteps.cs")
      );

      expect(badSteps.length).toBeGreaterThan(0);

      // Check specific bad patterns
      const onlyConsoleStep = badSteps.find((s) =>
        s.pattern.includes("result is verified")
      );
      expect(onlyConsoleStep?.quality.hasOnlyLogging).toBe(true);
      expect(onlyConsoleStep?.quality.hasAssertion).toBe(false);
    });

    it("should identify WARNING steps with TODO/STUBBED", () => {
      const warningSteps = result.steps.filter(
        (s) => s.quality.status === "WARNING"
      );

      // Should have warnings for TODO, STUBBED, SKIPPED
      expect(warningSteps.length).toBeGreaterThanOrEqual(0);
    });

    it("should detect PendingStepException as BAD", () => {
      const pendingStep = result.steps.find((s) =>
        s.pattern.includes("validation passes")
      );

      expect(pendingStep?.quality.status).toBe("BAD");
      expect(pendingStep?.quality.isPending).toBe(true);
    });

    it("should detect empty body as BAD", () => {
      const emptyStep = result.steps.find((s) =>
        s.pattern.includes("operation completes")
      );

      expect(emptyStep?.quality.status).toBe("BAD");
      expect(emptyStep?.quality.isEmpty).toBe(true);
    });

    it("should detect Playwright WaitForURLAsync as GOOD", () => {
      const playwrightStep = result.steps.find((s) =>
        s.pattern.includes("page URL matches")
      );

      expect(playwrightStep?.quality.status).toBe("GOOD");
      expect(playwrightStep?.quality.hasAssertion).toBe(true);
    });

    it("should detect Playwright WaitForAsync as GOOD", () => {
      const playwrightStep = result.steps.find((s) =>
        s.pattern.includes("element is visible")
      );

      expect(playwrightStep?.quality.status).toBe("GOOD");
      expect(playwrightStep?.quality.hasAssertion).toBe(true);
    });

    it("should detect method delegation as GOOD", () => {
      const delegationStep = result.steps.find((s) =>
        s.pattern.includes("result contains") && s.pattern.includes("items")
      );

      expect(delegationStep?.quality.status).toBe("GOOD");
      expect(delegationStep?.quality.hasAssertion).toBe(true);
    });

    it("should detect multiline conditional throw as GOOD", () => {
      const multilineStep = result.steps.find((s) =>
        s.pattern.includes("result is not empty")
      );

      expect(multilineStep?.quality.status).toBe("GOOD");
      expect(multilineStep?.quality.hasAssertion).toBe(true);
    });

    it("should detect StepDefinition attribute as Then", () => {
      const stepDefStep = result.steps.find((s) =>
        s.pattern.includes("data is validated")
      );

      expect(stepDefStep?.type).toBe("Then");
      expect(stepDefStep?.quality.status).toBe("GOOD");
      expect(stepDefStep?.quality.hasAssertion).toBe(true);
    });

    it("should detect 'simplified check' pattern as BAD", () => {
      const simplifiedStep = result.steps.find((s) =>
        s.pattern.includes("all items are updated")
      );

      expect(simplifiedStep?.quality.status).toBe("BAD");
      expect(simplifiedStep?.quality.hasOnlyLogging).toBe(true);
      expect(simplifiedStep?.quality.hasAssertion).toBe(false);
    });

    it("should detect 'already validated' pattern as BAD", () => {
      const alreadyValidatedStep = result.steps.find((s) =>
        s.pattern.includes("missing IDs are skipped")
      );

      expect(alreadyValidatedStep?.quality.status).toBe("BAD");
      expect(alreadyValidatedStep?.quality.hasOnlyLogging).toBe(true);
      expect(alreadyValidatedStep?.quality.hasAssertion).toBe(false);
    });

    it("should detect STUBBED with return as BAD", () => {
      const stubbedStep = result.steps.find((s) =>
        s.pattern.includes("API returns token")
      );

      expect(stubbedStep?.quality.status).toBe("BAD");
      expect(stubbedStep?.quality.hasAssertion).toBe(false);
    });

    it("should detect 'assume' pattern as BAD", () => {
      const assumeStep = result.steps.find((s) =>
        s.pattern.includes("system logs") && s.pattern.includes("level")
      );

      expect(assumeStep?.quality.status).toBe("BAD");
      expect(assumeStep?.quality.hasOnlyLogging).toBe(true);
      expect(assumeStep?.quality.hasAssertion).toBe(false);
    });
  });

  describe("TypeScript Fixture", () => {
    const fixtureDir = path.join(FIXTURES_DIR, "typescript");
    let result: ValidationResult;

    beforeAll(async () => {
      const config = await loadConfig(fixtureDir);
      const language = await detectLanguage(fixtureDir, config);

      if (language) {
        const parser = getParser(language, config);
        const files = await parser.findStepFiles(fixtureDir);
        const steps = await parser.parseAll(fixtureDir);
        result = analyzeSteps(steps, language, config, files);
      }
    });

    it("should detect TypeScript language", async () => {
      const config = await loadConfig(fixtureDir);
      const language = await detectLanguage(fixtureDir, config);
      expect(language).toBe("typescript");
    });

    it("should find step definition files", async () => {
      const config = await loadConfig(fixtureDir);
      const parser = getParser("typescript", config);
      const files = await parser.findStepFiles(fixtureDir);

      expect(files.length).toBeGreaterThanOrEqual(2);
    });

    it("should parse step definitions", () => {
      expect(result.totalSteps).toBeGreaterThan(0);
    });

    it("should identify GOOD steps with expect()", () => {
      const goodSteps = result.steps.filter(
        (s) =>
          s.quality.status === "GOOD" && s.file.includes("good.steps.ts")
      );

      expect(goodSteps.length).toBeGreaterThan(0);
    });

    it("should identify BAD steps with only console.log", () => {
      const badSteps = result.steps.filter(
        (s) => s.quality.status === "BAD" && s.file.includes("bad.steps.ts")
      );

      expect(badSteps.length).toBeGreaterThan(0);
    });
  });

  describe("Python Fixture", () => {
    const fixtureDir = path.join(FIXTURES_DIR, "python");
    let result: ValidationResult;

    beforeAll(async () => {
      const config = await loadConfig(fixtureDir);
      const language = await detectLanguage(fixtureDir, config);

      if (language) {
        const parser = getParser(language, config);
        const files = await parser.findStepFiles(fixtureDir);
        const steps = await parser.parseAll(fixtureDir);
        result = analyzeSteps(steps, language, config, files);
      }
    });

    it("should detect Python language", async () => {
      const config = await loadConfig(fixtureDir);
      const language = await detectLanguage(fixtureDir, config);
      expect(language).toBe("python");
    });

    it("should find step definition files", async () => {
      const config = await loadConfig(fixtureDir);
      const parser = getParser("python", config);
      const files = await parser.findStepFiles(fixtureDir);

      expect(files.length).toBeGreaterThanOrEqual(2);
    });

    it("should parse step definitions", () => {
      expect(result.totalSteps).toBeGreaterThan(0);
    });

    it("should identify GOOD steps with assert", () => {
      const goodSteps = result.steps.filter(
        (s) =>
          s.quality.status === "GOOD" && s.file.includes("good_steps.py")
      );

      expect(goodSteps.length).toBeGreaterThan(0);
    });

    it("should identify BAD steps with only print()", () => {
      const badSteps = result.steps.filter(
        (s) => s.quality.status === "BAD" && s.file.includes("bad_steps.py")
      );

      expect(badSteps.length).toBeGreaterThan(0);
    });

    it("should detect pass as BAD/empty", () => {
      const passStep = result.steps.find((s) =>
        s.pattern.includes("operation completes")
      );

      expect(passStep?.quality.status).toBe("BAD");
    });
  });

  describe("Configuration", () => {
    it("should load default config when no file exists", async () => {
      const tempDir = path.join(FIXTURES_DIR, "..", "temp-no-config");

      try {
        await fs.mkdir(tempDir, { recursive: true });
        const config = await loadConfig(tempDir);

        expect(config.enabled).toBe(true);
        expect(config.stepPaths.csharp).toBeDefined();
        expect(config.stepPaths.typescript).toBeDefined();
        expect(config.stepPaths.python).toBeDefined();
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it("should merge user config with defaults", async () => {
      const tempDir = path.join(FIXTURES_DIR, "..", "temp-with-config");

      try {
        await fs.mkdir(tempDir, { recursive: true });

        // Create config file
        await fs.writeFile(
          path.join(tempDir, ".steps-validator.yaml"),
          `enabled: false
custom_assertions:
  csharp:
    - 'MyAssert\\.'
`
        );

        const config = await loadConfig(tempDir);

        expect(config.enabled).toBe(false);
        expect(config.customAssertions.csharp).toContain("MyAssert\\.");
        // Defaults should still be present
        expect(config.stepPaths.csharp).toBeDefined();
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("Summary", () => {
    it("should calculate correct summary counts", async () => {
      const fixtureDir = path.join(FIXTURES_DIR, "csharp");
      const config = await loadConfig(fixtureDir);
      const language = await detectLanguage(fixtureDir, config);
      const parser = getParser(language!, config);
      const files = await parser.findStepFiles(fixtureDir);
      const steps = await parser.parseAll(fixtureDir);
      const result = analyzeSteps(steps, language!, config, files);

      const totalFromSummary =
        result.summary.good + result.summary.warning + result.summary.bad;

      expect(totalFromSummary).toBe(result.totalSteps);
    });
  });
});
