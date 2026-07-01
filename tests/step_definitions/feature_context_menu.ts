/**
 * Step definitions for context-menu BDD scenarios.
 * Drives the REAL tools/context-menu/postinstall.ts exports in-process.
 * Feature: .specs/context-menu/context-menu.feature
 * FR coverage: FR-1 (NSS generation), FR-2 (non-Windows skip), FR-3 (copy/resolve), FR-4 (drift guard), FR-5 (artifact)
 */

import { Given, When, Then } from '@cucumber/cucumber';
import type { V4World } from '../hooks/before-after.ts';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.env.APP_DIR || process.cwd();
const POSTINSTALL_SCRIPT = path.join(REPO_ROOT, 'tools', 'context-menu', 'postinstall.ts');
const LAUNCH_SCRIPT = path.join(REPO_ROOT, 'scripts', 'launch-claude-tui.ps1');

// ============================================================================
// G8 (FR-6/FR-7) helpers — drive the REAL launch-claude-tui.ps1 via real pwsh,
// isolated from the real ~/.claude.json by redirecting USERPROFILE/HOME to a
// per-scenario temp "fake home" directory (no mocks — real script, real fs).
// ============================================================================

interface G8World extends V4World {
  g8FakeHome?: string;
  g8ClaudeJsonPath?: string;
  g8LogPath?: string;
  g8TargetDir?: string;
}

function pwshAvailable(): boolean {
  const probe = spawnSync('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], {
    encoding: 'utf-8',
    timeout: 5000,
  });
  return probe.status === 0;
}

function runLaunchScript(world: G8World, extraArgs: string[]): void {
  const fakeHome = world.g8FakeHome ?? path.join(world.tempDir, 'fake-home');
  fs.mkdirSync(fakeHome, { recursive: true });
  world.g8FakeHome = fakeHome;
  world.g8LogPath = path.join(fakeHome, '.dev-pomogator', 'logs', 'context-menu-launch.log');

  const result = spawnSync(
    'pwsh',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', LAUNCH_SCRIPT, ...extraArgs],
    {
      encoding: 'utf-8',
      timeout: 15000,
      env: { ...process.env, USERPROFILE: fakeHome, HOME: fakeHome, CONTEXT_MENU_NONINTERACTIVE: '1' },
    },
  );
  world.lastExitCode = result.status;
  world.lastStdout = result.stdout || '';
  world.lastStderr = result.stderr || '';
}

// Lazily imported real module (import guard prevents side effects)
let postinstallModule: typeof import('../../tools/context-menu/postinstall.ts') | null = null;
async function getPostinstall() {
  if (!postinstallModule) {
    postinstallModule = await import('../../tools/context-menu/postinstall.ts');
  }
  return postinstallModule;
}

// ============================================================================
// Given steps
// ============================================================================

Given(/^the context-menu postinstall module is imported$/, async function (this: V4World) {
  this.lastStdout = '';
  this.lastStderr = '';
  await getPostinstall();
});

Given(/^a temporary directory exists for context-menu copy test$/, async function (this: V4World) {
  // tempDir already created by World Before hook — nothing extra needed
});

// ============================================================================
// When steps
// ============================================================================

When(/^generateNss is called$/, async function (this: V4World) {
  const mod = await getPostinstall();
  this.lastStdout = mod.generateNss();
});

When(/^the postinstall script is executed via tsx$/, function (this: V4World) {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', POSTINSTALL_SCRIPT],
    {
      encoding: 'utf-8',
      cwd: REPO_ROOT,
      timeout: 15000,
      env: { ...process.env, FORCE_COLOR: '0' },
    },
  );
  this.lastExitCode = result.status;
  this.lastStdout = result.stdout || '';
  this.lastStderr = result.stderr || '';
});

When(/^the launch-claude-tui\.ps1 script file is read$/, function (this: V4World) {
  this.lastStdout = fs.readFileSync(LAUNCH_SCRIPT, 'utf-8');
});

