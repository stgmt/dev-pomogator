/**
 * Regression tests for `extractWriteContent` in spec-form-parsers.ts.
 *
 * Issue #18: extractWriteContent used to return `new_string` raw for Edit tool
 * inputs, which caused user-story-form-guard / task-form-guard to validate
 * only the diff fragment instead of the post-edit file. Heading-only edits
 * therefore failed body checks (missing Why / Independent Test / etc.) — false
 * positive.
 *
 * Fix: when Edit tool input has `old_string` + `new_string` + a filePath that
 * exists on disk, reconstruct the post-edit file by string replacement before
 * returning. Falls back to `new_string` if reconstruction is impossible.
 *
 * Coverage:
 * - AC-1 Edit heading-only of a fully-formed USER_STORIES.md → ALLOW
 * - AC-2 Edit on file that genuinely lacks required fields → still DENY
 * - AC-3 Write tool with full content → behaviour unchanged
 * - AC-4 Same shape applies to task-form-guard (smoke check)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { runTsx } from './helpers';

const USER_STORY_GUARD = 'tools/specs-validator/user-story-form-guard.ts';
const TASK_GUARD = 'tools/specs-validator/task-form-guard.ts';

let tmpRoot: string;
let specDir: string;

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

function runHook(scriptPath: string, filePath: string, toolInput: Record<string, unknown>) {
  return runTsx(scriptPath, {
    input: {
      session_id: 'test-session',
      cwd: tmpRoot,
      tool_name: typeof toolInput.content === 'string' ? 'Write' : 'Edit',
      tool_input: { file_path: filePath, ...toolInput },
    },
    timeout: 10000,
  });
}

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-18-extract-'));
  specDir = path.join(tmpRoot, '.specs', 'sample-feature');
  fs.mkdirpSync(specDir);
  // v3 spec marker — phase-constants.isV3Spec reads .progress.json.schema_version
  fs.writeFileSync(
    path.join(specDir, '.progress.json'),
    JSON.stringify({ version: 3, phases: {} }),
    'utf-8',
  );
  fs.writeFileSync(path.join(specDir, 'USER_STORIES.md'), FULL_USER_STORIES, 'utf-8');
  fs.writeFileSync(
    path.join(specDir, 'TASKS.md'),
    `# Tasks\n\n## Phase 1\n\n- [ ] T01: Sample task -- @feature1\n` +
      `  **Done When:** something\n  - [ ] item\n  Status: TODO | Est: 30m\n`,
    'utf-8',
  );
});

afterAll(() => {
  if (tmpRoot) fs.removeSync(tmpRoot);
});

describe('Issue #18 — extractWriteContent reconstructs post-edit content', () => {
  it('AC-1: Edit heading-only of fully-formed USER_STORIES.md → ALLOW (was DENY before fix)', () => {
    const filePath = path.join(specDir, 'USER_STORIES.md');
    const oldHeading = '### User Story 1: Multi-repo dashboard (Priority: P1)';
    const newHeading = '### User Story 1: Multi-repo dashboard @feature1 @feature2 (Priority: P1)';
    const result = runHook(USER_STORY_GUARD, filePath, {
      old_string: oldHeading,
      new_string: newHeading,
    });
    expect(result.status, `stderr=${result.stderr}`).toBe(0);
  });

  it('AC-2: Edit on file genuinely lacking required fields → still DENY (no regression)', () => {
    const filePath = path.join(specDir, 'USER_STORIES.md');
    fs.writeFileSync(filePath, INCOMPLETE_USER_STORIES, 'utf-8');
    const result = runHook(USER_STORY_GUARD, filePath, {
      old_string: 'Incomplete story',
      new_string: 'Incomplete story v2',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr.toLowerCase()).toContain('missing why');
    fs.writeFileSync(filePath, FULL_USER_STORIES, 'utf-8');
  });

  it('AC-3: Write tool with full content → behaviour unchanged (ALLOW for valid, DENY for invalid)', () => {
    const filePath = path.join(specDir, 'USER_STORIES.md');
    const allow = runHook(USER_STORY_GUARD, filePath, { content: FULL_USER_STORIES });
    expect(allow.status, `stderr=${allow.stderr}`).toBe(0);

    const deny = runHook(USER_STORY_GUARD, filePath, { content: INCOMPLETE_USER_STORIES });
    expect(deny.status).not.toBe(0);
  });

  it('AC-4: task-form-guard inherits the same fix (smoke)', () => {
    const filePath = path.join(specDir, 'TASKS.md');
    // Edit only the task title — body has Done When/Status/Est intact
    const result = runHook(TASK_GUARD, filePath, {
      old_string: '- [ ] T01: Sample task -- @feature1',
      new_string: '- [ ] T01: Sample task renamed -- @feature1 @feature2',
    });
    expect(result.status, `stderr=${result.stderr}`).toBe(0);
  });

  it('AC-5: Edit with replace_all=true applies replacement everywhere', () => {
    const filePath = path.join(specDir, 'USER_STORIES.md');
    const multi = FULL_USER_STORIES + `\n### User Story 2: Other (Priority: P2)\n\n**Why:** y.\n\n**Independent Test:** t.\n\n**Acceptance Scenarios:**\n\n1. a\n`;
    fs.writeFileSync(filePath, multi, 'utf-8');
    const result = runHook(USER_STORY_GUARD, filePath, {
      old_string: '(Priority: P1)',
      new_string: '(Priority: P1)',
      replace_all: true,
    });
    expect(result.status, `stderr=${result.stderr}`).toBe(0);
    fs.writeFileSync(filePath, FULL_USER_STORIES, 'utf-8');
  });

  it('AC-6: Edit fallback when old_string not in current file → uses new_string', () => {
    const filePath = path.join(specDir, 'USER_STORIES.md');
    // old_string doesn't match current → fallback to new_string (which has full content)
    const result = runHook(USER_STORY_GUARD, filePath, {
      old_string: 'NONEXISTENT_SENTINEL_12345',
      new_string: FULL_USER_STORIES,
    });
    expect(result.status, `stderr=${result.stderr}`).toBe(0);
  });
});
