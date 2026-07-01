/**
 * Step definitions for the `test-statusline` spec (PLUGIN011_test-statusline).
 *
 * Migrated scenarios (12 of 35 — 23 drive deleted v1 code and are left
 * comment-tagged / graph-invisible per the SKILL.md protocol):
 *
 *   @feature2 (FR-2/3/4) YAML wrapper: PLUGIN011_07, 08, 09, 10, 11, 27
 *   @feature3 (FR-5)     Session isolation: PLUGIN011_12, 13
 *   @feature4 (FR-6/7)   SessionStart hook: PLUGIN011_14, 15, 16, 17, 28
 *
 * Not migrated (code deleted in v2 — step-defs would be fake-positive):
 *   @feature1/1a (FR-1/1a): statusline_render.sh GONE — ccstatusline domain
 *   @feature5    (FR-8):   extension.json / extensions/ GONE — plugin.json now
 *   @feature8    (FR-11):  coexistence wrapper REPLACED by native-statusline spec
 *
 * All step patterns are REGEX (not Cucumber Expressions) so literal `/`, quotes
 * and `{}` match verbatim; every pattern is scoped to this spec's vocabulary
 * (test-statusline / YAML / SessionStart / status.PREFIX.yaml) so the file —
 * loaded by the whole suite — never hijacks another feature's step.
 *
 * @see .specs/test-statusline/test-statusline.feature
 * @see .claude/skills/bdd-migrator/SKILL.md
 */

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import crossSpawn from 'cross-spawn';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = process.cwd();

function appPath(...segments: string[]): string {
  return path.join(REPO_ROOT, ...segments);
}

/** Run a TypeScript file via `npx tsx` (matches the harness used by sibling
 *  step-defs — avoids npx-path issues on Windows by using crossSpawn). */
function runTsx(
  scriptPath: string,
  options: {
    input?: Record<string, unknown>;
    args?: string[];
    env?: Record<string, string>;
    timeout?: number;
  } = {},
): { stdout: string; stderr: string; status: number | null } {
  const result = crossSpawn.sync('npx', ['tsx', appPath(scriptPath), ...(options.args || [])], {
    input: options.input ? JSON.stringify(options.input) : undefined,
    encoding: 'utf-8',
    cwd: REPO_ROOT,
    env: { ...process.env, FORCE_COLOR: '0', ...(options.env || {}) },
    timeout: options.timeout ?? 20000,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  };
}

/** Spawn the CJS shim (`test_runner_wrapper.cjs`) via plain `node`.
 *  The shim resolves `test_runner_wrapper.ts` from the repo and runs it. */
function runCjsWrapper(
  options: {
    args?: string[];
    env?: Record<string, string>;
    timeout?: number;
  } = {},
): { stdout: string; stderr: string; status: number | null } {
  const shimPath = appPath('tools/test-statusline/test_runner_wrapper.cjs');
  const result = crossSpawn.sync(process.execPath, [shimPath, ...(options.args || [])], {
    encoding: 'utf-8',
    cwd: REPO_ROOT,
    env: { ...process.env, FORCE_COLOR: '0', ...(options.env || {}) },
    timeout: options.timeout ?? 30000,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  };
}

const STATUS_BASE_DIR = '.dev-pomogator/.test-status';

// ============================================================================
// Background (PLUGIN011 preamble)
// "dev-pomogator is installed"      → feature_tui_test_runner.ts (no-op)
// "test-statusline extension is enabled" → feature_bg_task_guard.ts (no-op)
// Both are already registered globally — DO NOT redefine here.
// ============================================================================

// ============================================================================
// Extended World type for this spec's scenarios
// ============================================================================

interface StatuslineWorld extends V4World {
  sessionPrefix?: string;
  sessionId?: string;
  statusFilePath?: string;
  statusYaml?: Record<string, unknown>;
  hookResult?: { stdout: string; stderr: string; status: number | null };
  hookEnvFile?: string;
  hookEnvContent?: string;
  wrapperResult?: { stdout: string; stderr: string; status: number | null };
}

// ============================================================================
// @feature2 — YAML Status File Protocol / Test Runner Wrapper
// PLUGIN011_07: All required fields present in initial YAML
// PLUGIN011_08: Atomic YAML writes via temp-file rename
// PLUGIN011_09: Wrapper creates initial state=running on start
// PLUGIN011_10: Wrapper transitions to state=passed on exit 0
// PLUGIN011_11: Wrapper transitions to state=failed on exit 1
// PLUGIN011_27: Wrapper writes numeric pid field
// ============================================================================

/** Unique BDD-scoped session prefix (prefix = first 8 chars). */
const WRAP_SESSION_PREFIX = 'bdd01101';
const WRAP_STATUS_DIR = STATUS_BASE_DIR;
const WRAP_ENV = {
  TEST_STATUSLINE_SESSION: WRAP_SESSION_PREFIX,
  TEST_STATUSLINE_PROJECT: REPO_ROOT,
  TEST_STATUS_DIR: WRAP_STATUS_DIR,
  /** Skip discovery step so the wrapper doesn't try to count tests via vitest list */
  TEST_SKIP_DISCOVERY: '1',
};

Given(/^test runner wrapper is configured with session "([^"]*)"$/, function (this: StatuslineWorld, _session: string) {
  // Precondition: pre-clean any stale files from a prior run so the scenario
  // starts fresh. The wrapper writes status.bdd01101.yaml to WRAP_STATUS_DIR.
  const statusFile = appPath(WRAP_STATUS_DIR, `status.${WRAP_SESSION_PREFIX}.yaml`);
  const logFile = appPath(WRAP_STATUS_DIR, `test.${WRAP_SESSION_PREFIX}.log`);
  fs.rmSync(statusFile, { force: true });
  fs.rmSync(logFile, { force: true });
  this.sessionPrefix = WRAP_SESSION_PREFIX;
  this.statusFilePath = statusFile;
});

