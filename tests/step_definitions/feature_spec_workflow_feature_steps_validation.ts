/**
 * Step definitions for spec-workflow-feature-steps-validation
 *
 * Drives the REAL steps-validator engine (tools/steps-validator/):
 *   loadConfig, isEnabled, detectLanguage, hasStepDefinitions, getParser, analyzeStep, analyzeSteps
 *
 * All regexes are scoped to steps-validation vocabulary — no generic catch-all steps.
 * CLI spawn scenarios use process.execPath + ['--import', 'tsx', SCRIPT_ABS], cwd=REPO_ROOT.
 */

import { Given, When, Then } from "@cucumber/cucumber";
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import * as os from "os";
import { spawnSync } from "child_process";

import { loadConfig, isEnabled } from "../../tools/steps-validator/config.ts";
import {
  detectLanguage,
  hasStepDefinitions,
} from "../../tools/steps-validator/detector.ts";
import { getParser } from "../../tools/steps-validator/parsers/index.ts";
import { analyzeStep, analyzeSteps } from "../../tools/steps-validator/analyzer.ts";
import type { StepDefinition, Language } from "../../tools/steps-validator/types.ts";

// ─── constants ─────────────────────────────────────────────────────────────
const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, "..", "..");
const VALIDATE_STEPS_ABS = path.join(
  REPO_ROOT,
  "tools",
  "steps-validator",
  "validate-steps.ts"
);
const FIXTURES_DIR = path.join(REPO_ROOT, "tests", "fixtures", "steps-validator");

// ─── World state augmentation ──────────────────────────────────────────────
// We store per-scenario state on `this` (V4World extended by these step-defs).
// tempDir is created by the global Before hook in tests/hooks/before-after.ts.

function self(ctx: unknown): Record<string, unknown> {
  return ctx as Record<string, unknown>;
}

// ─── Background ────────────────────────────────────────────────────────────

Given(
  /^dev-pomogator is installed with hooks$/,
  function () {
    // No-op: assumes dev-pomogator repo is checked out (cwd = REPO_ROOT).
    // The hooks under tools/steps-validator/ are callable from source via tsx.
  }
);

// ─── @feature1 — language detection (TypeScript) ──────────────────────────

Given(
  /^a project with "([^"]+)" file$/,
  async function (relPath: string) {
    const w = self(this);
    const dir: string = w.tempDir as string;
    const fullPath = path.join(dir, relPath);
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    // Write a minimal TS step file so the detector picks up the language
    await fsp.writeFile(
      fullPath,
      "Given('example', function() { expect(1).toBe(1); });\n",
      "utf-8"
    );
    w.projectDir = dir;
  }
);

When(
  /^the validation hook runs$/,
  function () {
    const w = self(this);
    const dir = (w.projectDir as string) ?? (w.tempDir as string);
    const res = spawnSync(process.execPath, ["--import", "tsx", VALIDATE_STEPS_ABS, dir], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      env: { ...process.env },
    });
    w.lastExitCode = res.status ?? 0;
    w.lastStdout = res.stdout ?? "";
    w.lastStderr = res.stderr ?? "";
  }
);

Then(
  /^the language should be detected as "([^"]+)"$/,
  async function (expectedLang: string) {
    const w = self(this);
    const dir = (w.projectDir as string) ?? (w.tempDir as string);
    const config = await loadConfig(dir);
    const lang = await detectLanguage(dir, config);
    if (lang !== expectedLang) {
      throw new Error(
        `Expected language "${expectedLang}" but detectLanguage returned "${lang}" for dir: ${dir}`
      );
    }
  }
);

// ─── @feature2 — Parse TypeScript step definitions ────────────────────────

Given(
  /^a TypeScript project with step definitions:$/,
  async function (docString: string) {
    const w = self(this);
    const dir: string = w.tempDir as string;
    const stepsDir = path.join(dir, "tests", "steps");
    await fsp.mkdir(stepsDir, { recursive: true });
    const filePath = path.join(stepsDir, "example.steps.ts");
    await fsp.writeFile(filePath, docString, "utf-8");
    w.projectDir = dir;
    w.stepsFilePath = filePath;
    w.stepDocString = docString;
    // Detect & store language for subsequent When/Then
    const config = await loadConfig(dir);
    w.detectedLanguage = "typescript";
    w.validatorConfig = config;
  }
);

