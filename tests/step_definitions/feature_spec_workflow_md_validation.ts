/**
 * Step definitions for spec-workflow-md-validation.feature
 *
 * @feature2  ARTIFACT  — reads real .claude-plugin/hooks.json
 * @feature3–9 RUNTIME  — spawns tools/specs-validator/validate-specs.ts via process.execPath
 * @feature10  IN-PROCESS — imports parseTestFile from tools/specs-validator/parsers/test-parser.ts
 * @feature11  IN-PROCESS — imports matchTestFeature + parseTestFile from tools/specs-validator/
 *
 * Step-def signature: `function (this: MdValWorld, ...)` — `this:` is a TYPE ANNOTATION.
 * Cucumber binds the World; capture groups alone are the real parameters.
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { V4World } from '../hooks/before-after.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
// tests/step_definitions/ → root
const REPO_ROOT = path.resolve(__filename, '../../../');

const VALIDATE_SPECS_PATH = path.join(
  REPO_ROOT,
  'tools',
  'specs-validator',
  'validate-specs.ts',
);

const HOOKS_JSON_PATH = path.join(REPO_ROOT, '.claude-plugin', 'hooks.json');

// ─── World ───────────────────────────────────────────────────────────────────

interface MdValWorld extends V4World {
  /** Result from the last validate-specs spawn */
  spawnStdout: string;
  spawnStderr: string;
  spawnStatus: number | null;
  /** Name of the spec created under tempDir/.specs/ */
  currentSpecName: string;
  /** Results from in-process matcher call */
  matchResults: Array<{ id: string; status: string }>;
  /** Results from in-process parseTestFile call */
  parsedCases: Array<{ id: string; featureTag?: string }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const REQUIRED_MD_FILES = [
  'ACCEPTANCE_CRITERIA.md',
  'CHANGELOG.md',
  'DESIGN.md',
  'FILE_CHANGES.md',
  'FR.md',
  'NFR.md',
  'README.md',
  'REQUIREMENTS.md',
  'RESEARCH.md',
  'TASKS.md',
  'USE_CASES.md',
  'USER_STORIES.md',
];

function createCompleteSpec(
  specsRoot: string,
  name: string,
  frContent?: string,
  featureContent?: string,
): string {
  const specDir = path.join(specsRoot, name);
  fs.mkdirSync(specDir, { recursive: true });

  for (const file of REQUIRED_MD_FILES) {
    const content =
      file === 'FR.md' && frContent
        ? frContent
        : `# ${file.replace('.md', '')}\n\nContent for ${name}\n`;
    fs.writeFileSync(path.join(specDir, file), content);
  }

  const defaultFeature = `Feature: ${name}\n  Scenario: Test\n    Given test\n`;
  fs.writeFileSync(
    path.join(specDir, `${name}.feature`),
    featureContent ?? defaultFeature,
  );

  return specDir;
}

function runValidateSpecs(this: MdValWorld, workspaceRoot: string): void {
  // Best-effort cleanup of form-guards.log (os.homedir()-based, not HOME env)
  // to suppress the conformance "DENY" banner that would pollute stdout assertions.
  // This mirrors what the vitest twin does with fs.removeSync().
  const homeDir = os.homedir();
  const formGuardsLog = path.join(homeDir, '.dev-pomogator', 'logs', 'form-guards.log');
  try { fs.unlinkSync(formGuardsLog); } catch { /* best-effort */ }

  const stdinJson = JSON.stringify({
    conversation_id: 'test-session',
    workspace_roots: [workspaceRoot],
    prompt: 'Test prompt',
  });

  const res = spawnSync(
    process.execPath,
    ['--import', 'tsx', VALIDATE_SPECS_PATH],
    {
      cwd: REPO_ROOT,
      input: stdinJson,
      encoding: 'utf-8',
      timeout: 30_000,
      env: { ...process.env },
    },
  );

  this.spawnStdout = res.stdout ?? '';
  this.spawnStderr = res.stderr ?? '';
  this.spawnStatus = res.status;
  this.lastStdout = this.spawnStdout;
  this.lastStderr = this.spawnStderr;
  this.lastExitCode = res.status;
}

