/**
 * @feature100..@feature106 step definitions — specs-workflow-jira-mode
 *
 * Migrated from tests/e2e/specs-workflow-jira-mode.test.ts (SPECJIRA001_01..07, 06b, 06c, REG).
 * Drives the REAL validate-spec CLI (spawn) and the REAL checkJiraDrift/runAllChecks
 * in-process (tools/specs-validator/audit-checks.ts).
 *
 * 01-05 (runtime/spawn): Create .specs/jira-mode-test/ in Given, spawn validate-spec
 *   in When, clean up immediately after spawn, assert in Then.
 * 06/06b/06c/REG (runtime/in-process): Write files to this.tempDir (V4World isolation),
 *   call checkJiraDrift or runAllChecks in-process.
 * 07 (artifact): fs.existsSync on template file paths.
 *
 * Step patterns are all prefixed with "Jira-mode" to avoid collision with other
 * specs (particularly feature3_spec_quality_audit.ts which also uses runAllChecks).
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  checkJiraDrift,
  runAllChecks,
  type JiraLiveState,
  type AuditFinding,
} from '../../tools/specs-validator/audit-checks.ts';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const JIRA_TEST_SLUG = 'jira-mode-test';
const JIRA_TEST_DIR = path.join(REPO_ROOT, '.specs', JIRA_TEST_SLUG);
const CORE_MJS = path.join(REPO_ROOT, 'tools', 'specs-generator', 'specs-generator-core.mjs');

interface JiraModeWorld extends V4World {
  jiraCliOutput?: { status: number | null; json: Record<string, unknown> };
  jiraAuditFindings?: AuditFinding[];
  jiraLiveState?: JiraLiveState | null;
}

// ── Minimal spec seeding for validate-spec (CLI scenarios 01-05) ─────────────

function writeMinimalSpec(specDir: string, slug: string): void {
  fs.mkdirSync(specDir, { recursive: true });
  const files: Record<string, string> = {
    'USER_STORIES.md': '# User Stories\n\n- As a user, I want X, so that Y.\n',
    'USE_CASES.md': '# Use Cases\n\n## UC-1: Happy path\n\nUser flow.\n',
    'RESEARCH.md':
      '# Research\n\n## Problem\n\nDescription.\n\n## Project Context & Constraints\n\n> Skipped: trivial.\n',
    'REQUIREMENTS.md': '# Requirements\n\n- See [FR.md](FR.md)\n',
    'FR.md': '# FR\n\n## FR-1: Some feature\n\nThe system SHALL do thing.\n',
    'NFR.md':
      '# NFR\n\n## Performance\nN/A\n\n## Security\nN/A\n\n## Reliability\nN/A\n\n## Usability\nN/A\n',
    'ACCEPTANCE_CRITERIA.md':
      '# AC\n\n## AC-1 (FR-1): Happy\n\nWHEN user acts THEN system SHALL respond.\n',
    'DESIGN.md':
      '# Design\n\n## BDD Test Infrastructure\n**TEST_DATA:** TEST_DATA_NONE\n**TEST_FORMAT:** BDD\n**Framework:** N/A\n**Install Command:** N/A\n**Evidence:** trivial\n**Verdict:** stateless\n',
    'TASKS.md':
      '# Tasks\n\n## Phase 0: BDD Foundation\n\n- [ ] Write .feature — @feature1\n\n## Phase 1: Green\n\n- [ ] Implement FR-1 @feature1\n',
    'FILE_CHANGES.md':
      '# File Changes\n\n| Path | Action | Reason |\n|---|---|---|\n| foo | create | bar |\n',
    'CHANGELOG.md': '# Changelog\n\n## Unreleased\n\n- Initial spec.\n',
    'README.md': '# README\n\nOverview.\n',
    [`${slug}.feature`]:
      'Feature: JIRAMODE001 Happy\n\n  # @feature1\n  Scenario: Happy\n    Given x\n    When y\n    Then z\n',
  };
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(specDir, name), content, 'utf-8');
  }
}

function runJiraValidateCli(slug: string): { status: number | null; json: Record<string, unknown> } {
  const r = spawnSync(
    process.execPath,
    [CORE_MJS, 'validate-spec', '-Path', `.specs/${slug}`, '-Format', 'json'],
    { encoding: 'utf-8', cwd: REPO_ROOT, timeout: 60_000 },
  );
  const output = (r.stdout ?? '') || (r.stderr ?? '');
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(output) as Record<string, unknown>; } catch { /* leave empty */ }
  return { status: r.status, json };
}

// ── 01-05: CLI scenarios (JIRA_SOURCE_PRESERVED via validate-spec spawn) ────