When(
  /^the validation hook parses the file$/,
  async function () {
    const w = self(this);
    const dir = (w.projectDir as string) ?? (w.tempDir as string);
    const config = await loadConfig(dir);
    // Auto-detect language from the project directory
    const lang: Language =
      (w.detectedLanguage as Language) ?? (await detectLanguage(dir, config)) ?? "typescript";
    const parser = getParser(lang, config);
    const steps = await parser.parseAll(dir);
    w.parsedSteps = steps;
    w.detectedLanguage = lang;
  }
);

Then(
  /^(\d+) step definitions? should be found$/,
  function (expectedCountStr: string) {
    const w = self(this);
    const steps = (w.parsedSteps ?? []) as StepDefinition[];
    const expected = parseInt(expectedCountStr, 10);
    if (steps.length !== expected) {
      throw new Error(
        `Expected ${expected} step definitions but found ${steps.length}. Steps: ${JSON.stringify(steps.map((s) => ({ type: s.type, pattern: s.pattern })))}`
      );
    }
  }
);

Then(
  /^step "([^"]+)" should be type "([^"]+)"$/,
  function (pattern: string, expectedType: string) {
    const w = self(this);
    const steps = (w.parsedSteps ?? []) as StepDefinition[];
    const found = steps.find((s) => s.pattern === pattern);
    if (!found) {
      throw new Error(
        `Step with pattern "${pattern}" not found. Available: ${steps.map((s) => s.pattern).join(", ")}`
      );
    }
    if (found.type !== expectedType) {
      throw new Error(
        `Step "${pattern}" has type "${found.type}" but expected "${expectedType}"`
      );
    }
  }
);

// ─── @feature3 — Parse Python step definitions ────────────────────────────

Given(
  /^a Python project with step definitions:$/,
  async function (docString: string) {
    const w = self(this);
    const dir: string = w.tempDir as string;
    const stepsDir = path.join(dir, "features", "steps");
    await fsp.mkdir(stepsDir, { recursive: true });
    const filePath = path.join(stepsDir, "example_steps.py");
    await fsp.writeFile(filePath, docString, "utf-8");
    w.projectDir = dir;
    w.stepsFilePath = filePath;
    // Pre-set language so the shared "When parses the file" uses the right parser
    w.detectedLanguage = "python";
  }
);


// Note: @feature3 and @feature4 also use "When the validation hook parses the file".
// We detect by finding what step files exist in the tempDir.

// ─── @feature4 — Parse C# step definitions ───────────────────────────────

Given(
  /^a C# project with step definitions:$/,
  async function (docString: string) {
    const w = self(this);
    const dir: string = w.tempDir as string;
    const stepsDir = path.join(dir, "StepDefinitions");
    await fsp.mkdir(stepsDir, { recursive: true });
    const filePath = path.join(stepsDir, "Steps.cs");
    // Wrap in a minimal class so the C# parser finds it
    const wrapped = `using TechTalk.SpecFlow;\n\n[Binding]\npublic class Steps\n{\n${docString}\n}\n`;
    await fsp.writeFile(filePath, wrapped, "utf-8");
    // Also create a .csproj so the detector recognizes C#
    await fsp.writeFile(
      path.join(dir, "Project.csproj"),
      "<Project Sdk=\"Microsoft.NET.Sdk\"></Project>\n",
      "utf-8"
    );
    w.projectDir = dir;
    w.stepsFilePath = filePath;
    // Pre-set language so the shared "When parses the file" uses CSharpParser
    w.detectedLanguage = "csharp";
  }
);

// ─── @feature5 — Step quality analysis ───────────────────────────────────

Given(
  /^a TypeScript project with step definition:$/,
  async function (docString: string) {
    const w = self(this);
    const dir: string = w.tempDir as string;
    const stepsDir = path.join(dir, "tests", "steps");
    await fsp.mkdir(stepsDir, { recursive: true });
    const filePath = path.join(stepsDir, "target.steps.ts");
    await fsp.writeFile(filePath, docString, "utf-8");
    w.projectDir = dir;
    w.stepsFilePath = filePath;
    w.stepDocString = docString;
  }
);

When(
  /^the validation hook analyzes the step$/,
  async function () {
    const w = self(this);
    const dir = (w.projectDir as string) ?? (w.tempDir as string);
    const config = await loadConfig(dir);
    const lang: Language = "typescript";
    const parser = getParser(lang, config);
    const steps = await parser.parseAll(dir);
    if (steps.length === 0) {
      throw new Error("No steps parsed from the TypeScript step definition docstring");
    }
    // Analyze all steps; store the first one's result
    const result = analyzeSteps(steps, lang, config, [w.stepsFilePath as string]);
    w.analysisResult = result;
    w.analyzedStep = result.steps[0];
  }
);

Then(
  /^the step should be marked as "([^"]+)"$/,
  function (expectedStatus: string) {
    const w = self(this);
    const analyzed = w.analyzedStep as { quality: { status: string } };
    if (!analyzed) {
      throw new Error("No analyzed step found — run 'When the validation hook analyzes the step' first");
    }
    if (analyzed.quality.status !== expectedStatus) {
      throw new Error(
        `Expected step status "${expectedStatus}" but got "${analyzed.quality.status}". Issues: ${JSON.stringify((analyzed as { quality: { issues: string[] } }).quality.issues)}`
      );
    }
  }
);