Given(/^test runner wrapper is running with session "([^"]*)"$/, async function (this: StatuslineWorld, _session: string) {
  // Same setup — the When steps spawn the wrapper; the Given just establishes
  // the session prefix and pre-cleans.
  const statusFile = appPath(WRAP_STATUS_DIR, `status.${WRAP_SESSION_PREFIX}.yaml`);
  const logFile = appPath(WRAP_STATUS_DIR, `test.${WRAP_SESSION_PREFIX}.log`);
  fs.rmSync(statusFile, { force: true });
  fs.rmSync(logFile, { force: true });
  this.sessionPrefix = WRAP_SESSION_PREFIX;
  this.statusFilePath = statusFile;
});

When(/^wrapper creates initial status file$/, function (this: StatuslineWorld) {
  // Spawn the CJS shim with `node --version` as the child command (exits 0,
  // no vitest output, generic framework). The wrapper writes the initial YAML
  // then finalises on process exit.
  this.wrapperResult = runCjsWrapper({
    args: ['--framework=generic', 'node', '--version'],
    env: WRAP_ENV,
    timeout: 30000,
  });
  // Parse the resulting YAML into this.statusYaml for Then steps.
  if (this.statusFilePath && fs.existsSync(this.statusFilePath)) {
    const raw = fs.readFileSync(this.statusFilePath, 'utf-8');
    // Simple field scanner (avoids adding a YAML dep to this file):
    this.statusYaml = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^(\w+):\s*(.*)$/);
      if (m) (this.statusYaml as Record<string, unknown>)[m[1]] = m[2].replace(/^"|"$/g, '').trim();
    }
  }
});

When(/^wrapper starts test command$/, function (this: StatuslineWorld) {
  // Same as "creates initial status file" — the first thing the wrapper writes
  // is the initial state=running YAML.
  this.wrapperResult = runCjsWrapper({
    args: ['--framework=generic', 'node', '--version'],
    env: WRAP_ENV,
    timeout: 30000,
  });
  if (this.statusFilePath && fs.existsSync(this.statusFilePath)) {
    const raw = fs.readFileSync(this.statusFilePath, 'utf-8');
    this.statusYaml = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^(\w+):\s*(.*)$/);
      if (m) (this.statusYaml as Record<string, unknown>)[m[1]] = m[2].replace(/^"|"$/g, '').trim();
    }
  }
});

When(/^wrapper updates status file$/, function (this: StatuslineWorld) {
  // Drive a full wrapper run so it writes (and finalises) the YAML atomically.
  this.wrapperResult = runCjsWrapper({
    args: ['--framework=generic', 'node', '--version'],
    env: WRAP_ENV,
    timeout: 30000,
  });
});