Given(
  /^a Jira-mode spec with JIRA_SOURCE\.md and untraced FR sections$/,
  function (this: JiraModeWorld) {
    writeMinimalSpec(JIRA_TEST_DIR, JIRA_TEST_SLUG);
    fs.writeFileSync(
      path.join(JIRA_TEST_DIR, 'JIRA_SOURCE.md'),
      '# Jira Source\n\n## Description (Verbatim)\n\nDo the thing, all doctypes except INBOUND.\n',
      'utf-8',
    );
  },
);

Given(
  /^a Jira-mode spec with all Jira traces present in FR\.md, AC\.md, feature, and TASKS$/,
  function (this: JiraModeWorld) {
    writeMinimalSpec(JIRA_TEST_DIR, JIRA_TEST_SLUG);
    fs.writeFileSync(
      path.join(JIRA_TEST_DIR, 'FR.md'),
      '# FR\n\n## FR-1: Block stock over-limit\nJira imperative: "all doctypes except INBOUND"\n\nThe system SHALL block.\n',
      'utf-8',
    );
    fs.writeFileSync(
      path.join(JIRA_TEST_DIR, 'ACCEPTANCE_CRITERIA.md'),
      '# AC\n\n## AC-1 (FR-1): Block\nJira acceptance: "blocks save when qty > available"\n\nWHEN qty > available THEN save SHALL be blocked.\n',
      'utf-8',
    );
    fs.writeFileSync(
      path.join(JIRA_TEST_DIR, `${JIRA_TEST_SLUG}.feature`),
      'Feature: JIRAMODE001 Happy\n\n  # Jira trace: "all doctypes except INBOUND"\n  # @feature1\n  Scenario: Block over limit\n    Given stock of 5\n    When user enters 100\n    Then save blocked\n',
      'utf-8',
    );
    fs.writeFileSync(
      path.join(JIRA_TEST_DIR, 'TASKS.md'),
      '# Tasks\n\n## Phase 0: BDD Foundation\n\n### 📋 `write-feature`\n\n- [ ] Write .feature @feature1\n- _Jira:_ "all doctypes except INBOUND"\n',
      'utf-8',
    );
    fs.writeFileSync(
      path.join(JIRA_TEST_DIR, 'JIRA_SOURCE.md'),
      '# Jira Source\n\n## Description (Verbatim)\n\nAll doctypes except INBOUND.\n',
      'utf-8',
    );
  },
);

Given(
  /^a Jira-mode spec without JIRA_SOURCE\.md$/,
  function (this: JiraModeWorld) {
    writeMinimalSpec(JIRA_TEST_DIR, JIRA_TEST_SLUG);
    // Intentionally no JIRA_SOURCE.md — rule must be a no-op
  },
);

Given(
  /^a Jira-mode spec with JIRA_SOURCE\.md and AC lacking Jira acceptance or Evidence$/,
  function (this: JiraModeWorld) {
    writeMinimalSpec(JIRA_TEST_DIR, JIRA_TEST_SLUG);
    // writeMinimalSpec already creates ACCEPTANCE_CRITERIA.md without "Jira acceptance:" or "Evidence:"
    fs.writeFileSync(
      path.join(JIRA_TEST_DIR, 'JIRA_SOURCE.md'),
      '# Jira Source\n\n## Description (Verbatim)\n\nSome directive.\n',
      'utf-8',
    );
  },
);

Given(
  /^a Jira-mode spec with JIRA_SOURCE\.md and a scenario lacking Jira trace comment$/,
  function (this: JiraModeWorld) {
    writeMinimalSpec(JIRA_TEST_DIR, JIRA_TEST_SLUG);
    // writeMinimalSpec already creates a feature without "# Jira trace:"
    fs.writeFileSync(
      path.join(JIRA_TEST_DIR, 'JIRA_SOURCE.md'),
      '# Jira Source\n\n## Description (Verbatim)\n\nSome directive.\n',
      'utf-8',
    );
  },
);

When(
  /^the Jira-mode validate-spec CLI runs$/,
  function (this: JiraModeWorld) {
    this.jiraCliOutput = runJiraValidateCli(JIRA_TEST_SLUG);
    fs.rmSync(JIRA_TEST_DIR, { recursive: true, force: true });
  },
);