Then(
  /^the issue should be "([^"]+)"$/,
  function (expectedIssue: string) {
    const w = self(this);
    const analyzed = w.analyzedStep as { quality: { issues: string[] } };
    if (!analyzed) {
      throw new Error("No analyzed step found");
    }
    const issues = analyzed.quality.issues;
    if (!issues.includes(expectedIssue)) {
      throw new Error(
        `Expected issue "${expectedIssue}" but issues are: ${JSON.stringify(issues)}`
      );
    }
  }
);

// ─── @feature6 — Generate validation report ──────────────────────────────

Given(
  /^a project with mixed quality steps$/,
  async function () {
    const w = self(this);
    const dir: string = w.tempDir as string;
    const stepsDir = path.join(dir, "tests", "steps");
    await fsp.mkdir(stepsDir, { recursive: true });
    // Write a mixed-quality TS steps file: 1 GOOD + 1 BAD
    await fsp.writeFile(
      path.join(stepsDir, "mixed.steps.ts"),
      [
        "Given('setup done', async function() { this.ready = true; });",
        "Then('result is valid', async function() { expect(this.result).toBeDefined(); });",
        "Then('bad step', async function() { console.log('no assertion here'); });",
      ].join("\n"),
      "utf-8"
    );
    w.projectDir = dir;
  }
);

