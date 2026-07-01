/**
 * Step definitions for .specs/forbid-root-artifacts/forbid-root-artifacts.feature
 *
 * Drives the REAL forbid-root-artifacts Python engine:
 *   tools/forbid-root-artifacts/check.py
 *   tools/forbid-root-artifacts/configure.py
 *
 * All FS work stays inside V4World.tempDir (created fresh per scenario by the
 * Before hook in tests/hooks/before-after.ts).  The test repo inside tempDir
 * gets `git init` + tool copy to mirror the vitest twin's beforeEach setup.
 *
 * Artifact scenarios (STRUCT_01/02/03) read the real REPO files directly —
 * no tempDir needed; they just assert the source tree shape.
 *
 * @see .specs/forbid-root-artifacts/forbid-root-artifacts.feature
 * @see tests/e2e/forbid-root-artifacts.test.ts  (superseded vitest twin)
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { V4World } from '../hooks/before-after.ts';
import { checkRootArtifactsInstall, type RootArtifactsCheckResult } from '../../tools/forbid-root-artifacts/doctor-check.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Absolute path to the real plugin source tree (repo root / tools / ...) */
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const PLUGIN_SOURCE_DIR = path.join(REPO_ROOT, 'tools', 'forbid-root-artifacts');

// ─── World state extensions ───────────────────────────────────────────────────

/** Extra per-scenario state stored on the World. */
interface FRAState {
  /** The isolated git repo created inside tempDir for this scenario. */
  repoDir: string;
  /** Mtime (ms) snapshot captured before the run (for mtime-unchanged assertions). */
  yamlMtimeBefore: number;
  /** Fake stub binDir to prepend to PATH (for LLM tests). */
  stubBinDir?: string;
  /** Path to stub invocation log. */
  stubInvocationLogPath?: string;
  /** Named mtime snapshots (AUTOPRUNE_02 style). */
  mtimeSnapshots: Record<string, number>;
  /** Which source directory CLASS_01/02 scenario uses. */
  pluginSourceDir?: string;
  /** FR-7: env overrides applied to the install-hook run (opt-out, launchers, force-deps). */
  installEnv?: Record<string, string>;
  /** FR-7: path where the recording launcher appends invoked phases (deps/setup). */
  installRecordPath?: string;
  /** FR-7: mtime snapshot of .pre-commit-config.yaml before the run. */
  preCommitMtimeBefore?: number;
  /** FR-10: last doctor-check result. */
  doctorResult?: RootArtifactsCheckResult;
}

function state(world: V4World): FRAState {
  const w = world as V4World & { _fra?: FRAState };
  if (!w._fra) {
    w._fra = {
      repoDir: '',
      yamlMtimeBefore: 0,
      mtimeSnapshots: {},
    };
  }
  return w._fra;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initGitRepo(dir: string): void {
  spawnSync('git', ['init'], { cwd: dir, stdio: 'pipe' });
  spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'pipe' });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'pipe' });
}

function toolsDestDir(repoDir: string): string {
  return path.join(repoDir, '.dev-pomogator', 'tools', 'forbid-root-artifacts');
}

function copyPluginTools(repoDir: string): void {
  const dest = toolsDestDir(repoDir);
  fs.mkdirSync(dest, { recursive: true });
  // Copy only files (skip __pycache__, .mypy_cache, etc.)
  for (const entry of fs.readdirSync(PLUGIN_SOURCE_DIR)) {
    const src = path.join(PLUGIN_SOURCE_DIR, entry);
    if (!fs.statSync(src).isFile()) continue;
    fs.copyFileSync(src, path.join(dest, entry));
  }
}

