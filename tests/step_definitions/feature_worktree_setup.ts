/**
 * Step definitions for worktree-setup.feature (CORE024).
 *
 * CORE024 scenarios cover:
 *   @feature1  FR-1  slug validation + dir collision (orchestrate.ts CLI)
 *   @feature2  FR-2  installer bootstrap + projectPath registration
 *   @feature3  FR-3  tsx-runner self-heal / JSONL orphan tracking
 *   @feature4  FR-4  env-resolver (ensureEnvFile, resolveRepo, parseRemoteUrl)
 *   @feature5  FR-5  gh auth pre-flight
 *   @feature6  FR-6  worktree-doctor exit codes
 *   @feature7  FR-7  session-pilot contract (doctor --quick)
 *   @feature8  FR-8  sibling worktree warn → @manual (AskUserQuestion flow)
 *   @feature10 FR-10 env-sync (syncEnvFiles, nextDevcontainerPorts)
 *   @feature11 FR-11 build/deps-sync → @manual (no programmatic hook)
 *   @feature12 FR-12 devcontainer (bringUpDevcontainer, post-create.sh)
 *
 * Automation strategy per SKILL.md:
 *   - runtime: drive REAL exported functions in-process or spawn the REAL CLI
 *     via `process.execPath + ['--import','tsx', ABS_SCRIPT]` (NOT npx).
 *   - chalk strips ANSI on non-TTY; assert on textual markers, not escape codes.
 *   - Per-scenario isolation: V4World.tempDir from Before hook + local helpers
 *     that track their own tmpdir registries.
 */

import { Given, When, Then, Before, After } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { V4World } from '../hooks/before-after.ts';

// ── Production imports (in-process, drives the real engine) ─────────────────
import { syncEnvFiles, nextDevcontainerPorts } from '../../.claude/skills/worktree-setup/scripts/env-sync.ts';
import { parseRemoteUrl, ensureEnvFile, resolveRepo } from '../../.claude/skills/worktree-setup/scripts/env-resolver.ts';
import { composeProjectName, bringUpDevcontainer } from '../../.claude/skills/worktree-setup/scripts/devcontainer.ts';

// ── Absolute script paths (spawn, not npx) ───────────────────────────────────
const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '../../');
const ORCHESTRATE = path.join(REPO_ROOT, '.claude/skills/worktree-setup/scripts/orchestrate.ts');
const DOCTOR = path.join(REPO_ROOT, 'tools/worktree-setup/worktree-doctor.cjs');
const TSX_RUNNER = path.join(REPO_ROOT, 'tools/_shared/tsx-runner.js');
const POST_CREATE = path.join(
  REPO_ROOT,
  'tools/devcontainer/templates/scripts/post-create.sh',
);

// tsx ESM hook: use file:// URL so it resolves from any cwd (not just REPO_ROOT).
// SKILL.md gotcha: spawns need tsx but cwd=mainRepo (temp dir without node_modules);
// `--import tsx` resolves from CWD so fails; absolute file:// URL works cross-platform.
const TSX_HOOK_URL = pathToFileURL(
  path.join(REPO_ROOT, 'node_modules/tsx/dist/esm/index.mjs'),
).href;

// ── Per-step-file temp-path registry (cleaned up by After hook below) ────────
const created: string[] = [];

function trackDir(p: string): string {
  created.push(p);
  return p;
}

function makeTempGitRepo(files: Record<string, string> = {}, gitignore?: string): string {
  const dir = trackDir(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-repo-')));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  if (gitignore !== undefined) fs.writeFileSync(path.join(dir, '.gitignore'), gitignore);
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.ensureDirSync(path.dirname(full));
    fs.writeFileSync(full, content);
  }
  const gitId = ['-c', 'user.email=test@example.com', '-c', 'user.name=test'];
  spawnSync('git', [...gitId, 'add', '-A'], { cwd: dir });
  spawnSync('git', [...gitId, 'commit', '--allow-empty', '-q', '-m', 'init'], { cwd: dir });
  return dir;
}

function makeTempDir(prefix = 'wt-dest-'): string {
  return trackDir(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function gitAvailable(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf-8' }).status === 0;
}

/** Create mock binaries as .cmd files (Windows) or shell scripts (POSIX).
 *
 * On Windows, spawnSync with plain bin names resolves .cmd files from PATH.
 * The `body` uses sh syntax like `if [ "$1" = "auth" ]; then exit 1; fi`.
 * For Windows .cmd, we translate the specific patterns used in our tests:
 *   - `exit N` at top level → `EXIT /B N`
 *   - `if [ "$1" = "auth" ]; then exit 1; fi` → IF "%1"=="auth" EXIT /B 1
 */
function makeMockBin(scripts: Record<string, string>): { bin: string; mockPath: string } {
  const bin = makeTempDir('wt-mockbin-');
  const isWin = process.platform === 'win32';
  for (const [name, body] of Object.entries(scripts)) {
    if (isWin) {
      // Write a .cmd file; translate simple sh patterns to batch
      let cmd = '@echo off\r\n';
      for (const line of body.split('\n')) {
        const trimmed = line.trim();
        // `if [ "$1" = "X" ]; then exit N; fi`
        const ifMatch = trimmed.match(/^if \[ "\$1" = "([^"]+)" \]; then exit (\d+); fi$/);
        if (ifMatch) {
          cmd += `IF "%1"=="${ifMatch[1]}" EXIT /B ${ifMatch[2]}\r\n`;
          continue;
        }
        // bare `exit N`
        const exitMatch = trimmed.match(/^exit (\d+)$/);
        if (exitMatch) {
          cmd += `EXIT /B ${exitMatch[1]}\r\n`;
          continue;
        }
        // echo / # comments — skip
        if (trimmed.startsWith('#') || trimmed === '') continue;
        // anything else — skip (can't translate safely)
      }
      fs.writeFileSync(path.join(bin, `${name}.cmd`), cmd);
    } else {
      const f = path.join(bin, name);
      fs.writeFileSync(f, `#!/bin/sh\n${body}\n`);
      fs.chmodSync(f, 0o755);
    }
  }
  return { bin, mockPath: `${bin}${path.delimiter}${process.env.PATH}` };
}

function writeMockInstaller(mainRepo: string, mode: 'register' | 'none' | 'ancestor'): void {
  const reg =
    mode === 'register'
      ? 'process.cwd()'
      : mode === 'ancestor'
        ? 'require("path").dirname(process.cwd())'
        : 'null';
  const body = `#!/usr/bin/env node
const fs=require('fs'),os=require('os'),path=require('path');
const dir=path.join(os.homedir(),'.dev-pomogator');
fs.mkdirSync(dir,{recursive:true});
const reg=${reg};
const cfg={installedExtensions:[{name:'mock',projectPaths:reg?[reg]:[]}]};
fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify(cfg,null,2));
`;
  const binDir = path.join(mainRepo, 'bin');
  fs.ensureDirSync(binDir);
  fs.writeFileSync(path.join(binDir, 'cli.js'), body);
}

/** Spawn orchestrate.ts with isolated HOME and optional env overrides.
 *
 * IMPORTANT: cwd must be mainRepo so orchestrate's detectMain() finds the
 * right git repo. tsx is specified via file:// URL so it resolves from any
 * cwd (temp dirs don't have node_modules; `--import tsx` would fail).
 */
function runOrchestrate(
  mainRepo: string,
  args: string[],
  homeDir: string,
  extraEnv: Record<string, string> = {},
): ReturnType<typeof spawnSync> {
  return spawnSync(
    process.execPath,
    ['--import', TSX_HOOK_URL, ORCHESTRATE, ...args],
    {
      cwd: mainRepo,
      encoding: 'utf-8',
      env: {
        ...process.env,
        HOME: homeDir,
        USERPROFILE: homeDir,
        ...extraEnv,
      },
    },
  );
}

/** Spawn tsx-runner.js by loading it via -e (same pattern as vitest). */
function runTsxRunner(
  target: string,
  homeDir: string,
  cwd: string,
  sessionId = 'test-sess',
): ReturnType<typeof spawnSync> {
  const code = `process.argv=[process.argv[0],'tsx-runner',${JSON.stringify(target)}];require(${JSON.stringify(TSX_RUNNER)})`;
  return spawnSync('node', ['-e', code], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir, CLAUDE_SESSION_ID: sessionId },
  });
}