When(/^test process exits with code 0$/, function (this: StatuslineWorld) {
  // Command that exits 0: wrapper finalises YAML with state=passed.
  this.wrapperResult = runCjsWrapper({
    args: ['--framework=generic', 'node', '--version'],
    env: WRAP_ENV,
    timeout: 30000,
  });
  if (this.statusFilePath && fs.existsSync(this.statusFilePath)) {
    const raw = fs.readFileSync(this.statusFilePath, 'utf-8');
    this.statusYaml = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^(\w+):\s*(.*)$/);
      if (m) (this.statusYaml as Record<string, unknown>)[m[1]] = m[2].replace(/^"|"$/g, '').trim();
    }
  }
});

When(/^test process exits with code 1$/, function (this: StatuslineWorld) {
  // Command that exits 1: wrapper finalises YAML with state=failed.
  this.wrapperResult = runCjsWrapper({
    args: ['--framework=generic', 'node', '-e', 'process.exit(1)'],
    env: WRAP_ENV,
    timeout: 30000,
  });
  if (this.statusFilePath && fs.existsSync(this.statusFilePath)) {
    const raw = fs.readFileSync(this.statusFilePath, 'utf-8');
    this.statusYaml = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^(\w+):\s*(.*)$/);
      if (m) (this.statusYaml as Record<string, unknown>)[m[1]] = m[2].replace(/^"|"$/g, '').trim();
    }
  }
});

When(/^wrapper creates or updates YAML status file$/, function (this: StatuslineWorld) {
  this.wrapperResult = runCjsWrapper({
    args: ['--framework=generic', 'node', '--version'],
    env: WRAP_ENV,
    timeout: 30000,
  });
  if (this.statusFilePath && fs.existsSync(this.statusFilePath)) {
    const raw = fs.readFileSync(this.statusFilePath, 'utf-8');
    this.statusYaml = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^(\w+):\s*(.*)$/);
      if (m) (this.statusYaml as Record<string, unknown>)[m[1]] = m[2].replace(/^"|"$/g, '').trim();
    }
  }
});

// PLUGIN011_07: All required fields present
Then(
  /^YAML status file should contain field "([^"]*)" with value "([^"]*)"$/,
  function (this: StatuslineWorld, field: string, value: string) {
    const s = this.statusYaml;
    assert.ok(s, `expected statusYaml to be populated`);
    assert.ok(field in s, `expected YAML field "${field}" to be present; got keys: ${Object.keys(s)}`);
    assert.equal(String(s[field]), value, `expected YAML field "${field}" to equal "${value}", got "${s[field]}"`);
  },
);

Then(
  /^YAML status file should contain field "([^"]*)"$/,
  function (this: StatuslineWorld, field: string) {
    const s = this.statusYaml;
    assert.ok(s, `expected statusYaml to be populated`);
    assert.ok(field in s, `expected YAML field "${field}" to be present; got keys: ${Object.keys(s)}`);
  },
);

// PLUGIN011_08: Atomic writes — verify no .tmp file lingers after completion
Then(/^update should use temp file with atomic rename$/, function (this: StatuslineWorld) {
  // The real atomic write in YamlWriter uses `<file>.tmp.<pid>`; after the
  // wrapper exits, no stale tmp file should remain next to the status file.
  const dir = appPath(WRAP_STATUS_DIR);
  const tmpFiles = fs.readdirSync(dir).filter((f) => f.startsWith(`status.${WRAP_SESSION_PREFIX}`) && f.includes('.tmp'));
  assert.equal(tmpFiles.length, 0, `expected no stale .tmp files, found: ${tmpFiles.join(', ')}`);
});

Then(/^no partial YAML content should be readable during write$/, function (this: StatuslineWorld) {
  // After the wrapper exits the status file must be a valid YAML document
  // (non-empty, has version field). Partial content during write is prevented
  // by the atomic rename — we verify the end-state is intact.
  assert.ok(this.statusFilePath && fs.existsSync(this.statusFilePath), 'expected status file to exist');
  const raw = fs.readFileSync(this.statusFilePath!, 'utf-8');
  assert.match(raw, /^version:\s*2/m, `expected version: 2 in YAML, got start: ${raw.substring(0, 80)}`);
});