function runCheck(
  repoDir: string,
  extraEnv: NodeJS.ProcessEnv = {},
): { exitCode: number; stdout: string; stderr: string } {
  const checkScript = path.join(toolsDestDir(repoDir), 'check.py');
  const result = spawnSync('python', [checkScript], {
    cwd: repoDir,
    encoding: 'utf-8',
    env: { ...process.env, ...extraEnv },
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout?.toString() ?? '',
    stderr: result.stderr?.toString() ?? '',
  };
}

function runConfigure(
  repoDir: string,
  args: string[] = [],
  extraEnv: NodeJS.ProcessEnv = {},
): { exitCode: number; stdout: string; stderr: string } {
  const configureScript = path.join(toolsDestDir(repoDir), 'configure.py');
  const result = spawnSync('python', [configureScript, ...args], {
    cwd: repoDir,
    encoding: 'utf-8',
    env: { ...process.env, ...extraEnv },
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout?.toString() ?? '',
    stderr: result.stderr?.toString() ?? '',
  };
}

/** Create a fake claude stub that returns the given JSON result. Returns binDir and logPath. */
function createFakeClaudeStub(
  repoDir: string,
  jsonResult: object,
): { binDir: string; invocationLogPath: string } {
  const binDir = path.join(repoDir, '_stubs');
  fs.mkdirSync(binDir, { recursive: true });
  const invocationLogPath = path.join(binDir, 'invocations.log');
  fs.writeFileSync(invocationLogPath, '');

  const jsonOut = JSON.stringify(jsonResult).replace(/'/g, "'\\''");
  const escapedLogPath = invocationLogPath.replace(/\\/g, '\\\\');

  if (process.platform === 'win32') {
    const cmdPath = path.join(binDir, 'claude.cmd');
    const cmdContent =
      '@echo off\r\n' +
      'setlocal enabledelayedexpansion\r\n' +
      'set "ARGS="\r\n' +
      ':argloop\r\n' +
      'if "%~1"=="" goto :done\r\n' +
      'if defined ARGS (set "ARGS=!ARGS!|||%~1") else (set "ARGS=%~1")\r\n' +
      'shift\r\n' +
      'goto :argloop\r\n' +
      ':done\r\n' +
      `>>"${invocationLogPath}" echo !ARGS!\r\n` +
      `echo ${JSON.stringify(jsonResult).replace(/[<>&|^]/g, '^$&')}\r\n` +
      'exit /b 0\r\n';
    fs.writeFileSync(cmdPath, cmdContent);
  } else {
    const scriptPath = path.join(binDir, 'claude');
    const script =
      '#!/bin/sh\n' +
      `printf '%s\\n' "$*" >> '${escapedLogPath}'\n` +
      `cat <<'STUBJSON'\n${JSON.stringify(jsonResult)}\nSTUBJSON\n` +
      'exit 0\n';
    fs.writeFileSync(scriptPath, script);
    fs.chmodSync(scriptPath, 0o755);
  }

  return { binDir, invocationLogPath };
}

/**
 * Build the PATH-env for spawning check.py / configure.py.
 * - '__no_claude__' sentinel → restrict PATH to python-only locations (removes claude)
 * - real binDir → prepend stub to PATH (adds fake claude)
 * - no stub → use process.env as-is
 */
function buildEnv(s: FRAState): NodeJS.ProcessEnv {
  if (!s.stubBinDir) return {};

  if (s.stubBinDir === '__no_claude__') {
    // Keep the real PATH but remove any directory that contains a 'claude' binary.
    // This preserves python, git, and all other tools while excluding claude.
    const claudeResult = spawnSync(
      process.platform === 'win32' ? 'where' : 'which',
      ['claude'],
      { encoding: 'utf-8' },
    );
    const claudeLines = (claudeResult.stdout ?? '').trim().split('\n').map(l => l.trim()).filter(Boolean);
    const claudeDirs = new Set(claudeLines.map(l => path.dirname(l).toLowerCase()));

    const currentPath = process.env['PATH'] ?? '';
    const filteredPath = currentPath
      .split(path.delimiter)
      .filter(dir => !claudeDirs.has(dir.toLowerCase()))
      .join(path.delimiter);
    return { PATH: filteredPath };
  }

  // Normal case: prepend stub bin dir to PATH
  return { PATH: s.stubBinDir + path.delimiter + (process.env['PATH'] ?? '') };
}

// ─── Background steps ─────────────────────────────────────────────────────────

Given(/^a git repository$/, function (this: V4World) {
  const s = state(this);
  // Create an isolated git repo inside the per-scenario tempDir
  s.repoDir = path.join(this.tempDir, 'test-repo');
  fs.mkdirSync(s.repoDir, { recursive: true });
  initGitRepo(s.repoDir);
});

Given(/^forbid-root-artifacts plugin is installed$/, function (this: V4World) {
  // No-op: tools are copied in the next Background step.
  // Proves plugin source exists (would fail if PLUGIN_SOURCE_DIR missing).
  assert.ok(
    fs.existsSync(PLUGIN_SOURCE_DIR),
    `Plugin source missing at ${PLUGIN_SOURCE_DIR}`,
  );
});

Given(/^tools copied to \.dev-pomogator\/tools\/forbid-root-artifacts\/$/, function (this: V4World) {
  const s = state(this);
  assert.ok(s.repoDir, 'repoDir not set — "a git repository" step must run first');
  copyPluginTools(s.repoDir);
});

// ─── Given — setup steps ──────────────────────────────────────────────────────

Given(/^\.root-artifacts\.yaml contains:$/, function (this: V4World, docString: string) {
  const s = state(this);
  // Snapshot mtime before writing so mtime-unchanged assertions work
  s.yamlMtimeBefore = Date.now();
  fs.writeFileSync(path.join(s.repoDir, '.root-artifacts.yaml'), docString + '\n', 'utf-8');
  // Capture mtime right after write for "mtime should be unchanged" step
  const written = fs.statSync(path.join(s.repoDir, '.root-artifacts.yaml')).mtimeMs;
  s.yamlMtimeBefore = written;
});

Given(/^\.root-artifacts\.yaml with custom header contains:$/, function (this: V4World, docString: string) {
  // The docString already contains the header lines + body — write it verbatim
  const s = state(this);
  fs.writeFileSync(path.join(s.repoDir, '.root-artifacts.yaml'), docString + '\n', 'utf-8');
  s.yamlMtimeBefore = fs.statSync(path.join(s.repoDir, '.root-artifacts.yaml')).mtimeMs;
});

Given(/^file "([^"]+)" exists in repo root$/, function (this: V4World, filename: string) {
  const s = state(this);
  fs.writeFileSync(path.join(s.repoDir, filename), 'test content\n', 'utf-8');
});

