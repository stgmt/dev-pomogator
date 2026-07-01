/**
 * Step definitions for SPECGEN003: v3 form-guards migration
 * Migrated from tests/e2e/spec-generator-v3.test.ts (SPECGEN003_01-28, excluding 25/26 dead)
 *
 * Feature tags:
 *   @feature19 — FR-19 two-tier hook failure-mode policy (form guard behavior)
 *   @feature20 — FR-20 UserPromptSubmit threshold conformance summary
 *   @feature21 — FR-21 spec-status task-table backward-compat
 *   @feature23 — FR-23 log-file inventory (audit-logger)
 *   @feature55 — FR-55 child phase-assistant skills non-auto-trigger descriptions
 */
import { After, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { IWorld as CucumberWorld } from '@cucumber/cucumber';

// Resolve REPO_ROOT relative to this file (tests/step_definitions/ → repo root)
const _dirname =
  typeof import.meta !== 'undefined' && import.meta.dirname
    ? import.meta.dirname
    : __dirname;
const REPO_ROOT = path.resolve(_dirname, '..', '..');

// Static import for audit-logger (used by SPECGEN003_27 — logEvent writes to real AUDIT_LOG)
// ts-ignore note: when loaded by cucumber under tsx, the .ts import resolves correctly
import { logEvent as auditLogEvent } from '../../tools/specs-validator/audit-logger.ts';

const VALIDATOR_DIR = path.join(REPO_ROOT, 'tools', 'specs-validator');
const GENERATOR_DIR = path.join(REPO_ROOT, 'tools', 'specs-generator');

const USER_STORY_GUARD = path.join(VALIDATOR_DIR, 'user-story-form-guard.ts');
const TASK_GUARD = path.join(VALIDATOR_DIR, 'task-form-guard.ts');
const DESIGN_GUARD = path.join(VALIDATOR_DIR, 'design-decision-guard.ts');
const CHK_GUARD = path.join(VALIDATOR_DIR, 'requirements-chk-guard.ts');
const RISK_GUARD = path.join(VALIDATOR_DIR, 'risk-assessment-guard.ts');
const SPEC_STATUS = path.join(GENERATOR_DIR, 'spec-status.ts');
const VALIDATE_SPECS = path.join(VALIDATOR_DIR, 'validate-specs.ts');

const AUDIT_LOG = path.join(os.homedir(), '.dev-pomogator', 'logs', 'form-guards.log');
const ACK_FILE = path.join(os.homedir(), '.dev-pomogator', 'state', 'last-summary-ack.json');

// ---------------------------------------------------------------------------
// World extension — per-scenario state
// ---------------------------------------------------------------------------

interface SPECGEN003World extends CucumberWorld {
  tempDir: string; // provided by V4World Before hook
  s003SpecDir?: string;
  s003Result?: { status: number | null; stdout: string; stderr: string };
  s003Result2?: { status: number | null; stdout: string; stderr: string };
  // Backup state for AUDIT_LOG and ACK_FILE (undefined = not yet backed up)
  s003OrigLog?: string | null; // null means file did not exist before backup
  s003OrigAck?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a spec directory inside world.tempDir and set world.s003SpecDir.
 * extractSpecInfo matches any path containing ".specs/<slug>/<file>", so
 * tempDir/.specs/<slug>/ is a valid spec dir for form guards.
 * For spec-status, pass SPECS_GENERATOR_ROOT=world.tempDir so assertSpecSubdir
 * accepts the tempDir-rooted spec path.
 */
function makeS003Spec(
  world: SPECGEN003World,
  opts: {
    progressVersion?: number | 'missing' | 'no-version-field';
    files?: Record<string, string>;
    slug?: string;
  } = {}
): string {
  const slug = opts.slug ?? 'probe-s003';
  const specDir = path.join(world.tempDir, '.specs', slug);
  fs.mkdirSync(specDir, { recursive: true });

  if (opts.progressVersion !== 'missing') {
    const progress =
      opts.progressVersion === 'no-version-field'
        ? { featureSlug: slug }
        : { version: opts.progressVersion ?? 3, featureSlug: slug };
    fs.writeFileSync(path.join(specDir, '.progress.json'), JSON.stringify(progress));
  }

  if (opts.files) {
    for (const [name, content] of Object.entries(opts.files)) {
      fs.writeFileSync(path.join(specDir, name), content);
    }
  }

  world.s003SpecDir = specDir;
  return specDir;
}

/**
 * Spawn a form-guard script with a Claude Code PreToolUse payload via stdin.
 * Uses process.execPath + --import tsx (NOT npx) per dogfood-hardened convention.
 */
function invokeGuard(
  guardPath: string,
  toolName: string,
  filePath: string,
  content?: string
): { status: number | null; stdout: string; stderr: string } {
  const payload = {
    tool_name: toolName,
    tool_input:
      content !== undefined ? { file_path: filePath, content } : { file_path: filePath },
  };
  const res = spawnSync(process.execPath, ['--import', 'tsx', guardPath], {
    encoding: 'utf-8',
    input: JSON.stringify(payload),
    cwd: REPO_ROOT,
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

// ---------------------------------------------------------------------------
// After hook — restore shared-state files (AUDIT_LOG, ACK_FILE) after
// scenarios that back them up (SPECGEN003_27 @feature23, SPECGEN003_28 @feature20)
// ---------------------------------------------------------------------------
After({ tags: '@feature20 or @feature23' }, function (this: SPECGEN003World) {
  if (this.s003OrigLog !== undefined) {
    if (this.s003OrigLog === null) {
      try { fs.unlinkSync(AUDIT_LOG); } catch { /* already gone */ }
    } else {
      fs.mkdirSync(path.dirname(AUDIT_LOG), { recursive: true });
      fs.writeFileSync(AUDIT_LOG, this.s003OrigLog);
    }
    this.s003OrigLog = undefined;
  }
  if (this.s003OrigAck !== undefined) {
    if (this.s003OrigAck === null) {
      try { fs.unlinkSync(ACK_FILE); } catch { /* already gone */ }
    } else {
      fs.mkdirSync(path.dirname(ACK_FILE), { recursive: true });
      fs.writeFileSync(ACK_FILE, this.s003OrigAck);
    }
    this.s003OrigAck = undefined;
  }
});

// ---------------------------------------------------------------------------
// GIVEN steps — spec directory setup
// ---------------------------------------------------------------------------

Given(/^a SPECGEN003 v3 spec directory is prepared$/, function (this: SPECGEN003World) {
  makeS003Spec(this, { progressVersion: 3 });
});

Given(/^a SPECGEN003 spec directory with no progress\.json is prepared$/, function (this: SPECGEN003World) {
  makeS003Spec(this, { progressVersion: 'missing' });
});

Given(
  /^a SPECGEN003 spec directory with a legacy progress\.json lacking a version field is prepared$/,
  function (this: SPECGEN003World) {
    makeS003Spec(this, { progressVersion: 'no-version-field' });
  }
);

Given(
  /^a SPECGEN003 v3 spec directory with a 5-task TASKS\.md is prepared$/,
  function (this: SPECGEN003World) {
    makeS003Spec(this, {
      progressVersion: 3,
      files: {
        'TASKS.md':
          '# Tasks\n\n## Phase 0: BDD\n\n' +
          '- [ ] Create feature — Status: TODO | Est: 15m\n' +
          '- [ ] Write step definitions — Status: TODO | Est: 30m\n\n' +
          '## Phase 1: Implementation\n\n' +
          '- [ ] Build parser — Status: TODO | Est: 45m\n' +
          '- [ ] Wire hook — Status: TODO | Est: 30m\n' +
          '- [ ] Integration test — Status: TODO | Est: 60m\n',
      },
    });
  }
);

Given(
  /^a SPECGEN003 v3 spec directory with a 2-task TASKS\.md for idempotency is prepared$/,
  function (this: SPECGEN003World) {
    makeS003Spec(this, {
      progressVersion: 3,
      files: {
        'TASKS.md':
          '# Tasks\n\n## Phase 0\n\n' +
          '- [ ] Task A — Status: TODO | Est: 15m\n' +
          '- [x] Task B — Status: DONE | Est: 30m\n',
      },
    });
  }
);

Given(
  /^the SPECGEN003 audit log is backed up before writing a new log event$/,
  function (this: SPECGEN003World) {
    this.s003OrigLog = fs.existsSync(AUDIT_LOG)
      ? fs.readFileSync(AUDIT_LOG, 'utf-8')
      : null;
  }
);

Given(
  /^the SPECGEN003 form-guards log is seeded with 3 DENY and 3 other events and the ack file is cleared$/,
  function (this: SPECGEN003World) {
    // Back up real files before mutating
    this.s003OrigLog = fs.existsSync(AUDIT_LOG)
      ? fs.readFileSync(AUDIT_LOG, 'utf-8')
      : null;
    this.s003OrigAck = fs.existsSync(ACK_FILE)
      ? fs.readFileSync(ACK_FILE, 'utf-8')
      : null;

    // Seed with 3 DENY + 1 PARSER_CRASH + 2 ALLOW_AFTER_MIGRATION (all within 24h)
    const nowIso = new Date().toISOString();
    const synthetic =
      [
        `${nowIso} DENY user-story-form-guard /tmp/a USER_STORIES missing Priority`,
        `${nowIso} DENY task-form-guard /tmp/b TASKS missing Done When`,
        `${nowIso} DENY design-decision-guard /tmp/c DESIGN missing Alternatives`,
        `${nowIso} PARSER_CRASH user-story-form-guard /tmp/d regex overflow`,
        `${nowIso} ALLOW_AFTER_MIGRATION user-story-form-guard /tmp/e v2 pass-through`,
        `${nowIso} ALLOW_AFTER_MIGRATION task-form-guard /tmp/f v2 pass-through`,
      ].join('\n') + '\n';

    fs.mkdirSync(path.dirname(AUDIT_LOG), { recursive: true });
    fs.writeFileSync(AUDIT_LOG, synthetic, 'utf-8');

    // Delete ack file so all seeded DENYs are unresolved (never acked)
    if (fs.existsSync(ACK_FILE)) {
      fs.unlinkSync(ACK_FILE);
    }
  }
);

// ---------------------------------------------------------------------------
// WHEN steps — guard and tool invocations
// ---------------------------------------------------------------------------

When(
  /^the SPECGEN003 user-story-form-guard is invoked via Write on USER_STORIES\.md missing Priority$/,
  function (this: SPECGEN003World) {
    const filePath = path.join(this.s003SpecDir!, 'USER_STORIES.md');
    const content =
      '# User Stories\n\n### User Story 1: Foo\n\n' +
      'As a user I want foo so that bar.\n\n' +
      '**Why:** rationale\n\n' +
      '**Independent Test:** test\n\n' +
      '**Acceptance Scenarios:**\nGiven foo When bar Then baz\n';
    this.s003Result = invokeGuard(USER_STORY_GUARD, 'Write', filePath, content);
  }
);

When(
  /^the SPECGEN003 user-story-form-guard is invoked via Write on USER_STORIES\.md with Priority but missing Why$/,
  function (this: SPECGEN003World) {
    const filePath = path.join(this.s003SpecDir!, 'USER_STORIES.md');
    const content =
      '# User Stories\n\n### User Story 1: Foo (Priority: P1)\n\n' +
      'As a user I want foo.\n\n' +
      '**Independent Test:** test\n\n' +
      '**Acceptance Scenarios:**\nGiven foo When bar Then baz\n';
    this.s003Result = invokeGuard(USER_STORY_GUARD, 'Write', filePath, content);
  }
);

When(
  /^the SPECGEN003 user-story-form-guard is invoked via Write on USER_STORIES\.md with all 4 required fields$/,
  function (this: SPECGEN003World) {
    const filePath = path.join(this.s003SpecDir!, 'USER_STORIES.md');
    const content =
      '# User Stories\n\n### User Story 1: Foo (Priority: P1)\n\n' +
      'As a user I want foo so that bar.\n\n' +
      '**Why:** rationale\n\n' +
      '**Independent Test:** test it standalone\n\n' +
      '**Acceptance Scenarios:**\nGiven foo When bar Then baz\n';
    this.s003Result = invokeGuard(USER_STORY_GUARD, 'Write', filePath, content);
  }
);

When(
  /^the SPECGEN003 user-story-form-guard is invoked via Write on USER_STORIES\.md with minimal invalid content$/,
  function (this: SPECGEN003World) {
    const filePath = path.join(this.s003SpecDir!, 'USER_STORIES.md');
    const content = '# User Stories\n\n- Как роль, я хочу X, чтобы Y.\n';
    this.s003Result = invokeGuard(USER_STORY_GUARD, 'Write', filePath, content);
  }
);

When(
  /^the SPECGEN003 user-story-form-guard is invoked via Read on USER_STORIES\.md$/,
  function (this: SPECGEN003World) {
    const filePath = path.join(this.s003SpecDir!, 'USER_STORIES.md');
    this.s003Result = invokeGuard(USER_STORY_GUARD, 'Read', filePath);
  }
);

When(
  /^the SPECGEN003 user-story-form-guard is invoked with malformed JSON on stdin$/,
  function (this: SPECGEN003World) {
    const res = spawnSync(process.execPath, ['--import', 'tsx', USER_STORY_GUARD], {
      encoding: 'utf-8',
      input: 'not-valid-json{{{',
      cwd: REPO_ROOT,
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    this.s003Result = { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  }
);

When(
  /^the SPECGEN003 user-story-form-guard is invoked via Write on USER_STORIES\.md with pathological regex content$/,
  function (this: SPECGEN003World) {
    const filePath = path.join(this.s003SpecDir!, 'USER_STORIES.md');
    const content =
      '# User Stories\n\n### User Story 1: )((( (((((((((((((\\nd+){1000} (Priority: P1)\n';
    this.s003Result = invokeGuard(USER_STORY_GUARD, 'Write', filePath, content);
  }
);

When(
  /^the SPECGEN003 task-form-guard is invoked via Write on TASKS\.md missing Done When$/,
  function (this: SPECGEN003World) {
    const filePath = path.join(this.s003SpecDir!, 'TASKS.md');
    const content =
      '# Tasks\n\n## Phase 1\n\n- [ ] Implement queue\n  _Requirements: [FR-1](FR.md)_\n';
    this.s003Result = invokeGuard(TASK_GUARD, 'Write', filePath, content);
  }
);

When(
  /^the SPECGEN003 task-form-guard is invoked via Write on TASKS\.md with Done When but no checkboxes$/,
  function (this: SPECGEN003World) {
    const filePath = path.join(this.s003SpecDir!, 'TASKS.md');
    const content =
      '# Tasks\n\n## Phase 1\n\n- [ ] Implement queue — Status: TODO | Est: 30m\n' +
      '  **Done When:**\n  (no checkboxes here)\n';
    this.s003Result = invokeGuard(TASK_GUARD, 'Write', filePath, content);
  }
);

When(
  /^the SPECGEN003 task-form-guard is invoked via Write on TASKS\.md with valid Done When and checkboxes$/,
  function (this: SPECGEN003World) {
    const filePath = path.join(this.s003SpecDir!, 'TASKS.md');
    const content =
      '# Tasks\n\n## Phase 1\n\n- [ ] Implement queue — Status: TODO | Est: 30m\n' +
      '  **Done When:**\n  - [ ] queue.ts exports readQueue\n  - [ ] @feature1 Green\n';
    this.s003Result = invokeGuard(TASK_GUARD, 'Write', filePath, content);
  }
);

When(
  /^the SPECGEN003 design-decision-guard is invoked via Write on DESIGN\.md with a Decision block but no Alternatives$/,
  function (this: SPECGEN003World) {
    const filePath = path.join(this.s003SpecDir!, 'DESIGN.md');
    const content =
      '# Design\n\n## Key Decisions\n\n### Decision: Use ProgressV3\n\n' +
      '**Rationale:** reasons\n\n**Trade-off:** tradeoff\n\n(no Alternatives section)\n';
    this.s003Result = invokeGuard(DESIGN_GUARD, 'Write', filePath, content);
  }
);

When(
  /^the SPECGEN003 design-decision-guard is invoked via Write on DESIGN\.md with no Decision blocks$/,
  function (this: SPECGEN003World) {
    const filePath = path.join(this.s003SpecDir!, 'DESIGN.md');
    const content = '# Design\n\n## Components\n\n- foo.ts — does foo\n- bar.ts — does bar\n';
    this.s003Result = invokeGuard(DESIGN_GUARD, 'Write', filePath, content);
  }
);

When(
  /^the SPECGEN003 requirements-chk-guard is invoked via Write on REQUIREMENTS\.md with an empty Verification Method cell$/,
  function (this: SPECGEN003World) {
    const filePath = path.join(this.s003SpecDir!, 'REQUIREMENTS.md');
    const content =
      '# Requirements\n\n## Verification Matrix\n\n' +
      '| CHK-ID | Requirement | Traces To | Verification Method | Status | Notes |\n' +
      '|--------|-------------|-----------|---------------------|--------|-------|\n' +
      '| CHK-FR1-01 | FR-1 covered | FR-1, AC-1 |  | Draft | — |\n';
    this.s003Result = invokeGuard(CHK_GUARD, 'Write', filePath, content);
  }
);

When(
  /^the SPECGEN003 requirements-chk-guard is invoked via Write on REQUIREMENTS\.md with an invalid CHK ID format$/,
  function (this: SPECGEN003World) {
    const filePath = path.join(this.s003SpecDir!, 'REQUIREMENTS.md');
    const content =
      '# Requirements\n\n## Verification Matrix\n\n' +
      '| CHK-ID | Requirement | Traces To | Verification Method | Status | Notes |\n' +
      '|--------|-------------|-----------|---------------------|--------|-------|\n' +
      '| CHK-001 | Foo | FR-1 | BDD scenario | Draft | — |\n';
    this.s003Result = invokeGuard(CHK_GUARD, 'Write', filePath, content);
  }
);

When(
  /^the SPECGEN003 requirements-chk-guard is invoked via Write on REQUIREMENTS\.md with a valid CHK-FR row$/,
  function (this: SPECGEN003World) {
    const filePath = path.join(this.s003SpecDir!, 'REQUIREMENTS.md');
    const content =
      '# Requirements\n\n## Verification Matrix\n\n' +
      '| CHK-ID | Requirement | Traces To | Verification Method | Status | Notes |\n' +
      '|--------|-------------|-----------|---------------------|--------|-------|\n' +
      '| CHK-FR1-01 | FR-1 covered | FR-1, AC-1, @feature1 | BDD scenario | Draft | — |\n';
    this.s003Result = invokeGuard(CHK_GUARD, 'Write', filePath, content);
  }
);

When(
  /^the SPECGEN003 risk-assessment-guard is invoked via Write on RESEARCH\.md with only 1 risk data row$/,
  function (this: SPECGEN003World) {
    const filePath = path.join(this.s003SpecDir!, 'RESEARCH.md');
    const content =
      '# Research\n\n## Risk Assessment\n\n' +
      '| Risk | Likelihood | Impact | Mitigation |\n' +
      '|------|------------|--------|------------|\n' +
      '| Single risk | High | Medium | mitigation |\n';
    this.s003Result = invokeGuard(RISK_GUARD, 'Write', filePath, content);
  }
);

When(
  /^the SPECGEN003 risk-assessment-guard is invoked via Write on RESEARCH\.md with no Risk Assessment heading$/,
  function (this: SPECGEN003World) {
    const filePath = path.join(this.s003SpecDir!, 'RESEARCH.md');
    const content = '# Research\n\n## Context\n\nSome prose without Risk Assessment heading.\n';
    this.s003Result = invokeGuard(RISK_GUARD, 'Write', filePath, content);
  }
);

When(
  /^spec-status\.ts is invoked on the SPECGEN003 spec directory with -Format task-table$/,
  function (this: SPECGEN003World) {
    const res = spawnSync(
      process.execPath,
      ['--import', 'tsx', SPEC_STATUS, '-Path', this.s003SpecDir!, '-Format', 'task-table'],
      {
        encoding: 'utf-8',
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          FORCE_COLOR: '0',
          SPECS_GENERATOR_ROOT: this.tempDir,
        },
      }
    );
    this.s003Result = { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  }
);

When(
  /^spec-status\.ts is invoked twice on the SPECGEN003 spec directory with -Format task-table$/,
  function (this: SPECGEN003World) {
    const args = [
      '--import', 'tsx', SPEC_STATUS,
      '-Path', this.s003SpecDir!,
      '-Format', 'task-table',
    ];
    const env = { ...process.env, FORCE_COLOR: '0', SPECS_GENERATOR_ROOT: this.tempDir };
    const a = spawnSync(process.execPath, args, { encoding: 'utf-8', cwd: REPO_ROOT, env });
    const b = spawnSync(process.execPath, args, { encoding: 'utf-8', cwd: REPO_ROOT, env });
    this.s003Result = { status: a.status, stdout: a.stdout ?? '', stderr: a.stderr ?? '' };
    this.s003Result2 = { status: b.status, stdout: b.stdout ?? '', stderr: b.stderr ?? '' };
  }
);

When(
  /^the SPECGEN003 audit-logger logEvent is called with DENY for a test path$/,
  function (this: SPECGEN003World) {
    // Drive the REAL audit-logger.ts via its static import (auditLogEvent).
    // This writes a timestamped DENY line to the real AUDIT_LOG on disk.
    auditLogEvent('test-hook', 'DENY', '/tmp/foo.md', 'testing');
  }
);

When(
  /^validate-specs\.ts is invoked as a SPECGEN003 UserPromptSubmit hook event$/,
  function (this: SPECGEN003World) {
    const payload = {
      hook_event_name: 'UserPromptSubmit',
      prompt: 'hello',
      cwd: REPO_ROOT,
    };
    const res = spawnSync(process.execPath, ['--import', 'tsx', VALIDATE_SPECS], {
      encoding: 'utf-8',
      input: JSON.stringify(payload),
      cwd: REPO_ROOT,
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    this.s003Result = { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  }
);

When(
  /^the SPECGEN003 child phase-assistant skill SKILL\.md files are read from the repository$/,
  function (this: SPECGEN003World) {
    // Artifact scenarios 16/17/21/24: collect file stats for the 3 child skills.
    // The Then steps read the files directly; this When records that they exist.
    const skills = ['discovery-forms', 'requirements-chk-matrix', 'task-board-forms'];
    const missing = skills.filter(
      (s) => !fs.existsSync(path.join(REPO_ROOT, '.claude', 'skills', s, 'SKILL.md'))
    );
    // Store the missing list so Then steps can assert more precisely
    (this as SPECGEN003World & { s003MissingSkills?: string[] }).s003MissingSkills = missing;
  }
);

// ---------------------------------------------------------------------------
// THEN steps — assertions
// ---------------------------------------------------------------------------

Then(/^the SPECGEN003 guard exits with code (\d+)$/, function (this: SPECGEN003World, code: string) {
  const expected = parseInt(code, 10);
  assert.equal(
    this.s003Result!.status,
    expected,
    `Expected exit code ${expected}, got ${this.s003Result!.status}.\nstderr: ${this.s003Result!.stderr}`
  );
});

Then(
  /^the SPECGEN003 guard exits with code (\d+) and stderr mentions "([^"]+)"$/,
  function (this: SPECGEN003World, code: string, pattern: string) {
    const expected = parseInt(code, 10);
    assert.equal(
      this.s003Result!.status,
      expected,
      `Expected exit code ${expected}, got ${this.s003Result!.status}.\nstderr: ${this.s003Result!.stderr}`
    );
    assert.match(
      this.s003Result!.stderr,
      new RegExp(pattern, 'i'),
      `Expected stderr to match /${pattern}/i\nActual stderr: ${this.s003Result!.stderr}`
    );
  }
);

Then(/^the SPECGEN003 guard exits with code 0 or 2$/, function (this: SPECGEN003World) {
  assert.ok(
    this.s003Result!.status === 0 || this.s003Result!.status === 2,
    `Expected exit code 0 or 2, got ${this.s003Result!.status}.\nstderr: ${this.s003Result!.stderr}`
  );
});

Then(
  /^the SPECGEN003 task-table output has a header row with ID Title Status Depends Phase Est columns$/,
  function (this: SPECGEN003World) {
    assert.equal(
      this.s003Result!.status,
      0,
      `spec-status exited ${this.s003Result!.status}:\n${this.s003Result!.stderr}`
    );
    assert.match(
      this.s003Result!.stdout,
      /\|\s*ID\s*\|\s*Title\s*\|\s*Status\s*\|\s*Depends\s*\|\s*Phase\s*\|\s*Est/,
      `Expected task-table header. Got:\n${this.s003Result!.stdout.slice(0, 600)}`
    );
  }
);

Then(
  /^the SPECGEN003 task-table output has at least 6 markdown table rows including the header$/,
  function (this: SPECGEN003World) {
    // Count rows starting with | but not |-- (exclude separator rows)
    const rows = (this.s003Result!.stdout.match(/^\|(?!-)/gm) ?? []).length;
    assert.ok(
      rows >= 6,
      `Expected ≥6 table rows (1 header + 5 tasks), got ${rows}.\nOutput:\n${this.s003Result!.stdout.slice(0, 600)}`
    );
  }
);

Then(
  /^both SPECGEN003 task-table outputs are identical$/,
  function (this: SPECGEN003World) {
    assert.equal(
      this.s003Result!.status,
      0,
      `First invocation failed: ${this.s003Result!.stderr}`
    );
    assert.equal(
      this.s003Result2!.status,
      0,
      `Second invocation failed: ${this.s003Result2!.stderr}`
    );
    assert.equal(
      this.s003Result!.stdout,
      this.s003Result2!.stdout,
      'Expected task-table output to be identical for both invocations'
    );
  }
);

Then(
  /^the SPECGEN003 form-guards log last line matches the ISO timestamp DENY format$/,
  function (this: SPECGEN003World) {
    assert.ok(fs.existsSync(AUDIT_LOG), `Expected ${AUDIT_LOG} to exist after logEvent call`);
    const content = fs.readFileSync(AUDIT_LOG, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const last = lines[lines.length - 1] ?? '';
    assert.match(
      last,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z\s+DENY\s+test-hook\s+\/tmp\/foo\.md/,
      `Last log line does not match expected DENY format.\nActual last line: ${last}`
    );
  }
);

Then(
  /^the SPECGEN003 conformance summary mentions at least (\d+) unresolved DENY$/,
  function (this: SPECGEN003World, countStr: string) {
    const minCount = parseInt(countStr, 10);
    const combined = (this.s003Result!.stdout ?? '') + (this.s003Result!.stderr ?? '');
    const m = combined.match(/Spec conformance:\s*(\d+)\s*unresolved DENY/);
    assert.ok(
      m,
      `Expected FR-20 conformance summary in output.\nstdout: ${(this.s003Result!.stdout ?? '').slice(0, 500)}\nstderr: ${(this.s003Result!.stderr ?? '').slice(0, 500)}`
    );
    const count = parseInt(m[1], 10);
    assert.ok(
      count >= minCount,
      `Expected ≥${minCount} unresolved DENY in summary, got ${count}`
    );
  }
);

Then(
  /^the SPECGEN003 discovery-forms SKILL\.md exists without auto-trigger phrases in the first 600 characters$/,
  function (this: SPECGEN003World) {
    const skillPath = path.join(REPO_ROOT, '.claude', 'skills', 'discovery-forms', 'SKILL.md');
    assert.ok(fs.existsSync(skillPath), `Expected ${skillPath} to exist`);
    const content = fs.readFileSync(skillPath, 'utf-8');
    const header = content.slice(0, 600);
    assert.ok(content.startsWith('---'), `Expected frontmatter delimiter at start of SKILL.md`);
    assert.ok(!(/when the user/i).test(header), `"discovery-forms" SKILL.md contains "when the user" in first 600 chars`);
    assert.ok(!(/whenever/i).test(header), `"discovery-forms" SKILL.md contains "whenever" in first 600 chars`);
    assert.ok(content.includes('discovery-forms'), `Expected "discovery-forms" in SKILL.md content`);
  }
);

Then(
  /^the SPECGEN003 task-board-forms SKILL\.md exists without auto-trigger phrases in the first 600 characters$/,
  function (this: SPECGEN003World) {
    const skillPath = path.join(REPO_ROOT, '.claude', 'skills', 'task-board-forms', 'SKILL.md');
    assert.ok(fs.existsSync(skillPath), `Expected ${skillPath} to exist`);
    const content = fs.readFileSync(skillPath, 'utf-8');
    const header = content.slice(0, 600);
    assert.ok(!(/when the user/i).test(header), `"task-board-forms" SKILL.md contains "when the user" in first 600 chars`);
    assert.ok(!(/whenever/i).test(header), `"task-board-forms" SKILL.md contains "whenever" in first 600 chars`);
    assert.ok(content.includes('task-board-forms'), `Expected "task-board-forms" in SKILL.md content`);
  }
);

Then(
  /^the SPECGEN003 requirements-chk-matrix SKILL\.md exists and mentions Jira preservation$/,
  function (this: SPECGEN003World) {
    const skillPath = path.join(REPO_ROOT, '.claude', 'skills', 'requirements-chk-matrix', 'SKILL.md');
    assert.ok(fs.existsSync(skillPath), `Expected ${skillPath} to exist`);
    const content = fs.readFileSync(skillPath, 'utf-8');
    assert.ok((/jira/i).test(content), `Expected "jira" reference in requirements-chk-matrix SKILL.md`);
    assert.ok((/preserv/i).test(content), `Expected "preserv" reference in requirements-chk-matrix SKILL.md`);
  }
);

Then(
  /^all 3 SPECGEN003 child phase-assistant skills lack auto-trigger phrases in the first 800 characters$/,
  function (this: SPECGEN003World) {
    const skills = ['discovery-forms', 'requirements-chk-matrix', 'task-board-forms'];
    for (const skill of skills) {
      const skillPath = path.join(REPO_ROOT, '.claude', 'skills', skill, 'SKILL.md');
      assert.ok(fs.existsSync(skillPath), `Expected ${skill}/SKILL.md to exist`);
      const header = fs.readFileSync(skillPath, 'utf-8').slice(0, 800);
      assert.ok(
        !(/when the user/i).test(header),
        `"${skill}" SKILL.md contains "when the user" in first 800 chars`
      );
      assert.ok(
        !(/whenever/i).test(header),
        `"${skill}" SKILL.md contains "whenever" in first 800 chars`
      );
      assert.ok(
        !(/use this skill whenever/i).test(header),
        `"${skill}" SKILL.md contains "use this skill whenever" in first 800 chars`
      );
    }
  }
);
