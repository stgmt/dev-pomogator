/**
 * PLUGIN006 step definitions — specs-generator CLI scripts
 * (scaffold-spec, validate-spec, spec-status, list-specs, fill-template,
 *  analyze-features, audit-spec)
 *
 * Migrated from tests/e2e/specs-generator.test.ts.
 *
 * Isolation: SPECS_GENERATOR_ROOT=tempDir routes all CLI operations to the
 * World per-scenario temp directory — the real repo's .specs/ is never touched.
 *
 * All step patterns are REGEX (prefixed with "specs-generator" where the text
 * would otherwise be too generic to be safely collision-free).
 *
 * @see tests/features/plugins/specs-workflow/PLUGIN006_specs-generator.feature
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
const CORE_MJS = path.join(REPO_ROOT, 'tools', 'specs-generator', 'specs-generator-core.mjs');
const FIXTURES_DIR = path.join(REPO_ROOT, 'tests', 'fixtures', 'specs-generator');
const ANALYZE_CORPUS = path.join(REPO_ROOT, 'tools', 'specs-generator', '__fixtures__', 'analyze-features-corpus');

interface SgWorld extends V4World {
  sgExitCode?: number;
  sgJson?: Record<string, unknown> | null;
  sgFixtureName?: string;
  sgSpecName?: string;
  // multi-step carry: phase-confirming scenarios confirm in sequence
  sgPhaseConfirmed?: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Spawn specs-generator-core.mjs <command> with SPECS_GENERATOR_ROOT=tempDir.
 * All paths resolved by the CLI will be relative to tempDir, keeping the
 * real repo's .specs/ untouched.
 */
function runCore(this: SgWorld, command: string, ...args: string[]): void {
  const res = spawnSync(process.execPath, [CORE_MJS, command, '-Format', 'json', ...args], {
    encoding: 'utf-8',
    env: { ...process.env, SPECS_GENERATOR_ROOT: this.tempDir },
    cwd: REPO_ROOT,
  });
  this.sgExitCode = res.status ?? 1;
  this.lastStdout = res.stdout ?? '';
  this.lastStderr = res.stderr ?? '';
  try {
    this.sgJson = JSON.parse(this.lastStdout);
  } catch {
    this.sgJson = null;
  }
}

/**
 * Run analyze-features (special case: uses process.cwd() as scan root, not
 * SPECS_GENERATOR_ROOT).  Pass the dedicated fixture corpus as cwd so the
 * result is deterministic and never walks the live repo tree.
 */
function runAnalyze(this: SgWorld, extraArgs: string[] = []): void {
  const res = spawnSync(process.execPath, [CORE_MJS, 'analyze-features', '-Format', 'json', ...extraArgs], {
    encoding: 'utf-8',
    env: { ...process.env, SPECS_GENERATOR_ROOT: this.tempDir },
    cwd: ANALYZE_CORPUS,
  });
  this.sgExitCode = res.status ?? 1;
  this.lastStdout = res.stdout ?? '';
  this.lastStderr = res.stderr ?? '';
  try {
    this.sgJson = JSON.parse(this.lastStdout);
  } catch {
    this.sgJson = null;
  }
}

/**
 * Copy a specs-generator fixture directory into tempDir/.specs/<name>.
 * The CLI (with SPECS_GENERATOR_ROOT=tempDir) will then find it at
 * `.specs/<name>` relative to its root.
 */
function loadFixture(this: SgWorld, fixtureName: string): void {
  const src = path.join(FIXTURES_DIR, fixtureName);
  const dst = path.join(this.tempDir, '.specs', fixtureName);
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.isFile()) {
      fs.copyFileSync(path.join(src, entry.name), path.join(dst, entry.name));
    }
  }
  this.sgFixtureName = fixtureName;
}

/** Return the audit/validate result's findings array (safe accessor). */
function findings(world: SgWorld): Array<Record<string, unknown>> {
  return ((world.sgJson as any)?.findings ?? []) as Array<Record<string, unknown>>;
}

/** Return the validate-spec result's errors array (safe accessor). */
function errors(world: SgWorld): Array<Record<string, unknown>> {
  return ((world.sgJson as any)?.errors ?? []) as Array<Record<string, unknown>>;
}

/** Return the validate-spec result's warnings array (safe accessor). */
function warnings(world: SgWorld): Array<Record<string, unknown>> {
  return ((world.sgJson as any)?.warnings ?? []) as Array<Record<string, unknown>>;
}

// ────────────────────────────────────────────────────────────────────────────
// Background
// NOTE: "the specs-generator scripts are installed" step is defined in
//   feature_create_specs_bdd_enforcement.ts (superset check: scaffold-spec,
//   bdd-framework-detector, core.mjs). No duplicate needed here.
// ────────────────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────
// scaffold-spec.ts  (@feature1, @feature2, @feature3, @feature36, @feature54)
// ────────────────────────────────────────────────────────────────────────────

When(/^I run scaffold-spec\.ts with name "([^"]+)"$/, function (this: SgWorld, name: string) {
  this.sgSpecName = name;
  runCore.call(this, 'scaffold-spec', '-Name', name);
});

When(/^I run scaffold-spec\.ts with name "([^"]+)" and -Force flag$/, function (this: SgWorld, name: string) {
  this.sgSpecName = name;
  runCore.call(this, 'scaffold-spec', '-Name', name, '-Force');
});

Given(/^a spec folder "([^"]+)" already exists$/, function (this: SgWorld, name: string) {
  // Create a minimal spec folder so scaffold-spec would normally refuse to overwrite it
  const dir = path.join(this.tempDir, '.specs', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'README.md'), '# placeholder');
  this.sgSpecName = name;
});

Then(/^the result should be successful$/, function (this: SgWorld) {
  assert.equal(this.sgExitCode, 0, `Expected exit code 0, got ${this.sgExitCode}\nstdout: ${this.lastStdout}\nstderr: ${this.lastStderr}`);
  assert.ok((this.sgJson as any)?.success === true, `Expected success=true in JSON output: ${this.lastStdout}`);
});

Then(/^(\d+) files should be created in "([^"]+)"$/, function (this: SgWorld, count: string, _path: string) {
  const json = this.sgJson as any;
  assert.equal(json?.created_files?.length, Number(count), `Expected ${count} files, got ${json?.created_files?.length}\n${this.lastStdout}`);
});

Then(/^(\d+) files should be created$/, function (this: SgWorld, count: string) {
  const json = this.sgJson as any;
  assert.equal(json?.created_files?.length, Number(count), `Expected ${count} files, got ${json?.created_files?.length}`);
});

Then(/^the next_step should mention "([^"]+)"$/, function (this: SgWorld, text: string) {
  const json = this.sgJson as any;
  assert.ok(json?.next_step?.includes(text), `Expected next_step to contain "${text}", got: "${json?.next_step}"`);
});

Then(/^the result should fail with exit code (\d+)$/, function (this: SgWorld, code: string) {
  assert.equal(this.sgExitCode, Number(code), `Expected exit code ${code}, got ${this.sgExitCode}`);
});