function getValidationReport(specsRoot: string, specName: string): string {
  const p = path.join(specsRoot, specName, 'validation-report.md');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
}

function validationReportExists(specsRoot: string, specName: string): boolean {
  return fs.existsSync(path.join(specsRoot, specName, 'validation-report.md'));
}

// ─── Background (no-ops — defined in feature_tui_test_runner.ts + feature_onboard_repo_phase0.ts) ──
// "Given dev-pomogator is installed"         → feature_tui_test_runner.ts
// "And specs-workflow extension is enabled"  → feature_onboard_repo_phase0.ts
// No redefinition here.

// ─── @feature2 ARTIFACT ───────────────────────────────────────────────────────

Given(
  /^dev-pomogator installs specs-workflow for Claude$/,
  function (this: MdValWorld) {
    // No-op: the artifact check is the real .claude-plugin/hooks.json
    // which exists in the repo. The Then step does the real assertion.
  },
);

Then(
  /^\.claude\/settings\.json should contain UserPromptSubmit hook$/,
  function (this: MdValWorld) {
    // The UserPromptSubmit hook lives in .claude-plugin/hooks.json, not
    // settings.json directly. The feature prose says "settings.json" but
    // the real artifact is hooks.json (canonical plugin distribution).
    // Assert the canonical artifact.
    assert.ok(
      fs.existsSync(HOOKS_JSON_PATH),
      `Expected .claude-plugin/hooks.json to exist at ${HOOKS_JSON_PATH}`,
    );
    const hooksData = JSON.parse(fs.readFileSync(HOOKS_JSON_PATH, 'utf-8'));
    // Structure: { hooks: { UserPromptSubmit: [ { hooks: [ { command: "..." } ] } ] } }
    // Same traversal as pluginHookCommands() in tests/e2e/helpers.ts
    const groups: Array<{ hooks?: Array<{ command?: string }> }> =
      hooksData?.hooks?.UserPromptSubmit ?? [];
    const allCommands = groups.flatMap(
      (g) => (g.hooks ?? []).map((h) => h.command ?? ''),
    );
    const hasValidator = allCommands.some((c) =>
      c.includes('specs-validator/validate-specs.ts'),
    );
    assert.ok(
      hasValidator,
      `UserPromptSubmit hook referencing specs-validator/validate-specs.ts not found in ${HOOKS_JSON_PATH}`,
    );
  },
);

Then(
  /^hook command should reference validate-specs\.ts$/,
  function (this: MdValWorld) {
    // Already fully asserted by the previous step; this step is a no-op
    // continuation of the "And" chain.
  },
);

// ─── Shared "When validation hook runs" (used by @feature3–@feature9) ────────

When(
  /^validation hook runs$/,
  function (this: MdValWorld) {
    runValidateSpecs.call(this, this.tempDir);
  },
);

// ─── @feature3 ────────────────────────────────────────────────────────────────

Given(
  /^\.specs\/my-feature\/ contains all 12 required MD files$/,
  function (this: MdValWorld) {
    this.currentSpecName = 'my-feature';
    const specsRoot = path.join(this.tempDir, '.specs');
    fs.mkdirSync(specsRoot, { recursive: true });
    // Create spec WITHOUT feature file first (next step adds it)
    const specDir = path.join(specsRoot, this.currentSpecName);
    fs.mkdirSync(specDir, { recursive: true });
    for (const file of REQUIRED_MD_FILES) {
      fs.writeFileSync(
        path.join(specDir, file),
        `# ${file.replace('.md', '')}\n\nContent\n`,
      );
    }
  },
);

Given(
  /^\.specs\/my-feature\/ contains a \.feature file$/,
  function (this: MdValWorld) {
    const specDir = path.join(this.tempDir, '.specs', this.currentSpecName);
    fs.writeFileSync(
      path.join(specDir, `${this.currentSpecName}.feature`),
      `Feature: my-feature\n  Scenario: Test\n    Given test\n`,
    );
  },
);