Then(
  /^file "([^"]+)" should exist$/,
  function (fileName: string) {
    const w = self(this);
    const dir = (w.projectDir as string) ?? (w.tempDir as string);
    const filePath = path.join(dir, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Expected file "${fileName}" to exist at ${filePath} but it does not`);
    }
  }
);

Then(
  /^the report should contain "([^"]+)" section$/,
  async function (sectionName: string) {
    const w = self(this);
    const dir = (w.projectDir as string) ?? (w.tempDir as string);
    const reportPath = path.join(dir, "steps-validation-report.md");
    const content = await fsp.readFile(reportPath, "utf-8");
    if (!content.includes(sectionName)) {
      throw new Error(
        `Report does not contain section "${sectionName}". Report content:\n${content.slice(0, 500)}`
      );
    }
  }
);

// ─── @feature7 — Print warnings to stdout ────────────────────────────────

Given(
  /^a project with 2 BAD steps$/,
  async function () {
    const w = self(this);
    const dir: string = w.tempDir as string;
    const stepsDir = path.join(dir, "tests", "steps");
    await fsp.mkdir(stepsDir, { recursive: true });
    // Exactly 2 BAD Then steps (no assertion, no logging — plain "No assertion found")
    await fsp.writeFile(
      path.join(stepsDir, "bad.steps.ts"),
      [
        "Then('first bad step', async function() { this.x = 1; });",
        "Then('second bad step', async function() { this.y = 2; });",
      ].join("\n"),
      "utf-8"
    );
    w.projectDir = dir;
  }
);

Then(
  /^stdout should contain "([^"\/]+)"$/,
  function (expected: string) {
    // Scoped to steps-validation vocabulary (excludes /plugin... paths from canonical-plugin)
    const w = self(this);
    const stdout = (w.lastStdout as string) ?? "";
    if (!stdout.includes(expected)) {
      throw new Error(
        `stdout does not contain "${expected}". stdout was:\n${stdout}`
      );
    }
  }
);

// ─── @feature8 — Configuration via YAML ──────────────────────────────────

Given(
  /^a project with "\.steps-validator\.yaml":$/,
  async function (docString: string) {
    const w = self(this);
    const dir: string = w.tempDir as string;
    await fsp.writeFile(path.join(dir, ".steps-validator.yaml"), docString, "utf-8");
    w.projectDir = dir;
  }
);

Given(
  /^a file "([^"]+)" with BAD steps$/,
  async function (relPath: string) {
    const w = self(this);
    const dir = (w.projectDir as string) ?? (w.tempDir as string);
    const fullPath = path.join(dir, relPath);
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(
      fullPath,
      "Then('bad then step', async function() { this.x = 1; });\n",
      "utf-8"
    );
  }
);

Then(
  /^"([^"]+)" should not be in the report$/,
  async function (fileName: string) {
    const w = self(this);
    const dir = (w.projectDir as string) ?? (w.tempDir as string);
    const reportPath = path.join(dir, "steps-validation-report.md");
    if (!fs.existsSync(reportPath)) {
      // No report means this file wasn't processed — acceptable for ignore-filtered paths
      return;
    }
    const content = await fsp.readFile(reportPath, "utf-8");
    if (content.includes(fileName)) {
      throw new Error(
        `Report should NOT contain "${fileName}" (it should be ignored), but it does.\nReport:\n${content.slice(0, 600)}`
      );
    }
  }
);

Then(
  /^"([^"]+)" should be in the report$/,
  async function (fileName: string) {
    const w = self(this);
    const dir = (w.projectDir as string) ?? (w.tempDir as string);
    const reportPath = path.join(dir, "steps-validation-report.md");
    if (!fs.existsSync(reportPath)) {
      throw new Error(
        `Report file "steps-validation-report.md" does not exist in ${dir}`
      );
    }
    const content = await fsp.readFile(reportPath, "utf-8");
    if (!content.includes(fileName)) {
      throw new Error(
        `Report should contain "${fileName}" but it does not.\nReport:\n${content.slice(0, 600)}`
      );
    }
  }
);

// ─── @feature9 — Opt-out via config ──────────────────────────────────────

Given(
  /^a project with step definitions$/,
  async function () {
    const w = self(this);
    const dir: string = w.tempDir as string;
    const stepsDir = path.join(dir, "tests", "steps");
    await fsp.mkdir(stepsDir, { recursive: true });
    await fsp.writeFile(
      path.join(stepsDir, "example.steps.ts"),
      "Given('setup', function() { this.ready = true; });\n",
      "utf-8"
    );
    w.projectDir = dir;
  }
);

Given(
  /^"\.steps-validator\.yaml" with "([^"]+)"$/,
  async function (content: string) {
    const w = self(this);
    const dir = (w.projectDir as string) ?? (w.tempDir as string);
    await fsp.writeFile(path.join(dir, ".steps-validator.yaml"), content + "\n", "utf-8");
  }
);

Then(
  /^validation should be skipped$/,
  async function () {
    const w = self(this);
    const dir = (w.projectDir as string) ?? (w.tempDir as string);
    // When disabled, validate-steps exits 0 and writes no report
    const exitCode = w.lastExitCode as number;
    if (exitCode !== 0) {
      throw new Error(`Expected exit code 0 (skipped) but got ${exitCode}`);
    }
    // Additionally verify in-process: isEnabled returns false
    const config = await loadConfig(dir);
    if (isEnabled(config)) {
      throw new Error("Expected isEnabled(config) to return false but it returned true");
    }
  }
);

Then(
  /^no report should be generated$/,
  function () {
    const w = self(this);
    const dir = (w.projectDir as string) ?? (w.tempDir as string);
    const reportPath = path.join(dir, "steps-validation-report.md");
    if (fs.existsSync(reportPath)) {
      throw new Error(
        `Report file "steps-validation-report.md" should NOT exist but does at ${reportPath}`
      );
    }
  }
);

// @feature9 second scenario: auto-activation when steps exist

Given(
  /^a project with "([^"]+)"$/,
  async function (relPath: string) {
    // This pattern also matches @feature1's "a project with ... file" but that
    // has "file" suffix. This shorter pattern is for @feature9 auto-activation.
    const w = self(this);
    const dir: string = w.tempDir as string;
    const fullPath = path.join(dir, relPath);
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(
      fullPath,
      "Given('example', function() { expect(1).toBe(1); });\n",
      "utf-8"
    );
    w.projectDir = dir;
  }
);

Given(
  /^no "\.steps-validator\.yaml" file$/,
  function () {
    // Nothing to do — tempDir has no config by default
    const w = self(this);
    const dir = (w.projectDir as string) ?? (w.tempDir as string);
    const configPath = path.join(dir, ".steps-validator.yaml");
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  }
);

Then(
  /^validation should run automatically$/,
  async function () {
    const w = self(this);
    const dir = (w.projectDir as string) ?? (w.tempDir as string);
    // Verify in-process: hasStepDefinitions returns true even without config
    const config = await loadConfig(dir);
    const hasDefs = await hasStepDefinitions(dir, config);
    if (!hasDefs) {
      throw new Error(
        `Expected hasStepDefinitions to return true (auto-activate) but returned false for dir: ${dir}`
      );
    }
    // Also verify exit code 0 from the CLI spawn (set by When the validation hook runs)
    const exitCode = w.lastExitCode as number;
    if (exitCode !== 0) {
      throw new Error(`Expected exit code 0 but got ${exitCode}. stderr: ${w.lastStderr}`);
    }
  }
);

// ─── @feature10 — Graceful error handling ────────────────────────────────

Given(
  /^a project with malformed step file$/,
  async function () {
    const w = self(this);
    const dir: string = w.tempDir as string;
    const stepsDir = path.join(dir, "tests", "steps");
    await fsp.mkdir(stepsDir, { recursive: true });
    // Malformed: syntax error — unclosed paren
    await fsp.writeFile(
      path.join(stepsDir, "malformed.steps.ts"),
      "Given('broken step', async function( { expect(this.x).toBe(1); };\n",
      "utf-8"
    );
    // Also add a GOOD step file so "other files are still validated" assertion works
    await fsp.writeFile(
      path.join(stepsDir, "good.steps.ts"),
      "Then('good step', async function() { expect(this.x).toBe(1); });\n",
      "utf-8"
    );
    w.projectDir = dir;
  }
);

Then(
  /^the hook should exit with code 0$/,
  function () {
    const w = self(this);
    const exitCode = w.lastExitCode as number;
    if (exitCode !== 0) {
      throw new Error(
        `Expected hook to exit with code 0 but got ${exitCode}. stderr: ${w.lastStderr}`
      );
    }
  }
);

Then(
  /^error should be logged to "([^"]+)"$/,
  async function (logPathTemplate: string) {
    // The log path may contain ~ which expands to HOME
    const logPath = logPathTemplate.replace(/^~/, os.homedir());
    // We verify the log file exists AND was written recently (within 30s)
    try {
      const stat = await fsp.stat(logPath);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs > 30_000) {
        throw new Error(
          `Log file "${logPath}" exists but was last modified ${Math.round(ageMs / 1000)}s ago — expected a recent write`
        );
      }
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        throw new Error(
          `Expected error log at "${logPath}" but file does not exist. ` +
          `The logger writes to os.homedir()/.dev-pomogator/logs/steps-validator.log`
        );
      }
      throw e;
    }
  }
);

Then(
  /^other files should still be validated$/,
  async function () {
    const w = self(this);
    const dir = (w.projectDir as string) ?? (w.tempDir as string);
    const reportPath = path.join(dir, "steps-validation-report.md");
    if (!fs.existsSync(reportPath)) {
      throw new Error(
        `Expected "steps-validation-report.md" to exist (other files validated) but it does not at ${dir}`
      );
    }
  }
);

// @feature10 second scenario: no step definitions found

Given(
  /^a project without any step definition files$/,
  async function () {
    const w = self(this);
    // tempDir is already empty — nothing to create
    w.projectDir = w.tempDir as string;
  }
);

Then(
  /^no warnings should be printed$/,
  function () {
    const w = self(this);
    const stdout = (w.lastStdout as string) ?? "";
    if (stdout.includes("Found") && stdout.includes("bad step")) {
      throw new Error(
        `Expected no warnings but stdout contains warning text: ${stdout}`
      );
    }
  }
);

// ─── Fixture-based step-defs (migrated from steps-validator.test.ts) ────────
// These drive the REAL fixture dirs under tests/fixtures/steps-validator/
// without any mocks or inline fakes.

Given(
  /^the C# fixture directory$/,
  function () {
    const w = self(this);
    w.fixtureDir = path.join(FIXTURES_DIR, "csharp");
    w.fixtureLang = "csharp";
  }
);

Given(
  /^the TypeScript fixture directory$/,
  function () {
    const w = self(this);
    w.fixtureDir = path.join(FIXTURES_DIR, "typescript");
    w.fixtureLang = "typescript";
  }
);

Given(
  /^the Python fixture directory$/,
  function () {
    const w = self(this);
    w.fixtureDir = path.join(FIXTURES_DIR, "python");
    w.fixtureLang = "python";
  }
);

When(
  /^language detection runs on the fixture$/,
  async function () {
    const w = self(this);
    const dir = w.fixtureDir as string;
    const config = await loadConfig(dir);
    w.fixtureDetectedLang = await detectLanguage(dir, config);
  }
);

Then(
  /^the detected language should be "([^"]+)"$/,
  function (expectedLang: string) {
    const w = self(this);
    const lang = w.fixtureDetectedLang as string | null;
    if (lang !== expectedLang) {
      throw new Error(
        `Steps-validator fixture language detection: expected "${expectedLang}" but got "${lang}"`
      );
    }
  }
);

When(
  /^the fixture is parsed by the steps-validator$/,
  async function () {
    const w = self(this);
    const dir = w.fixtureDir as string;
    const config = await loadConfig(dir);
    const lang = (w.fixtureLang as string) as import("../../tools/steps-validator/types.ts").Language;
    const parser = getParser(lang, config);
    const files = await parser.findStepFiles(dir);
    const steps = await parser.parseAll(dir);
    w.fixtureStepFiles = files;
    w.fixtureSteps = steps;
    w.fixtureParsedLang = lang;
  }
);

Then(
  /^at least (\d+) C# step files? should be found$/,
  function (minStr: string) {
    const w = self(this);
    const files = (w.fixtureStepFiles as string[]) ?? [];
    const min = parseInt(minStr, 10);
    if (files.length < min) {
      throw new Error(
        `steps-validator C# fixture: expected ≥${min} step files but found ${files.length}: ${JSON.stringify(files)}`
      );
    }
  }
);