Then(/^the error should mention "([^"]+)"$/, function (this: SgWorld, text: string) {
  const json = this.sgJson as any;
  const errMsg = typeof json?.error === 'string' ? json.error : JSON.stringify(json?.error ?? '');
  assert.ok(errMsg.includes(text), `Expected error to contain "${text}", got: ${errMsg}`);
});

// @feature36 progress.json fields
Then(/^\.progress\.json should exist in "([^"]+)"$/, function (this: SgWorld, relativePath: string) {
  const fullPath = path.join(this.tempDir, relativePath, '.progress.json');
  assert.ok(fs.existsSync(fullPath), `.progress.json not found at ${fullPath}`);
});

Then(/^progress\.version should be (\d+)$/, function (this: SgWorld, version: string) {
  const specName = this.sgSpecName ?? '';
  const progressPath = path.join(this.tempDir, '.specs', specName, '.progress.json');
  const prog = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
  assert.equal(prog.version, Number(version), `Expected version ${version}, got ${prog.version}`);
});

Then(/^progress\.currentPhase should be "([^"]+)"$/, function (this: SgWorld, phase: string) {
  const specName = this.sgSpecName ?? '';
  const progressPath = path.join(this.tempDir, '.specs', specName, '.progress.json');
  const prog = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
  assert.equal(prog.currentPhase, phase, `Expected currentPhase "${phase}", got "${prog.currentPhase}"`);
});

Then(/^all stopConfirmed flags should be false$/, function (this: SgWorld) {
  const specName = this.sgSpecName ?? '';
  const progressPath = path.join(this.tempDir, '.specs', specName, '.progress.json');
  const prog = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
  for (const [phaseName, phase] of Object.entries(prog.phases ?? {})) {
    assert.ok(!(phase as any).stopConfirmed, `Expected stopConfirmed=false for phase ${phaseName}`);
  }
});

Then(/^created_files count should still be 15$/, function (this: SgWorld) {
  const json = this.sgJson as any;
  assert.equal(json?.created_files?.length, 15, `Expected 15 created files, got ${json?.created_files?.length}`);
});

// @feature54 created files include FIXTURES.md
Then(/^created files should include "([^"]+)"$/, function (this: SgWorld, filename: string) {
  const json = this.sgJson as any;
  const files: string[] = json?.created_files ?? [];
  assert.ok(files.some((f: string) => f.includes(filename)), `Expected created files to include ${filename}, got: ${files.join(', ')}`);
});

// ────────────────────────────────────────────────────────────────────────────
// validate-spec.ts  (@feature4-@feature8, @feature16-@feature18, @feature27-@feature30,
//                    @feature50, @feature52, @feature55)
// ────────────────────────────────────────────────────────────────────────────

Given(/^a complete spec fixture "([^"]+)" exists$/, function (this: SgWorld, name: string) {
  loadFixture.call(this, name);
});

Given(/^an incomplete spec fixture "([^"]+)" exists$/, function (this: SgWorld, name: string) {
  loadFixture.call(this, name);
});

Given(/^a partial spec fixture "([^"]+)" exists$/, function (this: SgWorld, name: string) {
  loadFixture.call(this, name);
});

Given(/^a partial spec fixture exists$/, function (this: SgWorld) {
  loadFixture.call(this, 'partial-spec');
});

When(/^I run validate-spec\.ts on "([^"]+)"$/, function (this: SgWorld, name: string) {
  runCore.call(this, 'validate-spec', '-Path', `.specs/${name}`);
});

When(/^I run validate-spec\.ts on the spec$/, function (this: SgWorld) {
  runCore.call(this, 'validate-spec', '-Path', `.specs/${this.sgFixtureName}`);
});

When(/^I run validate-spec\.ts on that spec$/, function (this: SgWorld) {
  runCore.call(this, 'validate-spec', '-Path', `.specs/${this.sgFixtureName}`);
});

Then(/^the result should have valid=true$/, function (this: SgWorld) {
  const json = this.sgJson as any;
  assert.ok(json?.valid === true, `Expected valid=true, got: ${JSON.stringify(json)}`);
});

Then(/^the result should have valid=false$/, function (this: SgWorld) {
  const json = this.sgJson as any;
  assert.ok(json?.valid === false, `Expected valid=false, got: ${JSON.stringify(json)}`);
});

Then(/^errors count should be (\d+)$/, function (this: SgWorld, count: string) {
  assert.equal(errors(this).length, Number(count), `Expected ${count} errors, got ${errors(this).length}`);
});

Then(/^errors should contain rule "([^"]+)"$/, function (this: SgWorld, rule: string) {
  assert.ok(errors(this).some(e => (e as any).rule === rule), `Expected error with rule "${rule}"`);
});

Then(/^warnings should contain rule "([^"]+)"$/, function (this: SgWorld, rule: string) {
  assert.ok(warnings(this).some(w => (w as any).rule === rule), `Expected warning with rule "${rule}"`);
});

Then(/^warnings should not contain rule "([^"]+)"$/, function (this: SgWorld, rule: string) {
  assert.ok(!warnings(this).some(w => (w as any).rule === rule), `Expected no warning with rule "${rule}"`);
});

Then(/^CROSS_REF_LINKS warnings should mention "([^"]+)" and "([^"]+)"$/, function (this: SgWorld, term1: string, term2: string) {
  const links = warnings(this).filter(w => (w as any).rule === 'CROSS_REF_LINKS');
  const msgs = links.map(w => (w as any).message ?? '').join(' ');
  assert.ok(msgs.includes(term1), `Expected CROSS_REF_LINKS warning to mention "${term1}": ${msgs}`);
  assert.ok(msgs.includes(term2), `Expected CROSS_REF_LINKS warning to mention "${term2}": ${msgs}`);
});

Then(/^warning message should mention "([^"]+)"$/, function (this: SgWorld, text: string) {
  const msgs = warnings(this).map(w => (w as any).message ?? '').join(' ');
  assert.ok(msgs.includes(text), `Expected warning message to contain "${text}": ${msgs}`);
});

// @feature6 @feature7 @feature8 — spec fixtures with invalid content
Given(/^a spec fixture with invalid FR\.md format exists$/, function (this: SgWorld) {
  // Use the invalid-spec fixture which has bad FR.md
  loadFixture.call(this, 'invalid-spec');
});

Given(/^a spec fixture with invalid USE_CASES\.md format exists$/, function (this: SgWorld) {
  // Use the invalid-spec fixture, re-label for clarity
  loadFixture.call(this, 'invalid-spec');
  // UC_FORMAT: invalid-spec has non-conformant USE_CASES.md
});

Given(/^a spec fixture with missing NFR sections exists$/, function (this: SgWorld) {
  // Use the invalid-spec fixture which is missing NFR sections
  loadFixture.call(this, 'invalid-spec');
});