Then(
  /^the Jira-mode validate-spec output warns JIRA_SOURCE_PRESERVED for FR\.md mentioning "Jira imperative"$/,
  function (this: JiraModeWorld) {
    const warnings = (this.jiraCliOutput!.json?.warnings ?? []) as Array<{
      rule: string; file: string; message: string;
    }>;
    const jiraWarnings = warnings.filter(w => w.rule === 'JIRA_SOURCE_PRESERVED');
    assert.ok(
      jiraWarnings.length > 0,
      `expected ≥1 JIRA_SOURCE_PRESERVED warning, got: ${JSON.stringify(warnings)}`,
    );
    const frWarning = jiraWarnings.find(w => w.file === 'FR.md');
    assert.ok(
      frWarning !== undefined,
      `expected JIRA_SOURCE_PRESERVED for FR.md, found: ${JSON.stringify(jiraWarnings)}`,
    );
    assert.ok(
      frWarning!.message.includes('Jira imperative'),
      `message must mention 'Jira imperative': ${frWarning!.message}`,
    );
  },
);

Then(
  /^the Jira-mode validate-spec output has no JIRA_SOURCE_PRESERVED warning for FR\.md$/,
  function (this: JiraModeWorld) {
    const warnings = (this.jiraCliOutput!.json?.warnings ?? []) as Array<{
      rule: string; file: string;
    }>;
    const frWarning = warnings.find(w => w.rule === 'JIRA_SOURCE_PRESERVED' && w.file === 'FR.md');
    assert.equal(
      frWarning,
      undefined,
      `expected no FR.md JIRA_SOURCE_PRESERVED warning, got: ${JSON.stringify(frWarning)}`,
    );
  },
);

Then(
  /^the Jira-mode validate-spec output has zero JIRA_SOURCE_PRESERVED warnings$/,
  function (this: JiraModeWorld) {
    const warnings = (this.jiraCliOutput!.json?.warnings ?? []) as Array<{ rule: string }>;
    const jiraWarnings = warnings.filter(w => w.rule === 'JIRA_SOURCE_PRESERVED');
    assert.equal(
      jiraWarnings.length,
      0,
      `expected 0 JIRA_SOURCE_PRESERVED warnings, got: ${JSON.stringify(jiraWarnings)}`,
    );
  },
);

Then(
  /^the Jira-mode validate-spec output warns JIRA_SOURCE_PRESERVED for ACCEPTANCE_CRITERIA\.md$/,
  function (this: JiraModeWorld) {
    const warnings = (this.jiraCliOutput!.json?.warnings ?? []) as Array<{
      rule: string; file: string;
    }>;
    const acWarning = warnings.find(
      w => w.rule === 'JIRA_SOURCE_PRESERVED' && w.file === 'ACCEPTANCE_CRITERIA.md',
    );
    assert.ok(
      acWarning !== undefined,
      `expected JIRA_SOURCE_PRESERVED for ACCEPTANCE_CRITERIA.md, got: ${JSON.stringify(warnings)}`,
    );
  },
);

Then(
  /^the Jira-mode validate-spec output warns JIRA_SOURCE_PRESERVED for the feature file mentioning "Jira trace"$/,
  function (this: JiraModeWorld) {
    const warnings = (this.jiraCliOutput!.json?.warnings ?? []) as Array<{
      rule: string; file: string; message: string;
    }>;
    const featWarning = warnings.find(
      w => w.rule === 'JIRA_SOURCE_PRESERVED' && w.file.endsWith('.feature'),
    );
    assert.ok(
      featWarning !== undefined,
      `expected JIRA_SOURCE_PRESERVED for .feature file, got: ${JSON.stringify(warnings)}`,
    );
    assert.ok(
      featWarning!.message.includes('Jira trace'),
      `message must mention 'Jira trace': ${featWarning!.message}`,
    );
  },
);

// ── 06/06b/06c: checkJiraDrift in-process (uses this.tempDir for isolation) ──

Given(
  /^a Jira-mode spec dir with a valid \.jira-cache\.json cache file$/,
  function (this: JiraModeWorld) {
    const cache = {
      schema_version: 1,
      jira_key: 'TEST-123',
      jira_url: 'https://example.invalid/browse/TEST-123',
      last_fetch_at: '2026-01-01T00:00:00Z',
      issue_updated_at: '2026-01-01T00:00:00Z',
      comment_count: 0,
      attachments: [],
    };
    fs.writeFileSync(
      path.join(this.tempDir, '.jira-cache.json'),
      JSON.stringify(cache, null, 2),
      'utf-8',
    );
  },
);

Given(
  /^a Jira-mode spec dir without a \.jira-cache\.json file$/,
  function (this: JiraModeWorld) {
    // tempDir is already empty per V4World Before hook — no action needed
  },
);