When(/^copyLaunchScript is called with an existing source and a temporary destination$/, async function (this: V4World) {
  const mod = await getPostinstall();
  const srcFile = path.join(this.tempDir, 'src-launch.ps1');
  const destFile = path.join(this.tempDir, 'dest', '.dev-pomogator', 'scripts', 'launch-claude-tui.ps1');
  fs.writeFileSync(srcFile, '# sentinel launch script\n', 'utf-8');
  // Store paths in lastStdout/lastStderr for the Then steps (reuse fields)
  this.lastStdout = srcFile;
  this.lastStderr = destFile;
  const ok = mod.copyLaunchScript(srcFile, destFile);
  this.lastExitCode = ok ? 0 : 1;
});

When(/^copyLaunchScript is called with a missing source path$/, async function (this: V4World) {
  const mod = await getPostinstall();
  const missingFile = path.join(this.tempDir, 'nonexistent.ps1');
  const destFile = path.join(this.tempDir, 'dest-should-not-exist.ps1');
  // Store dest path for Then assertion
  this.lastStderr = destFile;
  const ok = mod.copyLaunchScript(missingFile, destFile);
  this.lastExitCode = ok ? 0 : 1;
});

When(/^bundledLaunchScriptPath is called$/, async function (this: V4World) {
  const mod = await getPostinstall();
  this.lastStdout = mod.bundledLaunchScriptPath();
});

// ============================================================================
// Then steps
// ============================================================================

Then(/^the NSS content should contain "([^"]+)"$/, function (this: V4World, expected: string) {
  if (!this.lastStdout.includes(expected)) {
    throw new Error(`Expected NSS content to contain "${expected}" but it did not.\nNSS:\n${this.lastStdout.slice(0, 300)}`);
  }
});

Then(/^the NSS content should not contain "([^"]+)"$/, function (this: V4World, unexpected: string) {
  // Normalize backslashes for comparison (NSS uses Windows paths with backslashes)
  const nss = this.lastStdout.replace(/\\/g, '/');
  const normalUnexpected = unexpected.replace(/\\/g, '/');
  if (nss.includes(normalUnexpected)) {
    throw new Error(`Expected NSS content NOT to contain "${unexpected}" but it did.`);
  }
});

Then(/^the context-menu postinstall exit status should be (\d+)$/, function (this: V4World, expectedStr: string) {
  const expected = parseInt(expectedStr, 10);
  if (this.lastExitCode !== expected) {
    throw new Error(`Expected exit status ${expected} but got ${this.lastExitCode}.\nstdout: ${this.lastStdout}\nstderr: ${this.lastStderr}`);
  }
});

Then(/^the context-menu postinstall stdout should contain "([^"]+)"$/, function (this: V4World, expected: string) {
  if (!this.lastStdout.includes(expected)) {
    throw new Error(`Expected stdout to contain "${expected}" but got:\n${this.lastStdout}`);
  }
});

Then(/^the context-menu postinstall combined output should be non-empty$/, function (this: V4World) {
  const combined = (this.lastStdout + this.lastStderr).trim();
  if (combined.length === 0) {
    throw new Error('Expected non-empty combined output but got empty stdout+stderr');
  }
});

Then(/^the NSS content should contain exactly (\d+) "item\(" entry$/, function (this: V4World, expectedStr: string) {
  const expected = parseInt(expectedStr, 10);
  const actual = (this.lastStdout.match(/item\(/g) || []).length;
  if (actual !== expected) {
    throw new Error(`Expected exactly ${expected} "item(" entries in the NSS but found ${actual}.\nNSS:\n${this.lastStdout}`);
  }
});

Then(/^the launch script should contain "([^"]+)"$/, function (this: V4World, expected: string) {
  if (!this.lastStdout.includes(expected)) {
    throw new Error(`Expected launch script to contain "${expected}"`);
  }
});

Then(/^the launch script should not contain "([^"]+)"$/, function (this: V4World, unexpected: string) {
  if (this.lastStdout.includes(unexpected)) {
    throw new Error(`Expected launch script NOT to contain "${unexpected}"`);
  }
});

Then(/^copyLaunchScript should return true$/, function (this: V4World) {
  if (this.lastExitCode !== 0) {
    throw new Error('Expected copyLaunchScript to return true but it returned false');
  }
});

