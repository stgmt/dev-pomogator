/**
 * Step definitions for the `bg-task-guard` spec (GUARD002).
 *
 * Drives the REAL production code — no mocks, no inline copies:
 *   - runtime: spawns mark-bg-task.ts via `node --import tsx` (cwd=REPO_ROOT)
 *   - runtime: spawns stop-guard.sh via `bash` (cwd=tempDir — guard reads
 *              .dev-pomogator/ relative to its cwd for test isolation)
 *   - artifact: reads .claude-plugin/hooks.json for hook registration checks;
 *               checks tools/ file existence
 *
 * CRITICAL CWD split:
 *   mark-bg-task.ts  → cwd=REPO_ROOT   (needs node_modules for tsx)
 *   stop-guard.sh    → cwd=tempDir     (reads .dev-pomogator/.bg-task-active
 *                                        and .test-status/ relative to cwd)
 *
 * Reconciliations applied to the .feature (via apply_spec_change 2026-06-20):
 *   - GUARD002_01: prose said "creates marker"; mark-bg-task.ts is a NO-OP
 *     (marker creation moved to test_runner_wrapper.ts). Fixed to reality.
 *   - GUARD002_04: prose said "stale 20 min TTL"; code now uses PID-based
 *     logic (dead PID → allow). Fixed to "marker PID is dead".
 *   - GUARD002_07/08: feature prose referenced extension.json; tests check
 *     .claude-plugin/hooks.json (plugin registry) and tools/ file existence.
 *   - GUARD002_11: "PostToolUse deletes marker on TaskOutput" — behavior
 *     removed from production code; scenario dropped.
 *   - GUARD002_12: prose said "soft TTL"; code is PID-based. Fixed.
 *   - GUARD002_13: prose said "PID alive"; vitest uses non-numeric task ID
 *     (skips PID check, falls through to age/TTL logic). Fixed.
 *   - Added GUARD002_14-24, 33-37 (present in vitest but missing from .feature).
 *
 * @see .specs/bg-task-guard/bg-task-guard.feature
 * @see .claude/skills/bdd-migrator/SKILL.md
 */

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { V4World } from '../hooks/before-after.ts';

// ---------------------------------------------------------------------------
// Module-level constants — never recompute these inside step functions
// ---------------------------------------------------------------------------

const REPO_ROOT = process.cwd();

// tsx ESM loader as file:// URL (required on Windows: `--import D:/...` fails
// with ERR_UNSUPPORTED_ESM_URL_SCHEME; file:// is always safe).
const TSX_ESM_LOADER = pathToFileURL(
  path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'esm', 'index.mjs'),
).href;

const MARK_HOOK_ABS = path.join(REPO_ROOT, 'tools', 'bg-task-guard', 'mark-bg-task.ts');
const STOP_GUARD_ABS = path.join(REPO_ROOT, 'tools', 'bg-task-guard', 'stop-guard.sh');

const MARKER_REL = path.join('.dev-pomogator', '.bg-task-active');

// ---------------------------------------------------------------------------
// Spawn helpers
// ---------------------------------------------------------------------------

/**
 * Spawn mark-bg-task.ts via node + tsx ESM loader.
 * cwd=REPO_ROOT so tsx can find node_modules.
 */
function runMarkHook(
  world: V4World,
  stdinJson: Record<string, unknown> | string = {},
): void {
  const input = typeof stdinJson === 'string' ? stdinJson : JSON.stringify(stdinJson);
  const result = spawnSync(
    process.execPath,
    ['--import', TSX_ESM_LOADER, MARK_HOOK_ABS],
    {
      input,
      encoding: 'utf-8',
      cwd: REPO_ROOT,
      env: { ...process.env, FORCE_COLOR: '0' },
      timeout: 15_000,
    },
  );
  world.lastExitCode = result.status ?? -1;
  world.lastStdout = result.stdout ?? '';
  world.lastStderr = result.stderr ?? '';
}