Then(
  /^validation should process my-feature directory$/,
  function (this: MdValWorld) {
    const specsRoot = path.join(this.tempDir, '.specs');
    // A validation report is created when a complete spec is processed
    assert.ok(
      validationReportExists(specsRoot, this.currentSpecName),
      `Expected validation-report.md to exist for ${this.currentSpecName}`,
    );
    // No spec-validator warnings for a trivially clean spec
    // (census/conformance banners are orthogonal and may appear on the host)
    const specWarnings = this.spawnStdout.split('\n').filter(
      (l) => l.includes('NOT_COVERED') || l.includes('ORPHAN') || l.includes('[specs-validator]'),
    );
    assert.strictEqual(
      specWarnings.length,
      0,
      `Expected no spec-validator warnings but got: ${specWarnings.join('\n')}`,
    );
  },
);

// ─── @feature4 ────────────────────────────────────────────────────────────────

Given(
  /^\.specs\/incomplete-feature\/ contains only FR\.md$/,
  function (this: MdValWorld) {
    this.currentSpecName = 'incomplete-feature';
    const specDir = path.join(this.tempDir, '.specs', this.currentSpecName);
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(
      path.join(specDir, 'FR.md'),
      '# Functional Requirements\n\n## FR-1: Test\n',
    );
  },
);

Given(
  /^\.specs\/incomplete-feature\/ has no \.feature file$/,
  function (this: MdValWorld) {
    // Ensured by the previous step — only FR.md was created.
  },
);

Then(
  /^validation should skip incomplete-feature directory$/,
  function (this: MdValWorld) {
    const specsRoot = path.join(this.tempDir, '.specs');
    assert.strictEqual(
      validationReportExists(specsRoot, this.currentSpecName),
      false,
      `Expected no validation-report.md for incomplete spec`,
    );
    const specWarnings = this.spawnStdout.split('\n').filter(
      (l) => l.includes('NOT_COVERED') || l.includes('ORPHAN') || l.includes('[specs-validator]'),
    );
    assert.strictEqual(
      specWarnings.length,
      0,
      `Expected no spec-validator warnings for incomplete spec: ${specWarnings.join('\n')}`,
    );
  },
);

// ─── @feature5 ────────────────────────────────────────────────────────────────

Given(
  /^\.specs\/test-feature\/ is a complete spec$/,
  function (this: MdValWorld) {
    this.currentSpecName = 'test-feature';
    const specsRoot = path.join(this.tempDir, '.specs');
    fs.mkdirSync(specsRoot, { recursive: true });
    createCompleteSpec(specsRoot, this.currentSpecName);
  },
);

Given(
  /^FR\.md contains "## FR-1: Test @feature10"$/,
  function (this: MdValWorld) {
    const frPath = path.join(
      this.tempDir, '.specs', this.currentSpecName, 'FR.md',
    );
    fs.writeFileSync(
      frPath,
      '# Functional Requirements\n\n## FR-1: Test requirement @feature10\n',
    );
  },
);

Given(
  /^\.feature file does NOT contain @feature10$/,
  function (this: MdValWorld) {
    // The default feature file from createCompleteSpec has no @feature10.
    // Assert this is still the case.
    const fp = path.join(
      this.tempDir, '.specs', this.currentSpecName, `${this.currentSpecName}.feature`,
    );
    const content = fs.readFileSync(fp, 'utf-8');
    assert.ok(
      !content.includes('@feature10'),
      'Expected .feature NOT to contain @feature10 at this point',
    );
  },
);

Then(
  /^validation-report\.md should contain "NOT_COVERED"$/,
  function (this: MdValWorld) {
    const specsRoot = path.join(this.tempDir, '.specs');
    const report = getValidationReport(specsRoot, this.currentSpecName);
    assert.ok(
      report.includes('NOT_COVERED'),
      `Expected validation-report.md to contain NOT_COVERED. Got:\n${report}`,
    );
  },
);