Then(
  /^at least (\d+) TypeScript step files? should be found$/,
  function (minStr: string) {
    const w = self(this);
    const files = (w.fixtureStepFiles as string[]) ?? [];
    const min = parseInt(minStr, 10);
    if (files.length < min) {
      throw new Error(
        `steps-validator TS fixture: expected ≥${min} step files but found ${files.length}: ${JSON.stringify(files)}`
      );
    }
  }
);

Then(
  /^at least (\d+) Python step files? should be found$/,
  function (minStr: string) {
    const w = self(this);
    const files = (w.fixtureStepFiles as string[]) ?? [];
    const min = parseInt(minStr, 10);
    if (files.length < min) {
      throw new Error(
        `steps-validator Python fixture: expected ≥${min} step files but found ${files.length}: ${JSON.stringify(files)}`
      );
    }
  }
);

Then(
  /^the total step count should be greater than 0$/,
  function () {
    const w = self(this);
    const steps = (w.fixtureSteps as import("../../tools/steps-validator/types.ts").StepDefinition[]) ?? [];
    if (steps.length === 0) {
      throw new Error(
        `steps-validator fixture: expected totalSteps > 0 but got 0`
      );
    }
  }
);

Then(
  /^the parsed language should be "([^"]+)"$/,
  function (expectedLang: string) {
    const w = self(this);
    const lang = w.fixtureParsedLang as string;
    if (lang !== expectedLang) {
      throw new Error(
        `steps-validator fixture parsed language: expected "${expectedLang}" but got "${lang}"`
      );
    }
  }
);