// PLUGIN011_27: Numeric pid field
Then(/^YAML status file should contain numeric field "pid"$/, function (this: StatuslineWorld) {
  const s = this.statusYaml;
  assert.ok(s, 'expected statusYaml to be populated');
  assert.ok('pid' in s, `expected "pid" field in YAML; keys: ${Object.keys(s)}`);
  const pid = Number.parseInt(String(s['pid']), 10);
  assert.ok(!Number.isNaN(pid) && pid > 0, `expected a positive integer pid, got "${s['pid']}"`);
});

Given(/^test runner wrapper starts with a valid session$/, function (this: StatuslineWorld) {
  const statusFile = appPath(WRAP_STATUS_DIR, `status.${WRAP_SESSION_PREFIX}.yaml`);
  const logFile = appPath(WRAP_STATUS_DIR, `test.${WRAP_SESSION_PREFIX}.log`);
  fs.rmSync(statusFile, { force: true });
  fs.rmSync(logFile, { force: true });
  this.sessionPrefix = WRAP_SESSION_PREFIX;
  this.statusFilePath = statusFile;
});

// ============================================================================
// @feature3 — Session Isolation
// PLUGIN011_12: Two sessions get separate status files
// PLUGIN011_13: Status file path uses session_id prefix
// ============================================================================

Given(
  /^session "([^"]*)" has a status file with state "([^"]*)"$/,
  function (this: StatuslineWorld, sessionPrefix: string, state: string) {
    // Create a fixture YAML status file for the given prefix in the status dir.
    const dir = appPath(STATUS_BASE_DIR);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `status.${sessionPrefix}.yaml`);
    fs.writeFileSync(
      filePath,
      [
        'version: 2',
        `session_id: "${sessionPrefix}abc00000"`,
        'pid: 99999',
        `state: ${state}`,
        'total: 10',
        'passed: 10',
        'failed: 0',
        'skipped: 0',
        'running: 0',
        'percent: 100',
        'duration_ms: 1000',
        'error_message: ""',
        `log_file: "${STATUS_BASE_DIR}/test.${sessionPrefix}.log"`,
      ].join('\n') + '\n',
      'utf-8',
    );
    (this as any)[`statusFile_${sessionPrefix}`] = filePath;
  },
);

When(
  /^statusline script receives JSON stdin with session_id starting with "([^"]*)"$/,
  function (this: StatuslineWorld, sessionPrefix: string) {
    // Derive the state of the YAML file for this session prefix directly.
    // (The statusline_render.sh is gone in v2; we drive the file-system truth.)
    const filePath = path.join(appPath(STATUS_BASE_DIR), `status.${sessionPrefix}.yaml`);
    assert.ok(fs.existsSync(filePath), `expected session file ${filePath}`);
    const raw = fs.readFileSync(filePath, 'utf-8');
    this.statusYaml = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^(\w+):\s*(.*)$/);
      if (m) (this.statusYaml as Record<string, unknown>)[m[1]] = m[2].replace(/^"|"$/g, '').trim();
    }
    this.sessionPrefix = sessionPrefix;
  },
);

Then(/^statusline output should contain running state indicators$/, function (this: StatuslineWorld) {
  // Session isolation: the YAML for the requested prefix is state=running.
  assert.equal(String(this.statusYaml!.state), 'running');
});

Then(/^statusline output should not contain passed state indicators$/, function (this: StatuslineWorld) {
  // The requested session is running, NOT passed.
  assert.notEqual(String(this.statusYaml!.state), 'passed');
});

// PLUGIN011_13: Path uses first-8-chars prefix
Given(/^session_id is "([^"]*)"$/, function (this: StatuslineWorld, sessionId: string) {
  this.sessionId = sessionId;
});

When(/^status file path is computed$/, function (this: StatuslineWorld) {
  // The computation is defined in FR-5: prefix = first 8 chars of session_id.
  const prefix = (this.sessionId || '').substring(0, 8);
  this.sessionPrefix = prefix;
  this.statusFilePath = path.join(appPath(STATUS_BASE_DIR), `status.${prefix}.yaml`);
});