/**
 * Spawn stop-guard.sh via bash.
 * cwd=tempDir so the script reads .dev-pomogator/ from the test workspace.
 */
function runStopGuard(world: V4World): void {
  const result = spawnSync('bash', [STOP_GUARD_ABS], {
    input: '',
    encoding: 'utf-8',
    cwd: world.tempDir,
    env: { ...process.env, FORCE_COLOR: '0' },
    timeout: 15_000,
  });
  world.lastExitCode = result.status ?? -1;
  world.lastStdout = result.stdout ?? '';
  world.lastStderr = result.stderr ?? '';
}

// ---------------------------------------------------------------------------
// Fixture helpers (write into tempDir, mirroring the vitest helpers)
// ---------------------------------------------------------------------------

function markerPath(world: V4World, sessionPrefix?: string): string {
  if (sessionPrefix) {
    return path.join(world.tempDir, '.dev-pomogator', `.bg-task-active.${sessionPrefix}`);
  }
  return path.join(world.tempDir, MARKER_REL);
}

function createMarker(
  world: V4World,
  ageMinutes: number,
  taskId: string,
  sessionPrefix?: string,
): void {
  const mp = markerPath(world, sessionPrefix);
  fs.mkdirSync(path.dirname(mp), { recursive: true });
  const pastTime = new Date(Date.now() - ageMinutes * 60 * 1000);
  fs.writeFileSync(mp, `${taskId} ${pastTime.toISOString()}\n`, 'utf-8');
  if (ageMinutes > 0) {
    fs.utimesSync(mp, pastTime, pastTime);
  }
}

function ensureStatusDir(world: V4World): string {
  const statusDir = path.join(world.tempDir, '.dev-pomogator', '.test-status');
  fs.mkdirSync(statusDir, { recursive: true });
  return statusDir;
}