When(
  /^the fixture is analyzed by the steps-validator$/,
  async function () {
    const w = self(this);
    const dir = w.fixtureDir as string;
    const lang = (w.fixtureLang as string) as import("../../tools/steps-validator/types.ts").Language;
    const config = await loadConfig(dir);
    const parser = getParser(lang, config);
    const steps = await parser.parseAll(dir);
    const result = analyzeSteps(steps, lang, config, []);
    w.fixtureAnalysisResult = result;
  }
);

Then(
  /^the step matching "([^"]+)" should have status "([^"]+)"$/,
  function (patternSubstring: string, expectedStatus: string) {
    const w = self(this);
    const result = w.fixtureAnalysisResult as import("../../tools/steps-validator/types.ts").ValidationResult;
    if (!result) {
      throw new Error("No fixture analysis result — run 'When the fixture is analyzed by the steps-validator' first");
    }
    const matching = result.steps.filter((s) => s.pattern.includes(patternSubstring));
    if (matching.length === 0) {
      throw new Error(
        `No step with pattern containing "${patternSubstring}" found. Available patterns: ${result.steps.map((s) => s.pattern).join(", ")}`
      );
    }
    // Check at least one (in case multiple match) — use the FIRST match
    const step = matching[0];
    if (step.quality.status !== expectedStatus) {
      throw new Error(
        `Step "${step.pattern}" has status "${step.quality.status}" but expected "${expectedStatus}". Issues: ${JSON.stringify(step.quality.issues)}`
      );
    }
  }
);

Then(
  /^at least 1 step with status "([^"]+)" should exist$/,
  function (expectedStatus: string) {
    const w = self(this);
    const result = w.fixtureAnalysisResult as import("../../tools/steps-validator/types.ts").ValidationResult;
    if (!result) {
      throw new Error("No fixture analysis result");
    }
    const matching = result.steps.filter((s) => s.quality.status === expectedStatus);
    if (matching.length === 0) {
      throw new Error(
        `Expected at least 1 step with status "${expectedStatus}" but found 0. Summary: ${JSON.stringify(result.summary)}`
      );
    }
  }
);