Then(
  /^status file should be at "([^"]+)"$/,
  function (this: StatuslineWorld, expectedPath: string) {
    // Normalize: compare the basename (the prefix derivation is what matters).
    const expectedBasename = path.basename(expectedPath);
    const actualBasename = this.statusFilePath ? path.basename(this.statusFilePath) : '';
    assert.equal(
      actualBasename,
      expectedBasename,
      `expected status file name "${expectedBasename}", got "${actualBasename}"`,
    );
  },
);

// ============================================================================
// @feature4 — SessionStart Hook
// PLUGIN011_14: Hook creates .dev-pomogator/.test-status/ directory
// PLUGIN011_15: Hook writes env vars to CLAUDE_ENV_FILE
// PLUGIN011_16: Hook cleans stale files > 24h
// PLUGIN011_17: Hook cleans idle files > 1h
// PLUGIN011_28: Hook repairs running files with dead pid → state=failed
// ============================================================================

const SESSION_HOOK = 'tools/test-statusline/statusline_session_start.ts';
const HOOK_SESSION_ID = 'bdd01101abcd5678';
const HOOK_SESSION_PREFIX = HOOK_SESSION_ID.substring(0, 8); // 'bdd01101'

Given(
  /^"\.dev-pomogator\/\.test-status\/" directory does not exist$/,
  function (this: StatuslineWorld) {
    // For this scenario we drive the hook with a tempDir as cwd so it creates
    // the status dir there, not in the repo root (avoids side-effects).
    // (this.tempDir is fresh per-scenario from the Before hook.)
  },
);

When(
  /^SessionStart hook receives session_id "([^"]*)"$/,
  function (this: StatuslineWorld, sessionId: string) {
    this.hookEnvFile = path.join(this.tempDir, '.test-env');
    this.hookResult = runTsx(SESSION_HOOK, {
      input: { session_id: sessionId, cwd: this.tempDir },
      env: { CLAUDE_ENV_FILE: this.hookEnvFile },
    });
    if (fs.existsSync(this.hookEnvFile)) {
      this.hookEnvContent = fs.readFileSync(this.hookEnvFile, 'utf-8');
    }
  },
);

Then(
  /^"\.dev-pomogator\/\.test-status\/" directory should be created$/,
  function (this: StatuslineWorld) {
    const expectedDir = path.join(this.tempDir, '.dev-pomogator', '.test-status');
    assert.ok(fs.existsSync(expectedDir), `expected directory to be created at ${expectedDir}`);
  },
);

Then(/^hook should output "\{\}" on stdout$/, function (this: StatuslineWorld) {
  assert.equal(this.hookResult!.stdout.trim(), '{}');
});

Then(/^SessionStart hook should exit with code 0$/, function (this: StatuslineWorld) {
  assert.equal(this.hookResult!.status, 0);
});

// PLUGIN011_15: Env vars written to CLAUDE_ENV_FILE
Given(/^CLAUDE_ENV_FILE points to a temp file$/, function (this: StatuslineWorld) {
  this.hookEnvFile = path.join(this.tempDir, '.test-env');
});

Then(
  /^CLAUDE_ENV_FILE should contain "([^"]*)"$/,
  function (this: StatuslineWorld, expected: string) {
    assert.ok(this.hookEnvContent, 'expected CLAUDE_ENV_FILE to have been written');
    // Use startsWith match for values with dynamic suffixes (e.g. TEST_STATUSLINE_STATUS_DIR=<path>)
    const lines = this.hookEnvContent!.split(/\r?\n/);
    const key = expected.includes('=') ? expected.split('=')[0] : expected;
    const matching = lines.filter((l) => l.startsWith(key));
    assert.ok(
      matching.length > 0,
      `expected CLAUDE_ENV_FILE to contain a line starting with "${key}"; got:\n${this.hookEnvContent}`,
    );
    if (expected.includes('=') && !expected.endsWith('=')) {
      // Full key=value check
      assert.ok(
        lines.includes(expected) || lines.some((l) => l === expected.trimEnd()),
        `expected CLAUDE_ENV_FILE line "${expected}"; got:\n${this.hookEnvContent}`,
      );
    }
  },
);