Then(
  /^validation-report\.md should reference @feature10$/,
  function (this: MdValWorld) {
    const specsRoot = path.join(this.tempDir, '.specs');
    const report = getValidationReport(specsRoot, this.currentSpecName);
    assert.ok(
      report.includes('@feature10'),
      `Expected validation-report.md to reference @feature10. Got:\n${report}`,
    );
  },
);

// ─── @feature6 ────────────────────────────────────────────────────────────────

Given(
  /^\.feature file contains "# @feature99"$/,
  function (this: MdValWorld) {
    const fp = path.join(
      this.tempDir, '.specs', this.currentSpecName, `${this.currentSpecName}.feature`,
    );
    fs.writeFileSync(
      fp,
      'Feature: Test\n  # @feature99\n  Scenario: Orphan test\n    Given test\n',
    );
  },
);

Given(
  /^no MD file contains @feature99$/,
  function (this: MdValWorld) {
    // The MD files created by createCompleteSpec have no @feature99.
  },
);

Then(
  /^validation-report\.md should contain "ORPHAN"$/,
  function (this: MdValWorld) {
    const specsRoot = path.join(this.tempDir, '.specs');
    const report = getValidationReport(specsRoot, this.currentSpecName);
    assert.ok(
      report.includes('ORPHAN'),
      `Expected validation-report.md to contain ORPHAN. Got:\n${report}`,
    );
  },
);

Then(
  /^validation-report\.md should reference @feature99$/,
  function (this: MdValWorld) {
    const specsRoot = path.join(this.tempDir, '.specs');
    const report = getValidationReport(specsRoot, this.currentSpecName);
    assert.ok(
      report.includes('@feature99'),
      `Expected validation-report.md to reference @feature99. Got:\n${report}`,
    );
  },
);

// ─── @feature7 ────────────────────────────────────────────────────────────────

Given(
  /^FR\.md contains @feature20$/,
  function (this: MdValWorld) {
    const frPath = path.join(
      this.tempDir, '.specs', this.currentSpecName, 'FR.md',
    );
    fs.writeFileSync(
      frPath,
      '# Functional Requirements\n\n## FR-1: Login requirement @feature20\n',
    );
  },
);

Given(
  /^\.feature file contains @feature20 in Scenario comment$/,
  function (this: MdValWorld) {
    const fp = path.join(
      this.tempDir, '.specs', this.currentSpecName, `${this.currentSpecName}.feature`,
    );
    fs.writeFileSync(
      fp,
      'Feature: Test\n  # @feature20\n  Scenario: Login test\n    Given test\n',
    );
  },
);

Then(
  /^validation-report\.md should show COVERED for @feature20$/,
  function (this: MdValWorld) {
    const specsRoot = path.join(this.tempDir, '.specs');
    const report = getValidationReport(specsRoot, this.currentSpecName);
    assert.ok(
      report.includes('COVERED'),
      `Expected validation-report.md to contain COVERED. Got:\n${report}`,
    );
    assert.ok(
      report.includes('@feature20'),
      `Expected validation-report.md to reference @feature20. Got:\n${report}`,
    );
    const specWarnings = this.spawnStdout.split('\n').filter(
      (l) => l.includes('NOT_COVERED') || l.includes('ORPHAN') || l.includes('[specs-validator]'),
    );
    assert.strictEqual(
      specWarnings.length,
      0,
      `Expected no spec-validator warnings for fully-linked spec: ${specWarnings.join('\n')}`,
    );
  },
);

// ─── @feature8 ────────────────────────────────────────────────────────────────

Given(
  /^\.specs\/ directory does not exist$/,
  function (this: MdValWorld) {
    // tempDir has no .specs/ by default (Before hook gives a fresh empty dir).
    const specsRoot = path.join(this.tempDir, '.specs');
    if (fs.existsSync(specsRoot)) {
      fs.rmSync(specsRoot, { recursive: true, force: true });
    }
  },
);