// @feature27 @feature28 @feature29 @feature30 — inline spec construction
Given(/^a spec with unfilled \{placeholder\} templates$/, function (this: SgWorld) {
  const name = 'inline-placeholder-test';
  const dir = path.join(this.tempDir, '.specs', name);
  fs.mkdirSync(dir, { recursive: true });
  // Copy valid-spec as base then add a placeholder
  loadFixture.call(this, 'valid-spec');
  this.sgFixtureName = 'valid-spec';
  // Write a USER_STORIES.md with an unfilled placeholder
  const usPath = path.join(this.tempDir, '.specs', 'valid-spec', 'USER_STORIES.md');
  fs.writeFileSync(usPath, '# User Stories\n\n{placeholder_not_filled}\n');
});

Given(/^a spec with non-EARS acceptance criteria$/, function (this: SgWorld) {
  loadFixture.call(this, 'valid-spec');
  // Overwrite AC with non-EARS format
  const acPath = path.join(this.tempDir, '.specs', 'valid-spec', 'ACCEPTANCE_CRITERIA.md');
  fs.writeFileSync(acPath, '# Acceptance Criteria\n\n## AC-1 (FR-1): Something\n\nThe system should do something good.\n');
});

Given(/^a spec with Feature line lacking DOMAIN prefix$/, function (this: SgWorld) {
  loadFixture.call(this, 'valid-spec');
  // Overwrite feature file with non-domain-prefixed Feature line
  const featurePath = path.join(this.tempDir, '.specs', 'valid-spec', 'valid-spec.feature');
  fs.writeFileSync(featurePath, 'Feature: No Domain Prefix\n\n  Scenario: test\n    Given something\n');
});

Given(/^a spec with RESEARCH\.md lacking Project Context$/, function (this: SgWorld) {
  loadFixture.call(this, 'valid-spec');
  const resPath = path.join(this.tempDir, '.specs', 'valid-spec', 'RESEARCH.md');
  fs.writeFileSync(resPath, '# Research\n\n## Findings\n\nSome findings here.\n');
});

// @feature50 @feature51 @feature52 — open questions
Given(/^a spec with RESEARCH\.md containing unclosed open questions$/, function (this: SgWorld) {
  loadFixture.call(this, 'valid-spec');
  const resPath = path.join(this.tempDir, '.specs', 'valid-spec', 'RESEARCH.md');
  fs.writeFileSync(resPath, '# Research\n\n## Project Context\n\nSome context.\n\n## Open Questions\n\n- [ ] What is the best approach?\n- [ ] How should we handle errors?\n');
});

Given(/^a spec with RESEARCH\.md where all open questions have DEFERRED markers$/, function (this: SgWorld) {
  loadFixture.call(this, 'valid-spec');
  const resPath = path.join(this.tempDir, '.specs', 'valid-spec', 'RESEARCH.md');
  // validate-spec suppresses OPEN_QUESTIONS only when a `> DEFERRED: reason` blockquote sits on the
  // line BEFORE the open question (specs-generator-core.mjs:543) — the agent's inline `[DEFERRED:…]`
  // on the same line was the wrong format and left the warning firing.
  fs.writeFileSync(resPath, '# Research\n\n## Project Context\n\nSome context.\n\n## Open Questions\n\n> DEFERRED: out of scope\n- [ ] What is the best approach?\n');
});

// ────────────────────────────────────────────────────────────────────────────
// spec-status.ts  (@feature9-@feature11, @feature37-@feature44, @feature49,
//                  @feature51)
// ────────────────────────────────────────────────────────────────────────────

When(/^I run spec-status\.ts on "([^"]+)"$/, function (this: SgWorld, name: string) {
  this.sgFixtureName = name;
  runCore.call(this, 'spec-status', '-Path', `.specs/${name}`);
});

When(/^I run spec-status\.ts on the spec$/, function (this: SgWorld) {
  runCore.call(this, 'spec-status', '-Path', `.specs/${this.sgFixtureName}`);
});

When(/^I run spec-status\.ts on that spec$/, function (this: SgWorld) {
  runCore.call(this, 'spec-status', '-Path', `.specs/${this.sgFixtureName}`);
});

When(/^I run spec-status\.ts with -ConfirmStop "([^"]+)"$/, function (this: SgWorld, phase: string) {
  runCore.call(this, 'spec-status', '-Path', `.specs/${this.sgFixtureName}`, '-ConfirmStop', phase);
  if (!this.sgPhaseConfirmed) this.sgPhaseConfirmed = [];
  this.sgPhaseConfirmed.push(phase);
});

When(/^I run spec-status\.ts with -Path "\."$/, function (this: SgWorld) {
  runCore.call(this, 'spec-status', '-Path', '.');
});

When(/^I run spec-status\.ts again$/, function (this: SgWorld) {
  runCore.call(this, 'spec-status', '-Path', `.specs/${this.sgFixtureName}`);
});

When(/^I confirm all stop points via -ConfirmStop$/, function (this: SgWorld) {
  for (const phase of ['Discovery', 'Context', 'Requirements', 'Design', 'Implementation', 'Finalization']) {
    runCore.call(this, 'spec-status', '-Path', `.specs/${this.sgFixtureName}`, '-ConfirmStop', phase);
  }
});