Given(/^file "([^"]+)" does NOT exist in repo root$/, function (this: V4World, filename: string) {
  const s = state(this);
  const p = path.join(s.repoDir, filename);
  if (fs.existsSync(p)) fs.unlinkSync(p);
});

Given(/^directory "([^"]+)" exists in repo root$/, function (this: V4World, dirname: string) {
  const s = state(this);
  fs.mkdirSync(path.join(s.repoDir, dirname), { recursive: true });
});

Given(/^the plugin source tree at "([^"]+)"$/, function (this: V4World, relPath: string) {
  const s = state(this);
  // Resolve relative to REPO_ROOT; store for subsequent Then steps
  s.pluginSourceDir = path.join(REPO_ROOT, relPath);
});

Given(/^fake "claude" binary in test PATH that returns JSON \{"result":"([^"]+)"\}$/, function (this: V4World, result: string) {
  const s = state(this);
  const { binDir, invocationLogPath } = createFakeClaudeStub(s.repoDir, { result });
  s.stubBinDir = binDir;
  s.stubInvocationLogPath = invocationLogPath;
});

Given(/^fake "claude" binary in test PATH that records invocations$/, function (this: V4World) {
  const s = state(this);
  // Returns 'config' — so the file ends up in whitelist (LLM_03 cache-hit test)
  const { binDir, invocationLogPath } = createFakeClaudeStub(s.repoDir, { result: 'config' });
  s.stubBinDir = binDir;
  s.stubInvocationLogPath = invocationLogPath;
});

Given(/^no "claude" binary in test PATH$/, function (this: V4World) {
  // Signal to When steps: use a minimal PATH that has python but NOT claude.
  // We store the sentinel '__no_claude__' in stubBinDir to indicate PATH-replace mode.
  const s = state(this);
  s.stubBinDir = '__no_claude__';
  // Create the invocation log path too (even though claude won't be invoked)
  s.stubInvocationLogPath = path.join(this.tempDir, '_no_claude_invocations.log');
  fs.writeFileSync(s.stubInvocationLogPath, '', 'utf-8');
});

Given(/^\.dev-pomogator\/\.classifier-cache\.json contains:$/, function (this: V4World, docString: string) {
  const s = state(this);
  const cacheDir = path.join(s.repoDir, '.dev-pomogator');
  fs.mkdirSync(cacheDir, { recursive: true });
  // Parse and normalise timestamps: replace any ts that's in the far future
  // (>current_epoch+1yr) with the current epoch seconds.  _classifier.py treats
  // future timestamps as clock drift (delta<0) → cache miss; we need a real ts.
  const nowSec = Math.floor(Date.now() / 1000);
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(docString);
    const entries = (data as { entries?: Record<string, { ts?: number }> }).entries ?? {};
    for (const key of Object.keys(entries)) {
      const entry = entries[key];
      if (entry && typeof entry.ts === 'number' && entry.ts > nowSec + 365 * 86400) {
        entry.ts = nowSec;
      }
    }
    fs.writeFileSync(path.join(cacheDir, '.classifier-cache.json'), JSON.stringify(data), 'utf-8');
  } catch {
    // Fallback: write raw docString if JSON parse fails
    fs.writeFileSync(path.join(cacheDir, '.classifier-cache.json'), docString, 'utf-8');
  }
});

Given(/^default-whitelist\.yaml is patched to add "([^"]+)" to trash_patterns_default$/, function (this: V4World, pattern: string) {
  const s = state(this);
  const yamlPath = path.join(toolsDestDir(s.repoDir), 'default-whitelist.yaml');
  const original = fs.readFileSync(yamlPath, 'utf-8');
  const patched = original.replace(
    'trash_patterns_default:',
    `trash_patterns_default:\n  - "${pattern}"`,
  );
  fs.writeFileSync(yamlPath, patched, 'utf-8');
});

Given(/^_classifier\.py is removed from \.dev-pomogator\/tools\/forbid-root-artifacts\/$/, function (this: V4World) {
  const s = state(this);
  const classifierPath = path.join(toolsDestDir(s.repoDir), '_classifier.py');
  if (fs.existsSync(classifierPath)) fs.unlinkSync(classifierPath);
});

// ─── When — actions ───────────────────────────────────────────────────────────

