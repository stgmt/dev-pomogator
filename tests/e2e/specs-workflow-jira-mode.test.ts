import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import {
  appPath,
  runShellScript,
  getSpecsGeneratorPath,
} from './helpers';
import {
  checkJiraDrift,
  runAllChecks,
  type JiraLiveState,
} from '../../extensions/specs-workflow/tools/specs-validator/audit-checks';

const SPEC_SLUG = 'jira-mode-test';
const SPEC_DIR = appPath('.specs', SPEC_SLUG);
const SPEC_REL = `.specs/${SPEC_SLUG}`;

async function writeMinimalRequiredFiles(): Promise<void> {
  await fs.ensureDir(SPEC_DIR);

  const required: Record<string, string> = {
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
  };
  for (const [name, body] of Object.entries(required)) {
    await fs.writeFile(path.join(SPEC_DIR, name), body, 'utf-8');
  }
  await fs.writeFile(
    path.join(SPEC_DIR, `${SPEC_SLUG}.feature`),
    'Feature: JIRAMODE001 Happy\n\n  # @feature1\n  Scenario: Happy\n    Given x\n    When y\n    Then z\n',
    'utf-8',
  );
}

function runValidator(): ReturnType<typeof runShellScript> {
  return runShellScript(
    getSpecsGeneratorPath('validate-spec.ts'),
    ['-Path', SPEC_REL],
  );
}