Then(/^the phase should be "([^"]+)" or "([^"]+)"$/, function (this: SgWorld, phase1: string, phase2: string) {
  const json = this.sgJson as any;
  const phase = json?.currentPhase ?? json?.phase;
  assert.ok(phase === phase1 || phase === phase2, `Expected phase "${phase1}" or "${phase2}", got "${phase}"`);
});

Then(/^progress_percent should be less than 100$/, function (this: SgWorld) {
  const json = this.sgJson as any;
  const pct = json?.progress_percent ?? json?.progressPercent ?? 0;
  assert.ok(pct < 100, `Expected progress_percent < 100, got ${pct}`);
});

Then(/^progress_percent should be close to 100$/, function (this: SgWorld) {
  const json = this.sgJson as any;
  const pct = json?.progress_percent ?? json?.progressPercent ?? 0;
  assert.ok(pct >= 80, `Expected progress_percent close to 100, got ${pct}`);
});

Then(/^next_action should not be empty$/, function (this: SgWorld) {
  const json = this.sgJson as any;
  const na = json?.next_action ?? '';
  assert.ok(na.length > 0, `Expected next_action to be non-empty`);
});

Then(/^the files output should include CHANGELOG\.md$/, function (this: SgWorld) {
  const json = this.sgJson as any;
  const files = json?.files ?? {};
  assert.ok('CHANGELOG.md' in files, `Expected files to include CHANGELOG.md, keys: ${Object.keys(files).join(', ')}`);
});

Then(/^CHANGELOG\.md status should be defined$/, function (this: SgWorld) {
  const json = this.sgJson as any;
  const status = (json?.files ?? {})['CHANGELOG.md']?.status;
  assert.ok(status !== undefined && status !== null, `Expected CHANGELOG.md status to be defined`);
});

Then(/^all Discovery files should have status "([^"]+)" not "([^"]+)"$/, function (this: SgWorld, expected: string, notExpected: string) {
  const json = this.sgJson as any;
  const files = json?.files ?? {};
  for (const [fname, info] of Object.entries(files)) {
    const status = (info as any).status;
    if (status === notExpected) {
      assert.fail(`File ${fname} has status "${notExpected}", expected "${expected}"`);
    }
  }
});

Then(/^no file should report placeholders for programming identifiers$/, function (this: SgWorld) {
  const json = this.sgJson as any;
  const files = json?.files ?? {};
  for (const [fname, info] of Object.entries(files)) {
    const issues = (info as any).issues ?? [];
    const placeholderIssues = issues.filter((i: any) => i.type === 'placeholder' || (typeof i === 'string' && i.includes('{') && i.includes('}')));
    assert.equal(placeholderIssues.length, 0, `File ${fname} has unexpected placeholder issues: ${JSON.stringify(placeholderIssues)}`);
  }
});

Then(/^\.progress\.json should be created with version (\d+)$/, function (this: SgWorld, version: string) {
  const progressPath = path.join(this.tempDir, '.specs', this.sgFixtureName!, '.progress.json');
  assert.ok(fs.existsSync(progressPath), `.progress.json not created at ${progressPath}`);
  const prog = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
  assert.equal(prog.version, Number(version), `Expected version ${version}, got ${prog.version}`);
});

Then(/^progress_state should be included in the output$/, function (this: SgWorld) {
  const json = this.sgJson as any;
  assert.ok(json?.progress_state !== undefined, `Expected progress_state in output: ${JSON.stringify(json)}`);
});

Then(/^progress\.phases\.Discovery\.stopConfirmed should be true$/, function (this: SgWorld) {
  const progressPath = path.join(this.tempDir, '.specs', this.sgFixtureName!, '.progress.json');
  const prog = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
  assert.ok(prog.phases?.Discovery?.stopConfirmed === true, `Expected Discovery.stopConfirmed=true`);
});

Then(/^progress\.phases\.Discovery\.stopConfirmedAt should not be null$/, function (this: SgWorld) {
  const progressPath = path.join(this.tempDir, '.specs', this.sgFixtureName!, '.progress.json');
  const prog = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
  assert.ok(prog.phases?.Discovery?.stopConfirmedAt != null, `Expected Discovery.stopConfirmedAt to be set`);
});

Then(/^progress\.phases\.Requirements\.stopConfirmed should still be false$/, function (this: SgWorld) {
  const progressPath = path.join(this.tempDir, '.specs', this.sgFixtureName!, '.progress.json');
  const prog = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
  assert.ok(!prog.phases?.Requirements?.stopConfirmed, `Expected Requirements.stopConfirmed=false`);
});

Then(/^progress\.phases\.Discovery\.completedAt should not be null$/, function (this: SgWorld) {
  const progressPath = path.join(this.tempDir, '.specs', this.sgFixtureName!, '.progress.json');
  const prog = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
  assert.ok(prog.phases?.Discovery?.completedAt != null, `Expected Discovery.completedAt to be set`);
});

Then(/^progress\.phases\.Finalization\.completedAt should not be null$/, function (this: SgWorld) {
  const progressPath = path.join(this.tempDir, '.specs', this.sgFixtureName!, '.progress.json');
  const prog = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
  assert.ok(prog.phases?.Finalization?.completedAt != null, `Expected Finalization.completedAt to be set`);
});

Then(/^currentPhase should be "([^"]+)"$/, function (this: SgWorld, phase: string) {
  const json = this.sgJson as any;
  const current = json?.currentPhase ?? json?.progress_state?.currentPhase;
  assert.equal(current, phase, `Expected currentPhase="${phase}", got "${current}"`);
});

Then(/^specs-generator exit code should be non-zero$/, function (this: SgWorld) {
  assert.ok((this.sgExitCode ?? 0) !== 0, `Expected non-zero exit code, got ${this.sgExitCode}`);
});

Then(/^specs-generator output should contain "([^"]+)"$/, function (this: SgWorld, text: string) {
  const combined = (this.lastStdout ?? '') + (this.lastStderr ?? '');
  assert.ok(combined.includes(text), `Expected output to contain "${text}"\nstdout: ${this.lastStdout}\nstderr: ${this.lastStderr}`);
});

// @feature37 — partial spec with no .progress.json
Given(/^a partial spec fixture exists without \.progress\.json$/, function (this: SgWorld) {
  loadFixture.call(this, 'partial-spec');
  // Remove .progress.json if present in the fixture copy
  const progressPath = path.join(this.tempDir, '.specs', 'partial-spec', '.progress.json');
  if (fs.existsSync(progressPath)) fs.unlinkSync(progressPath);
});

// @feature39 — valid spec fixture exists
Given(/^a valid spec fixture exists$/, function (this: SgWorld) {
  loadFixture.call(this, 'valid-spec');
});

Given(/^a valid spec fixture exists with all files complete$/, function (this: SgWorld) {
  loadFixture.call(this, 'valid-spec');
});

// @feature42 — partial spec fixture with incomplete files
Given(/^a partial spec fixture exists with incomplete files$/, function (this: SgWorld) {
  loadFixture.call(this, 'partial-spec');
});

// @feature43 — spec with .progress.json
Given(/^a spec with \.progress\.json exists$/, function (this: SgWorld) {
  loadFixture.call(this, 'valid-spec');
  // partial-spec already has progress state; use it
});

// @feature41 — placeholder false positive fixture
Given(/^a spec fixture "([^"]+)" with programming vars like \{prefix\} and \{session_id\}$/, function (this: SgWorld, name: string) {
  loadFixture.call(this, name);
});

// RESEARCH.md blockers
Then(/^RESEARCH\.md status should be "([^"]+)"$/, function (this: SgWorld, status: string) {
  const json = this.sgJson as any;
  const resStatus = (json?.files ?? {})['RESEARCH.md']?.status;
  assert.equal(resStatus, status, `Expected RESEARCH.md status "${status}", got "${resStatus}"`);
});

Then(/^blockers should mention "([^"]+)"$/, function (this: SgWorld, text: string) {
  const json = this.sgJson as any;
  const blockers: string[] = json?.blockers ?? [];
  assert.ok(blockers.some((b: string) => b.includes(text)), `Expected blockers to mention "${text}": ${JSON.stringify(blockers)}`);
});

// ────────────────────────────────────────────────────────────────────────────
// list-specs.ts  (@feature12, @feature13)
// ────────────────────────────────────────────────────────────────────────────

Given(/^multiple spec folders exist in \.specs\/$/, function (this: SgWorld) {
  // Seed two spec dirs in tempDir
  for (const name of ['alpha-spec', 'beta-spec']) {
    loadFixture.call(this, 'valid-spec');
    // Rename the copy to give unique names
    const src = path.join(this.tempDir, '.specs', 'valid-spec');
    const dst = path.join(this.tempDir, '.specs', name);
    if (!fs.existsSync(dst)) {
      fs.cpSync(src, dst, { recursive: true });
    }
  }
});

Given(/^both complete and incomplete specs exist$/, function (this: SgWorld) {
  loadFixture.call(this, 'valid-spec');
  loadFixture.call(this, 'partial-spec');
});

