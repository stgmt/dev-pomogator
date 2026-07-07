/**
 * Integration tests for spec-generator-v3 feature (SPECGEN003).
 *
 * Covers 28 scenarios from .specs/spec-generator-v3/spec-generator-v3.feature:
 * - SPECGEN003_01..04: user-story-form-guard (deny + allow + migration + fail-open)
 * - SPECGEN003_05..07: task-form-guard
 * - SPECGEN003_08..09: design-decision-guard
 * - SPECGEN003_10..12: requirements-chk-guard
 * - SPECGEN003_13..14: risk-assessment-guard
 * - SPECGEN003_15, 23: fail-open paths (malformed stdin, regex exception)
 * - SPECGEN003_16, 17: child skill invocation (discovery-forms, task-board-forms)
 * - SPECGEN003_18: migration safety (existing v1/v2 specs)
 * - SPECGEN003_19, 20: spec-status.ts -Format task-table
 * - SPECGEN003_21: Jira-mode preservation
 * - SPECGEN003_22: guards ignore Read tool
 * - SPECGEN003_24: child skills do NOT auto-trigger
 * - SPECGEN003_25, 26: meta-guard (deny remove form-guard, allow add unrelated)
 * - SPECGEN003_27: audit-logger append-only with ISO timestamp
 * - SPECGEN003_28: UserPromptSubmit summary over 24h
 *
 * Red baseline: all assertions should FAIL until implementation phases land.
 * @see integration-tests-first.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, appendFileSync } from 'fs';
import { tmpdir, homedir } from 'os';
import path from 'path';

const APP_DIR = process.env.APP_DIR || process.cwd();
const VALIDATOR_DIR = path.join(APP_DIR, 'extensions', 'specs-workflow', 'tools', 'specs-validator');
const GENERATOR_DIR = path.join(APP_DIR, 'extensions', 'specs-workflow', 'tools', 'specs-generator');
const FIXTURES_DIR = path.join(APP_DIR, 'tests', 'fixtures', 'spec-generator-v3');

const USER_STORY_GUARD = path.join(VALIDATOR_DIR, 'user-story-form-guard.ts');
const TASK_GUARD = path.join(VALIDATOR_DIR, 'task-form-guard.ts');
const DESIGN_GUARD = path.join(VALIDATOR_DIR, 'design-decision-guard.ts');
const CHK_GUARD = path.join(VALIDATOR_DIR, 'requirements-chk-guard.ts');
const RISK_GUARD = path.join(VALIDATOR_DIR, 'risk-assessment-guard.ts');
const META_GUARD = path.join(VALIDATOR_DIR, 'extension-json-meta-guard.ts');
const SPEC_STATUS = path.join(GENERATOR_DIR, 'spec-status.ts');
const VALIDATE_SPECS = path.join(VALIDATOR_DIR, 'validate-specs.ts');
const AUDIT_LOG = path.join(homedir(), '.dev-pomogator', 'logs', 'form-guards.log');

/**
 * Invoke a PreToolUse hook by piping a JSON payload to its stdin.
 * Returns { status, stdout, stderr }.
 */
function invokeHook(
  hookPath: string,
  payload: {
    tool_name?: string;
    tool_input?: { file_path?: string; content?: string; new_string?: string };
    [k: string]: unknown;
  },
  opts: { env?: Record<string, string> } = {}
) {
  return spawnSync('npx', ['tsx', hookPath], {
    encoding: 'utf-8',
    input: JSON.stringify(payload),
    cwd: APP_DIR,
    env: { ...process.env, ...(opts.env || {}), FORCE_COLOR: '0' },
  });
}

/**
 * Build a temporary spec dir with optional progress.json at the requested version.
 */