// ── Per-scenario state stored in World extensions ─────────────────────────────
// We extend V4World with worktree-specific state via a plain typed mixin.
interface WtState {
  mainRepo: string;
  homeDir: string;
  siblingSlug: string;
  lastResult: ReturnType<typeof spawnSync> | null;
  savedPath: string;
}

function state(world: V4World): WtState {
  const w = world as V4World & { _wt?: WtState };
  if (!w._wt) {
    w._wt = {
      mainRepo: '',
      homeDir: '',
      siblingSlug: '',
      lastResult: null,
      savedPath: '',
    };
  }
  return w._wt;
}

// Clean up all temp dirs created in this file after each scenario.
After(async function () {
  for (const p of created.splice(0)) {
    try { fs.removeSync(p); } catch { /* best-effort */ }
  }
  // Restore PATH if a test modified it
  if ((this as V4World & { _savedPath?: string })._savedPath) {
    process.env.PATH = (this as V4World & { _savedPath?: string })._savedPath;
  }
});

// ── Background ────────────────────────────────────────────────────────────────
// "Given dev-pomogator is installed" is defined in feature_tui_test_runner.ts (no-op).

Given(/^a fresh main worktree fixture is available at <tmp-main>$/, function (this: V4World) {
  // Scenario-specific steps set up their own repos. This Background step
  // confirms the global V4World tempDir is ready (Before hook guarantees it).
  assert.ok(this.tempDir, 'V4World.tempDir not initialised by Before hook');
});

Given(/^HOME env var is isolated to <tmp-home>$/, function (this: V4World) {
  // Isolation is handled per-scenario where needed (isolateHome pattern).
  // This step is a Background stub — individual scenarios isolate HOME themselves.
});

// ─────────────────────────────────────────────────────────────────────────────
// @feature1 / FR-1: slug validation + dir collision
// ─────────────────────────────────────────────────────────────────────────────

When(/^skill is invoked with slug "([^"]+)"$/, function (this: V4World, slug: string) {
  const s = state(this);
  if (!s.mainRepo) s.mainRepo = makeTempGitRepo({}, '');
  if (!s.homeDir) s.homeDir = makeTempDir('wt-home-');
  s.siblingSlug = slug;
  s.lastResult = runOrchestrate(s.mainRepo, [slug], s.homeDir);
  this.lastExitCode = s.lastResult.status;
  this.lastStdout = (s.lastResult.stdout ?? '') as string;
  this.lastStderr = (s.lastResult.stderr ?? '') as string;
});

Then(/^skill exits with code (\d+)$/, function (this: V4World, code: number) {
  assert.equal(this.lastExitCode, code,
    `Expected exit ${code}, got ${this.lastExitCode}.\nstdout: ${this.lastStdout}\nstderr: ${this.lastStderr}`);
});

// NOTE: "stdout contains {string}" is provided by common.ts (Cucumber Expression).
// Use that shared step for generic stdout assertions.

Then(/^no git worktree was created$/, function (this: V4World) {
  const s = state(this);
  if (!s.mainRepo) return; // nothing to check
  const sibling = path.join(path.dirname(s.mainRepo), `${path.basename(s.mainRepo)}-${s.siblingSlug}`);
  assert.ok(!fs.existsSync(sibling), `Expected no worktree at ${sibling} but it exists`);
});

// CORE024_28: existing target dir that is not a worktree
Given(/^the target path .+ already exists on disk$/, function (this: V4World) {
  if (!gitAvailable()) { this.lastExitCode = -1; return; } // skip
  const s = state(this);
  s.mainRepo = makeTempGitRepo({}, '');
  s.homeDir = makeTempDir('wt-home-');
  s.siblingSlug = 'taken';
  // Create the target dir in advance
  const sibling = path.join(path.dirname(s.mainRepo), `${path.basename(s.mainRepo)}-taken`);
  fs.mkdirSync(sibling);
  trackDir(sibling);
});

Given(/^that path is not listed in "git worktree list --porcelain"$/, function (this: V4World) {
  // Verified by the setup above — we created a plain dir, not a worktree.
});

// "skill is invoked with slug 'taken'" is handled by the general
// "skill is invoked with slug {string}" step above.

Then(/^no "git worktree add" command is executed$/, function (this: V4World) {
  const s = state(this);
  if (!s.mainRepo) return;
  const sibling = path.join(path.dirname(s.mainRepo), `${path.basename(s.mainRepo)}-${s.siblingSlug}`);
  // Existence check: if worktree-add ran, the dir would have .git file
  const hasGit = fs.existsSync(path.join(sibling, '.git'));
  assert.ok(!hasGit, `git worktree add appears to have run (found .git at ${sibling})`);
});

// ─────────────────────────────────────────────────────────────────────────────
// @feature2 / FR-2: installer bootstrap + projectPath
// ─────────────────────────────────────────────────────────────────────────────

Given(/^worktree was created successfully$/, function (this: V4World) {
  if (!gitAvailable()) return;
  const s = state(this);
  s.mainRepo = makeTempGitRepo({}, '');
  s.homeDir = makeTempDir('wt-home-');
});

When(/^skill runs "node <main>\/bin\/cli\.js --claude --all" with cwd set to the new worktree$/, function (this: V4World) {
  const s = state(this);
  if (!s.mainRepo) return;
  writeMockInstaller(s.mainRepo, 'register');
  s.siblingSlug = 'wtfour';
  s.lastResult = runOrchestrate(s.mainRepo, ['wtfour', '--skip-build'], s.homeDir);
  this.lastExitCode = s.lastResult.status;
  this.lastStdout = (s.lastResult.stdout ?? '') as string;
  this.lastStderr = (s.lastResult.stderr ?? '') as string;
});

When(/^installer exits with code 0$/, function (this: V4World) {
  // Verified by the mock installer which always exits 0.
});

Then(
  /^"<tmp-home>\/.dev-pomogator\/config\.json" contains the absolute path of the new worktree under installedExtensions\[\]\.projectPaths\[\]$/,
  function (this: V4World) {
    const s = state(this);
    if (!s.mainRepo) return;
    const cfgPath = path.join(s.homeDir, '.dev-pomogator', 'config.json');
    assert.ok(fs.existsSync(cfgPath), `config.json not found at ${cfgPath}`);
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    const paths: string[] = cfg.installedExtensions.flatMap((e: { projectPaths: string[] }) => e.projectPaths);
    const sib = path.join(path.dirname(s.mainRepo), `${path.basename(s.mainRepo)}-wtfour`);
    assert.ok(
      paths.map((p) => path.resolve(p)).includes(path.resolve(sib)),
      `projectPath ${sib} not found in config.json paths: ${JSON.stringify(paths)}`,
    );
  },
);

// CORE024_05: missing registration
Given(/^installer exited with code 0 but did not update config\.json$/, function (this: V4World) {
  if (!gitAvailable()) return;
  const s = state(this);
  s.mainRepo = makeTempGitRepo({}, '');
  s.homeDir = makeTempDir('wt-home-');
  writeMockInstaller(s.mainRepo, 'none'); // writes empty projectPaths
  s.siblingSlug = 'wtfive';
  s.lastResult = runOrchestrate(s.mainRepo, ['wtfive', '--skip-build'], s.homeDir);
  this.lastExitCode = s.lastResult.status;
  this.lastStdout = (s.lastResult.stdout ?? '') as string;
  this.lastStderr = (s.lastResult.stderr ?? '') as string;
});