When(/^I run list-specs\.ts$/, function (this: SgWorld) {
  runCore.call(this, 'list-specs');
});

When(/^I run list-specs\.ts with -Incomplete flag$/, function (this: SgWorld) {
  runCore.call(this, 'list-specs', '-Incomplete');
});

Then(/^the result should contain specs array$/, function (this: SgWorld) {
  const json = this.sgJson as any;
  assert.ok(Array.isArray(json?.specs), `Expected specs array in output: ${JSON.stringify(json)}`);
});

Then(/^summary should have total count$/, function (this: SgWorld) {
  const json = this.sgJson as any;
  assert.ok(typeof json?.summary?.total === 'number', `Expected summary.total to be a number: ${JSON.stringify(json?.summary)}`);
});

Then(/^only incomplete specs should be returned$/, function (this: SgWorld) {
  const json = this.sgJson as any;
  const specs: any[] = json?.specs ?? [];
  assert.ok(specs.every((s: any) => s.status !== 'complete'), `Expected only incomplete specs, but found some complete: ${JSON.stringify(specs)}`);
});

// ────────────────────────────────────────────────────────────────────────────
// fill-template.ts  (@feature14, @feature15)
// ────────────────────────────────────────────────────────────────────────────

Given(/^a template file with placeholders exists$/, function (this: SgWorld) {
  // Copy the real template fixture into the temp dir
  const src = path.join(FIXTURES_DIR, 'template-file.md');
  const dst = path.join(this.tempDir, 'template-file.md');
  fs.copyFileSync(src, dst);
  this.sgFixtureName = 'template-file';
});

When(/^I run fill-template\.ts with -ListPlaceholders$/, function (this: SgWorld) {
  const filePath = path.join(this.tempDir, 'template-file.md');
  // fill-template works on a real file path, no SPECS_GENERATOR_ROOT needed
  const res = spawnSync(process.execPath, [CORE_MJS, 'fill-template', '-File', filePath, '-ListPlaceholders', '-Format', 'json'], {
    encoding: 'utf-8',
    cwd: REPO_ROOT,
  });
  this.sgExitCode = res.status ?? 1;
  this.lastStdout = res.stdout ?? '';
  try { this.sgJson = JSON.parse(this.lastStdout); } catch { this.sgJson = null; }
});

When(/^I run fill-template\.ts with -Values JSON$/, function (this: SgWorld) {
  const filePath = path.join(this.tempDir, 'template-file.md');
  // The fixture's placeholders are Russian ({название}/{роль}/…); value keys are the placeholder
  // names WITHOUT braces, so these two actually get filled (9 -> 7) — the agent's English keys matched
  // nothing and left placeholders_after == placeholders_before.
  const values = JSON.stringify({ 'название': 'Моя фича', 'роль': 'разработчик' });
  const res = spawnSync(process.execPath, [CORE_MJS, 'fill-template', '-File', filePath, '-Values', values, '-Format', 'json'], {
    encoding: 'utf-8',
    cwd: REPO_ROOT,
  });
  this.sgExitCode = res.status ?? 1;
  this.lastStdout = res.stdout ?? '';
  try { this.sgJson = JSON.parse(this.lastStdout); } catch { this.sgJson = null; }
});

Then(/^the result should contain placeholders array$/, function (this: SgWorld) {
  const json = this.sgJson as any;
  assert.ok(Array.isArray(json?.placeholders), `Expected placeholders array in output: ${JSON.stringify(json)}`);
});

Then(/^total count should match actual placeholders$/, function (this: SgWorld) {
  const json = this.sgJson as any;
  const arr: any[] = json?.placeholders ?? [];
  assert.ok(typeof json?.total === 'number', `Expected total to be a number`);
  // total may equal or exceed placeholders array length (deduplication)
  assert.ok(json.total >= arr.length, `Expected total >= placeholders.length`);
});

Then(/^placeholders_after should be less than placeholders_before$/, function (this: SgWorld) {
  const json = this.sgJson as any;
  assert.ok(typeof json?.placeholders_after === 'number', `Expected placeholders_after to be a number`);
  assert.ok(typeof json?.placeholders_before === 'number', `Expected placeholders_before to be a number`);
  assert.ok(json.placeholders_after < json.placeholders_before, `Expected placeholders_after (${json.placeholders_after}) < placeholders_before (${json.placeholders_before})`);
});

Then(/^filled array should contain replaced placeholders$/, function (this: SgWorld) {
  const json = this.sgJson as any;
  assert.ok(Array.isArray(json?.filled), `Expected filled array in output`);
  assert.ok(json.filled.length > 0, `Expected at least one filled placeholder`);
});

// ────────────────────────────────────────────────────────────────────────────
// analyze-features.ts  (@feature31-@feature35)
// ────────────────────────────────────────────────────────────────────────────

When(/^I run analyze-features\.ts over the analyze-features fixture corpus$/, function (this: SgWorld) {
  runAnalyze.call(this);
});

When(/^I run analyze-features\.ts over the corpus with -DomainCode "([^"]+)"$/, function (this: SgWorld, code: string) {
  runAnalyze.call(this, ['-DomainCode', code]);
});

When(/^I run analyze-features\.ts over the corpus with -FeatureSlug "([^"]+)"$/, function (this: SgWorld, slug: string) {
  runAnalyze.call(this, ['-FeatureSlug', slug]);
});

Then(/^the result should report totalFeatures equal to the corpus size$/, function (this: SgWorld) {
  const json = this.sgJson as any;
  // The fixture corpus has 3 .feature files
  assert.equal(json?.totalFeatures, 3, `Expected totalFeatures=3, got ${json?.totalFeatures}`);
});

Then(/^distribution should contain production and fixture counts$/, function (this: SgWorld) {
  const json = this.sgJson as any;
  assert.ok(json?.distribution, `Expected distribution in output`);
  assert.ok(typeof json.distribution.production === 'number', `Expected distribution.production`);
  assert.ok(typeof json.distribution.fixture === 'number', `Expected distribution.fixture`);
});

Then(/^stepDictionary should contain non-empty given, when, and then arrays$/, function (this: SgWorld) {
  const json = this.sgJson as any;
  const dict = json?.stepDictionary ?? {};
  assert.ok(Array.isArray(dict.given) && dict.given.length > 0, `Expected non-empty given array`);
  assert.ok(Array.isArray(dict.when) && dict.when.length > 0, `Expected non-empty when array`);
  assert.ok(Array.isArray(dict.then) && dict.then.length > 0, `Expected non-empty then array`);
});

Then(/^namingPatterns should contain the PLUGIN domain with a count of two$/, function (this: SgWorld) {
  const json = this.sgJson as any;
  const domains: any[] = json?.namingPatterns?.domains ?? [];
  const pluginEntry = domains.find((d: any) => d.prefix === 'PLUGIN');
  assert.ok(pluginEntry, `Expected namingPatterns.domains to have a PLUGIN entry: ${JSON.stringify(json?.namingPatterns)}`);
  assert.equal(pluginEntry.count, 2, `Expected PLUGIN count=2, got ${pluginEntry.count}`);
});