function createYamlStatus(
  world: V4World,
  fields: Record<string, string | number>,
  mtimeOffsetMs = 0,
): void {
  const statusDir = ensureStatusDir(world);
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${v}`);
  const yamlFile = path.join(statusDir, 'status.test-session.yaml');
  fs.writeFileSync(yamlFile, lines.join('\n') + '\n', 'utf-8');
  if (mtimeOffsetMs !== 0) {
    const t = new Date(Date.now() - Math.abs(mtimeOffsetMs));
    fs.utimesSync(yamlFile, t, t);
  }
}

function writeSessionEnv(world: V4World, prefix: string): void {
  const statusDir = ensureStatusDir(world);
  fs.writeFileSync(
    path.join(statusDir, 'session.env'),
    `TEST_STATUSLINE_SESSION=${prefix}\n`,
    'utf-8',
  );
}

function makePostToolUseInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    session_id: 'test-session-abc123',
    transcript_path: '/tmp/test-transcript.jsonl',
    cwd: '/test/project',
    permission_mode: 'default',
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_use_id: 'toolu_test01',
    tool_input: { command: 'sleep 60', run_in_background: true },
    tool_response: {
      stdout: '',
      stderr: '',
      interrupted: false,
      isImage: false,
      noOutputExpected: false,
      backgroundTaskId: 'bs0olkeoz',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Background steps (shared across all scenarios)
// ---------------------------------------------------------------------------

// "Given dev-pomogator is installed" is defined in feature_tui_test_runner.ts (no-op).
// Do NOT redefine here — it would cause an ambiguous step collision.

Given(/^test-statusline extension is enabled$/, function (this: V4World) {
  // No-op: verifying the extension is wired happens in GUARD002_07.
});

// ---------------------------------------------------------------------------
// Given steps — fixture setup
// ---------------------------------------------------------------------------

Given(/^no bg-task marker file exists$/, function (this: V4World) {
  // tempDir is fresh from the Before hook; marker dir does not yet exist.
  // Nothing to do — ensure it really isn't there.
  const mp = markerPath(this);
  if (fs.existsSync(mp)) fs.rmSync(mp);
});

Given(
  /^bg-task marker file exists with task ID "([^"]+)" and timestamp (\d+) minutes? ago$/,
  function (this: V4World, taskId: string, ageStr: string) {
    createMarker(this, parseInt(ageStr, 10), taskId);
  },
);

Given(
  /^bg-task marker file exists with task ID "([^"]+)" and timestamp from long ago$/,
  function (this: V4World, taskId: string) {
    // Write marker with a timestamp string but let it be fresh on disk.
    // The real check is the task ID (PID-based): 99999/99998 are dead PIDs.
    const mp = markerPath(this);
    fs.mkdirSync(path.dirname(mp), { recursive: true });
    fs.writeFileSync(mp, `${taskId} 2026-01-01T00:00:00Z\n`, 'utf-8');
  },
);

Given(/^bg-task marker file exists with invalid binary content$/, function (this: V4World) {
  const mp = markerPath(this);
  fs.mkdirSync(path.dirname(mp), { recursive: true });
  fs.writeFileSync(mp, 'not-a-timestamp\x00\xff', 'utf-8');
});

Given(/^bg-task marker file exists and is empty$/, function (this: V4World) {
  const mp = markerPath(this);
  fs.mkdirSync(path.dirname(mp), { recursive: true });
  fs.writeFileSync(mp, '');
});

Given(/^bg-task marker file exists with whitespace-only content$/, function (this: V4World) {
  const mp = markerPath(this);
  fs.mkdirSync(path.dirname(mp), { recursive: true });
  fs.writeFileSync(mp, '  \n\t\n', 'utf-8');
});

Given(/^dev-pomogator plugin hooks\.json is installed$/, function (this: V4World) {
  assert.ok(
    fs.existsSync(path.join(REPO_ROOT, '.claude-plugin', 'hooks.json')),
    '.claude-plugin/hooks.json not found',
  );
});

Given(/^test-status directory has a stale running YAML file$/, function (this: V4World) {
  createYamlStatus(this, { state: 'running', result: 'unknown' });
});

Given(
  /^YAML status file with state "([^"]+)" and (\d+) passed (\d+) failed (\d+) total$/,
  function (this: V4World, state: string, passed: string, failed: string, total: string) {
    const p = parseInt(passed, 10);
    const f = parseInt(failed, 10);
    const t = parseInt(total, 10);
    // Compute consistent percent so stop-guard's consistency check doesn't reject it
    const pct = t > 0 ? Math.round((p + f) * 100 / t) : 0;
    createYamlStatus(this, {
      state,
      passed: p,
      failed: f,
      skipped: 0,
      total: t,
      percent: pct,
    });
  },
);

Given(
  /^YAML status file with state "([^"]+)" and 0 passed 0 failed (\d+) skipped (\d+) total$/,
  function (this: V4World, state: string, skipped: string, total: string) {
    createYamlStatus(this, {
      state,
      passed: 0,
      failed: 0,
      skipped: parseInt(skipped, 10),
      total: parseInt(total, 10),
      percent: 100,
    });
  },
);

Given(
  /^YAML status file with state "([^"]+)" and (\d+) passed (\d+) failed (\d+) skipped (\d+) total at (\d+) percent$/,
  function (
    this: V4World,
    state: string,
    passed: string,
    failed: string,
    skipped: string,
    total: string,
    percent: string,
  ) {
    createYamlStatus(this, {
      state,
      passed: parseInt(passed, 10),
      failed: parseInt(failed, 10),
      skipped: parseInt(skipped, 10),
      total: parseInt(total, 10),
      percent: parseInt(percent, 10),
    });
  },
);

Given(
  /^YAML status file with state "([^"]+)" and (\d+) passed (\d+) failed (\d+) total at (\d+) percent$/,
  function (
    this: V4World,
    state: string,
    passed: string,
    failed: string,
    total: string,
    percent: string,
  ) {
    createYamlStatus(this, {
      state,
      passed: parseInt(passed, 10),
      failed: parseInt(failed, 10),
      skipped: 0,
      total: parseInt(total, 10),
      percent: parseInt(percent, 10),
    });
  },
);

Given(
  /^YAML status file with state "([^"]+)" and 0 passed at (\d+) percent total (\d+)$/,
  function (this: V4World, state: string, percent: string, total: string) {
    // 0 passed, 0 failed, percent > 0 → tests the consistency-check failure path
    createYamlStatus(this, {
      state,
      passed: 0,
      failed: 0,
      skipped: 0,
      total: parseInt(total, 10),
      percent: parseInt(percent, 10),
    });
  },
);

Given(
  /^YAML status file with state "([^"]+)" and ([1-9]\d*) passed at (\d+) percent total (\d+)$/,
  function (this: V4World, state: string, passed: string, percent: string, total: string) {
    createYamlStatus(this, {
      state,
      passed: parseInt(passed, 10),
      failed: 1,
      skipped: 0,
      total: parseInt(total, 10),
      percent: parseInt(percent, 10),
    });
  },
);

Given(
  /^YAML status file with state "([^"]+)" and (\d+) passed (\d+) failed (\d+) total but mtime (\d+) seconds ago$/,
  function (
    this: V4World,
    state: string,
    passed: string,
    failed: string,
    total: string,
    staleSeconds: string,
  ) {
    createYamlStatus(
      this,
      {
        state,
        passed: parseInt(passed, 10),
        failed: parseInt(failed, 10),
        skipped: 0,
        total: parseInt(total, 10),
        percent: 52,
      },
      parseInt(staleSeconds, 10) * 1000,
    );
  },
);

Given(
  /^YAML status file with state "([^"]+)" and (\d+) passed (\d+) failed (\d+) total at (\d+) percent but mtime (\d+) seconds ago$/,
  function (
    this: V4World,
    state: string,
    passed: string,
    failed: string,
    total: string,
    percent: string,
    staleSeconds: string,
  ) {
    createYamlStatus(
      this,
      {
        state,
        passed: parseInt(passed, 10),
        failed: parseInt(failed, 10),
        skipped: 0,
        total: parseInt(total, 10),
        percent: parseInt(percent, 10),
      },
      parseInt(staleSeconds, 10) * 1000,
    );
  },
);

Given(
  /^bg-task marker file exists for session "([^"]+)" with task ID "([^"]+)" and timestamp (\d+) minutes? ago$/,
  function (this: V4World, sessionPrefix: string, taskId: string, ageStr: string) {
    createMarker(this, parseInt(ageStr, 10), taskId, sessionPrefix);
  },
);

Given(
  /^session\.env file declares session prefix "([^"]+)"$/,
  function (this: V4World, prefix: string) {
    writeSessionEnv(this, prefix);
  },
);

Given(/^a process with PID 99999 does not exist on this system$/, function (this: V4World) {
  // Pure assertion — verifies the known-dead PID before using it in tests.
  let alive = false;
  try {
    process.kill(99999, 0);
    alive = true;
  } catch {
    alive = false;
  }
  assert.equal(alive, false, 'PID 99999 is unexpectedly alive on this system');
});

// ---------------------------------------------------------------------------
// When steps
// ---------------------------------------------------------------------------

When(
  /^PostToolUse hook receives tool_input with run_in_background true$/,
  function (this: V4World) {
    const input = makePostToolUseInput({
      tool_input: { command: 'npm test', run_in_background: true },
      tool_response: {
        stdout: '',
        stderr: '',
        interrupted: false,
        isImage: false,
        noOutputExpected: false,
        backgroundTaskId: 'bs0olkeoz',
      },
    });
    runMarkHook(this, input);
  },
);

When(
  /^PostToolUse hook receives Bash output "([^"]+)"$/,
  function (this: V4World, outputText: string) {
    const input = makePostToolUseInput({
      tool_input: { command: 'npm run build' },
      tool_response: {
        stdout: outputText,
        stderr: '',
        interrupted: false,
        isImage: false,
        noOutputExpected: false,
      },
    });
    runMarkHook(this, input);
  },
);

When(/^Stop hook executes$/, function (this: V4World) {
  runStopGuard(this);
});

When(/^Stop hook executes with empty stdin$/, function (this: V4World) {
  runStopGuard(this);
});

When(
  /^PostToolUse hook receives tool_response with stdout "([^"]+)"$/,
  function (this: V4World, stdout: string) {
    const input = makePostToolUseInput({
      tool_input: { command: 'sleep 60' },
      tool_response: {
        stdout,
        stderr: '',
        interrupted: false,
        isImage: false,
        noOutputExpected: false,
      },
    });
    runMarkHook(this, input);
  },
);

When(
  /^PostToolUse hook receives backgroundTaskId "([^"]+)" without run_in_background flag$/,
  function (this: V4World, bgTaskId: string) {
    const input = makePostToolUseInput({
      tool_input: { command: 'sleep 10 && cat file.txt' },
      tool_response: {
        stdout: 'file contents here',
        stderr: '',
        interrupted: false,
        isImage: false,
        noOutputExpected: false,
        backgroundTaskId: bgTaskId,
      },
    });
    runMarkHook(this, input);
  },
);

When(/^mark-bg-task hook receives empty stdin$/, function (this: V4World) {
  runMarkHook(this, '');
});

When(
  /^PostToolUse hook receives tool_input without run_in_background field$/,
  function (this: V4World) {
    const input = makePostToolUseInput({
      tool_input: { command: 'echo hello' },
    });
    runMarkHook(this, input);
  },
);

When(
  /^PostToolUse hook is called with session_id "([^"]+)" and run_in_background true$/,
  function (this: V4World, sessionId: string) {
    const input = makePostToolUseInput({
      session_id: sessionId,
      tool_input: { command: 'npm test', run_in_background: true },
      tool_response: {
        stdout: '',
        stderr: '',
        interrupted: false,
        isImage: false,
        noOutputExpected: false,
        backgroundTaskId: 'task-123',
      },
    });
    runMarkHook(this, input);
  },
);

When(/^we check if PID 99999 is alive$/, function (this: V4World) {
  let alive = false;
  try {
    process.kill(99999, 0);
    alive = true;
  } catch {
    alive = false;
  }
  // Store result in world for Then to verify
  this.lastStdout = alive ? 'alive' : 'dead';
  this.lastExitCode = 0;
});

// ---------------------------------------------------------------------------
// Then steps
// ---------------------------------------------------------------------------

Then(
  /^mark-bg-task exits 0 and does NOT create marker file$/,
  function (this: V4World) {
    assert.equal(this.lastExitCode, 0, `Expected exit 0, got ${this.lastExitCode}\nstderr: ${this.lastStderr}`);
    const mp = markerPath(this);
    assert.equal(
      fs.existsSync(mp),
      false,
      `Marker file should NOT exist but found: ${mp}`,
    );
  },
);

Then(
  /^hook should output JSON with "decision": "([^"]+)"$/,
  function (this: V4World, decision: string) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(this.lastStdout.trim());
    } catch (e) {
      assert.fail(
        `Expected JSON with "decision": "${decision}" but got non-JSON stdout: ${this.lastStdout.slice(0, 400)}`,
      );
    }
    assert.equal(
      parsed.decision,
      decision,
      `Expected decision="${decision}", got: ${JSON.stringify(parsed)}`,
    );
  },
);

Then(
  /^reason should mention "([^"]+)"$/,
  function (this: V4World, fragment: string) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(this.lastStdout.trim());
    } catch {
      assert.fail(`Expected JSON output but got: ${this.lastStdout.slice(0, 400)}`);
    }
    const reason = String(parsed.reason ?? '');
    assert.ok(
      reason.includes(fragment),
      `Expected reason to contain "${fragment}", got: ${reason}`,
    );
  },
);

Then(/^hook exits 0$/, function (this: V4World) {
  assert.equal(
    this.lastExitCode,
    0,
    `Expected exit 0, got ${this.lastExitCode}\nstdout: ${this.lastStdout}\nstderr: ${this.lastStderr}`,
  );
});

Then(/^hook exits 0 without blocking$/, function (this: V4World) {
  assert.equal(
    this.lastExitCode,
    0,
    `Expected exit 0, got ${this.lastExitCode}\nstdout: ${this.lastStdout}\nstderr: ${this.lastStderr}`,
  );
  // No block JSON in stdout
  if (this.lastStdout.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.lastStdout.trim());
    } catch {
      // Non-JSON stdout is fine for allow
      return;
    }
    const p = parsed as Record<string, unknown>;
    assert.notEqual(
      p.decision,
      'block',
      `Expected no block decision, got: ${JSON.stringify(parsed)}`,
    );
  }
});

Then(/^marker file should be deleted$/, function (this: V4World) {
  const mp = markerPath(this);
  assert.equal(fs.existsSync(mp), false, `Expected marker to be deleted but ${mp} still exists`);
});

Then(
  /^PostToolUse hook for bg-task-guard should be registered with matcher "([^"]+)"$/,
  function (this: V4World, expectedMatcher: string) {
    const raw = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'hooks.json'), 'utf-8'),
    ) as Record<string, unknown>;
    const hooks = (raw as { hooks?: Record<string, unknown> }).hooks ?? raw;
    const postToolUseEntries = Array.isArray(hooks['PostToolUse'])
      ? (hooks['PostToolUse'] as Array<{ matcher?: string; hooks?: Array<{ command?: string }> }>)
      : [];

    const matchingEntry = postToolUseEntries.find(
      (entry) =>
        entry.hooks?.some((h) => h.command?.includes('bg-task-guard/mark-bg-task.ts')),
    );

    assert.ok(
      matchingEntry,
      'No PostToolUse hook found for bg-task-guard/mark-bg-task.ts in .claude-plugin/hooks.json',
    );
    assert.equal(
      matchingEntry.matcher,
      expectedMatcher,
      `Expected matcher "${expectedMatcher}", got "${matchingEntry.matcher}"`,
    );
  },
);

Then(/^Stop hook for bg-task-guard should be registered$/, function (this: V4World) {
  const raw = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'hooks.json'), 'utf-8'),
  ) as Record<string, unknown>;
  const hooks = (raw as { hooks?: Record<string, unknown> }).hooks ?? raw;
  const stopEntries = Array.isArray(hooks['Stop'])
    ? (hooks['Stop'] as Array<{ hooks?: Array<{ command?: string }> }>)
    : [];

  const hasStopGuard = stopEntries.some((entry) =>
    entry.hooks?.some((h) => h.command?.includes('bg-task-guard/stop-guard.sh')),
  );
  assert.ok(
    hasStopGuard,
    'No Stop hook found for bg-task-guard/stop-guard.sh in .claude-plugin/hooks.json',
  );
});

Then(
  /^"([^"]+)" should exist$/,
  function (this: V4World, relPath: string) {
    const absPath = path.join(REPO_ROOT, ...relPath.split('/'));
    assert.ok(fs.existsSync(absPath), `Expected "${relPath}" to exist at ${absPath}`);
  },
);

Then(
  /^output should contain "([^"]+)"$/,
  function (this: V4World, fragment: string) {
    assert.ok(
      this.lastStdout.includes(fragment),
      `Expected stdout to contain "${fragment}". Got: ${this.lastStdout.slice(0, 400)}`,
    );
  },
);

Then(
  /^output should NOT contain "([^"]+)"$/,
  function (this: V4World, fragment: string) {
    assert.ok(
      !this.lastStdout.includes(fragment),
      `Expected stdout NOT to contain "${fragment}". Got: ${this.lastStdout.slice(0, 400)}`,
    );
  },
);

Then(/^the PID should be reported as dead$/, function (this: V4World) {
  assert.equal(this.lastStdout, 'dead', `Expected PID to be dead, got: ${this.lastStdout}`);
});