Given(
  /^a Jira-mode spec dir with a \.jira-cache\.json showing old timestamp and lower comment count$/,
  function (this: JiraModeWorld) {
    const cache = {
      schema_version: 1,
      jira_key: 'TEST-123',
      jira_url: 'https://example.invalid/browse/TEST-123',
      last_fetch_at: '2026-01-01T00:00:00Z',
      issue_updated_at: '2026-01-01T00:00:00Z',
      comment_count: 2,
      attachments: [
        { id: 'att-1', filename: 'a.png', hash: 'sha256:aaa', size: 100, role: 'ui-reference' },
      ],
    };
    fs.writeFileSync(
      path.join(this.tempDir, '.jira-cache.json'),
      JSON.stringify(cache, null, 2),
      'utf-8',
    );
  },
);

Given(
  /^the live Jira state shows issue updated at "([^"]+)" with (\d+) comments$/,
  function (this: JiraModeWorld, updatedAt: string, commentCount: string) {
    this.jiraLiveState = {
      issueUpdatedAt: updatedAt,
      commentCount: Number(commentCount),
      attachmentHashes: { 'att-1': 'sha256:aaa' },
    };
  },
);

When(
  /^the Jira-mode checkJiraDrift runs with MCP unavailable and no live state$/,
  function (this: JiraModeWorld) {
    this.jiraAuditFindings = checkJiraDrift(this.tempDir, null, true);
  },
);

When(
  /^the Jira-mode checkJiraDrift runs against the live Jira state$/,
  function (this: JiraModeWorld) {
    this.jiraAuditFindings = checkJiraDrift(this.tempDir, this.jiraLiveState ?? null, false);
  },
);

Then(
  /^the Jira-mode drift check returns exactly one INFO finding with message containing "([^"]+)"$/,
  function (this: JiraModeWorld, expectedMsg: string) {
    assert.equal(
      this.jiraAuditFindings!.length,
      1,
      `expected 1 finding, got: ${JSON.stringify(this.jiraAuditFindings)}`,
    );
    assert.equal(this.jiraAuditFindings![0].check, 'JIRA_DRIFT');
    assert.equal(this.jiraAuditFindings![0].severity, 'INFO');
    assert.ok(
      this.jiraAuditFindings![0].message.includes(expectedMsg),
      `expected message to contain '${expectedMsg}': ${this.jiraAuditFindings![0].message}`,
    );
  },
);

Then(
  /^the Jira-mode drift check returns zero findings$/,
  function (this: JiraModeWorld) {
    assert.equal(
      this.jiraAuditFindings!.length,
      0,
      `expected 0 findings, got: ${JSON.stringify(this.jiraAuditFindings)}`,
    );
  },
);

Then(
  /^the Jira-mode drift check returns a WARNING about "([^"]+)"$/,
  function (this: JiraModeWorld, phrase: string) {
    const found = this.jiraAuditFindings!.find(
      f => f.severity === 'WARNING' && f.message.includes(phrase),
    );
    assert.ok(
      found !== undefined,
      `expected WARNING containing '${phrase}', got: ${JSON.stringify(this.jiraAuditFindings)}`,
    );
  },
);

// ── 07: Artifact check — template files exist on disk ───────────────────────

Then(
  /^the Jira-mode template file "([^"]+)" exists in tools\/specs-generator\/templates$/,
  function (this: JiraModeWorld, filename: string) {
    const p = path.join(REPO_ROOT, 'tools', 'specs-generator', 'templates', filename);
    assert.ok(fs.existsSync(p), `expected template file to exist: ${p}`);
  },
);

// ── Regression: runAllChecks ─────────────────────────────────────────────────

Given(
  /^a Jira-mode non-Jira spec dir with an FR and TASKS but no JIRA_SOURCE\.md$/,
  function (this: JiraModeWorld) {
    fs.writeFileSync(path.join(this.tempDir, 'FR.md'), '## FR-1: Clean\n\nImplemented.\n', 'utf-8');
    fs.writeFileSync(path.join(this.tempDir, 'TASKS.md'), '- [x] do FR-1\n', 'utf-8');
  },
);

When(
  /^the Jira-mode runAllChecks runs on the spec dir$/,
  function (this: JiraModeWorld) {
    this.jiraAuditFindings = runAllChecks(this.tempDir);
  },
);

Then(
  /^the Jira-mode runAllChecks returns zero JIRA_DRIFT findings$/,
  function (this: JiraModeWorld) {
    const jiraDrift = this.jiraAuditFindings!.filter(f => f.check === 'JIRA_DRIFT');
    assert.equal(
      jiraDrift.length,
      0,
      `expected 0 JIRA_DRIFT findings, got: ${JSON.stringify(jiraDrift)}`,
    );
  },
);