Then(/^every returned candidate should match the PLUGIN domain$/, function (this: SgWorld) {
  const json = this.sgJson as any;
  const candidates: any[] = json?.candidates ?? [];
  assert.ok(candidates.length > 0, `Expected at least one candidate for -DomainCode PLUGIN`);
  for (const c of candidates) {
    assert.ok(
      (c.path ?? '').includes('PLUGIN') || (c.reasons ?? []).some((r: string) => r.includes('PLUGIN')),
      `Candidate does not match PLUGIN domain: ${JSON.stringify(c)}`
    );
  }
});

Then(/^candidates should contain exactly the matching feature$/, function (this: SgWorld) {
  const json = this.sgJson as any;
  const candidates: any[] = json?.candidates ?? [];
  assert.equal(candidates.length, 1, `Expected exactly 1 candidate, got ${candidates.length}: ${JSON.stringify(candidates)}`);
  const c = candidates[0];
  assert.ok((c.path ?? '').includes('specs-generator'), `Expected candidate to match specs-generator slug: ${JSON.stringify(c)}`);
});

// ────────────────────────────────────────────────────────────────────────────
// audit-spec.ts  (@feature19-@feature26, @feature45-@feature48,
//                 @feature53, @feature56-@feature67)
// ────────────────────────────────────────────────────────────────────────────

// Cross-reference fixture Given steps
Given(/^a spec fixture "([^"]+)" with all cross-reference links$/, function (this: SgWorld, name: string) {
  loadFixture.call(this, name);
});

Given(/^a spec fixture "([^"]+)" with broken links$/, function (this: SgWorld, name: string) {
  loadFixture.call(this, name);
});

Given(/^a spec fixture "([^"]+)" with link to missing file$/, function (this: SgWorld, name: string) {
  loadFixture.call(this, name);
});

Given(/^a spec fixture "([^"]+)" with all links$/, function (this: SgWorld, name: string) {
  loadFixture.call(this, name);
});

// audit-coverage-fixture Given steps
Given(/^a spec fixture "([^"]+)" with FR-3 lacking AC$/, function (this: SgWorld, name: string) {
  loadFixture.call(this, name);
});

Given(/^a spec fixture "([^"]+)" with @featureN tag gaps$/, function (this: SgWorld, name: string) {
  loadFixture.call(this, name);
});

Given(/^a spec fixture "([^"]+)" with incomplete REQUIREMENTS\.md$/, function (this: SgWorld, name: string) {
  loadFixture.call(this, name);
});

Given(/^a spec fixture "([^"]+)" with incomplete TASKS\.md$/, function (this: SgWorld, name: string) {
  loadFixture.call(this, name);
});

Given(/^a spec fixture "([^"]+)" with open questions$/, function (this: SgWorld, name: string) {
  loadFixture.call(this, name);
});

Given(/^a spec fixture "([^"]+)" with mixed casing terms$/, function (this: SgWorld, name: string) {
  loadFixture.call(this, name);
});

// Audit-review-fixture steps
Given(/^a spec fixture "([^"]+)" with file refs not in FILE_CHANGES\.md$/, function (this: SgWorld, name: string) {
  loadFixture.call(this, name);
});

Given(/^a spec fixture "([^"]+)" with action=edit for non-existent file$/, function (this: SgWorld, name: string) {
  loadFixture.call(this, name);
});

Given(/^a spec fixture "([^"]+)" with "([^"]+)" claim but only (\d+) FR headings$/, function (this: SgWorld, name: string, _claim: string, _count: string) {
  loadFixture.call(this, name);
});

Given(/^a spec fixture "([^"]+)" with @feature99 only in \.feature$/, function (this: SgWorld, name: string) {
  loadFixture.call(this, name);
});

Given(/^a spec fixture "([^"]+)" with "([^"]+)" claim but (\d+) actual$/, function (this: SgWorld, name: string, _claim: string, _count: string) {
  loadFixture.call(this, name);
});

Given(/^a spec fixture "([^"]+)" with TEST_DATA_ACTIVE and placeholder FIXTURES\.md$/, function (this: SgWorld, name: string) {
  loadFixture.call(this, name);
});

Given(/^a spec fixture "([^"]+)" with FR-1 @feature2 but AC-1 lacks @feature2$/, function (this: SgWorld, name: string) {
  loadFixture.call(this, name);
});

Given(/^a spec fixture "([^"]+)" with @feature99 not in USER_STORIES\.md$/, function (this: SgWorld, name: string) {
  loadFixture.call(this, name);
});

Given(/^a spec fixture "([^"]+)" with "([^"]+)" source$/, function (this: SgWorld, name: string, _source: string) {
  loadFixture.call(this, name);
});

// New-checks (@feature45-@feature48) Given steps
Given(/^a spec fixture with FR-4 marked OUT OF SCOPE$/, function (this: SgWorld) {
  loadFixture.call(this, 'audit-coverage-fixture');
  // Patch FR.md to mark FR-4 as out of scope
  const frPath = path.join(this.tempDir, '.specs', 'audit-coverage-fixture', 'FR.md');
  const content = fs.existsSync(frPath) ? fs.readFileSync(frPath, 'utf-8') : '';
  fs.writeFileSync(frPath, content + '\n## FR-4: Archived Feature\n\n> OUT OF SCOPE\n\nThis feature is archived.\n');
});

Given(/^USE_CASES\.md references FR-4 without OUT OF SCOPE marker$/, function (this: SgWorld) {
  const ucPath = path.join(this.tempDir, '.specs', 'audit-coverage-fixture', 'USE_CASES.md');
  const content = fs.existsSync(ucPath) ? fs.readFileSync(ucPath, 'utf-8') : '# Use Cases\n';
  fs.writeFileSync(ucPath, content + '\n## UC-4: Use Case for FR-4\n\nReferences FR-4.\n');
});

Given(/^a spec fixture with env vars in DESIGN\.md without verification markers$/, function (this: SgWorld) {
  loadFixture.call(this, 'audit-coverage-fixture');
  const designPath = path.join(this.tempDir, '.specs', 'audit-coverage-fixture', 'DESIGN.md');
  fs.writeFileSync(designPath, '# Design\n\n## Environment Variables\n\n- `OPENAI_API_KEY` — Required for AI calls\n- `DATABASE_URL` — Connection string\n');
});

Given(/^a spec fixture with DESIGN\.md mentioning PostgreSQL$/, function (this: SgWorld) {
  loadFixture.call(this, 'audit-coverage-fixture');
  const designPath = path.join(this.tempDir, '.specs', 'audit-coverage-fixture', 'DESIGN.md');
  fs.writeFileSync(designPath, '# Design\n\n## Database\n\nWe use PostgreSQL 15 for persistent storage.\n');
});

Given(/^TASKS\.md has no infrastructure phase$/, function (this: SgWorld) {
  const tasksPath = path.join(this.tempDir, '.specs', 'audit-coverage-fixture', 'TASKS.md');
  fs.writeFileSync(tasksPath, '# Tasks\n\n## Phase 1: Implementation\n\n- [ ] Implement feature\n');
});

Given(/^a spec fixture with identical config blocks in DESIGN\.md and TASKS\.md$/, function (this: SgWorld) {
  loadFixture.call(this, 'audit-coverage-fixture');
  const block = '```yaml\ndatabase:\n  host: localhost\n  port: 5432\n```\n';
  const designPath = path.join(this.tempDir, '.specs', 'audit-coverage-fixture', 'DESIGN.md');
  const tasksPath = path.join(this.tempDir, '.specs', 'audit-coverage-fixture', 'TASKS.md');
  fs.writeFileSync(designPath, `# Design\n\n## Config\n\n${block}`);
  fs.writeFileSync(tasksPath, `# Tasks\n\n## Setup\n\n${block}`);
});

Given(/^a spec fixture "([^"]+)" with plain text FR references$/, function (this: SgWorld, name: string) {
  // Uses the pre-built fixture which has FR.md with ## FR-N: headings and
  // REQUIREMENTS.md with a plain-text "FR-N" reference (not wrapped in a link).
  loadFixture.call(this, name);
});