Then(
  /^no validation occurs$/,
  function (this: MdValWorld) {
    assert.strictEqual(
      this.spawnStatus,
      0,
      `Expected exit 0 but got ${this.spawnStatus}`,
    );
  },
);

Then(
  /^no warning is shown$/,
  function (this: MdValWorld) {
    const specWarnings = this.spawnStdout.split('\n').filter(
      (l) => l.includes('NOT_COVERED') || l.includes('ORPHAN') || l.includes('[specs-validator]'),
    );
    assert.strictEqual(
      specWarnings.length,
      0,
      `Expected no spec-validator warnings: ${specWarnings.join('\n')}`,
    );
  },
);

// "exit code is 0" is defined in common.ts

// ─── @feature9 ────────────────────────────────────────────────────────────────

Given(
  /^\.specs\/my-feature\/ is a complete spec$/,
  function (this: MdValWorld) {
    this.currentSpecName = 'my-feature';
    const specsRoot = path.join(this.tempDir, '.specs');
    fs.mkdirSync(specsRoot, { recursive: true });
    createCompleteSpec(specsRoot, this.currentSpecName);
  },
);

Given(
  /^\.specs-validator\.yaml contains "enabled: false"$/,
  function (this: MdValWorld) {
    fs.writeFileSync(
      path.join(this.tempDir, '.specs-validator.yaml'),
      'enabled: false\n',
    );
  },
);

Then(
  /^validation is skipped$/,
  function (this: MdValWorld) {
    const specsRoot = path.join(this.tempDir, '.specs');
    assert.strictEqual(
      validationReportExists(specsRoot, this.currentSpecName),
      false,
      'Expected no validation-report.md when disabled',
    );
    const specWarnings = this.spawnStdout.split('\n').filter(
      (l) => l.includes('NOT_COVERED') || l.includes('ORPHAN') || l.includes('[specs-validator]'),
    );
    assert.strictEqual(
      specWarnings.length,
      0,
      `Expected no spec-validator warnings when disabled: ${specWarnings.join('\n')}`,
    );
  },
);

Then(
  /^no validation-report\.md is created$/,
  function (this: MdValWorld) {
    // Already asserted by the previous step; no-op continuation.
  },
);

// ─── @feature10 IN-PROCESS ────────────────────────────────────────────────────

Given(
  /^a \.test\.ts fixture with 3 it\(\) blocks including @feature1 and @feature2 comment-tags$/,
  async function (this: MdValWorld) {
    const fixtureDir = path.join(this.tempDir, 'test-fixtures');
    fs.mkdirSync(fixtureDir, { recursive: true });
    fs.writeFileSync(
      path.join(fixtureDir, 'sample.test.ts'),
      [
        "import { describe, it } from 'vitest';",
        "describe('TEST001: Sample', () => {",
        '  // @feature1',
        "  it('TEST001_01: first test', () => {});",
        '  // @feature2',
        "  it('TEST001_02: second test', () => {});",
        "  it('TEST001_03: no tag', () => {});",
        '});',
      ].join('\n'),
    );
    // Store path so When step can use it
    (this as any)._fixturePath = path.join(fixtureDir, 'sample.test.ts');
  },
);

When(
  /^parseTestFile is called on the fixture$/,
  async function (this: MdValWorld) {
    const { parseTestFile } = await import(
      '../../tools/specs-validator/parsers/test-parser.ts'
    );
    this.parsedCases = parseTestFile((this as any)._fixturePath);
  },
);

Then(
  /^3 TestCase records are returned$/,
  function (this: MdValWorld) {
    assert.equal(
      this.parsedCases.length,
      3,
      `Expected 3 test cases, got ${this.parsedCases.length}`,
    );
  },
);