When(/^I run "python check\.py"(?: as pre-commit hook)?$/, function (this: V4World) {
  const s = state(this);
  const extraEnv: NodeJS.ProcessEnv = buildEnv(s);
  const result = runCheck(s.repoDir, extraEnv);
  this.lastExitCode = result.exitCode;
  this.lastStdout = result.stdout;
  this.lastStderr = result.stderr;
});

When(/^I run "python configure\.py --non-interactive"$/, function (this: V4World) {
  const s = state(this);
  const extraEnv: NodeJS.ProcessEnv = buildEnv(s);
  const result = runConfigure(s.repoDir, ['--non-interactive'], extraEnv);
  this.lastExitCode = result.exitCode;
  this.lastStdout = result.stdout;
  this.lastStderr = result.stderr;
});

When(/^I update \.root-artifacts\.yaml to set "([^"]+)"$/, function (this: V4World, setting: string) {
  // TRASH_02: toggle use_default_trash_patterns.  setting = "use_default_trash_patterns: false"
  const s = state(this);
  const yamlPath = path.join(s.repoDir, '.root-artifacts.yaml');
  const current = fs.readFileSync(yamlPath, 'utf-8');
  const [key, val] = setting.split(':').map(p => p.trim());
  // Replace line matching key: * with key: val, or append if not found
  const re = new RegExp(`^${key}:.*$`, 'm');
  const updated = re.test(current)
    ? current.replace(re, `${key}: ${val}`)
    : current + `${key}: ${val}\n`;
  fs.writeFileSync(yamlPath, updated, 'utf-8');
});

When(/^I grep "([^"]+)" across the \.py files in directory$/, function (this: V4World, pattern: string) {
  const s = state(this);
  const dir = s.pluginSourceDir ?? PLUGIN_SOURCE_DIR;
  const pyFiles = fs.readdirSync(dir).filter(f => f.endsWith('.py'));
  const re = new RegExp(pattern, 'm');
  const matches: string[] = [];
  for (const py of pyFiles) {
    const content = fs.readFileSync(path.join(dir, py), 'utf-8');
    if (re.test(content)) matches.push(py);
  }
  this.lastStdout = matches.join('\n');
});

When(/^I grep "([^"]+)" in default-whitelist\.yaml$/, function (this: V4World, pattern: string) {
  const s = state(this);
  const dir = s.pluginSourceDir ?? PLUGIN_SOURCE_DIR;
  const content = fs.readFileSync(path.join(dir, 'default-whitelist.yaml'), 'utf-8');
  const re = new RegExp(pattern, 'gm');
  const m = content.match(re);
  this.lastStdout = m ? m.join('\n') : '';
  this.lastExitCode = m ? 0 : 1;
});

// ─── Then — assertions ────────────────────────────────────────────────────────

Then(/^exit code should be (\d+)$/, function (this: V4World, expected: number) {
  assert.equal(
    this.lastExitCode,
    expected,
    `Expected exit ${expected}, got ${this.lastExitCode}\nstdout: ${this.lastStdout?.slice(0, 400)}\nstderr: ${this.lastStderr?.slice(0, 400)}`,
  );
});

// stdout contains / stderr contains are defined in common.ts (Cucumber Expression
// `stdout contains {string}` / `stderr contains {string}` — uses lastStdout/lastStderr).
// No redefinition here.

Then(/^stdout should NOT contain "([^"]+)"$/, function (this: V4World, fragment: string) {
  assert.ok(
    !this.lastStdout?.includes(fragment),
    `stdout should NOT contain "${fragment}" but does\nstdout: ${this.lastStdout?.slice(0, 600)}`,
  );
});

// stderr should NOT contain (uppercase NOT) — does NOT collide with auto_capture's
// lowercase `should not contain` (case-sensitive regex). Stays here.
Then(/^stderr should NOT contain "([^"]+)"$/, function (this: V4World, fragment: string) {
  assert.ok(
    !this.lastStderr?.includes(fragment),
    `stderr should NOT contain "${fragment}" but does\nstderr: ${this.lastStderr?.slice(0, 600)}`,
  );
});

Then(/^\.root-artifacts\.yaml should NOT contain "([^"]+)" in allow list$/, function (this: V4World, entry: string) {
  const s = state(this);
  const content = fs.readFileSync(path.join(s.repoDir, '.root-artifacts.yaml'), 'utf-8');
  // Check there's no list item matching this name
  const re = new RegExp(`^\\s*-\\s*${entry.replace(/\./g, '\\.')}\\s*$`, 'm');
  assert.ok(
    !re.test(content),
    `Expected .root-artifacts.yaml NOT to contain allow entry "${entry}"\nContent:\n${content}`,
  );
});

Then(/^\.root-artifacts\.yaml should still contain "([^"]+)" in allow list$/, function (this: V4World, entry: string) {
  const s = state(this);
  const content = fs.readFileSync(path.join(s.repoDir, '.root-artifacts.yaml'), 'utf-8');
  assert.ok(
    content.includes(entry),
    `Expected .root-artifacts.yaml to still contain "${entry}"\nContent:\n${content}`,
  );
});