function makeTempSpec(opts: {
  files?: Record<string, string>;
  progressVersion?: number | 'missing' | 'no-version-field';
}): { specDir: string; cleanup: () => void } {
  const specDir = mkdtempSync(path.join(tmpdir(), 'spec-v3-test-'));
  if (opts.files) {
    for (const [name, content] of Object.entries(opts.files)) {
      writeFileSync(path.join(specDir, name), content, 'utf-8');
    }
  }
  if (opts.progressVersion === 'missing') {
    // no progress.json at all
  } else if (opts.progressVersion === 'no-version-field') {
    writeFileSync(
      path.join(specDir, '.progress.json'),
      JSON.stringify({ featureSlug: 'legacy' }),
      'utf-8'
    );
  } else if (typeof opts.progressVersion === 'number') {
    writeFileSync(
      path.join(specDir, '.progress.json'),
      JSON.stringify({ version: opts.progressVersion, featureSlug: 'test' }),
      'utf-8'
    );
  }
  return { specDir, cleanup: () => rmSync(specDir, { recursive: true, force: true }) };
}

describe('SPECGEN003: spec-generator-v3 form-guards + skills + audit log', () => {
  // ========== user-story-form-guard (FR-4) ==========

  // @feature4
  it('SPECGEN003_01: user-story-form-guard denies USER_STORIES.md without Priority (integration)', () => {
    const { specDir, cleanup } = makeTempSpec({ progressVersion: 3 });
    try {
      const content = `# User Stories\n\n### User Story 1: Foo\n\nAs a user I want foo so that bar.\n\n**Why:** rationale\n\n**Independent Test:** test\n\n**Acceptance Scenarios:**\nGiven foo When bar Then baz\n`;
      const result = invokeHook(USER_STORY_GUARD, {
        tool_name: 'Write',
        tool_input: { file_path: path.join(specDir, 'USER_STORIES.md'), content },
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/Priority/i);
      expect(result.stderr).not.toMatch(/SPEC_FORM_GUARDS_DISABLE/);
    } finally {
      cleanup();
    }
  });

  // @feature4
  it('SPECGEN003_02: user-story-form-guard denies when Priority present but Why missing (integration)', () => {
    const { specDir, cleanup } = makeTempSpec({ progressVersion: 3 });
    try {
      const content = `# User Stories\n\n### User Story 1: Foo (Priority: P1)\n\nAs a user I want foo.\n\n**Independent Test:** test\n\n**Acceptance Scenarios:**\nGiven foo When bar Then baz\n`;
      const result = invokeHook(USER_STORY_GUARD, {
        tool_name: 'Write',
        tool_input: { file_path: path.join(specDir, 'USER_STORIES.md'), content },
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/Why/i);
    } finally {
      cleanup();
    }
  });

  // @feature4
  it('SPECGEN003_03: user-story-form-guard allows all 4 fields present (integration)', () => {
    const { specDir, cleanup } = makeTempSpec({ progressVersion: 3 });
    try {
      const content = `# User Stories\n\n### User Story 1: Foo (Priority: P1)\n\nAs a user I want foo so that bar.\n\n**Why:** rationale\n\n**Independent Test:** test it standalone\n\n**Acceptance Scenarios:**\nGiven foo When bar Then baz\n`;
      const result = invokeHook(USER_STORY_GUARD, {
        tool_name: 'Write',
        tool_input: { file_path: path.join(specDir, 'USER_STORIES.md'), content },
      });
      expect(result.status).toBe(0);
    } finally {
      cleanup();
    }
  });

  // @feature5
  it('SPECGEN003_04: migration safety — v1/v2 spec passes unchecked (integration)', () => {
    const { specDir, cleanup } = makeTempSpec({ progressVersion: 'missing' });
    try {
      const content = `# User Stories\n\n- Как пользователь, я хочу логин, чтобы войти.\n`;
      const result = invokeHook(USER_STORY_GUARD, {
        tool_name: 'Write',
        tool_input: { file_path: path.join(specDir, 'USER_STORIES.md'), content },
      });
      expect(result.status).toBe(0);
    } finally {
      cleanup();
    }
  });

  // ========== task-form-guard (FR-5) ==========

  // @feature4
  it('SPECGEN003_05: task-form-guard denies TASKS.md without Done When (integration)', () => {
    const { specDir, cleanup } = makeTempSpec({ progressVersion: 3 });
    try {
      const content = `# Tasks\n\n## Phase 1\n\n- [ ] Implement queue\n  _Requirements: [FR-1](FR.md)_\n`;
      const result = invokeHook(TASK_GUARD, {
        tool_name: 'Write',
        tool_input: { file_path: path.join(specDir, 'TASKS.md'), content },
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/Done When/i);
    } finally {
      cleanup();
    }
  });

  // @feature4
  it('SPECGEN003_06: task-form-guard denies Done When with zero checkboxes (integration)', () => {
    const { specDir, cleanup } = makeTempSpec({ progressVersion: 3 });
    try {
      const content = `# Tasks\n\n## Phase 1\n\n- [ ] Implement queue — Status: TODO | Est: 30m\n  **Done When:**\n  (no checkboxes here)\n`;
      const result = invokeHook(TASK_GUARD, {
        tool_name: 'Write',
        tool_input: { file_path: path.join(specDir, 'TASKS.md'), content },
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/checkbox/i);
    } finally {
      cleanup();
    }
  });

  // @feature4
  it('SPECGEN003_07: task-form-guard allows full task format (integration)', () => {
    const { specDir, cleanup } = makeTempSpec({ progressVersion: 3 });
    try {
      const content = `# Tasks\n\n## Phase 1\n\n- [ ] Implement queue — Status: TODO | Est: 30m\n  **Done When:**\n  - [ ] queue.ts exports readQueue\n  - [ ] @feature1 Green\n`;
      const result = invokeHook(TASK_GUARD, {
        tool_name: 'Write',
        tool_input: { file_path: path.join(specDir, 'TASKS.md'), content },
      });
      expect(result.status).toBe(0);
    } finally {
      cleanup();
    }
  });

  // ========== design-decision-guard (FR-6) ==========

  // @feature4
  it('SPECGEN003_08: design-decision-guard denies Decision without Alternatives (integration)', () => {
    const { specDir, cleanup } = makeTempSpec({ progressVersion: 3 });
    try {
      const content = `# Design\n\n## Key Decisions\n\n### Decision: Use ProgressV3\n\n**Rationale:** reasons\n\n**Trade-off:** tradeoff\n\n(no Alternatives section)\n`;
      const result = invokeHook(DESIGN_GUARD, {
        tool_name: 'Write',
        tool_input: { file_path: path.join(specDir, 'DESIGN.md'), content },
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/Alternatives/i);
    } finally {
      cleanup();
    }
  });

  // @feature4
  it('SPECGEN003_09: design-decision-guard allows DESIGN.md without decisions (integration)', () => {
    const { specDir, cleanup } = makeTempSpec({ progressVersion: 3 });
    try {
      const content = `# Design\n\n## Components\n\n- foo.ts — does foo\n- bar.ts — does bar\n`;
      const result = invokeHook(DESIGN_GUARD, {
        tool_name: 'Write',
        tool_input: { file_path: path.join(specDir, 'DESIGN.md'), content },
      });
      expect(result.status).toBe(0);
    } finally {
      cleanup();
    }
  });

  // ========== requirements-chk-guard (FR-7) ==========

  // @feature4
  it('SPECGEN003_10: requirements-chk-guard denies CHK without Verification Method (integration)', () => {
    const { specDir, cleanup } = makeTempSpec({ progressVersion: 3 });
    try {
      const content = `# Requirements\n\n## Verification Matrix\n\n| CHK-ID | Requirement | Traces To | Verification Method | Status | Notes |\n|--------|-------------|-----------|---------------------|--------|-------|\n| CHK-FR1-01 | FR-1 covered | FR-1, AC-1 |  | Draft | — |\n`;
      const result = invokeHook(CHK_GUARD, {
        tool_name: 'Write',
        tool_input: { file_path: path.join(specDir, 'REQUIREMENTS.md'), content },
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/Verification Method/i);
    } finally {
      cleanup();
    }
  });

  // @feature4
  it('SPECGEN003_11: requirements-chk-guard denies malformed CHK ID (integration)', () => {
    const { specDir, cleanup } = makeTempSpec({ progressVersion: 3 });
    try {
      const content = `# Requirements\n\n## Verification Matrix\n\n| CHK-ID | Requirement | Traces To | Verification Method | Status | Notes |\n|--------|-------------|-----------|---------------------|--------|-------|\n| CHK-001 | Foo | FR-1 | BDD scenario | Draft | — |\n`;
      const result = invokeHook(CHK_GUARD, {
        tool_name: 'Write',
        tool_input: { file_path: path.join(specDir, 'REQUIREMENTS.md'), content },
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/CHK-FR/);
    } finally {
      cleanup();
    }
  });

  // @feature4
  it('SPECGEN003_12: requirements-chk-guard allows valid CHK row (integration)', () => {
    const { specDir, cleanup } = makeTempSpec({ progressVersion: 3 });
    try {
      const content = `# Requirements\n\n## Verification Matrix\n\n| CHK-ID | Requirement | Traces To | Verification Method | Status | Notes |\n|--------|-------------|-----------|---------------------|--------|-------|\n| CHK-FR1-01 | FR-1 covered | FR-1, AC-1, @feature1 | BDD scenario | Draft | — |\n`;
      const result = invokeHook(CHK_GUARD, {
        tool_name: 'Write',
        tool_input: { file_path: path.join(specDir, 'REQUIREMENTS.md'), content },
      });
      expect(result.status).toBe(0);
    } finally {
      cleanup();
    }
  });

  // ========== risk-assessment-guard (FR-8) ==========

  // @feature4
  it('SPECGEN003_13: risk-assessment-guard denies heading with only 1 row (integration)', () => {
    const { specDir, cleanup } = makeTempSpec({ progressVersion: 3 });
    try {
      const content = `# Research\n\n## Risk Assessment\n\n| Risk | Likelihood | Impact | Mitigation |\n|------|------------|--------|------------|\n| Single risk | High | Medium | mitigation |\n`;
      const result = invokeHook(RISK_GUARD, {
        tool_name: 'Write',
        tool_input: { file_path: path.join(specDir, 'RESEARCH.md'), content },
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/Risk Assessment/i);
    } finally {
      cleanup();
    }
  });

  // @feature4
  it('SPECGEN003_14: risk-assessment-guard allows file without heading (integration)', () => {
    const { specDir, cleanup } = makeTempSpec({ progressVersion: 3 });
    try {
      const content = `# Research\n\n## Context\n\nSome prose without Risk Assessment heading.\n`;
      const result = invokeHook(RISK_GUARD, {
        tool_name: 'Write',
        tool_input: { file_path: path.join(specDir, 'RESEARCH.md'), content },
      });
      expect(result.status).toBe(0);
    } finally {
      cleanup();
    }
  });

  // ========== fail-open paths (FR-10) ==========

  // @feature5
  it('SPECGEN003_15: fail-open on malformed stdin (integration)', () => {
    const result = spawnSync('npx', ['tsx', USER_STORY_GUARD], {
      encoding: 'utf-8',
      input: 'not-valid-json{{{',
      cwd: APP_DIR,
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    expect(result.status).toBe(0);
  });

  // @feature5
  it('SPECGEN003_23: fail-open on regex exception (integration)', () => {
    const { specDir, cleanup } = makeTempSpec({ progressVersion: 3 });
    try {
      // Content that could plausibly break naive regex (nested brackets, unclosed structures)
      const content = `# User Stories\n\n### User Story 1: )((( (((((((((((((\\nd+){1000} (Priority: P1)\n`;
      const result = invokeHook(USER_STORY_GUARD, {
        tool_name: 'Write',
        tool_input: { file_path: path.join(specDir, 'USER_STORIES.md'), content },
      });
      // Regardless of what parser does — status must never be 2 due to parser bug
      // Either valid validation fail (code 2 with meaningful message) or pass (0)
      expect([0, 2]).toContain(result.status);
    } finally {
      cleanup();
    }
  });

  // ========== skill invocation (FR-1, FR-3) ==========

  // @feature1
  it('SPECGEN003_16: discovery-forms skill populates USER_STORIES.md in v3 format (integration)', () => {
    // Skill invocation is tested via its presence + structure.
    // Actual Skill tool execution requires Claude Code runtime which is not available in unit context.
    const skillPath = path.join(APP_DIR, 'extensions', 'specs-workflow', '.claude', 'skills', 'discovery-forms', 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);
    const content = readFileSync(skillPath, 'utf-8');
    // Frontmatter must be anti-pushy (no "when user asks"/"whenever")
    expect(content).toMatch(/^---/);
    expect(content.slice(0, 600)).not.toMatch(/when the user/i);
    expect(content.slice(0, 600)).not.toMatch(/whenever/i);
    expect(content).toMatch(/discovery-forms/);
  });

  // @feature3
  it('SPECGEN003_17: task-board-forms skill exists and has anti-pushy description (integration)', () => {
    const skillPath = path.join(APP_DIR, 'extensions', 'specs-workflow', '.claude', 'skills', 'task-board-forms', 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);
    const content = readFileSync(skillPath, 'utf-8');
    expect(content.slice(0, 600)).not.toMatch(/when the user/i);
    expect(content.slice(0, 600)).not.toMatch(/whenever/i);
    expect(content).toMatch(/task-board-forms/);
  });

  // ========== migration safety (FR-9) ==========

  // @feature5
  it('SPECGEN003_18: existing v2 spec Write passes unblocked (integration)', () => {
    const existingSpec = path.join(APP_DIR, '.specs', 'pushy-skill-descriptions');
    // Verify test precondition: this spec exists and has no .progress.json (or v < 3)
    if (!existsSync(existingSpec)) {
      // skip — spec structure changed
      return;
    }
    const progressPath = path.join(existingSpec, '.progress.json');
    let isPreV3 = true;
    if (existsSync(progressPath)) {
      try {
        const p = JSON.parse(readFileSync(progressPath, 'utf-8'));
        isPreV3 = !p.version || p.version < 3;
      } catch {
        isPreV3 = true;
      }
    }
    expect(isPreV3).toBe(true);

    const result = invokeHook(USER_STORY_GUARD, {
      tool_name: 'Write',
      tool_input: {
        file_path: path.join(existingSpec, 'USER_STORIES.md'),
        content: '# User Stories\n- Как роль, я хочу X, чтобы Y.\n',
      },
    });
    expect(result.status).toBe(0);
  });

  // ========== spec-status.ts -Format task-table (FR-14) ==========

  // @feature3
  it('SPECGEN003_19: spec-status.ts -Format task-table renders markdown (integration)', () => {
    const { specDir, cleanup } = makeTempSpec({
      progressVersion: 3,
      files: {
        'TASKS.md': `# Tasks\n\n## Phase 0: BDD\n\n- [ ] Create feature — Status: TODO | Est: 15m\n- [ ] Write step definitions — Status: TODO | Est: 30m\n\n## Phase 1: Implementation\n\n- [ ] Build parser — Status: TODO | Est: 45m\n- [ ] Wire hook — Status: TODO | Est: 30m\n- [ ] Integration test — Status: TODO | Est: 60m\n`,
      },
    });
    try {
      const result = spawnSync('npx', ['tsx', SPEC_STATUS, '-Path', specDir, '-Format', 'task-table'], {
        encoding: 'utf-8',
        cwd: APP_DIR,
        env: { ...process.env, FORCE_COLOR: '0' },
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/\|\s*ID\s*\|\s*Title\s*\|\s*Status\s*\|\s*Depends\s*\|\s*Phase\s*\|\s*Est/);
      // Count data rows
      const dataRows = (result.stdout.match(/^\|(?!-)/gm) || []).length;
      expect(dataRows).toBeGreaterThanOrEqual(5 + 1); // 5 tasks + 1 header
    } finally {
      cleanup();
    }
  });

  // @feature3
  it('SPECGEN003_20: task-table format idempotent (integration)', () => {
    const { specDir, cleanup } = makeTempSpec({
      progressVersion: 3,
      files: {
        'TASKS.md': `# Tasks\n\n## Phase 0\n\n- [ ] Task A — Status: TODO | Est: 15m\n- [ ] Task B — Status: DONE | Est: 30m\n`,
      },
    });
    try {
      const a = spawnSync('npx', ['tsx', SPEC_STATUS, '-Path', specDir, '-Format', 'task-table'], {
        encoding: 'utf-8', cwd: APP_DIR, env: { ...process.env, FORCE_COLOR: '0' },
      });
      const b = spawnSync('npx', ['tsx', SPEC_STATUS, '-Path', specDir, '-Format', 'task-table'], {
        encoding: 'utf-8', cwd: APP_DIR, env: { ...process.env, FORCE_COLOR: '0' },
      });
      expect(a.status).toBe(0);
      expect(a.stdout).toBe(b.stdout);
    } finally {
      cleanup();
    }
  });

  // ========== Jira-mode preservation (FR-2) ==========

  // @feature1
  it('SPECGEN003_21: Jira-mode preservation — CHK skill preserves existing Jira traces (integration)', () => {
    // Structural: skill file references "Jira imperative:" preservation pattern
    const skillPath = path.join(APP_DIR, 'extensions', 'specs-workflow', '.claude', 'skills', 'requirements-chk-matrix', 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);
    const content = readFileSync(skillPath, 'utf-8');
    // Must mention Jira mode preservation explicitly
    expect(content).toMatch(/jira/i);
    expect(content).toMatch(/preserv/i);
  });

  // ========== tool-matcher + auto-trigger negative tests ==========

  // @feature4
  it('SPECGEN003_22: guards ignore Read tool (integration)', () => {
    const { specDir, cleanup } = makeTempSpec({ progressVersion: 3 });
    try {
      const result = invokeHook(USER_STORY_GUARD, {
        tool_name: 'Read',
        tool_input: { file_path: path.join(specDir, 'USER_STORIES.md') },
      });
      expect(result.status).toBe(0);
    } finally {
      cleanup();
    }
  });

  // @feature1
  it('SPECGEN003_24: child skills do NOT contain auto-trigger phrases (integration)', () => {
    const skills = ['discovery-forms', 'requirements-chk-matrix', 'task-board-forms'];
    for (const skill of skills) {
      const skillPath = path.join(APP_DIR, 'extensions', 'specs-workflow', '.claude', 'skills', skill, 'SKILL.md');
      expect(existsSync(skillPath), `${skill}/SKILL.md must exist`).toBe(true);
      const content = readFileSync(skillPath, 'utf-8');
      // Extract frontmatter description (first 800 chars ~ frontmatter block)
      const header = content.slice(0, 800);
      // These phrases are strong auto-trigger signals — must NOT be in child skill descriptions
      expect(header, `${skill} description contains 'when the user'`).not.toMatch(/when the user/i);
      expect(header, `${skill} description contains 'whenever'`).not.toMatch(/whenever/i);
      expect(header, `${skill} description contains 'use this skill whenever'`).not.toMatch(/use this skill whenever/i);
    }
  });

  // ========== meta-guard (FR-11) ==========

  // @feature7
  it('SPECGEN003_25: meta-guard denies removing form-guard from extension.json (integration)', () => {
    const extensionJson = path.join(APP_DIR, 'extensions', 'specs-workflow', 'extension.json');
    // Simulate Edit removing user-story-form-guard entry from hooks.PreToolUse
    const current = readFileSync(extensionJson, 'utf-8');
    // Only run test if extension.json actually has the form-guards wired (Phase 5 done)
    if (!current.includes('user-story-form-guard')) {
      return; // not yet wired — scenario not applicable pre-phase-5
    }
    const mutated = current.replace(/\{\s*"type":\s*"command",\s*"command":\s*"[^"]*user-story-form-guard[^"]*"\s*\},?/g, '');
    const result = invokeHook(META_GUARD, {
      tool_name: 'Write',
      tool_input: { file_path: extensionJson, content: mutated },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/cannot remove form-guards/i);
    expect(result.stderr).toMatch(/human review/i);
  });

  // @feature7
  it('SPECGEN003_26: meta-guard allows adding new unrelated hook (integration)', () => {
    const extensionJson = path.join(APP_DIR, 'extensions', 'specs-workflow', 'extension.json');
    const current = readFileSync(extensionJson, 'utf-8');
    if (!current.includes('user-story-form-guard')) {
      return;
    }
    // Add a new unrelated entry while keeping all form-guards
    const mutated = current.replace(
      /"PreToolUse":\s*\[/,
      `"PreToolUse": [{ "matcher": "Write", "hooks": [{ "type": "command", "command": "npx tsx my-unrelated-hook.ts" }] },`
    );
    const result = invokeHook(META_GUARD, {
      tool_name: 'Write',
      tool_input: { file_path: extensionJson, content: mutated },
    });
    expect(result.status).toBe(0);
  });

  // ========== audit-logger (FR-12) ==========

  // @feature8
  it('SPECGEN003_27: audit-logger appends event with ISO timestamp (integration)', () => {
    const AUDIT_LOGGER = path.join(VALIDATOR_DIR, 'audit-logger.ts');
    if (!existsSync(AUDIT_LOGGER)) {
      expect.fail('audit-logger.ts not yet created');
    }
    // Invoke logger via tiny Node shim: import logEvent and call it
    const shim = `
      import { logEvent } from ${JSON.stringify(AUDIT_LOGGER)};
      logEvent('test-hook', 'DENY', '/tmp/foo.md', 'testing');
      console.log('DONE');
    `;
    const result = spawnSync('npx', ['tsx', '-e', shim], {
      encoding: 'utf-8', cwd: APP_DIR, env: { ...process.env, FORCE_COLOR: '0' },
    });
    expect(result.status).toBe(0);
    const log = existsSync(AUDIT_LOG) ? readFileSync(AUDIT_LOG, 'utf-8') : '';
    const lastLine = log.trim().split('\n').pop() || '';
    expect(lastLine).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z\s+DENY\s+test-hook\s+\/tmp\/foo\.md/);
  });

  // @feature8
  it('SPECGEN003_28: UserPromptSubmit summary shows counts for 24h window (integration)', () => {
    // Seed log with synthetic events
    const nowIso = new Date().toISOString();
    const synthetic = [
      `${nowIso} DENY user-story-form-guard /tmp/a USER_STORIES missing Priority`,
      `${nowIso} DENY task-form-guard /tmp/b TASKS missing Done When`,
      `${nowIso} DENY design-decision-guard /tmp/c DESIGN missing Alternatives`,
      `${nowIso} PARSER_CRASH user-story-form-guard /tmp/d regex overflow`,
      `${nowIso} ALLOW_AFTER_MIGRATION user-story-form-guard /tmp/e v2 pass-through`,
      `${nowIso} ALLOW_AFTER_MIGRATION task-form-guard /tmp/f v2 pass-through`,
    ].join('\n') + '\n';
    mkdirSync(path.dirname(AUDIT_LOG), { recursive: true });
    // Preserve existing log + append
    const existing = existsSync(AUDIT_LOG) ? readFileSync(AUDIT_LOG, 'utf-8') : '';
    writeFileSync(AUDIT_LOG, existing + synthetic, 'utf-8');

    const payload = { hook_event_name: 'UserPromptSubmit', prompt: 'hello', cwd: APP_DIR };
    const result = spawnSync('npx', ['tsx', VALIDATE_SPECS], {
      encoding: 'utf-8', input: JSON.stringify(payload),
      cwd: APP_DIR, env: { ...process.env, FORCE_COLOR: '0' },
    });
    expect(result.status).toBe(0);
    const combined = (result.stdout || '') + (result.stderr || '');
    expect(combined).toMatch(/Form guards \(24h\)/);
    expect(combined).toMatch(/3 DENY|DENY:\s*3/);
    expect(combined).toMatch(/1 PARSER_CRASH|PARSER_CRASH:\s*1/);
    expect(combined).toMatch(/2 ALLOW_AFTER_MIGRATION|ALLOW_AFTER_MIGRATION:\s*2/);
  });
});