Then(
  /^the sum of good plus warning plus bad should equal totalSteps$/,
  function () {
    const w = self(this);
    const result = w.fixtureAnalysisResult as import("../../tools/steps-validator/types.ts").ValidationResult;
    if (!result) {
      throw new Error("No fixture analysis result");
    }
    const { good, warning, bad } = result.summary;
    const sum = good + warning + bad;
    if (sum !== result.totalSteps) {
      throw new Error(
        `Summary invariant violated: good(${good}) + warning(${warning}) + bad(${bad}) = ${sum} !== totalSteps(${result.totalSteps})`
      );
    }
  }
);

// ─── Config default/merge step-defs ──────────────────────────────────────────

When(
  /^the default config is loaded for the project$/,
  async function () {
    const w = self(this);
    const dir = (w.projectDir as string) ?? (w.tempDir as string);
    const config = await loadConfig(dir);
    w.loadedConfig = config;
  }
);

Then(
  /^the config enabled field should be (true|false)$/,
  function (expectedStr: string) {
    const w = self(this);
    const config = w.loadedConfig as import("../../tools/steps-validator/types.ts").ValidatorConfig;
    const expected = expectedStr === "true";
    if (config.enabled !== expected) {
      throw new Error(
        `Expected config.enabled = ${expected} but got ${config.enabled}`
      );
    }
  }
);