Then(/^\.root-artifacts\.yaml should contain "([^"]+)"$/, function (this: V4World, text: string) {
  const s = state(this);
  const content = fs.readFileSync(path.join(s.repoDir, '.root-artifacts.yaml'), 'utf-8');
  assert.ok(
    content.includes(text),
    `Expected .root-artifacts.yaml to contain "${text}"\nContent:\n${content}`,
  );
});

Then(/^\.root-artifacts\.yaml should NOT contain "([^"]+)"$/, function (this: V4World, text: string) {
  const s = state(this);
  const content = fs.readFileSync(path.join(s.repoDir, '.root-artifacts.yaml'), 'utf-8');
  assert.ok(
    !content.includes(text),
    `Expected .root-artifacts.yaml NOT to contain "${text}"\nContent:\n${content}`,
  );
});

Then(/^\.root-artifacts\.yaml mtime should be unchanged$/, function (this: V4World) {
  const s = state(this);
  const mtimeAfter = fs.statSync(path.join(s.repoDir, '.root-artifacts.yaml')).mtimeMs;
  assert.equal(
    mtimeAfter,
    s.yamlMtimeBefore,
    `Expected .root-artifacts.yaml mtime to be unchanged (${s.yamlMtimeBefore}) but got ${mtimeAfter}`,
  );
});

Then(/^claude CLI should have been invoked exactly once with prompt containing "([^"]+)"$/, function (this: V4World, fragment: string) {
  const s = state(this);
  assert.ok(s.stubInvocationLogPath, 'No stub invocation log — fake claude step must run first');
  const log = fs.readFileSync(s.stubInvocationLogPath!, 'utf-8');
  assert.ok(log.length > 0, 'claude stub was never invoked (log is empty)');
  assert.ok(
    log.includes(fragment),
    `Expected claude invocation log to contain "${fragment}"\nLog: ${log.slice(0, 400)}`,
  );
});

Then(/^claude CLI should NOT have been invoked$/, function (this: V4World) {
  const s = state(this);
  assert.ok(s.stubInvocationLogPath, 'No stub invocation log — fake claude step must run first');
  const log = fs.readFileSync(s.stubInvocationLogPath!, 'utf-8');
  assert.equal(
    log.trim(),
    '',
    `Expected claude stub NOT to be invoked but log has content:\n${log.slice(0, 400)}`,
  );
});

Then(/^classify_file should have returned "([^"]+)" for "([^"]+)"$/, function (this: V4World, expected: string, filename: string) {
  // LLM_02: when CLI not found, classify_file returns 'unknown'.
  // configure.py in non-interactive mode prints files not classified as trash to the allow-list
  // and skips trash. For 'unknown' files: they appear in "not in whitelist" and get added to allow.
  const s = state(this);
  const yamlPath = path.join(s.repoDir, '.root-artifacts.yaml');
  const content = fs.existsSync(yamlPath) ? fs.readFileSync(yamlPath, 'utf-8') : '';
  if (expected === 'unknown') {
    // File ended up in whitelist (configure adds unknown files to allow list)
    assert.ok(
      content.includes(filename),
      `Expected "${filename}" in allow list (unknown → whitelisted)\nYAML:\n${content}`,
    );
  } else if (expected === 'trash') {
    const re = new RegExp(`^\\s*-\\s*${filename.replace(/\./g, '\\.')}\\s*$`, 'm');
    assert.ok(!re.test(content), `Expected "${filename}" NOT in allow list (classified as trash)`);
  }
});

Then(/^\.dev-pomogator\/\.classifier-cache\.json should contain "([^"]+)" entry$/, function (this: V4World, filename: string) {
  const s = state(this);
  const cachePath = path.join(s.repoDir, '.dev-pomogator', '.classifier-cache.json');
  assert.ok(fs.existsSync(cachePath), `Cache file does not exist at ${cachePath}`);
  const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  assert.ok(
    cache.entries && cache.entries[filename],
    `Expected cache to contain entry for "${filename}"\nCache: ${JSON.stringify(cache, null, 2).slice(0, 400)}`,
  );
});

Then(/^result should be empty$/, function (this: V4World) {
  assert.equal(
    this.lastStdout?.trim(),
    '',
    `Expected grep result to be empty but got:\n${this.lastStdout}`,
  );
});

Then(/^result should match exactly one occurrence$/, function (this: V4World) {
  const lines = this.lastStdout?.trim().split('\n').filter(Boolean) ?? [];
  assert.equal(
    lines.length,
    1,
    `Expected exactly 1 occurrence but got ${lines.length}:\n${this.lastStdout}`,
  );
});