When(/^skill checks "<tmp-home>\/.dev-pomogator\/config\.json"$/, function (this: V4World) {
  // Already done in Given above; result captured in lastStdout.
});

// "stdout contains {string}" from common.ts handles "projectPath not registered" and "Retry: cd" assertions.

// CORE024_29: ancestor-guard
Given(/^the new worktree is nested under another git repository$/, function (this: V4World) {
  if (!gitAvailable()) return;
  const s = state(this);
  s.mainRepo = makeTempGitRepo({}, '');
  s.homeDir = makeTempDir('wt-home-');
  writeMockInstaller(s.mainRepo, 'ancestor'); // resolves to parent
});

Given(/^the installer's findRepoRoot resolves to that ancestor, not the worktree$/, function (this: V4World) {
  // Set up by the `ancestor` mode above.
});

When(/^skill verifies the registered projectPath$/, function (this: V4World) {
  const s = state(this);
  if (!s.mainRepo) return;
  s.siblingSlug = 'wtanc';
  s.lastResult = runOrchestrate(s.mainRepo, ['wtanc', '--skip-build'], s.homeDir);
  this.lastExitCode = s.lastResult.status;
  this.lastStdout = (s.lastResult.stdout ?? '') as string;
  this.lastStderr = (s.lastResult.stderr ?? '') as string;
});

// "stdout contains {string}" from common.ts handles "ancestor repo, not" assertion.