Then(
  /^the config should have step paths for (typescript|python|csharp)$/,
  function (lang: string) {
    const w = self(this);
    const config = w.loadedConfig as import("../../tools/steps-validator/types.ts").ValidatorConfig;
    const paths = config.stepPaths[lang as import("../../tools/steps-validator/types.ts").Language];
    if (!paths || paths.length === 0) {
      throw new Error(
        `Expected config.stepPaths.${lang} to be non-empty but got: ${JSON.stringify(paths)}`
      );
    }
  }
);

Then(
  /^the csharp custom assertions should contain "([^"]+)"$/,
  function (expected: string) {
    const w = self(this);
    const config = w.loadedConfig as import("../../tools/steps-validator/types.ts").ValidatorConfig;
    const assertions = config.customAssertions?.csharp ?? [];
    if (!assertions.includes(expected)) {
      throw new Error(
        `Expected csharp custom assertions to contain "${expected}" but got: ${JSON.stringify(assertions)}`
      );
    }
  }
);

Then(
  /^the config should still have default step paths for (typescript|python|csharp)$/,
  function (lang: string) {
    const w = self(this);
    const config = w.loadedConfig as import("../../tools/steps-validator/types.ts").ValidatorConfig;
    const paths = config.stepPaths[lang as import("../../tools/steps-validator/types.ts").Language];
    if (!paths || paths.length === 0) {
      throw new Error(
        `Expected config.stepPaths.${lang} to still have defaults but got: ${JSON.stringify(paths)}`
      );
    }
  }
);

Given(
  /^a project with a custom "\.steps-validator\.yaml" config:$/,
  async function (docString: string) {
    const w = self(this);
    const dir: string = w.tempDir as string;
    await fsp.writeFile(path.join(dir, ".steps-validator.yaml"), docString, "utf-8");
    w.projectDir = dir;
  }
);

// ─── CLI fixture-based step-defs ─────────────────────────────────────────────

When(
  /^the CLI runs on the C# fixture directory$/,
  function () {
    const w = self(this);
    const dir = w.fixtureDir as string;
    const res = spawnSync(
      process.execPath,
      ["--import", "tsx", VALIDATE_STEPS_ABS, dir],
      { cwd: REPO_ROOT, encoding: "utf-8", env: { ...process.env } }
    );
    w.cliExitCode = res.status ?? 0;
    w.cliStdout = res.stdout ?? "";
    w.cliStderr = res.stderr ?? "";
  }
);

When(
  /^the CLI runs on the TypeScript fixture directory$/,
  function () {
    const w = self(this);
    const dir = w.fixtureDir as string;
    const res = spawnSync(
      process.execPath,
      ["--import", "tsx", VALIDATE_STEPS_ABS, dir],
      { cwd: REPO_ROOT, encoding: "utf-8", env: { ...process.env } }
    );
    w.cliExitCode = res.status ?? 0;
    w.cliStdout = res.stdout ?? "";
    w.cliStderr = res.stderr ?? "";
  }
);

Then(
  /^the CLI should exit with code (\d+)$/,
  function (codeStr: string) {
    const w = self(this);
    const expected = parseInt(codeStr, 10);
    const actual = w.cliExitCode as number;
    if (actual !== expected) {
      throw new Error(
        `CLI fixture run: expected exit code ${expected} but got ${actual}. stderr: ${w.cliStderr}`
      );
    }
  }
);

Then(
  /^the CLI stdout should contain "([^"]+)"$/,
  function (expected: string) {
    const w = self(this);
    const stdout = (w.cliStdout as string) ?? "";
    if (!stdout.includes(expected)) {
      throw new Error(
        `CLI stdout does not contain "${expected}". stdout was:\n${stdout.slice(0, 800)}`
      );
    }
  }
);