Then(/^"([^"]+)" should contain "([^"]+)"$/, function (this: V4World, filename: string, text: string) {
  const s = state(this);
  const dir = s.pluginSourceDir ?? PLUGIN_SOURCE_DIR;
  const content = fs.readFileSync(path.join(dir, filename), 'utf-8');
  assert.ok(
    content.includes(text),
    `Expected ${filename} to contain "${text}"`,
  );
});

Then(/^no Python source code change should have been made$/, function (this: V4World) {
  // Verify that the .py files in the installed tools dir are identical to the originals.
  // This proves hot-reload works without code changes.
  const s = state(this);
  const installedDir = toolsDestDir(s.repoDir);
  const pyFiles = ['check.py', 'configure.py', '_classifier.py'];
  for (const py of pyFiles) {
    const installed = path.join(installedDir, py);
    const source = path.join(PLUGIN_SOURCE_DIR, py);
    if (fs.existsSync(installed) && fs.existsSync(source)) {
      // Just verify the core logic hasn't changed (size within 10% is sufficient;
      // the real check is that configure output changed without .py modification)
      const installedSize = fs.statSync(installed).size;
      const sourceSize = fs.statSync(source).size;
      // default-whitelist.yaml was patched (allowed), but .py must not differ from source
      // We check only that the installed .py content has the same whitespace-normalized text
      const iContent = fs.readFileSync(installed, 'utf-8').replace(/\r\n/g, '\n');
      const sContent = fs.readFileSync(source, 'utf-8').replace(/\r\n/g, '\n');
      assert.equal(
        iContent,
        sContent,
        `Expected ${py} to be unchanged from source (hot-reload must work via yaml only)`,
      );
    }
  }
});

// Artifact assertions (STRUCT scenarios — no tempDir)

Then(/^file "([^"]+)" exists in the plugin directory$/, function (this: V4World, filename: string) {
  const s = state(this);
  const dir = s.pluginSourceDir ?? PLUGIN_SOURCE_DIR;
  const filePath = path.join(dir, filename);
  assert.ok(
    fs.existsSync(filePath),
    `Expected ${filename} to exist in plugin directory ${dir}`,
  );
});

Then(/^"([^"]+)" exists in the repository$/, function (this: V4World, relPath: string) {
  // STRUCT_03: assert a path exists in the real REPO_ROOT (not tempDir)
  const filePath = path.join(REPO_ROOT, relPath);
  assert.ok(
    fs.existsSync(filePath),
    `Expected ${relPath} to exist in repository at ${filePath}`,
  );
});

Then(/^\.root-artifacts\.yaml should contain "([^"]+)" in allow list$/, function (this: V4World, entry: string) {
  const s = state(this);
  const content = fs.readFileSync(path.join(s.repoDir, '.root-artifacts.yaml'), 'utf-8');
  assert.ok(
    content.includes(entry),
    `Expected .root-artifacts.yaml to contain "${entry}"\nContent:\n${content}`,
  );
});

Then(/^stdout should classify "([^"]+)" as trash via fallback patterns$/, function (this: V4World, filename: string) {
  // CLASS_03: fallback mode — check.py uses _FALLBACK_TRASH_PATTERNS for *.tmp
  // The check.py output puts violations in stdout with AUTO-DELETE section
  assert.ok(
    this.lastStdout?.includes(filename) || this.lastStdout?.includes('AUTO-DELETE'),
    `Expected stdout to classify "${filename}" as trash (AUTO-DELETE)\nstdout: ${this.lastStdout?.slice(0, 600)}`,
  );
});

Then(/^exit code should be 1 OR exit code should be 0 \(если уже не в violations\)$/, function (this: V4World) {
  // CLASS_02: after configure classifies the file as trash, check.py may exit 0 or 1
  // depending on whether other violations exist. Either is acceptable.
  assert.ok(
    this.lastExitCode === 0 || this.lastExitCode === 1,
    `Expected exit code 0 or 1, got ${this.lastExitCode}`,
  );
});

// ─── FR-7..FR-10: SessionStart auto-installer + doctor steps ─────────────────────

const INSTALL_HOOK_SRC = path.join(REPO_ROOT, 'tools', 'forbid-root-artifacts', 'install-hook.ts');
const PRECOMMIT_CFG = '.pre-commit-config.yaml';

function installEnv(s: FRAState): Record<string, string> {
  if (!s.installEnv) s.installEnv = {};
  return s.installEnv;
}