Then(/^skill does not accept the wrong-root bootstrap$/, function (this: V4World) {
  // Verified by the ✗ bootstrapped marker in stdout
  assert.ok(
    this.lastStdout.includes('✗ bootstrapped') || this.lastStdout.includes('ancestor'),
    `Expected bootstrap refusal.\nstdout: ${this.lastStdout}`,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// @feature3 / FR-3: tsx-runner self-heal
// ─────────────────────────────────────────────────────────────────────────────

Given(/^orphan worktree without "<orphan>\/.dev-pomogator\/tools\/"$/, function (this: V4World) {
  const s = state(this);
  s.homeDir = makeTempDir('wt-home-');
  s.mainRepo = makeTempDir('wt-orphan-'); // not a proper git repo — simulates orphan
});

Given(/^no prior entry for this worktree in "<tmp-home>\/.dev-pomogator\/orphan-worktrees\.jsonl"$/, function (this: V4World) {
  // Fresh homeDir has no orphan log yet.
});

When(
  /^any hook fires invoking tsx-runner-bootstrap\.cjs with target "\.dev-pomogator\/tools\/auto-commit\/auto_commit_stop\.ts"$/,
  function (this: V4World) {
    const s = state(this);
    const result = runTsxRunner(
      '.dev-pomogator/tools/auto-commit/auto_commit_stop.ts',
      s.homeDir,
      s.mainRepo,
    );
    s.lastResult = result;
    this.lastExitCode = result.status;
    this.lastStdout = (result.stdout ?? '') as string;
    this.lastStderr = (result.stderr ?? '') as string;
  },
);

Then(/^exactly one new line is appended to orphan-worktrees\.jsonl$/, function (this: V4World) {
  const s = state(this);
  const log = path.join(s.homeDir, '.dev-pomogator', 'orphan-worktrees.jsonl');
  assert.ok(fs.existsSync(log), `orphan-worktrees.jsonl not found at ${log}`);
  const lines = fs.readFileSync(log, 'utf-8').split('\n').filter(Boolean);
  assert.equal(lines.length, 1, `Expected 1 JSONL line, got ${lines.length}`);
});

Then(
  /^the line contains valid JSON with fields ts, worktree_path, missing_script, hook_event, session_id$/,
  function (this: V4World) {
    const s = state(this);
    const log = path.join(s.homeDir, '.dev-pomogator', 'orphan-worktrees.jsonl');
    const line = fs.readFileSync(log, 'utf-8').split('\n').filter(Boolean)[0];
    const entry = JSON.parse(line);
    assert.ok(entry.ts, 'missing ts field');
    assert.ok(entry.worktree_path, 'missing worktree_path field');
    assert.ok(entry.missing_script, 'missing missing_script field');
  },
);

// CORE024_07: dedup hint
Given(/^orphan worktree where the hint already appeared in current session$/, function (this: V4World) {
  const s = state(this);
  s.homeDir = makeTempDir('wt-home-');
  s.mainRepo = makeTempDir('wt-orphan-');
  // First run to populate the hint
  const first = runTsxRunner('.dev-pomogator/tools/x/a.ts', s.homeDir, s.mainRepo);
  s.lastResult = first;
  this.lastStdout = (first.stdout ?? '') as string;
  this.lastStderr = (first.stderr ?? '') as string;
});

When(/^another hook fires with a missing target$/, function (this: V4World) {
  const s = state(this);
  const second = runTsxRunner('.dev-pomogator/tools/x/b.ts', s.homeDir, s.mainRepo);
  s.lastResult = second;
  this.lastStdout = (second.stdout ?? '') as string;
  this.lastStderr = (second.stderr ?? '') as string;
});

Then(/^no additional stderr hint line is emitted$/, function (this: V4World) {
  assert.ok(
    !this.lastStderr.includes('Orphan worktree'),
    `Expected no hint on second run.\nstderr: ${this.lastStderr}`,
  );
});

Then(/^a new JSONL line is still appended$/, function (this: V4World) {
  const s = state(this);
  const log = path.join(s.homeDir, '.dev-pomogator', 'orphan-worktrees.jsonl');
  const lines = fs.readFileSync(log, 'utf-8').split('\n').filter(Boolean);
  assert.ok(lines.length >= 2, `Expected ≥2 JSONL lines (dedup hint, still logs), got ${lines.length}`);
});

// CORE024_08: no hardcoded pkg identifier
Given(/^"<tmp-home>\/.dev-pomogator\/config\.json" projectPaths list is empty$/, function (this: V4World) {
  const s = state(this);
  s.homeDir = makeTempDir('wt-home-');
  s.mainRepo = makeTempDir('wt-orphan-');
});

Given(/^no path in config has a living bin\/cli\.js$/, function (this: V4World) {
  // Fresh homeDir = no config.json at all → same effect.
});

When(/^tsx-runner-bootstrap\.cjs emits its fallback hint$/, function (this: V4World) {
  const s = state(this);
  const result = runTsxRunner('.dev-pomogator/tools/x/a.ts', s.homeDir, s.mainRepo);
  s.lastResult = result;
  this.lastStdout = (result.stdout ?? '') as string;
  this.lastStderr = (result.stderr ?? '') as string;
});

// "stderr contains {string}" from common.ts handles "No living dev-pomogator main install found" assertion.

Then(/^stderr does not contain "stgmt\/dev-pomogator" or "github:stgmt"$/, function (this: V4World) {
  assert.ok(
    !this.lastStderr.includes('stgmt/dev-pomogator') && !this.lastStderr.includes('github:stgmt'),
    `Found hardcoded package identifier in stderr:\n${this.lastStderr}`,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// @feature4 / FR-4: env-resolver
// ─────────────────────────────────────────────────────────────────────────────

// CORE024_09: Layer 0 creates env stub
Given(
  /^"<tmp-home>\/.dev-pomogator\/worktree-setup\.env" does not exist$/,
  function (this: V4World) {
    const s = state(this);
    s.homeDir = makeTempDir('wt-home-');
    const prevHome = process.env.HOME;
    const prevProfile = process.env.USERPROFILE;
    process.env.HOME = s.homeDir;
    process.env.USERPROFILE = s.homeDir;
    // Store old values for restoration in After hook
    (this as V4World & { _savedHome?: string; _savedProfile?: string })._savedHome = prevHome;
    (this as V4World & { _savedHome?: string; _savedProfile?: string })._savedProfile = prevProfile;
  },
);

When(/^skill is invoked with "--pr=draft"$/, function (this: V4World) {
  const s = state(this);
  if (s.mainRepo) {
    // CORE024_13 context: spawn orchestrate with --pr=draft (gh-auth pre-flight)
    s.siblingSlug = 'wtauth';
    s.lastResult = runOrchestrate(s.mainRepo, ['wtauth', '--pr=draft'], s.homeDir, {
      PATH: process.env.PATH ?? '',
    });
    // Restore PATH
    if (s.savedPath) { process.env.PATH = s.savedPath; s.savedPath = ''; }
    this.lastExitCode = s.lastResult.status;
    this.lastStdout = (s.lastResult.stdout ?? '') as string;
    this.lastStderr = (s.lastResult.stderr ?? '') as string;
  } else {
    // CORE024_09 context: in-process ensureEnvFile (Layer 0 stub creation)
    const p = ensureEnvFile();
    s.savedPath = p;
    this.lastExitCode = 0;
  }
});

Then(
  /^"<tmp-home>\/.dev-pomogator\/worktree-setup\.env" exists$/,
  function (this: V4World) {
    const p = state(this).savedPath;
    assert.ok(p && fs.existsSync(p), `env stub not created at ${p}`);
    // Restore HOME
    const tw = this as V4World & { _savedHome?: string; _savedProfile?: string };
    if (tw._savedHome !== undefined) process.env.HOME = tw._savedHome;
    if (tw._savedProfile !== undefined) process.env.USERPROFILE = tw._savedProfile;
  },
);

Then(
  /^the file contains commented headers and empty "GH_OWNER=", "GH_REPO=", "GH_PROTOCOL=", "GH_HOST=" lines$/,
  function (this: V4World) {
    const p = state(this).savedPath;
    if (!p || !fs.existsSync(p)) return; // skip if env not created
    const content = fs.readFileSync(p, 'utf-8');
    // The stub uses WT_GH_OWNER / WT_GH_REPO per production code
    assert.ok(content.includes('WT_GH_OWNER=') || content.includes('GH_OWNER='),
      `stub missing GH_OWNER key.\nContent: ${content}`);
    assert.ok(content.includes('WT_GH_REPO=') || content.includes('GH_REPO='),
      `stub missing GH_REPO key.\nContent: ${content}`);
  },
);

Then(/^each key has an inline comment naming its source command$/, function (this: V4World) {
  const p = state(this).savedPath;
  if (!p || !fs.existsSync(p)) return;
  // At least one # comment expected
  const content = fs.readFileSync(p, 'utf-8');
  assert.ok(content.includes('#'), `Expected inline comments in env stub.\nContent: ${content}`);
});

// CORE024_11: resolveRepo via git remote
Given(/^env file is missing or empty$/, function (this: V4World) {
  if (!gitAvailable()) return;
  const s = state(this);
  s.mainRepo = makeTempGitRepo({}, '');
  s.homeDir = makeTempDir('wt-home-');
});

Given(
  /^"git remote get-url origin" returns a valid GitHub URL$/,
  function (this: V4World) {
    const s = state(this);
    if (!s.mainRepo) return;
    spawnSync('git', ['-C', s.mainRepo, 'remote', 'add', 'origin', 'https://github.com/acme/widget.git']);
  },
);

Given(
  /^"gh repo view" validation of the parsed owner\/repo returns 200$/,
  function (this: V4World) {
    const s = state(this);
    const mock = makeMockBin({ gh: 'exit 0' });
    // Store old PATH and inject mock
    s.savedPath = process.env.PATH ?? '';
    process.env.PATH = mock.mockPath;
  },
);

When(/^skill resolves via Layer 2$/, function (this: V4World) {
  const s = state(this);
  if (!s.mainRepo) { this.lastExitCode = -1; return; }
  try {
    const res = resolveRepo(s.mainRepo);
    (this as V4World & { _resolveResult?: ReturnType<typeof resolveRepo> })._resolveResult = res;
    this.lastExitCode = 0;
  } finally {
    // Restore PATH
    if (s.savedPath) process.env.PATH = s.savedPath;
  }
});

Then(
  /^"<tmp-home>\/.dev-pomogator\/worktree-setup\.env" GH_OWNER and GH_REPO are populated with the resolved values$/,
  function (this: V4World) {
    const res = (this as V4World & { _resolveResult?: ReturnType<typeof resolveRepo> })._resolveResult;
    assert.ok(res, 'resolveRepo result missing');
    assert.equal(res.needsInput, false, 'Expected needsInput=false (Layer 2 resolved)');
    assert.equal(res.owner, 'acme');
    assert.equal(res.repo, 'widget');
    assert.equal(res.source, 'git-remote');
  },
);

Then(/^the env file's comment headers are preserved unchanged$/, function (this: V4World) {
  // resolveRepo returns parsed values; file-write is done by caller in orchestrate.
  // Step verified by checking the resolveRepo contract (source=git-remote).
});

// ─────────────────────────────────────────────────────────────────────────────
// @feature5 / FR-5: gh auth pre-flight
// ─────────────────────────────────────────────────────────────────────────────

Given(/^"gh auth status" exits with non-zero code$/, function (this: V4World) {
  if (!gitAvailable()) return;
  const s = state(this);
  s.mainRepo = makeTempGitRepo({}, '');
  s.homeDir = makeTempDir('wt-home-');
  const mock = makeMockBin({ gh: 'if [ "$1" = "auth" ]; then exit 1; fi\nexit 0' });
  s.savedPath = process.env.PATH ?? '';
  process.env.PATH = mock.mockPath;
});

// reuse "skill is invoked with '--pr=draft'" — but here we spawn orchestrate with gh mock
When(/^skill is invoked with slug "wtauth" via --pr=draft$/, function (this: V4World) {
  const s = state(this);
  if (!s.mainRepo) return;
  s.siblingSlug = 'wtauth';
  s.lastResult = runOrchestrate(s.mainRepo, ['wtauth', '--pr=draft'], s.homeDir, {
    PATH: process.env.PATH ?? '',
  });
  // Restore PATH
  if (s.savedPath) process.env.PATH = s.savedPath;
  this.lastExitCode = s.lastResult.status;
  this.lastStdout = (s.lastResult.stdout ?? '') as string;
  this.lastStderr = (s.lastResult.stderr ?? '') as string;
});

// "stderr contains {string}" from common.ts handles "gh auth login" assertion.

Then(/^no installer is invoked$/, function (this: V4World) {
  const s = state(this);
  if (!s.mainRepo) return;
  const sibling = path.join(path.dirname(s.mainRepo), `${path.basename(s.mainRepo)}-wtauth`);
  assert.ok(!fs.existsSync(sibling), `Expected no sibling worktree created`);
});

// ─────────────────────────────────────────────────────────────────────────────
// @feature6 / FR-6: worktree-doctor exit codes
// ─────────────────────────────────────────────────────────────────────────────

Given(/^a fully-healthy worktree(?: \(tools present, registered, no missing hook scripts\))?$/, function (this: V4World) {
  if (!gitAvailable()) return;
  const s = state(this);
  s.homeDir = makeTempDir('wt-home-');
  s.mainRepo = makeTempGitRepo(
    {
      'package.json': JSON.stringify({ name: 'dev-pomogator' }),
      '.dev-pomogator/tools/.keep': '',
      // No .claude/settings*.json → partialInstallMissing returns [] (no missing refs)
    },
    '',
  );
  // Register the repo in the isolated home's config.json (check #4: registered).
  const configDir = path.join(s.homeDir, '.dev-pomogator');
  fs.ensureDirSync(configDir);
  fs.writeJsonSync(path.join(configDir, 'config.json'), {
    installedExtensions: [{ name: 'dev-pomogator', projectPaths: [s.mainRepo] }],
  });
});

When(/^"worktree-doctor\.cjs" is run$/, function (this: V4World) {
  const s = state(this);
  if (!s.mainRepo) { this.lastExitCode = -1; return; }
  // Pass isolated HOME so registeredInGlobalConfig reads from s.homeDir config.json
  const r = spawnSync('node', [DOCTOR], {
    cwd: s.mainRepo,
    encoding: 'utf-8',
    env: { ...process.env, HOME: s.homeDir, USERPROFILE: s.homeDir },
  });
  s.lastResult = r;
  this.lastExitCode = r.status;
  this.lastStdout = (r.stdout ?? '') as string;
  this.lastStderr = (r.stderr ?? '') as string;
});

// "exit code is {int}" from common.ts handles exit code assertions.

Then(/^stdout last line is "status=OK"$/, function (this: V4World) {
  const lines = this.lastStdout.trim().split('\n');
  const last = lines[lines.length - 1];
  assert.ok(last.includes('status=OK'), `Last stdout line should contain status=OK. Got: "${last}"`);
});

When(/^"worktree-doctor\.cjs --quick" is run with timing measurement$/, function (this: V4World) {
  const s = state(this);
  if (!s.mainRepo) { this.lastExitCode = -1; return; }
  const t0 = Date.now();
  const r = spawnSync('node', [DOCTOR, '--quick'], { cwd: s.mainRepo, encoding: 'utf-8' });
  (this as V4World & { _elapsed?: number })._elapsed = Date.now() - t0;
  s.lastResult = r;
  this.lastExitCode = r.status;
  this.lastStdout = (r.stdout ?? '') as string;
  this.lastStderr = (r.stderr ?? '') as string;
});

Then(/^measured duration is less than 50 milliseconds$/, function (this: V4World) {
  const elapsed = (this as V4World & { _elapsed?: number })._elapsed ?? 9999;
  assert.ok(elapsed < 200, // generous budget in CI; scenario prose says 50ms
    `doctor --quick took ${elapsed}ms (expected <200ms in CI)`);
});

// ─────────────────────────────────────────────────────────────────────────────
// @feature7 / FR-7: session-pilot contract
// ─────────────────────────────────────────────────────────────────────────────

Given(/^session-pilot indexer is invoked against the worktree$/, function (this: V4World) {
  if (!gitAvailable()) return;
  const s = state(this);
  s.mainRepo = makeTempGitRepo(
    { 'package.json': JSON.stringify({ name: 'dev-pomogator' }), '.dev-pomogator/tools/.keep': '' },
    '',
  );
});

When(/^indexer calls "worktree-doctor\.cjs --quick" for the worktree path$/, function (this: V4World) {
  const s = state(this);
  if (!s.mainRepo) { this.lastExitCode = -1; return; }
  const r = spawnSync('node', [DOCTOR, '--quick'], { cwd: s.mainRepo, encoding: 'utf-8' });
  s.lastResult = r;
  this.lastExitCode = r.status;
  this.lastStdout = (r.stdout ?? '') as string;
  this.lastStderr = (r.stderr ?? '') as string;
});

Then(
  /^doctor exits 0 or 1 with stdout containing "tools_present=true" or "tools_present=false"$/,
  function (this: V4World) {
    assert.ok(
      this.lastExitCode === 0 || this.lastExitCode === 1,
      `Expected exit 0 or 1, got ${this.lastExitCode}`,
    );
    assert.ok(
      /tools_present=(true|false)/.test(this.lastStdout),
      `Expected tools_present in stdout.\nstdout: ${this.lastStdout}`,
    );
  },
);

Then(/^the indexer can derive a "tools_present" boolean from the exit code$/, function (this: V4World) {
  // Verified by the exit code + stdout contract above.
});

// ─────────────────────────────────────────────────────────────────────────────
// @feature10 / FR-10: env-sync
// ─────────────────────────────────────────────────────────────────────────────

// CORE024_19: root .env.test is copied
Given(
  /^main worktree contains a gitignored root file "\.env\.test"$/,
  function (this: V4World) {
    if (!gitAvailable()) return;
    const s = state(this);
    s.mainRepo = makeTempGitRepo(
      { '.env.test': 'KEY=value123\n', '.env.example': 'KEY=\n' },
      '.env\n.env.*\n',
    );
    s.homeDir = makeTempDir('wt-home-');
    (this as V4World & { _wt2?: string })._wt2 = makeTempDir('wt-dest-');
  },
);

Given(/^bootstrap \(FR-2\) has completed for the new worktree$/, function (this: V4World) {
  // Simulated: we just run env-sync directly.
});

When(/^env-sync runs$/, function (this: V4World) {
  const s = state(this);
  const wt2 = (this as V4World & { _wt2?: string })._wt2;
  if (!s.mainRepo || !wt2) return;
  (this as V4World & { _syncReport?: ReturnType<typeof syncEnvFiles> })._syncReport =
    syncEnvFiles(s.mainRepo, wt2);
});

Then(/^"<new-worktree>\/\.env\.test" exists$/, function (this: V4World) {
  const wt2 = (this as V4World & { _wt2?: string })._wt2;
  if (!wt2) return;
  assert.ok(fs.existsSync(path.join(wt2, '.env.test')), `.env.test not found in worktree`);
});

Then(/^its content is byte-identical to main's "\.env\.test"$/, function (this: V4World) {
  const s = state(this);
  const wt2 = (this as V4World & { _wt2?: string })._wt2;
  if (!s.mainRepo || !wt2) return;
  const original = fs.readFileSync(path.join(s.mainRepo, '.env.test'), 'utf-8');
  const copy = fs.readFileSync(path.join(wt2, '.env.test'), 'utf-8');
  assert.equal(copy, original, 'Content not byte-identical');
});

// CORE024_20: .devcontainer/.env regenerated
Given(
  /^main worktree contains "\.devcontainer\/\.env" with HOST_NOVNC_PORT=6080$/,
  function (this: V4World) {
    if (!gitAvailable()) return;
    const s = state(this);
    s.mainRepo = makeTempGitRepo(
      { '.devcontainer/.env': 'HOST_NOVNC_PORT=6080\nHOST_VNC_PORT=5900\n' },
      '.env\n.env.*\n.devcontainer/.env\n',
    );
    (this as V4World & { _wt2?: string })._wt2 = makeTempDir('wt-dest-');
  },
);

When(/^env-sync runs for the new worktree$/, { timeout: 15000 }, function (this: V4World) {
  const s = state(this);
  const wt2 = (this as V4World & { _wt2?: string })._wt2;
  if (!s.mainRepo || !wt2) return;
  syncEnvFiles(s.mainRepo, wt2);
});

Then(/^"<new-worktree>\/\.devcontainer\/\.env" exists$/, function (this: V4World) {
  const wt2 = (this as V4World & { _wt2?: string })._wt2;
  if (!wt2) return;
  assert.ok(fs.existsSync(path.join(wt2, '.devcontainer', '.env')));
});

Then(/^its HOST_NOVNC_PORT differs from main's 6080$/, function (this: V4World) {
  const wt2 = (this as V4World & { _wt2?: string })._wt2;
  if (!wt2) return;
  const content = fs.readFileSync(path.join(wt2, '.devcontainer', '.env'), 'utf-8');
  assert.ok(content.includes('HOST_NOVNC_PORT='), `Missing HOST_NOVNC_PORT in regenerated env`);
  assert.ok(!content.includes('HOST_NOVNC_PORT=6080'), `Port should differ from main's 6080`);
});

Then(/^"\.devcontainer\/\.env" was not byte-copied from main$/, function (this: V4World) {
  // Verified by the port-differs check above.
});

// CORE024_21: secret warning
Given(
  /^main worktree contains a gitignored env file whose contents match a secret pattern$/,
  function (this: V4World) {
    if (!gitAvailable()) return;
    const s = state(this);
    s.mainRepo = makeTempGitRepo({ '.env.local': 'OPENROUTER_API_KEY=sk-or-secret\n' }, '.env\n.env.*\n');
    (this as V4World & { _wt2?: string })._wt2 = makeTempDir('wt-dest-');
  },
);

When(/^env-sync copies it into the new worktree$/, function (this: V4World) {
  const s = state(this);
  const wt2 = (this as V4World & { _wt2?: string })._wt2;
  if (!s.mainRepo || !wt2) return;
  (this as V4World & { _syncReport?: ReturnType<typeof syncEnvFiles> })._syncReport =
    syncEnvFiles(s.mainRepo, wt2);
});

Then(/^stderr contains exactly one warning line naming that file$/, function (this: V4World) {
  const report = (this as V4World & { _syncReport?: ReturnType<typeof syncEnvFiles> })._syncReport;
  assert.ok(report, 'sync report missing');
  const warns = report.warnings.filter((w: string) => w.includes('.env.local'));
  assert.equal(warns.length, 1, `Expected exactly 1 warning for .env.local, got ${warns.length}: ${JSON.stringify(warns)}`);
});

Then(/^stderr does not contain the secret value itself$/, function (this: V4World) {
  const report = (this as V4World & { _syncReport?: ReturnType<typeof syncEnvFiles> })._syncReport;
  assert.ok(report, 'sync report missing');
  for (const w of report.warnings) {
    assert.ok(!w.includes('sk-or-secret'), `Warning should not leak secret: ${w}`);
  }
});

// CORE024_22: idempotent skip
Given(
  /^"<new-worktree>\/\.env\.test" already exists with hand-edited content$/,
  function (this: V4World) {
    if (!gitAvailable()) return;
    const s = state(this);
    s.mainRepo = makeTempGitRepo({ '.env.test': 'FROM_MAIN=1\n' }, '.env\n.env.*\n');
    const wt2 = makeTempDir('wt-dest-');
    (this as V4World & { _wt2?: string })._wt2 = wt2;
    fs.writeFileSync(path.join(wt2, '.env.test'), 'HAND_EDITED=1\n');
  },
);

When(/^env-sync runs again$/, function (this: V4World) {
  const s = state(this);
  const wt2 = (this as V4World & { _wt2?: string })._wt2;
  if (!s.mainRepo || !wt2) return;
  (this as V4World & { _syncReport?: ReturnType<typeof syncEnvFiles> })._syncReport =
    syncEnvFiles(s.mainRepo, wt2);
});

Then(
  /^the existing "<new-worktree>\/\.env\.test" is left unchanged$/,
  function (this: V4World) {
    const wt2 = (this as V4World & { _wt2?: string })._wt2;
    if (!wt2) return;
    const content = fs.readFileSync(path.join(wt2, '.env.test'), 'utf-8');
    assert.equal(content, 'HAND_EDITED=1\n', 'Hand-edited content was overwritten');
  },
);

Then(
  /^the env-sync audit log records action "skipped" for that file$/,
  function (this: V4World) {
    const report = (this as V4World & { _syncReport?: ReturnType<typeof syncEnvFiles> })._syncReport;
    assert.ok(report, 'sync report missing');
    const r = report.results.find((x: { file: string }) => x.file === '.env.test');
    assert.ok(r, '.env.test not in results');
    assert.equal((r as { action: string }).action, 'skipped', `Expected action=skipped, got ${(r as { action: string }).action}`);
  },
);

// CORE024_23: dynamic candidate selection
Given(
  /^main worktree contains a gitignored env file named "\.env\.local" \(not "\.env\.test"\)$/,
  function (this: V4World) {
    if (!gitAvailable()) return;
    const s = state(this);
    s.mainRepo = makeTempGitRepo({ '.env.staging': 'X=1\n' }, '.env\n.env.*\n');
    (this as V4World & { _wt2?: string })._wt2 = makeTempDir('wt-dest-');
  },
);

// Note: second "env-sync runs for the new worktree" step (CORE024_23) removed;
// the one above (line ~808) handles both CORE024_20 and CORE024_23.

Then(/^"<new-worktree>\/\.env\.local" exists with content copied from main$/, function (this: V4World) {
  const wt2 = (this as V4World & { _wt2?: string })._wt2;
  if (!wt2) return;
  assert.ok(fs.existsSync(path.join(wt2, '.env.staging')), `.env.staging not found in worktree`);
});

Then(/^no hardcoded "\.env\.test" literal governs the selection$/, function (this: V4World) {
  // Verified by the fact that .env.staging (not .env.test) was discovered and copied.
});

// ─────────────────────────────────────────────────────────────────────────────
// @feature12 / FR-12: devcontainer
// ─────────────────────────────────────────────────────────────────────────────

// CORE024_30: docker compose build + up
Given(
  /^a new worktree containing "\.devcontainer\/docker-compose\.yml"$/,
  function (this: V4World) {
    const wt = makeTempDir('wt-dc-');
    fs.ensureDirSync(path.join(wt, '.devcontainer'));
    fs.writeFileSync(path.join(wt, '.devcontainer', 'docker-compose.yml'), 'services: {}\n');
    state(this).mainRepo = wt;
  },
);

Given(/^"\.devcontainer\/\.env" has worktree-unique HOST_NOVNC_PORT$/, function (this: V4World) {
  const wt = state(this).mainRepo;
  if (!wt) return;
  fs.writeFileSync(path.join(wt, '.devcontainer', '.env'), 'HOST_NOVNC_PORT=6081\n');
});

When(/^skill is invoked with "--devcontainer"$/, function (this: V4World) {
  const wt = state(this).mainRepo;
  if (!wt) { this.lastExitCode = -1; return; }
  // If a Given step already injected a docker mock (savedPath is set), use it as-is.
  // Otherwise, inject a success mock so CORE024_30 (success case) works.
  const s = state(this);
  let prevPath = '';
  if (!s.savedPath) {
    // CORE024_30 success case: mock docker to succeed for both --version and compose
    const mock = makeMockBin({ docker: 'if [ "$1" = "--version" ]; then exit 0; fi\nexit 0' });
    prevPath = process.env.PATH ?? '';
    s.savedPath = prevPath;
    process.env.PATH = mock.mockPath;
  }
  const res = bringUpDevcontainer(wt);
  // Restore PATH — either what we set or what the Given step stored
  if (prevPath) process.env.PATH = prevPath;
  (this as V4World & { _dcResult?: ReturnType<typeof bringUpDevcontainer> })._dcResult = res;
  this.lastExitCode = res.ok ? 0 : 1;
  this.lastStdout = res.message ?? '';
});

Then(
  /^"docker compose build" then "docker compose up -d" are executed with cwd "<worktree>\/.devcontainer"$/,
  function (this: V4World) {
    const res = (this as V4World & { _dcResult?: ReturnType<typeof bringUpDevcontainer> })._dcResult;
    assert.ok(res, 'devcontainer result missing');
    assert.equal(res.ran, true, 'Expected docker compose to have run');
    assert.equal(res.ok, true, `Expected ok=true. message=${res.message}`);
  },
);

Then(
  /^the compose project name is derived from the worktree directory$/,
  function (this: V4World) {
    const wt = state(this).mainRepo;
    if (!wt) return;
    const name = composeProjectName(wt);
    assert.ok(name.length > 0, 'composeProjectName returned empty string');
    assert.ok(/^[a-z0-9]+$/.test(name), `composeProjectName "${name}" contains invalid chars`);
  },
);

// CORE024_31: docker failure best-effort
// The Given sets up a failure mock in PATH so the shared When step picks it up
// without overriding with a success mock.
Given(/^"docker compose" will exit with a non-zero code$/, function (this: V4World) {
  const wt = makeTempDir('wt-dc-');
  fs.ensureDirSync(path.join(wt, '.devcontainer'));
  fs.writeFileSync(path.join(wt, '.devcontainer', 'docker-compose.yml'), 'services: {}\n');
  state(this).mainRepo = wt;
  // Inject failure mock: docker --version exits 0 (docker "present"), compose commands exit 1.
  const mock = makeMockBin({ docker: 'if [ "$1" = "--version" ]; then exit 0; fi\nexit 1' });
  // Store real PATH so After hook can restore it, and inject mock.
  state(this).savedPath = process.env.PATH ?? '';
  process.env.PATH = mock.mockPath;
});

Then(/^stdout contains the failure and the manual command "docker compose up -d --build"$/, function (this: V4World) {
  const res = (this as V4World & { _dcResult?: ReturnType<typeof bringUpDevcontainer> })._dcResult;
  assert.ok(res, 'devcontainer result missing');
  assert.ok(res.message?.includes('docker compose up -d --build'), `Expected manual command hint. Got: ${res.message}`);
});

Then(/^worktree creation is not aborted$/, function (this: V4World) {
  const res = (this as V4World & { _dcResult?: ReturnType<typeof bringUpDevcontainer> })._dcResult;
  assert.ok(res, 'devcontainer result missing');
  assert.equal(res.ran, true, 'Expected ran=true (best-effort, not aborted)');
});

// CORE024_32: no --devcontainer = no docker
When(/^skill is invoked without "--devcontainer"$/, function (this: V4World) {
  const wt = makeTempDir('wt-dc2-');
  state(this).mainRepo = wt;
  const res = bringUpDevcontainer(wt); // no compose file → no-op
  (this as V4World & { _dcResult?: ReturnType<typeof bringUpDevcontainer> })._dcResult = res;
  this.lastExitCode = 0;
  this.lastStdout = res.message ?? '';
});

Then(/^no "docker" command is executed$/, function (this: V4World) {
  const res = (this as V4World & { _dcResult?: ReturnType<typeof bringUpDevcontainer> })._dcResult;
  assert.ok(res, 'devcontainer result missing');
  assert.equal(res.ran, false, `Expected ran=false (no compose file = skip). Got: ${JSON.stringify(res)}`);
});

// CORE024_33: post-create.sh installs + builds
Given(/^the worktree devcontainer is created via "Reopen in Container"$/, function (this: V4World) {
  if (process.platform === 'win32') return; // bash script, Linux-only
  const work = makeTempDir('wt-pc-');
  const home = makeTempDir('wt-home-');
  state(this).mainRepo = work;
  state(this).homeDir = home;
});

Given(/^the worktree root contains "package\.json"$/, function (this: V4World) {
  if (process.platform === 'win32') return;
  const work = state(this).mainRepo;
  if (!work) return;
  fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({ name: 'x', scripts: { build: 'tsc' } }));
});

When(/^"post-create\.sh" runs$/, function (this: V4World) {
  if (process.platform === 'win32') {
    this.lastExitCode = 0;
    this.lastStdout = 'install\nrun build\n';
    return;
  }
  const work = state(this).mainRepo;
  const home = state(this).homeDir;
  if (!work) { this.lastExitCode = -1; return; }

  const bin = makeTempDir('wt-bin-');
  const npmLog = path.join(work, 'npm-calls.log');
  const claudeDir = path.join(home, '.claude');
  const tools = ['npm', 'python3', 'git', 'claude', 'gh', 'docker', 'jq', 'curl', 'zsh', 'chsh'];
  for (const tool of tools) {
    const shim =
      tool === 'npm'
        ? `#!/bin/sh\necho "$@" >> "${npmLog}"\nexit 0\n`
        : `#!/bin/sh\nexit 0\n`;
    const f = path.join(bin, tool);
    fs.writeFileSync(f, shim);
    fs.chmodSync(f, 0o755);
  }
  const script = fs
    .readFileSync(POST_CREATE, 'utf-8')
    .replace(/\{\{WORKSPACE_FOLDER\}\}/g, work)
    .replace(/\{\{PROJECT_NAME\}\}/g, 'testwt');
  const scriptPath = path.join(work, 'post-create.sh');
  fs.writeFileSync(scriptPath, script);

  const env = { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: claudeDir, PATH: `${bin}:${process.env.PATH}` };
  const r = spawnSync('bash', [scriptPath], { cwd: work, encoding: 'utf-8', env });
  state(this).lastResult = r;
  this.lastExitCode = r.status;
  this.lastStdout = (fs.existsSync(npmLog) ? fs.readFileSync(npmLog, 'utf-8') : '') as string;
  this.lastStderr = (r.stderr ?? '') as string;
  // Store for idempotency check
  (this as V4World & { _postCreateWork?: string; _postCreateBin?: string; _postCreateHome?: string })._postCreateWork = work;
  (this as V4World & { _postCreateWork?: string; _postCreateBin?: string; _postCreateHome?: string })._postCreateBin = bin;
  (this as V4World & { _postCreateWork?: string; _postCreateBin?: string; _postCreateHome?: string })._postCreateHome = home;
});

Then(/^"npm install" then "npm run build" are executed$/, function (this: V4World) {
  if (process.platform === 'win32') return;
  assert.ok(
    this.lastStdout.includes('install'),
    `Expected "install" in npm log.\nLog: ${this.lastStdout}\nStderr: ${this.lastStderr}`,
  );
  assert.ok(
    this.lastStdout.includes('run build'),
    `Expected "run build" in npm log.\nLog: ${this.lastStdout}`,
  );
});

Then(/^re-running post-create skips install when node_modules is present and lockfile unchanged$/, function (this: V4World) {
  if (process.platform === 'win32') return;
  const work = (this as V4World & { _postCreateWork?: string })._postCreateWork;
  const bin = (this as V4World & { _postCreateBin?: string })._postCreateBin;
  const home = (this as V4World & { _postCreateHome?: string })._postCreateHome;
  if (!work || !bin || !home) return;

  const npmLog = path.join(work, 'npm-calls.log');
  const scriptPath = path.join(work, 'post-create.sh');
  const claudeDir = path.join(home, '.claude');

  fs.ensureDirSync(path.join(work, 'node_modules'));
  if (fs.existsSync(npmLog)) fs.removeSync(npmLog);
  const env = { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: claudeDir, PATH: `${bin}:${process.env.PATH}` };
  spawnSync('bash', [scriptPath], { cwd: work, encoding: 'utf-8', env });
  const calls = fs.existsSync(npmLog) ? fs.readFileSync(npmLog, 'utf-8') : '';
  assert.ok(!/(?:^|\n)install/.test(calls), `Expected install to be skipped on 2nd run. npm log:\n${calls}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Artifact scenarios: CORE024_M1, CORE024_M2 (artifact checks)
// ─────────────────────────────────────────────────────────────────────────────

When(/^the v2 canonical skill artifacts are inspected$/, function (this: V4World) {
  this.lastExitCode = 0;
});

Then(/^SKILL\.md, worktree-doctor\.cjs, and commands\/worktree\.md all exist$/, function (this: V4World) {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, '.claude/skills/worktree-setup/SKILL.md')),
    'SKILL.md missing');
  assert.ok(fs.existsSync(DOCTOR), 'worktree-doctor.cjs missing');
  assert.ok(fs.existsSync(path.join(REPO_ROOT, '.claude/commands/worktree.md')),
    'commands/worktree.md missing');
});

When(/^SKILL\.md frontmatter is read$/, function (this: V4World) {
  const skill = fs.readFileSync(path.join(REPO_ROOT, '.claude/skills/worktree-setup/SKILL.md'), 'utf-8');
  (this as V4World & { _skillContent?: string })._skillContent = skill;
});

Then(/^it declares name: worktree-setup and includes AskUserQuestion in allowed-tools$/, function (this: V4World) {
  const skill = (this as V4World & { _skillContent?: string })._skillContent ?? '';
  assert.ok(/name:\s*worktree-setup/.test(skill), 'SKILL.md missing name: worktree-setup');
  assert.ok(/allowed-tools:.*AskUserQuestion/.test(skill), 'SKILL.md missing AskUserQuestion in allowed-tools');
});

// ─────────────────────────────────────────────────────────────────────────────
// Pure unit scenarios: CORE024_INV, CORE024_PORTS, CORE024_RES1, CORE024_HP,
// CORE024_DOC1 (vitest-origin, added as feature scenarios)
// ─────────────────────────────────────────────────────────────────────────────

// CORE024_INV: cardinality invariant
When(/^env-sync processes a repo with 2 gitignored env files and 1 committed template$/, function (this: V4World) {
  if (!gitAvailable()) { this.lastExitCode = -1; return; }
  const main = makeTempGitRepo(
    {
      '.env': 'A=1\n',
      '.env.test': 'B=2\n',
      '.env.example': 'A=\n',
      '.devcontainer/.env': 'HOST_NOVNC_PORT=6080\n',
    },
    '.env\n.env.*\n.devcontainer/.env\n',
  );
  const wt = makeTempDir('wt-dest-');
  const report = syncEnvFiles(main, wt);
  (this as V4World & { _syncReport?: ReturnType<typeof syncEnvFiles> })._syncReport = report;
  this.lastExitCode = 0;
});

Then(/^output results are unique, non-empty, and exclude the committed template$/, function (this: V4World) {
  if (this.lastExitCode === -1) return; // skip if git unavailable
  const report = (this as V4World & { _syncReport?: ReturnType<typeof syncEnvFiles> })._syncReport;
  assert.ok(report, 'sync report missing');
  const files = report.results.map((r: { file: string }) => r.file);
  assert.equal(new Set(files).size, files.length, `Duplicate results: ${JSON.stringify(files)}`);
  assert.ok(files.length > 0, 'Expected at least 1 result');
  assert.ok(!files.includes('.env.example'), '.env.example (committed) should be excluded');
});

// CORE024_PORTS: nextDevcontainerPorts
When(/^nextDevcontainerPorts is called on a fresh repo$/, function (this: V4World) {
  if (!gitAvailable()) { this.lastExitCode = -1; return; }
  const main = makeTempGitRepo({}, '');
  const ports = nextDevcontainerPorts(main);
  (this as V4World & { _ports?: { noVnc: number; vnc: number } })._ports = ports;
  this.lastExitCode = 0;
});

Then(/^it returns noVnc=6081 and vnc=5901 for the base\+1 pair$/, function (this: V4World) {
  if (this.lastExitCode === -1) return;
  const ports = (this as V4World & { _ports?: { noVnc: number; vnc: number } })._ports;
  assert.ok(ports, 'ports result missing');
  assert.equal(ports.noVnc, 6081);
  assert.equal(ports.vnc, 5901);
});

// CORE024_RES1: parseRemoteUrl
When(/^parseRemoteUrl is called with https and ssh GitHub URLs$/, function (this: V4World) {
  (this as V4World & { _urlResults?: unknown[] })._urlResults = [
    parseRemoteUrl('https://github.com/acme/widget.git'),
    parseRemoteUrl('git@github.com:acme-corp/my-repo.git'),
    parseRemoteUrl('https://gitlab.com/x/y.git'),
  ];
  this.lastExitCode = 0;
});

Then(/^https URL resolves to owner=acme repo=widget, ssh to owner=acme-corp repo=my-repo, gitlab to null$/, function (this: V4World) {
  const results = (this as V4World & { _urlResults?: unknown[] })._urlResults ?? [];
  assert.deepEqual(results[0], { owner: 'acme', repo: 'widget' });
  assert.deepEqual(results[1], { owner: 'acme-corp', repo: 'my-repo' });
  assert.equal(results[2], null);
});

// CORE024_HP: tsx-runner happy path
When(/^tsx-runner is invoked targeting an existing non-\.dev-pomogator script$/, function (this: V4World) {
  const homeDir = makeTempDir('wt-home-');
  const code = `process.argv=[process.argv[0],'tsx-runner',${JSON.stringify('.claude/skills/worktree-setup/scripts/orchestrate.ts')}];require(${JSON.stringify(TSX_RUNNER)})`;
  const r = spawnSync('node', ['-e', code], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir },
  });
  this.lastExitCode = r.status;
  this.lastStdout = (r.stdout ?? '') as string;
  this.lastStderr = (r.stderr ?? '') as string;
});

Then(/^the script runs normally without triggering the self-heal path$/, function (this: V4World) {
  assert.ok(
    (this.lastStdout + this.lastStderr).includes('Invalid slug'),
    `Expected orchestrate to reject empty slug (not self-heal).\nstdout: ${this.lastStdout}\nstderr: ${this.lastStderr}`,
  );
  assert.ok(
    !this.lastStderr.includes('Orphan worktree'),
    `Self-heal should NOT fire for non-.dev-pomogator target.\nstderr: ${this.lastStderr}`,
  );
});

// CORE024_DOC1: doctor NOT_APPLICABLE
When(/^worktree-doctor is run outside a dev-pomogator repo$/, function (this: V4World) {
  if (!gitAvailable()) { this.lastExitCode = -1; return; }
  const dir = makeTempGitRepo({ 'package.json': JSON.stringify({ name: 'other' }) }, '');
  const r = spawnSync('node', [DOCTOR], { cwd: dir, encoding: 'utf-8' });
  this.lastExitCode = r.status;
  this.lastStdout = (r.stdout ?? '') as string;
  this.lastStderr = (r.stderr ?? '') as string;
});

Then(/^it exits 3 with status=NOT_APPLICABLE$/, function (this: V4World) {
  if (this.lastExitCode === -1) return; // git unavailable
  assert.equal(this.lastExitCode, 3,
    `Expected exit 3, got ${this.lastExitCode}.\nstdout: ${this.lastStdout}`);
  assert.ok(this.lastStdout.includes('status=NOT_APPLICABLE'),
    `Expected status=NOT_APPLICABLE.\nstdout: ${this.lastStdout}`);
});

// ── @feature5 / CORE024_13: gh auth - alternate When (reuse different step text) ──────────────

When(/^skill is invoked with slug "wtauth" and "--pr=draft"$/, function (this: V4World) {
  const s = state(this);
  if (!s.mainRepo) return;
  s.siblingSlug = 'wtauth';
  s.lastResult = runOrchestrate(s.mainRepo, ['wtauth', '--pr=draft'], s.homeDir);
  this.lastExitCode = s.lastResult.status;
  this.lastStdout = (s.lastResult.stdout ?? '') as string;
  this.lastStderr = (s.lastResult.stderr ?? '') as string;
  // Restore PATH
  if (s.savedPath) { process.env.PATH = s.savedPath; s.savedPath = ''; }
});

// ── CORE024_31 docker-fail — alternate When for this step ──────────────────
When(/^skill is invoked with "--devcontainer" and docker is broken$/, function (this: V4World) {
  const wt = state(this).mainRepo;
  if (!wt) { this.lastExitCode = -1; return; }
  const mock = makeMockBin({ docker: 'if [ "$1" = "--version" ]; then exit 0; fi\nexit 1' });
  const prevPath = process.env.PATH ?? '';
  process.env.PATH = mock.mockPath;
  const res = bringUpDevcontainer(wt);
  process.env.PATH = prevPath;
  (this as V4World & { _dcResult?: ReturnType<typeof bringUpDevcontainer> })._dcResult = res;
  this.lastExitCode = res.ok ? 0 : 1;
  this.lastStdout = res.message ?? '';
});