describe('SPECJIRA001 Optional Jira-first Workflow', () => {
  beforeEach(async () => {
    await fs.remove(SPEC_DIR);
    await fs.ensureDir(appPath('.specs'));
  });

  afterEach(async () => {
    await fs.remove(SPEC_DIR);
  });

  // @feature1
  it('SPECJIRA001_01: JIRA_SOURCE.md presence triggers JIRA_SOURCE_PRESERVED warning for untraced FR', async () => {
    await writeMinimalRequiredFiles();
    await fs.writeFile(
      path.join(SPEC_DIR, 'JIRA_SOURCE.md'),
      '# Jira Source\n\n## Description (Verbatim)\n\nDo the thing, all doctypes except INBOUND.\n',
      'utf-8',
    );

    const result = runValidator();
    const warnings = (result.json?.warnings || []) as Array<{
      rule: string;
      file: string;
      message: string;
    }>;

    const jiraWarnings = warnings.filter((w) => w.rule === 'JIRA_SOURCE_PRESERVED');
    expect(jiraWarnings.length).toBeGreaterThan(0);
    const frWarning = jiraWarnings.find((w) => w.file === 'FR.md');
    expect(frWarning).toBeDefined();
    expect(frWarning?.message).toContain('Jira imperative');
  });

  // @feature2
  it('SPECJIRA001_02: FR with Jira imperative trace passes JIRA_SOURCE_PRESERVED', async () => {
    await writeMinimalRequiredFiles();
    await fs.writeFile(
      path.join(SPEC_DIR, 'FR.md'),
      '# FR\n\n## FR-1: Block stock over-limit\nJira imperative: "all doctypes except INBOUND"\n\nThe system SHALL block.\n',
      'utf-8',
    );
    await fs.writeFile(
      path.join(SPEC_DIR, 'ACCEPTANCE_CRITERIA.md'),
      '# AC\n\n## AC-1 (FR-1): Block\nJira acceptance: "blocks save when qty > available"\n\nWHEN qty > available THEN save SHALL be blocked.\n',
      'utf-8',
    );
    await fs.writeFile(
      path.join(SPEC_DIR, `${SPEC_SLUG}.feature`),
      'Feature: JIRAMODE001 Happy\n\n  # Jira trace: "all doctypes except INBOUND"\n  # @feature1\n  Scenario: Block over limit\n    Given stock of 5\n    When user enters 100\n    Then save blocked\n',
      'utf-8',
    );
    await fs.writeFile(
      path.join(SPEC_DIR, 'TASKS.md'),
      '# Tasks\n\n## Phase 0: BDD Foundation\n\n### 📋 `write-feature`\n\n- [ ] Write .feature @feature1\n- _Jira:_ "all doctypes except INBOUND"\n',
      'utf-8',
    );
    await fs.writeFile(
      path.join(SPEC_DIR, 'JIRA_SOURCE.md'),
      '# Jira Source\n\n## Description (Verbatim)\n\nAll doctypes except INBOUND.\n',
      'utf-8',
    );

    const result = runValidator();
    const warnings = (result.json?.warnings || []) as Array<{
      rule: string;
      file: string;
    }>;

    const frWarning = warnings.find(
      (w) => w.rule === 'JIRA_SOURCE_PRESERVED' && w.file === 'FR.md',
    );
    expect(frWarning).toBeUndefined();
  });

  // @feature3
  it('SPECJIRA001_03: No JIRA_SOURCE.md → rule is no-op (opt-out)', async () => {
    await writeMinimalRequiredFiles();
    // Intentionally NOT creating JIRA_SOURCE.md

    const result = runValidator();
    const warnings = (result.json?.warnings || []) as Array<{ rule: string }>;

    const jiraWarnings = warnings.filter((w) => w.rule === 'JIRA_SOURCE_PRESERVED');
    expect(jiraWarnings).toHaveLength(0);
  });

  // @feature4
  it('SPECJIRA001_04: AC without Jira acceptance or Evidence emits warning', async () => {
    await writeMinimalRequiredFiles();
    await fs.writeFile(
      path.join(SPEC_DIR, 'JIRA_SOURCE.md'),
      '# Jira Source\n\n## Description (Verbatim)\n\nSome directive.\n',
      'utf-8',
    );

    const result = runValidator();
    const warnings = (result.json?.warnings || []) as Array<{
      rule: string;
      file: string;
    }>;

    const acWarning = warnings.find(
      (w) => w.rule === 'JIRA_SOURCE_PRESERVED' && w.file === 'ACCEPTANCE_CRITERIA.md',
    );
    expect(acWarning).toBeDefined();
  });

  // @feature5
  it('SPECJIRA001_05: BDD scenario without # Jira trace comment emits warning', async () => {
    await writeMinimalRequiredFiles();
    await fs.writeFile(
      path.join(SPEC_DIR, 'JIRA_SOURCE.md'),
      '# Jira Source\n\n## Description (Verbatim)\n\nSome directive.\n',
      'utf-8',
    );

    const result = runValidator();
    const warnings = (result.json?.warnings || []) as Array<{
      rule: string;
      file: string;
      message: string;
    }>;

    const featWarning = warnings.find(
      (w) => w.rule === 'JIRA_SOURCE_PRESERVED' && w.file.endsWith('.feature'),
    );
    expect(featWarning).toBeDefined();
    expect(featWarning?.message).toContain('Jira trace');
  });

  // @feature6 — checkJiraDrift unit-level (runs in-process, does not call validate-spec)
  it('SPECJIRA001_06: checkJiraDrift emits INFO when MCP unavailable and .jira-cache.json exists', async () => {
    await fs.ensureDir(SPEC_DIR);
    const cache = {
      schema_version: 1,
      jira_key: 'TEST-123',
      jira_url: 'https://example.invalid/browse/TEST-123',
      last_fetch_at: '2026-01-01T00:00:00Z',
      issue_updated_at: '2026-01-01T00:00:00Z',
      comment_count: 0,
      attachments: [],
    };
    await fs.writeFile(
      path.join(SPEC_DIR, '.jira-cache.json'),
      JSON.stringify(cache, null, 2),
      'utf-8',
    );

    const findings = checkJiraDrift(SPEC_DIR, null, true);
    expect(findings).toHaveLength(1);
    expect(findings[0].check).toBe('JIRA_DRIFT');
    expect(findings[0].severity).toBe('INFO');
    expect(findings[0].message).toContain('skipped');
  });

  // @feature6 — no cache = no findings
  it('SPECJIRA001_06b: checkJiraDrift is no-op when .jira-cache.json is absent', async () => {
    await fs.ensureDir(SPEC_DIR);
    const findings = checkJiraDrift(SPEC_DIR, null, true);
    expect(findings).toHaveLength(0);
  });

  // @feature6 — live drift detection
  it('SPECJIRA001_06c: checkJiraDrift emits WARNING when issue_updated_at differs from live', async () => {
    await fs.ensureDir(SPEC_DIR);
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
    await fs.writeFile(
      path.join(SPEC_DIR, '.jira-cache.json'),
      JSON.stringify(cache, null, 2),
      'utf-8',
    );

    const live: JiraLiveState = {
      issueUpdatedAt: '2026-02-15T12:00:00Z',
      commentCount: 5,
      attachmentHashes: { 'att-1': 'sha256:aaa' },
    };
    const findings = checkJiraDrift(SPEC_DIR, live, false);
    const updatedFinding = findings.find((f) =>
      f.message.includes('Issue modified since intake'),
    );
    expect(updatedFinding).toBeDefined();
    expect(updatedFinding?.severity).toBe('WARNING');
    const commentFinding = findings.find((f) => f.message.includes('new comment'));
    expect(commentFinding).toBeDefined();
    expect(commentFinding?.severity).toBe('WARNING');
  });

  // @feature7
  it('SPECJIRA001_07: Templates referenced in extension.json exist on disk', async () => {
    const extJsonPath = appPath('extensions', 'specs-workflow', 'extension.json');
    const extJson = JSON.parse(await fs.readFile(extJsonPath, 'utf-8'));
    const expectedTemplates = [
      'JIRA_SOURCE.md.template',
      'ATTACHMENTS.md.template',
      'JIRA_CACHE.schema.json',
    ];
    const toolFiles: string[] = extJson.toolFiles['specs-generator'];
    for (const tpl of expectedTemplates) {
      expect(toolFiles.some((p) => p.endsWith(tpl))).toBe(true);
      const onDisk = appPath(
        'extensions',
        'specs-workflow',
        'tools',
        'specs-generator',
        'templates',
        tpl,
      );
      expect(await fs.pathExists(onDisk)).toBe(true);
    }
  });

  // Regression guard: ensure non-Jira spec has zero new findings from Jira rules.
  it('regression: runAllChecks on non-Jira spec emits zero JIRA_DRIFT findings', async () => {
    await writeMinimalRequiredFiles();
    const findings = runAllChecks(SPEC_DIR);
    const jiraDrift = findings.filter((f) => f.check === 'JIRA_DRIFT');
    expect(jiraDrift).toHaveLength(0);
  });
});
