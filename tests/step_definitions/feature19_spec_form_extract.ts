/**
 * @feature19 step definitions — extractWriteContent Edit-reconstruction (Issue #18)
 * (SPECGEN004_385 – SPECGEN004_390)
 *
 * Drives the REAL `tools/specs-validator/user-story-form-guard.ts` and
 * `tools/specs-validator/task-form-guard.ts` via process.execPath + tsx (no mocks).
 * Each scenario uses V4World's fresh tempDir for per-scenario isolation.
 *
 * Tests that extractWriteContent correctly reconstructs the post-edit file so
 * guards validate the whole file content rather than just the diff fragment.
 *
 * @see .specs/spec-generator-v4/FR.md FR-19 (two-tier hook policy, soft tier)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
const USER_STORY_GUARD = path.join(REPO_ROOT, 'tools', 'specs-validator', 'user-story-form-guard.ts');
const TASK_GUARD = path.join(REPO_ROOT, 'tools', 'specs-validator', 'task-form-guard.ts');

// ── Fixture content ───────────────────────────────────────────────────────────

const FULL_USER_STORIES = `# User Stories

### User Story 1: Multi-repo dashboard (Priority: P1)

As a developer, I want all worktrees on one page.

**Why:** scattered Claude history makes worktree switching slow.

**Independent Test:** open dashboard, see ≥1 row.

**Acceptance Scenarios:**

1. Given >1 worktree exists, when I open the dashboard, then rows render.
`;

const INCOMPLETE_USER_STORIES = `# User Stories

### User Story 1: Incomplete story (Priority: P1)

As a developer, I want something but the body is missing.
`;

const FULL_TASKS = `# Tasks

## Phase 1

- [ ] T01: Sample task -- @feature1
  **Done When:** something
  - [ ] item
  Status: TODO | Est: 30m
`;

// ── World ─────────────────────────────────────────────────────────────────────

interface ExtractWriteWorld extends V4World {
  specDir?: string;
  guardResult?: { status: number | null; stderr: string };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSpecDir(tmpRoot: string): string {
  const specDir = path.join(tmpRoot, '.specs', 'sample-feature');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(
    path.join(specDir, '.progress.json'),
    JSON.stringify({ version: 3, phases: {} }),
    'utf-8',
  );
  return specDir;
}

function runGuard(
  guardScript: string,
  tmpRoot: string,
  filePath: string,
  toolInput: Record<string, unknown>,
): { status: number | null; stderr: string } {
  const stdinPayload = {
    session_id: 'test-session',
    cwd: tmpRoot,
    tool_name: typeof toolInput['content'] === 'string' ? 'Write' : 'Edit',
    tool_input: { file_path: filePath, ...toolInput },
  };
  const r = spawnSync(process.execPath, ['--import', 'tsx', guardScript], {
    input: JSON.stringify(stdinPayload),
    encoding: 'utf-8',
    cwd: REPO_ROOT,
    timeout: 60_000,
  });
  return { status: r.status, stderr: r.stderr ?? '' };
}

// ── Given steps ───────────────────────────────────────────────────────────────

Given(
  /^an isolated spec directory with a fully-formed USER_STORIES\.md for extractWriteContent testing$/,
  function (this: ExtractWriteWorld) {
    this.specDir = makeSpecDir(this.tempDir);
    fs.writeFileSync(path.join(this.specDir, 'USER_STORIES.md'), FULL_USER_STORIES, 'utf-8');
  },
);

Given(
  /^an isolated spec directory with an incomplete USER_STORIES\.md lacking required body fields$/,
  function (this: ExtractWriteWorld) {
    this.specDir = makeSpecDir(this.tempDir);
    fs.writeFileSync(path.join(this.specDir, 'USER_STORIES.md'), INCOMPLETE_USER_STORIES, 'utf-8');
  },
);

Given(
  /^an isolated spec directory with a fully-formed TASKS\.md for extractWriteContent testing$/,
  function (this: ExtractWriteWorld) {
    this.specDir = makeSpecDir(this.tempDir);
    fs.writeFileSync(path.join(this.specDir, 'TASKS.md'), FULL_TASKS, 'utf-8');
  },
);

Given(
  /^an isolated spec directory with a multi-story USER_STORIES\.md for extractWriteContent testing$/,
  function (this: ExtractWriteWorld) {
    this.specDir = makeSpecDir(this.tempDir);
    const multi =
      FULL_USER_STORIES +
      '\n### User Story 2: Other feature (Priority: P2)\n\n' +
      'As a dev, I want other things.\n\n' +
      '**Why:** reason.\n\n' +
      '**Independent Test:** test.\n\n' +
      '**Acceptance Scenarios:**\n\n' +
      '1. a\n';
    fs.writeFileSync(path.join(this.specDir, 'USER_STORIES.md'), multi, 'utf-8');
  },
);

// ── When steps ────────────────────────────────────────────────────────────────

When(
  /^the user-story-form-guard receives an Edit of the user story heading only leaving body intact$/,
  function (this: ExtractWriteWorld) {
    const filePath = path.join(this.specDir!, 'USER_STORIES.md');
    this.guardResult = runGuard(USER_STORY_GUARD, this.tempDir, filePath, {
      old_string: '### User Story 1: Multi-repo dashboard (Priority: P1)',
      new_string: '### User Story 1: Multi-repo dashboard @feature1 @feature2 (Priority: P1)',
    });
  },
);

When(
  /^the user-story-form-guard receives an Edit of the heading on the incomplete user story file$/,
  function (this: ExtractWriteWorld) {
    const filePath = path.join(this.specDir!, 'USER_STORIES.md');
    this.guardResult = runGuard(USER_STORY_GUARD, this.tempDir, filePath, {
      old_string: 'Incomplete story',
      new_string: 'Incomplete story v2',
    });
  },
);

When(
  /^the user-story-form-guard receives a Write with (fully-formed|incomplete) user story content$/,
  function (this: ExtractWriteWorld, contentKind: string) {
    const filePath = path.join(this.specDir!, 'USER_STORIES.md');
    const content = contentKind === 'fully-formed' ? FULL_USER_STORIES : INCOMPLETE_USER_STORIES;
    this.guardResult = runGuard(USER_STORY_GUARD, this.tempDir, filePath, { content });
  },
);

When(
  /^the task-form-guard receives an Edit of the task title only leaving body fields intact$/,
  function (this: ExtractWriteWorld) {
    const filePath = path.join(this.specDir!, 'TASKS.md');
    this.guardResult = runGuard(TASK_GUARD, this.tempDir, filePath, {
      old_string: '- [ ] T01: Sample task -- @feature1',
      new_string: '- [ ] T01: Sample task renamed -- @feature1 @feature2',
    });
  },
);

When(
  /^the user-story-form-guard receives an Edit with replace_all true on the multi-story user story file$/,
  function (this: ExtractWriteWorld) {
    const filePath = path.join(this.specDir!, 'USER_STORIES.md');
    this.guardResult = runGuard(USER_STORY_GUARD, this.tempDir, filePath, {
      old_string: '(Priority: P1)',
      new_string: '(Priority: P1)',
      replace_all: true,
    });
  },
);

When(
  /^the user-story-form-guard receives an Edit with an old_string absent from the file$/,
  function (this: ExtractWriteWorld) {
    const filePath = path.join(this.specDir!, 'USER_STORIES.md');
    this.guardResult = runGuard(USER_STORY_GUARD, this.tempDir, filePath, {
      old_string: 'NONEXISTENT_SENTINEL_12345',
      new_string: FULL_USER_STORIES,
    });
  },
);

// ── Then steps ────────────────────────────────────────────────────────────────

Then(
  /^the user-story-form-guard exits 0 and allows the user story write$/,
  function (this: ExtractWriteWorld) {
    assert.equal(
      this.guardResult!.status,
      0,
      `Expected exit 0; got ${this.guardResult!.status}; stderr: ${this.guardResult!.stderr}`,
    );
  },
);

Then(
  /^the user-story-form-guard exits non-zero and stderr mentions missing why$/,
  function (this: ExtractWriteWorld) {
    assert.notEqual(
      this.guardResult!.status,
      0,
      `Expected non-zero exit; got 0`,
    );
    assert.match(
      this.guardResult!.stderr.toLowerCase(),
      /missing why/,
      `Expected stderr to mention "missing why"; got: ${this.guardResult!.stderr}`,
    );
  },
);

Then(
  /^the user-story-form-guard Write exits (allowed|denied)$/,
  function (this: ExtractWriteWorld, writeResult: string) {
    if (writeResult === 'allowed') {
      assert.equal(
        this.guardResult!.status,
        0,
        `Expected exit 0 (allowed); got ${this.guardResult!.status}; stderr: ${this.guardResult!.stderr}`,
      );
    } else {
      assert.notEqual(
        this.guardResult!.status,
        0,
        `Expected non-zero exit (denied); got 0`,
      );
    }
  },
);

Then(
  /^the task-form-guard exits 0 and allows the task write$/,
  function (this: ExtractWriteWorld) {
    assert.equal(
      this.guardResult!.status,
      0,
      `Expected exit 0; got ${this.guardResult!.status}; stderr: ${this.guardResult!.stderr}`,
    );
  },
);