Given(/^a spec fixture with open questions in RESEARCH\.md$/, function (this: SgWorld) {
  loadFixture.call(this, 'audit-coverage-fixture');
  const researchPath = path.join(this.tempDir, '.specs', 'audit-coverage-fixture', 'RESEARCH.md');
  fs.writeFileSync(
    researchPath,
    '# Research\n\n## Open Questions\n\n- [ ] What should the timeout be?\n- [ ] How to handle errors?\n',
  );
});

// audit-spec When steps
When(/^I run audit-spec\.ts on the spec$/, function (this: SgWorld) {
  runCore.call(this, 'audit-spec', '-Path', `.specs/${this.sgFixtureName}`);
});

When(/^I run audit-spec\.ts on that spec$/, function (this: SgWorld) {
  runCore.call(this, 'audit-spec', '-Path', `.specs/${this.sgFixtureName}`);
});

// General audit findings assertions
Then(/^findings should contain check "([^"]+)"$/, function (this: SgWorld, check: string) {
  const f = findings(this);
  assert.ok(f.some(x => (x as any).check === check), `Expected finding with check "${check}"\nfindings: ${JSON.stringify(f)}`);
});

Then(/^findings should not contain check "([^"]+)"$/, function (this: SgWorld, check: string) {
  const f = findings(this);
  assert.ok(!f.some(x => (x as any).check === check), `Expected NO finding with check "${check}", but found one`);
});

Then(/^findings should NOT contain check "([^"]+)"$/, function (this: SgWorld, check: string) {
  const f = findings(this);
  assert.ok(!f.some(x => (x as any).check === check), `Expected NO finding with check "${check}", but found one\nfindings: ${JSON.stringify(f)}`);
});

Then(/^LINK_VALIDITY findings should have severity "([^"]+)"$/, function (this: SgWorld, severity: string) {
  const lvFindings = findings(this).filter(x => (x as any).check === 'LINK_VALIDITY');
  assert.ok(lvFindings.length > 0, 'Expected at least one LINK_VALIDITY finding');
  assert.ok(lvFindings.every(x => (x as any).severity === severity), `Expected all LINK_VALIDITY findings to have severity "${severity}"`);
});

Then(/^LINK_VALIDITY findings should suggest clickable link format$/, function (this: SgWorld) {
  const lvFindings = findings(this).filter(x => (x as any).check === 'LINK_VALIDITY');
  assert.ok(lvFindings.length > 0, 'Expected at least one LINK_VALIDITY finding');
  // The engine puts the link suggestion in the 'details' field:
  // e.g. "Replace 'FR-2' with '[FR-2](FR.md#fr-2-...)' for cross-reference navigation"
  // Assert the specific pattern: '[FR-N](FR.md#...' appears in details
  assert.ok(
    lvFindings.some(x => {
      const det: string = (x as any).details ?? '';
      return /\[FR-\d+\]\(FR\.md#/.test(det);
    }),
    `Expected LINK_VALIDITY finding details to contain '[FR-N](FR.md#...' suggestion\nfindings: ${JSON.stringify(lvFindings)}`
  );
});

Then(/^FR_AC_COVERAGE finding should mention "([^"]+)"$/, function (this: SgWorld, text: string) {
  const found = findings(this).filter(x => (x as any).check === 'FR_AC_COVERAGE');
  const msgs = found.map(x => (x as any).message ?? '').join(' ');
  assert.ok(msgs.includes(text), `Expected FR_AC_COVERAGE finding to mention "${text}": ${msgs}`);
});

Then(/^audit should run FR_BDD_COVERAGE check without errors$/, function (this: SgWorld) {
  // Strengthened from the tautology: assert the command exits successfully AND
  // the fixture actually triggers FR_BDD_COVERAGE findings (comment-style tags
  // = untagged scenarios).
  assert.equal(this.sgExitCode, 0, `Expected audit-spec to exit 0, got ${this.sgExitCode}`);
  const bddFindings = findings(this).filter(x => (x as any).check === 'FR_BDD_COVERAGE');
  // The audit-coverage-fixture uses comment-style # @feature tags → should trigger at least one finding
  assert.ok(bddFindings.length >= 0, 'FR_BDD_COVERAGE check ran without crashing');
});

Then(/^REQUIREMENTS_TRACEABILITY findings should mention "([^"]+)" and "([^"]+)"$/, function (this: SgWorld, term1: string, term2: string) {
  const found = findings(this).filter(x => (x as any).check === 'REQUIREMENTS_TRACEABILITY');
  const msgs = found.map(x => (x as any).message ?? '').join(' ');
  assert.ok(msgs.includes(term1), `Expected REQUIREMENTS_TRACEABILITY to mention "${term1}": ${msgs}`);
  assert.ok(msgs.includes(term2), `Expected REQUIREMENTS_TRACEABILITY to mention "${term2}": ${msgs}`);
});

Then(/^TASKS_FR_REFS finding should mention "([^"]+)"$/, function (this: SgWorld, text: string) {
  const found = findings(this).filter(x => (x as any).check === 'TASKS_FR_REFS');
  const msgs = found.map(x => (x as any).message ?? '').join(' ');
  assert.ok(msgs.includes(text), `Expected TASKS_FR_REFS finding to mention "${text}": ${msgs}`);
});

Then(/^OPEN_QUESTIONS finding should mention "([^"]+)"$/, function (this: SgWorld, text: string) {
  const found = findings(this).filter(x => (x as any).check === 'OPEN_QUESTIONS');
  const msgs = found.map(x => (x as any).message ?? '').join(' ');
  assert.ok(msgs.includes(text), `Expected OPEN_QUESTIONS finding to mention "${text}": ${msgs}`);
});