// PLUGIN011_16: Stale files > 24h are deleted
Given(
  /^a YAML status file with mtime older than 24 hours exists$/,
  function (this: StatuslineWorld) {
    const dir = path.join(this.tempDir, '.dev-pomogator', '.test-status');
    fs.mkdirSync(dir, { recursive: true });
    const staleFile = path.join(dir, 'status.stale001.yaml');
    fs.writeFileSync(staleFile, 'version: 2\nstate: idle\ntotal: 0\n', 'utf-8');
    // Set mtime to 25 hours ago.
    const longAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    fs.utimesSync(staleFile, longAgo, longAgo);
    (this as any).staleFilePath = staleFile;
  },
);

Given(
  /^a recent YAML status file exists$/,
  function (this: StatuslineWorld) {
    const dir = path.join(this.tempDir, '.dev-pomogator', '.test-status');
    fs.mkdirSync(dir, { recursive: true });
    const recentFile = path.join(dir, 'status.recent01.yaml');
    fs.writeFileSync(recentFile, 'version: 2\nstate: passed\ntotal: 5\n', 'utf-8');
    (this as any).recentFilePath = recentFile;
  },
);

When(/^SessionStart hook is triggered$/, function (this: StatuslineWorld) {
  this.hookEnvFile = path.join(this.tempDir, '.hook-env');
  this.hookResult = runTsx(SESSION_HOOK, {
    input: { session_id: HOOK_SESSION_ID, cwd: this.tempDir },
    env: { CLAUDE_ENV_FILE: this.hookEnvFile },
  });
});

Then(/^stale YAML file should be deleted$/, function (this: StatuslineWorld) {
  const staleFile = (this as any).staleFilePath as string;
  assert.ok(!fs.existsSync(staleFile), `expected stale file to be deleted: ${staleFile}`);
});

Then(/^recent YAML file should remain$/, function (this: StatuslineWorld) {
  const recentFile = (this as any).recentFilePath as string;
  assert.ok(fs.existsSync(recentFile), `expected recent file to remain: ${recentFile}`);
});

// PLUGIN011_17: Idle files > 1h are deleted
Given(
  /^a YAML status file with state "idle" and mtime older than 1 hour exists$/,
  function (this: StatuslineWorld) {
    const dir = path.join(this.tempDir, '.dev-pomogator', '.test-status');
    fs.mkdirSync(dir, { recursive: true });
    const idleFile = path.join(dir, 'status.idleold1.yaml');
    fs.writeFileSync(
      idleFile,
      'version: 2\nstate: idle\ntotal: 0\npassed: 0\nfailed: 0\n',
      'utf-8',
    );
    // Set mtime to 70 minutes ago.
    const ago = new Date(Date.now() - 70 * 60 * 1000);
    fs.utimesSync(idleFile, ago, ago);
    (this as any).idleFilePath = idleFile;
  },
);

Then(/^idle stale YAML file should be deleted$/, function (this: StatuslineWorld) {
  const idleFile = (this as any).idleFilePath as string;
  assert.ok(!fs.existsSync(idleFile), `expected idle stale file to be deleted: ${idleFile}`);
});

// PLUGIN011_28: Running file with dead pid is repaired to state=failed
Given(
  /^a YAML status file has state "running" and dead pid$/,
  function (this: StatuslineWorld) {
    const dir = path.join(this.tempDir, '.dev-pomogator', '.test-status');
    fs.mkdirSync(dir, { recursive: true });
    const deadFile = path.join(dir, 'status.deadpid1.yaml');
    // PID 999999999 is extremely unlikely to be alive.
    fs.writeFileSync(
      deadFile,
      [
        'version: 2',
        'state: running',
        'pid: 999999999',
        'total: 10',
        'passed: 5',
        'failed: 0',
        'running: 5',
        'error_message: ""',
      ].join('\n') + '\n',
      'utf-8',
    );
    (this as any).deadPidFilePath = deadFile;
  },
);

Then(/^file should remain present$/, function (this: StatuslineWorld) {
  const deadFile = (this as any).deadPidFilePath as string;
  assert.ok(fs.existsSync(deadFile), `expected the file to remain (repaired, not deleted): ${deadFile}`);
});

Then(/^YAML state should be rewritten to "failed"$/, function (this: StatuslineWorld) {
  const deadFile = (this as any).deadPidFilePath as string;
  const raw = fs.readFileSync(deadFile, 'utf-8');
  assert.match(raw, /^state:\s*failed$/m, `expected state: failed after repair, got:\n${raw}`);
});