Then(/^the destination file should exist and match the source$/, function (this: V4World) {
  const srcFile = this.lastStdout;
  const destFile = this.lastStderr;
  if (!fs.existsSync(destFile)) {
    throw new Error(`Expected destination file to exist at: ${destFile}`);
  }
  const srcContent = fs.readFileSync(srcFile, 'utf-8');
  const destContent = fs.readFileSync(destFile, 'utf-8');
  if (srcContent !== destContent) {
    throw new Error('Destination file content does not match source file content');
  }
});

Then(/^copyLaunchScript should return false$/, function (this: V4World) {
  if (this.lastExitCode !== 1) {
    throw new Error('Expected copyLaunchScript to return false but it returned true');
  }
});

Then(/^the destination file should not exist$/, function (this: V4World) {
  const destFile = this.lastStderr;
  if (fs.existsSync(destFile)) {
    throw new Error(`Expected destination NOT to exist but found: ${destFile}`);
  }
});

Then(/^the returned path should end with "([^"]+)"$/, function (this: V4World, suffix: string) {
  const normalPath = this.lastStdout.replace(/\\/g, '/');
  if (!normalPath.endsWith(suffix)) {
    throw new Error(`Expected path to end with "${suffix}" but got: ${this.lastStdout}`);
  }
});

Then(/^the file at that path should exist$/, function (this: V4World) {
  const filePath = this.lastStdout;
  if (!fs.existsSync(filePath)) {
    throw new Error(`Expected file to exist at: ${filePath}`);
  }
});

Then(/^the NSS content should contain the global path home\/\.dev-pomogator\/scripts\/launch-claude-tui\.ps1$/, function (this: V4World) {
  const homeDir = os.homedir().replace(/\\/g, '/');
  const expectedPath = `${homeDir}/.dev-pomogator/scripts/launch-claude-tui.ps1`;
  const nss = this.lastStdout.replace(/\\/g, '/');
  if (!nss.includes(expectedPath)) {
    throw new Error(`Expected NSS to contain global path "${expectedPath}"\nNSS (normalized):\n${nss.slice(0, 500)}`);
  }
});

// ============================================================================
// G8 (FR-6 universal logging / FR-7 trust auto-grant) — CTXMENU001_13..17
// ============================================================================

Given(/^pwsh is available$/, function (this: V4World) {
  if (!pwshAvailable()) return 'pending';
});

Given(/^pwsh is available and wt\.exe is unavailable$/, function (this: V4World) {
  if (!pwshAvailable()) return 'pending';
  // wt.exe genuinely does not exist outside Windows — true on Docker/Linux by construction;
  // on a Windows host with wt.exe installed this scenario would need PATH manipulation, which
  // we do not attempt here (consistent with the existing CTXMENU001_10 sibling scenario).
  if (process.platform === 'win32') return 'pending';
});

Given(/^pwsh is available and a temporary ~\/\.claude\.json fixture with no entry for the target directory$/, function (this: G8World) {
  if (!pwshAvailable()) return 'pending';
  const fakeHome = path.join(this.tempDir, 'fake-home');
  fs.mkdirSync(fakeHome, { recursive: true });
  this.g8FakeHome = fakeHome;
  this.g8TargetDir = path.join(this.tempDir, 'target-project');
  fs.mkdirSync(this.g8TargetDir, { recursive: true });
  this.g8ClaudeJsonPath = path.join(fakeHome, '.claude.json');
  fs.writeFileSync(
    this.g8ClaudeJsonPath,
    JSON.stringify({ projects: { 'C:/Users/x/unrelated-repo': { hasTrustDialogAccepted: true } } }),
    'utf-8',
  );
});

When(/^the launch-claude-tui\.ps1 script is invoked with -NoTui and a project dir$/, function (this: G8World) {
  const dir = this.g8TargetDir ?? this.tempDir;
  runLaunchScript(this, ['-NoTui', '-ProjectDir', dir]);
});