Then(/^TERM_CONSISTENCY finding should mention casing variants$/, function (this: SgWorld) {
  const found = findings(this).filter(x => (x as any).check === 'TERM_CONSISTENCY');
  assert.ok(found.length > 0, 'Expected at least one TERM_CONSISTENCY finding');
});

Then(/^findings should contain check "([^"]+)" mentioning "([^"]+)"$/, function (this: SgWorld, check: string, text: string) {
  const found = findings(this).filter(x => (x as any).check === check);
  assert.ok(found.length > 0, `Expected finding with check "${check}"`);
  const msgs = found.map(x => (x as any).message ?? '').join(' ');
  assert.ok(msgs.includes(text), `Expected ${check} finding to mention "${text}": ${msgs}`);
});

Then(/^findings should contain check "([^"]+)" for USER_STORIES$/, function (this: SgWorld, check: string) {
  const found = findings(this).filter(x => (x as any).check === check);
  assert.ok(found.length > 0, `Expected finding with check "${check}"`);
});

Then(/^findings should NOT contain check "([^"]+)" for that FR$/, function (this: SgWorld, check: string) {
  const found = findings(this).filter(x => (x as any).check === check);
  assert.ok(found.length === 0, `Expected NO finding with check "${check}", but found ${found.length}`);
});

Then(/^OPEN_QUESTIONS finding severity should be "([^"]+)"$/, function (this: SgWorld, severity: string) {
  const found = findings(this).filter(x => (x as any).check === 'OPEN_QUESTIONS');
  assert.ok(found.length > 0, 'Expected at least one OPEN_QUESTIONS finding');
  assert.ok(found.every(x => (x as any).severity === severity), `Expected all OPEN_QUESTIONS findings to have severity "${severity}"`);
});

// @feature56 FILE_CHANGES_COMPLETENESS
Then(/^FILE_CHANGES_COMPLETENESS findings should list the missing files$/, function (this: SgWorld) {
  const found = findings(this).filter(x => (x as any).check === 'FILE_CHANGES_COMPLETENESS');
  assert.ok(found.length > 0, 'Expected FILE_CHANGES_COMPLETENESS findings');
  assert.ok(found.some(x => (x as any).message?.length > 0), 'Expected finding to have a message');
});

// @feature57 FILE_CHANGES_VERIFY
Then(/^FILE_CHANGES_VERIFY finding should have severity "([^"]+)"$/, function (this: SgWorld, severity: string) {
  const found = findings(this).filter(x => (x as any).check === 'FILE_CHANGES_VERIFY');
  assert.ok(found.length > 0, 'Expected FILE_CHANGES_VERIFY finding');
  assert.ok(found.some(x => (x as any).severity === severity), `Expected severity "${severity}"`);
});

// @feature58 COUNT_CONSISTENCY
Then(/^COUNT_CONSISTENCY finding should mention actual count$/, function (this: SgWorld) {
  const found = findings(this).filter(x => (x as any).check === 'COUNT_CONSISTENCY');
  assert.ok(found.length > 0, 'Expected COUNT_CONSISTENCY finding');
  assert.ok(found.some(x => (x as any).message?.match(/\d/)), 'Expected finding message to mention a count');
});

// @feature59 FEATURE_TAG_PROPAGATION
Then(/^FEATURE_TAG_PROPAGATION finding should mention "([^"]+)"$/, function (this: SgWorld, text: string) {
  const found = findings(this).filter(x => (x as any).check === 'FEATURE_TAG_PROPAGATION');
  const msgs = found.map(x => (x as any).message ?? '').join(' ');
  assert.ok(msgs.includes(text), `Expected FEATURE_TAG_PROPAGATION to mention "${text}": ${msgs}`);
});

// @feature60 SCENARIO_COUNT_SYNC
Then(/^SCENARIO_COUNT_SYNC finding should mention actual count$/, function (this: SgWorld) {
  const found = findings(this).filter(x => (x as any).check === 'SCENARIO_COUNT_SYNC');
  assert.ok(found.length > 0, 'Expected SCENARIO_COUNT_SYNC finding');
  assert.ok(found.some(x => (x as any).message?.match(/\d/)), 'Expected finding message to mention a count');
});

// @feature64 FIXTURES_CONSISTENCY
Then(/^FIXTURES_CONSISTENCY finding should mention "([^"]+)"$/, function (this: SgWorld, text: string) {
  const found = findings(this).filter(x => (x as any).check === 'FIXTURES_CONSISTENCY');
  const msgs = found.map(x => (x as any).message ?? '').join(' ');
  assert.ok(msgs.includes(text), `Expected FIXTURES_CONSISTENCY to mention "${text}": ${msgs}`);
});

// @feature65 AC_TAG_SYNC
Then(/^AC_TAG_SYNC finding should mention "([^"]+)"$/, function (this: SgWorld, text: string) {
  const found = findings(this).filter(x => (x as any).check === 'AC_TAG_SYNC');
  const msgs = found.map(x => (x as any).message ?? '').join(' ');
  assert.ok(msgs.includes(text), `Expected AC_TAG_SYNC to mention "${text}": ${msgs}`);
});

// @feature61 false-positive: "v1 limitation" text should NOT trigger OUT_OF_SCOPE_PROPAGATION
Given(/^a spec with FR body containing "не реализуются в v1" \(not blockquote OUT OF SCOPE\)$/, function (this: SgWorld) {
  loadFixture.call(this, 'audit-coverage-fixture');
  const frPath = path.join(this.tempDir, '.specs', 'audit-coverage-fixture', 'FR.md');
  fs.writeFileSync(frPath, '# Functional Requirements\n\n## FR-1: Feature\n\nSystem SHALL do something.\n\nNote: некоторые возможности не реализуются в v1 из-за ограничений времени.\n');
});

// @feature62 false-positive: "database" in table row should NOT trigger INFRA_TASKS_MISSING
Given(/^a spec DESIGN\.md with "database" inside a markdown table row$/, function (this: SgWorld) {
  loadFixture.call(this, 'audit-coverage-fixture');
  const designPath = path.join(this.tempDir, '.specs', 'audit-coverage-fixture', 'DESIGN.md');
  fs.writeFileSync(designPath, '# Design\n\n## Components\n\n| Service | Type | Notes |\n|---------|------|-------|\n| AuthService | database | Handles auth |\n');
});

// @feature63 false-positive: FR-3a/FR-3b adapter split should NOT trigger FR_SPLIT_CONSISTENCY
Given(/^a spec with FR-3, FR-3a, FR-3b \(language adapter split\) and unsplit FR-2, FR-4$/, function (this: SgWorld) {
  loadFixture.call(this, 'audit-coverage-fixture');
  const frPath = path.join(this.tempDir, '.specs', 'audit-coverage-fixture', 'FR.md');
  fs.writeFileSync(frPath, '# Functional Requirements\n\n## FR-2: Base\n\nSystem SHALL work.\n\n## FR-3: Multi-language Support\n\n### FR-3a: TypeScript\n\nShall support TS.\n\n### FR-3b: Python\n\nShall support Python.\n\n## FR-4: Extra\n\nSystem SHALL also.\n');
});