Then(
  /^the first case has id "([^"]+)" and featureTag "([^"]+)"$/,
  function (this: MdValWorld, expectedId: string, expectedTag: string) {
    const first = this.parsedCases[0];
    assert.equal(first.id, expectedId, `First case id mismatch`);
    assert.equal(first.featureTag, expectedTag, `First case featureTag mismatch`);
  },
);

Then(
  /^the second case has id "([^"]+)" and featureTag "([^"]+)"$/,
  function (this: MdValWorld, expectedId: string, expectedTag: string) {
    const second = this.parsedCases[1];
    assert.equal(second.id, expectedId, `Second case id mismatch`);
    assert.equal(second.featureTag, expectedTag, `Second case featureTag mismatch`);
  },
);

Then(
  /^the third case has id "([^"]+)" with no featureTag$/,
  function (this: MdValWorld, expectedId: string) {
    const third = this.parsedCases[2];
    assert.equal(third.id, expectedId, `Third case id mismatch`);
    assert.equal(
      third.featureTag,
      undefined,
      `Third case featureTag should be undefined, got ${third.featureTag}`,
    );
  },
);

// ─── @feature11 IN-PROCESS ────────────────────────────────────────────────────

Given(
  /^a \.test\.ts with cases ALIGN001_01 and ALIGN001_02$/,
  function (this: MdValWorld) {
    const fixtureDir = path.join(this.tempDir, 'align-fixtures');
    fs.mkdirSync(fixtureDir, { recursive: true });
    fs.writeFileSync(
      path.join(fixtureDir, 'align.test.ts'),
      [
        "describe('ALIGN001: Test', () => {",
        "  it('ALIGN001_01: exists in both', () => {});",
        "  it('ALIGN001_02: only in test', () => {});",
        '});',
      ].join('\n'),
    );
    (this as any)._alignTestPath = path.join(fixtureDir, 'align.test.ts');
  },
);

Given(
  /^a \.feature file with scenarios ALIGN001_01 and ALIGN001_03$/,
  function (this: MdValWorld) {
    const fixtureDir = path.join(this.tempDir, 'align-fixtures');
    fs.writeFileSync(
      path.join(fixtureDir, 'align.feature'),
      [
        'Feature: Alignment test',
        '  Scenario: ALIGN001_01 exists in both',
        '    Given something',
        '  Scenario: ALIGN001_03 only in feature',
        '    Given something else',
      ].join('\n'),
    );
    (this as any)._alignFeaturePath = path.join(fixtureDir, 'align.feature');
  },
);

When(
  /^matchTestFeature is called with those files$/,
  async function (this: MdValWorld) {
    const { parseTestFile } = await import(
      '../../tools/specs-validator/parsers/test-parser.ts'
    );
    const { matchTestFeature } = await import(
      '../../tools/specs-validator/matcher.ts'
    );
    const testCases = parseTestFile((this as any)._alignTestPath);
    this.matchResults = matchTestFeature(
      testCases,
      (this as any)._alignFeaturePath,
    );
  },
);

Then(
  /^ALIGN001_01 is ALIGNED$/,
  function (this: MdValWorld) {
    const entry = this.matchResults.find((r) => r.id === 'ALIGN001_01');
    assert.ok(entry, 'ALIGN001_01 not found in match results');
    assert.equal(entry.status, 'ALIGNED', `Expected ALIGNED, got ${entry.status}`);
  },
);

Then(
  /^ALIGN001_02 is TEST_NOT_IN_FEATURE$/,
  function (this: MdValWorld) {
    const entry = this.matchResults.find((r) => r.id === 'ALIGN001_02');
    assert.ok(entry, 'ALIGN001_02 not found in match results');
    assert.equal(
      entry.status,
      'TEST_NOT_IN_FEATURE',
      `Expected TEST_NOT_IN_FEATURE, got ${entry.status}`,
    );
  },
);

Then(
  /^ALIGN001_03 is FEATURE_NOT_IN_TEST$/,
  function (this: MdValWorld) {
    const entry = this.matchResults.find((r) => r.id === 'ALIGN001_03');
    assert.ok(entry, 'ALIGN001_03 not found in match results');
    assert.equal(
      entry.status,
      'FEATURE_NOT_IN_TEST',
      `Expected FEATURE_NOT_IN_TEST, got ${entry.status}`,
    );
  },
);