When(/^the launch-claude-tui\.ps1 script is invoked with -Yolo -NoTui and the target directory$/, function (this: G8World) {
  runLaunchScript(this, ['-Yolo', '-NoTui', '-ProjectDir', this.g8TargetDir!]);
});

When(/^the launch-claude-tui\.ps1 script is invoked with -NoTui and the target directory$/, function (this: G8World) {
  runLaunchScript(this, ['-NoTui', '-ProjectDir', this.g8TargetDir!]);
});

Then(/^a log file should be created at ~\/\.dev-pomogator\/logs\/context-menu-launch\.log$/, function (this: G8World) {
  if (!this.g8LogPath || !fs.existsSync(this.g8LogPath)) {
    throw new Error(`Expected log file to exist at: ${this.g8LogPath}\nstdout: ${this.lastStdout}\nstderr: ${this.lastStderr}`);
  }
});

Then(/^the log should contain "([^"]+)"$/, function (this: G8World, expected: string) {
  const logContent = this.g8LogPath && fs.existsSync(this.g8LogPath) ? fs.readFileSync(this.g8LogPath, 'utf-8') : '';
  if (!logContent.includes(expected)) {
    throw new Error(`Expected log to contain "${expected}" but got:\n${logContent}\nstderr: ${this.lastStderr}`);
  }
});

Then(/^the log should contain the resolved project dir$/, function (this: G8World) {
  const logContent = this.g8LogPath && fs.existsSync(this.g8LogPath) ? fs.readFileSync(this.g8LogPath, 'utf-8') : '';
  const dir = this.g8TargetDir ?? this.tempDir;
  const normalizedLog = logContent.replace(/\\/g, '/');
  const normalizedDir = fs.realpathSync(dir).replace(/\\/g, '/');
  if (!normalizedLog.includes(normalizedDir) && !normalizedLog.includes(dir.replace(/\\/g, '/'))) {
    throw new Error(`Expected log to contain project dir "${dir}" but got:\n${logContent}`);
  }
});

Then(/^the fixture should have hasTrustDialogAccepted true for the target directory$/, function (this: G8World) {
  const raw = fs.readFileSync(this.g8ClaudeJsonPath!, 'utf-8');
  const obj = JSON.parse(raw);
  const dir = fs.realpathSync(this.g8TargetDir!);
  const entry = obj.projects?.[dir] ?? obj.projects?.[this.g8TargetDir!];
  if (!entry || entry.hasTrustDialogAccepted !== true) {
    throw new Error(`Expected ~/.claude.json to have hasTrustDialogAccepted:true for "${dir}" but got:\n${raw}`);
  }
});

Then(/^the fixture should be unchanged$/, function (this: G8World) {
  const raw = fs.readFileSync(this.g8ClaudeJsonPath!, 'utf-8');
  const obj = JSON.parse(raw);
  const dir = fs.realpathSync(this.g8TargetDir!);
  const entry = obj.projects?.[dir] ?? obj.projects?.[this.g8TargetDir!];
  if (entry) {
    throw new Error(`Expected ~/.claude.json to have NO entry for "${dir}" (non-Yolo launch must never write trust) but got:\n${raw}`);
  }
});

Then(/^the NSS "([^"]+)" entry command should reference "launch-claude-tui\.ps1"$/, function (this: V4World, title: string) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = this.lastStdout.match(new RegExp(`title='${escaped}'[^)]*args='([^']*)'`));
  if (!match || !match[1].includes('launch-claude-tui.ps1')) {
    throw new Error(`Expected the "${title}" NSS entry args to reference launch-claude-tui.ps1, got:\n${match ? match[1] : '(entry not found)'}`);
  }
});

Then(/^the NSS "([^"]+)" entry command should not call claude directly$/, function (this: V4World, title: string) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = this.lastStdout.match(new RegExp(`title='${escaped}'[^)]*cmd='([^']*)'`));
  if (!match) {
    throw new Error(`Expected to find the "${title}" NSS entry`);
  }
  if (match[1].trim() === 'claude' || match[1].includes('cmd /k claude')) {
    throw new Error(`Expected the "${title}" entry NOT to call claude directly, got cmd='${match[1]}'`);
  }
});