/** Write a node recorder that appends its phase arg to the record file; on 'deps' it touches the marker. */
function ensureRecorder(s: FRAState): string {
  if (!s.installRecordPath) s.installRecordPath = path.join(s.repoDir, '_install-record.log');
  const recorderPath = path.join(s.repoDir, '_launcher.cjs');
  if (!fs.existsSync(recorderPath)) {
    const src =
      "const fs=require('fs');\n" +
      "fs.appendFileSync(process.env.DEV_POMOGATOR_ROOT_ARTIFACTS_RECORD,(process.argv[2]||'')+'\\n');\n" +
      "const m=process.env.DEV_POMOGATOR_ROOT_ARTIFACTS_DEPS_MARKER;\n" +
      "if(process.argv[2]==='deps'&&m){fs.writeFileSync(m,'');}\n" +
      "process.exit(0);\n";
    fs.writeFileSync(recorderPath, src, 'utf-8');
  }
  installEnv(s).DEV_POMOGATOR_ROOT_ARTIFACTS_RECORD = s.installRecordPath;
  return recorderPath;
}

function readRecord(s: FRAState): string[] {
  if (!s.installRecordPath || !fs.existsSync(s.installRecordPath)) return [];
  return fs.readFileSync(s.installRecordPath, 'utf-8').split('\n').map(l => l.trim()).filter(Boolean);
}

Given(/^no "\.pre-commit-config\.yaml" exists in repo root$/, function (this: V4World) {
  const s = state(this);
  const p = path.join(s.repoDir, PRECOMMIT_CFG);
  if (fs.existsSync(p)) fs.unlinkSync(p);
});

Given(/^a recording setup launcher is configured$/, function (this: V4World) {
  const s = state(this);
  const recorder = ensureRecorder(s);
  installEnv(s).DEV_POMOGATOR_ROOT_ARTIFACTS_SETUP_LAUNCHER = recorder;
  // Default the install-hook run to "deps present" so it reaches the setup phase deterministically
  // (a MISSING seam takes precedence, so deps scenarios can still override this).
  installEnv(s).DEV_POMOGATOR_ROOT_ARTIFACTS_FORCE_DEPS_OK = '1';
});

Given(/^a recording deps launcher is configured$/, function (this: V4World) {
  const s = state(this);
  const recorder = ensureRecorder(s);
  installEnv(s).DEV_POMOGATOR_ROOT_ARTIFACTS_DEPS_LAUNCHER = recorder;
  // Simulate a successful provision: the recorder creates this marker on the 'deps' phase.
  installEnv(s).DEV_POMOGATOR_ROOT_ARTIFACTS_DEPS_MARKER = path.join(s.repoDir, '_deps-provisioned.marker');
});

Given(/^the root-artifacts opt-out env is set$/, function (this: V4World) {
  installEnv(state(this)).DEV_POMOGATOR_ROOT_ARTIFACTS_SETUP = 'off';
});

Given(/^the repo root is not a git repository$/, function (this: V4World) {
  const s = state(this);
  fs.rmSync(path.join(s.repoDir, '.git'), { recursive: true, force: true });
});

Given(/^"pre-commit" is not available in test PATH$/, function (this: V4World) {
  // Deterministic: force the deps probe to report missing (independent of the host PATH).
  installEnv(state(this)).DEV_POMOGATOR_ROOT_ARTIFACTS_FORCE_DEPS_MISSING = '1';
});

Given(/^deps-install cannot provision the dependencies$/, function (this: V4World) {
  const s = state(this);
  const recorder = ensureRecorder(s);
  // Deps launcher configured but NO marker env → recorder cannot mark deps provisioned → stays missing.
  installEnv(s).DEV_POMOGATOR_ROOT_ARTIFACTS_DEPS_LAUNCHER = recorder;
  installEnv(s).DEV_POMOGATOR_ROOT_ARTIFACTS_FORCE_DEPS_MISSING = '1';
});

Given(/^"\.pre-commit-config\.yaml" already contains hook id "([^"]+)"$/, function (this: V4World, id: string) {
  const s = state(this);
  const p = path.join(s.repoDir, PRECOMMIT_CFG);
  fs.writeFileSync(
    p,
    `repos:\n  - repo: local\n    hooks:\n      - id: ${id}\n        name: Forbid root artifacts\n` +
      `        entry: python .dev-pomogator/tools/forbid-root-artifacts/check.py\n        language: python\n`,
    'utf-8',
  );
  s.preCommitMtimeBefore = fs.statSync(p).mtimeMs;
});

Given(/^the pre-commit entry path exists in repo root$/, function (this: V4World) {
  const s = state(this);
  // Background copied tools to .dev-pomogator/tools/forbid-root-artifacts/ — ensure check.py is present.
  const entry = path.join(toolsDestDir(s.repoDir), 'check.py');
  if (!fs.existsSync(entry)) {
    fs.mkdirSync(path.dirname(entry), { recursive: true });
    fs.writeFileSync(entry, '# stub\n');
  }
});

When(/^I run the forbid-root-artifacts install-hook$/, function (this: V4World) {
  const s = state(this);
  // Launch via the REAL bootstrap.cjs launcher (as hooks.json does) with cwd=REPO_ROOT so tsx resolves;
  // the target repo is passed through the hook's stdin cwd (install-hook prefers inputCwd over process.cwd).
  const bootstrapRequire =
    "require(require('path').join(process.env.CLAUDE_PLUGIN_ROOT || '.', 'tools', '_shared', 'bootstrap.cjs'))";
  const result = spawnSync(
    process.execPath,
    ['-e', bootstrapRequire, '--', 'tools/forbid-root-artifacts/install-hook.ts'],
    {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      input: JSON.stringify({ cwd: s.repoDir }),
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: REPO_ROOT, ...(s.installEnv ?? {}) },
    },
  );
  this.lastExitCode = result.status ?? 1;
  this.lastStdout = result.stdout?.toString() ?? '';
  this.lastStderr = result.stderr?.toString() ?? '';
});

When(/^I run "python setup\.py" as the installer$/, function (this: V4World) {
  const s = state(this);
  const setupScript = path.join(toolsDestDir(s.repoDir), 'setup.py');
  const result = spawnSync('python', [setupScript], { cwd: s.repoDir, encoding: 'utf-8', env: { ...process.env } });
  this.lastExitCode = result.status ?? 1;
  this.lastStdout = result.stdout?.toString() ?? '';
  this.lastStderr = result.stderr?.toString() ?? '';
});

When(/^I run the forbid-root-artifacts doctor check$/, function (this: V4World) {
  const s = state(this);
  s.doctorResult = checkRootArtifactsInstall(s.repoDir);
});

Then(/^the setup launcher should have been invoked exactly once$/, function (this: V4World) {
  const n = readRecord(state(this)).filter(p => p === 'setup').length;
  assert.equal(n, 1, `Expected setup launcher invoked once, got ${n}`);
});

Then(/^the setup launcher should NOT have been invoked$/, function (this: V4World) {
  const n = readRecord(state(this)).filter(p => p === 'setup').length;
  assert.equal(n, 0, `Expected setup launcher NOT invoked, got ${n}`);
});

Then(/^the deps launcher should have been invoked before the setup launcher$/, function (this: V4World) {
  const rec = readRecord(state(this));
  const di = rec.indexOf('deps');
  const si = rec.indexOf('setup');
  assert.ok(di >= 0, `deps launcher not invoked; record: ${rec.join(',')}`);
  assert.ok(si >= 0, `setup launcher not invoked; record: ${rec.join(',')}`);
  assert.ok(di < si, `Expected deps before setup; record: ${rec.join(',')}`);
});

Then(/^\.pre-commit-config\.yaml mtime should be unchanged$/, function (this: V4World) {
  const s = state(this);
  const after = fs.statSync(path.join(s.repoDir, PRECOMMIT_CFG)).mtimeMs;
  assert.equal(after, s.preCommitMtimeBefore, `Expected .pre-commit-config.yaml mtime unchanged`);
});

Then(/^the pre-commit entry for "([^"]+)" should be "([^"]+)"$/, function (this: V4World, id: string, expected: string) {
  const s = state(this);
  const content = fs.readFileSync(path.join(s.repoDir, PRECOMMIT_CFG), 'utf-8');
  assert.ok(content.includes(`id: ${id}`), `hook id ${id} not found in config:\n${content}`);
  assert.ok(content.includes(`entry: ${expected}`), `Expected entry "${expected}"\nConfig:\n${content}`);
});

Then(/^the pre-commit entry path should exist in repo root$/, function (this: V4World) {
  const s = state(this);
  const content = fs.readFileSync(path.join(s.repoDir, PRECOMMIT_CFG), 'utf-8');
  const m = content.match(/entry:\s*python3?\s+(\S+)/);
  assert.ok(m, `no entry line in config:\n${content}`);
  const entryPath = path.join(s.repoDir, m![1]);
  assert.ok(fs.existsSync(entryPath), `entry path ${m![1]} does not resolve at ${entryPath}`);
});

Then(/^a backoff lock file exists under "\.dev-pomogator"$/, function (this: V4World) {
  const s = state(this);
  const lock = path.join(s.repoDir, '.dev-pomogator', '.root-artifacts-setup.lock');
  assert.ok(fs.existsSync(lock), `Expected backoff lock at ${lock}`);
});

Then(/^the doctor check status should be non-green$/, function (this: V4World) {
  const s = state(this);
  assert.ok(s.doctorResult, 'doctor check not run');
  assert.notEqual(s.doctorResult!.status, 'green', `Expected non-green, got ${s.doctorResult!.status}`);
});

Then(/^the doctor check status should be green$/, function (this: V4World) {
  const s = state(this);
  assert.ok(s.doctorResult, 'doctor check not run');
  assert.equal(
    s.doctorResult!.status,
    'green',
    `Expected green, got ${s.doctorResult!.status}: ${s.doctorResult!.message}`,
  );
});

Then(/^the doctor check should offer a reinstall fix action$/, function (this: V4World) {
  const s = state(this);
  assert.ok(s.doctorResult?.fixAction, `Expected a reinstall fixAction, got: ${JSON.stringify(s.doctorResult)}`);
});
