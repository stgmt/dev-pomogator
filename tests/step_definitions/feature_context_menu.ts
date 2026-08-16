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
import { assertLiveEvidence } from '../../tools/live-evidence/validator.mjs';

const REPO_ROOT = process.env.APP_DIR || process.cwd();
const POSTINSTALL_SCRIPT = path.join(REPO_ROOT, 'tools', 'context-menu', 'postinstall.ts');
const LAUNCH_SCRIPT = path.join(REPO_ROOT, 'scripts', 'launch-claude-tui.ps1');
const CODEX_LAUNCH_SCRIPT = path.join(REPO_ROOT, 'scripts', 'launch-Codex-tui.ps1');
const WORKTREE_LAUNCH_SCRIPTS = [
  path.join(REPO_ROOT, 'scripts', 'launch-worktree.ps1'),
  path.join(REPO_ROOT, 'tools', 'devcontainer', 'launch-worktree.ps1'),
];
const INSTALL_CODEX_CONTEXT_MENU_SCRIPT = path.join(REPO_ROOT, 'scripts', 'install-codex-context-menu.ps1');

// ============================================================================
// G8 (FR-6/FR-7) helpers — drive the REAL launch-claude-tui.ps1 via real pwsh,
// isolated from the real ~/.claude.json by redirecting USERPROFILE/HOME to a
// per-scenario temp "fake home" directory (no mocks — real script, real fs).
// ============================================================================

interface G8World extends V4World {
  g8FakeHome?: string;
  g8ClaudeJsonPath?: string;
  g8ClaudeJsonBefore?: string;
  g8CodexConfigPath?: string;
  g8LogPath?: string;
  g8TargetDir?: string;
  g8ExtraPath?: string;
  g8CodexPaneBefore?: Set<string>;
  g8GeneratedCodexPane?: string;
  worktreeLauncherContents?: string[];
  codexOnlyPlan?: import('../../tools/context-menu/postinstall.ts').InstallPlan;
  codexOnlyShellImports?: string;
  fallbackCodexIcon?: Buffer;
  codexExecutableCandidates?: string[];
  codexIconFileCandidates?: string[];
  nilesoftArgs?: readonly string[];
  contextMenuSkillContents?: string[];
  postinstallSource?: string;
  liveUncEvidencePath?: string;
}

function pwshAvailable(): boolean {
  const probe = spawnSync('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], {
    encoding: 'utf-8',
    timeout: 5000,
  });
  return probe.status === 0;
}

function runLaunchScript(world: G8World, extraArgs: string[], scriptPath = LAUNCH_SCRIPT): void {
  const fakeHome = world.g8FakeHome ?? path.join(world.tempDir, 'fake-home');
  fs.mkdirSync(fakeHome, { recursive: true });
  world.g8FakeHome = fakeHome;
  world.g8LogPath = path.join(fakeHome, '.dev-pomogator', 'logs', 'context-menu-launch.log');

  // g8ExtraPath lets a scenario control what `claude` resolves to (e.g. an npm-style shim pair).
  const pathValue = world.g8ExtraPath
    ? world.g8ExtraPath + path.delimiter + (process.env.PATH ?? '')
    : process.env.PATH;

  const result = spawnSync(
    'pwsh',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...extraArgs],
    {
      encoding: 'utf-8',
      timeout: 15000,
      env: {
        ...process.env,
        PATH: pathValue,
        USERPROFILE: fakeHome,
        HOME: fakeHome,
        CONTEXT_MENU_NONINTERACTIVE: '1',
      },
    },
  );
  world.lastExitCode = result.status;
  world.lastStdout = result.stdout || '';
  world.lastStderr = result.stderr || '';
}

const GENERATED_LAUNCHER_DIR = path.join(os.tmpdir(), 'dev-pomogator-launch');

function generatedPanes(pattern: RegExp): string[] {
  if (!fs.existsSync(GENERATED_LAUNCHER_DIR)) return [];
  return fs.readdirSync(GENERATED_LAUNCHER_DIR)
    .filter((name) => pattern.test(name))
    .map((name) => path.join(GENERATED_LAUNCHER_DIR, name));
}

function removeGeneratedPanes(pattern: RegExp): void {
  for (const target of generatedPanes(pattern)) fs.rmSync(target, { force: true });
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

Given(/^the context-menu postinstall source is read$/, function (this: G8World) {
  this.postinstallSource = fs.readFileSync(POSTINSTALL_SCRIPT, 'utf-8');
});

Given(/^a temporary directory exists for context-menu copy test$/, async function (this: V4World) {
  // tempDir already created by World Before hook — nothing extra needed
});

// ============================================================================
// When steps
// ============================================================================

When(/^the Nilesoft winget arguments are generated$/, async function (this: G8World) {
  const mod = await getPostinstall();
  this.nilesoftArgs = mod.NILESOFT_WINGET_ARGS;
});

When(/^the context-menu skill files are read$/, function (this: G8World) {
  this.contextMenuSkillContents = [
    fs.readFileSync(path.join(REPO_ROOT, '.claude', 'skills', 'context-menu', 'SKILL.md'), 'utf-8'),
    fs.readFileSync(path.join(REPO_ROOT, '.agents', 'skills', 'context-menu', 'SKILL.md'), 'utf-8'),
  ];
});

When(/^the Claude NSS content is generated$/, async function (this: V4World) {
  const mod = await getPostinstall();
  this.lastStdout = mod.generateNss();
});

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

Given(/^the launch-Codex-tui\.ps1 script file is read$/, function (this: V4World) {
  this.lastStdout = fs.readFileSync(CODEX_LAUNCH_SCRIPT, 'utf-8');
});

When(/^the worktree launcher scripts are read$/, function (this: G8World) {
  this.worktreeLauncherContents = WORKTREE_LAUNCH_SCRIPTS.map((file) => fs.readFileSync(file, 'utf-8'));
});

When(/^the install-codex-context-menu\.ps1 script file is read$/, function (this: V4World) {
  this.lastStdout = fs.readFileSync(INSTALL_CODEX_CONTEXT_MENU_SCRIPT, 'utf-8');
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

When(/^the combined Nilesoft imports are generated$/, async function (this: V4World) {
  const mod = await getPostinstall();
  this.lastStdout = [
    mod.generateShellImports(),
    mod.generateNss(),
    mod.generateCodexNss(),
  ].join('\n');
});

When(/^the Codex NSS content is generated$/, async function (this: V4World) {
  const mod = await getPostinstall();
  this.lastStdout = mod.generateCodexNss();
});

When(/^the Codex-only postinstall plan is generated$/, async function (this: G8World) {
  const mod = await getPostinstall();
  this.codexOnlyPlan = mod.installPlanForMode('codex-only');
  this.codexOnlyShellImports = mod.generateShellImports('', 'codex-only');
  this.lastStdout = JSON.stringify(this.codexOnlyPlan, null, 2);
});

When(/^the fallback Codex icon is generated$/, async function (this: G8World) {
  const mod = await getPostinstall();
  this.fallbackCodexIcon = mod.generateFallbackCodexIcon();
  this.lastStdout = mod.generateCodexNss();
});

When(/^the Codex executable candidates are generated for a Windows user profile$/, async function (this: G8World) {
  const mod = await getPostinstall();
  this.codexExecutableCandidates = mod.codexExecutableCandidates({
    LOCALAPPDATA: 'C:\\Users\\demo\\AppData\\Local',
    PATH: '',
  });
  this.lastStdout = JSON.stringify(this.codexExecutableCandidates, null, 2);
});

When(/^the Codex icon file candidates are generated for a Windows app install$/, async function (this: G8World) {
  const mod = await getPostinstall();
  const programFiles = path.join(this.tempDir, 'Program Files');
  const codexAppDir = path.join(programFiles, 'WindowsApps', 'OpenAI.Codex_1.2.3.0_x64__2p2nqsd0c76g0', 'app', 'resources');
  fs.mkdirSync(codexAppDir, { recursive: true });
  this.codexIconFileCandidates = mod.codexIconFileCandidates({
    LOCALAPPDATA: 'C:\\Users\\demo\\AppData\\Local',
    ProgramFiles: programFiles,
    PATH: '',
  });
  this.lastStdout = JSON.stringify(this.codexIconFileCandidates, null, 2);
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

Then(/^the shell\.nss content should contain "([^"]+)"$/, function (this: V4World, expected: string) {
  if (!this.lastStdout.includes(expected)) {
    throw new Error(`Expected shell.nss content to contain "${expected}" but got:\n${this.lastStdout}`);
  }
});

Then(/^the generated entries should include "([^"]+)"$/, function (this: V4World, expected: string) {
  if (!this.lastStdout.includes(expected)) {
    throw new Error(`Expected generated entries to include "${expected}" but got:\n${this.lastStdout}`);
  }
});

Then(/^the Codex NSS content should contain exactly (\d+) "item\(" entry$/, function (this: V4World, expectedStr: string) {
  const expected = parseInt(expectedStr, 10);
  const actual = (this.lastStdout.match(/item\(/g) || []).length;
  if (actual !== expected) {
    throw new Error(`Expected exactly ${expected} "item(" entries in Codex NSS but found ${actual}.\nNSS:\n${this.lastStdout}`);
  }
});

Then(/^the Codex NSS content should contain "([^"]+)"$/, function (this: V4World, expected: string) {
  if (!this.lastStdout.includes(expected)) {
    throw new Error(`Expected Codex NSS content to contain "${expected}" but got:\n${this.lastStdout}`);
  }
});

Then(/^the Codex NSS content should not contain "([^"]+)"$/, function (this: V4World, unexpected: string) {
  if (this.lastStdout.includes(unexpected)) {
    throw new Error(`Expected Codex NSS content NOT to contain "${unexpected}" but got:\n${this.lastStdout}`);
  }
});

Then(/^the Codex NSS content should contain the global path home\/\.dev-pomogator\/scripts\/launch-Codex-tui\.ps1$/, function (this: V4World) {
  const homeDir = os.homedir().replace(/\\/g, '/');
  const expectedPath = `${homeDir}/.dev-pomogator/scripts/launch-Codex-tui.ps1`;
  const nss = this.lastStdout.replace(/\\/g, '/');
  if (!nss.includes(expectedPath)) {
    throw new Error(`Expected Codex NSS to contain global path "${expectedPath}"\nNSS (normalized):\n${nss.slice(0, 500)}`);
  }
});

Then(/^the bundled Codex launch script path should end with "([^"]+)"$/, async function (this: V4World, suffix: string) {
  const mod = await getPostinstall();
  const result = mod.bundledCodexLaunchScriptPath();
  const normalPath = result.replace(/\\/g, '/');
  if (!normalPath.endsWith(suffix)) {
    throw new Error(`Expected Codex launch path to end with "${suffix}" but got: ${result}`);
  }
  if (!fs.existsSync(result)) {
    throw new Error(`Expected Codex launch script to exist at: ${result}`);
  }
});

Then(/^the Codex launch script should contain "([^"]+)"$/, function (this: V4World, expected: string) {
  if (!this.lastStdout.includes(expected)) {
    throw new Error(`Expected Codex launch script to contain "${expected}"`);
  }
});

Then(/^the Codex launch script should not contain "([^"]+)"$/, function (this: V4World, unexpected: string) {
  if (this.lastStdout.includes(unexpected)) {
    throw new Error(`Expected Codex launch script NOT to contain "${unexpected}"`);
  }
});

Then(/^the Codex launch script should invoke "codex"$/, function (this: V4World) {
  if (!/\bcodex\b/.test(this.lastStdout)) {
    throw new Error('Expected Codex launch script to invoke codex');
  }
});

Then(/^the Codex-only plan should copy only the Codex launch script$/, function (this: G8World) {
  const plan = this.codexOnlyPlan;
  if (!plan?.copyCodex || plan.copyClaude || plan.launchScripts.length !== 1 || plan.launchScripts[0] !== 'launch-Codex-tui.ps1') {
    throw new Error(`Expected Codex-only plan to copy only launch-Codex-tui.ps1, got:\n${this.lastStdout}`);
  }
});

Then(/^the Codex-only plan should write only "([^"]+)"$/, function (this: G8World, expected: string) {
  const plan = this.codexOnlyPlan;
  if (!plan?.writeCodexNss || plan.writeClaudeNss || plan.nssFiles.length !== 1 || plan.nssFiles[0] !== expected) {
    throw new Error(`Expected Codex-only plan to write only ${expected}, got:\n${this.lastStdout}`);
  }
});

Then(/^the Codex-only plan should install only "([^"]+)"$/, function (this: G8World, expected: string) {
  const plan = this.codexOnlyPlan;
  if (!plan?.writeCodexIcon || plan.iconFiles.length !== 1 || plan.iconFiles[0] !== expected) {
    throw new Error(`Expected Codex-only plan to install only ${expected}, got:\n${this.lastStdout}`);
  }
});

Then(/^the Codex-only shell imports should contain "([^"]+)"$/, function (this: G8World, expected: string) {
  if (!this.codexOnlyShellImports?.includes(expected)) {
    throw new Error(`Expected Codex-only shell imports to contain ${expected}, got:\n${this.codexOnlyShellImports ?? '<missing>'}`);
  }
});

Then(/^the Codex-only shell imports should not contain "([^"]+)"$/, function (this: G8World, unexpected: string) {
  if (this.codexOnlyShellImports?.includes(unexpected)) {
    throw new Error(`Expected Codex-only shell imports not to contain ${unexpected}, got:\n${this.codexOnlyShellImports}`);
  }
});

Then(/^the fallback Codex icon should be a valid ICO file$/, function (this: G8World) {
  const icon = this.fallbackCodexIcon;
  if (!icon) throw new Error('Fallback Codex icon was not generated');
  const valid =
    icon.length > 100 &&
    icon.readUInt16LE(0) === 0 &&
    icon.readUInt16LE(2) === 1 &&
    icon.readUInt16LE(4) === 1 &&
    icon.readUInt8(6) === 32 &&
    icon.readUInt8(7) === 32 &&
    icon.readUInt16LE(12) === 32;
  if (!valid) {
    throw new Error(`Expected a valid single-image 32x32 ICO, got ${icon.length} bytes`);
  }
});

Then(/^the Codex executable candidates should include "([^"]+)"$/, function (this: G8World, expected: string) {
  const normalizedExpected = expected.replace(/\\/g, '/');
  const candidates = this.codexExecutableCandidates ?? [];
  if (!candidates.some((candidate) => candidate.replace(/\\/g, '/').endsWith(normalizedExpected))) {
    throw new Error(`Expected Codex executable candidates to include ${expected}, got:\n${this.lastStdout}`);
  }
});

Then(/^the Codex icon file candidates should include "([^"]+)"$/, function (this: G8World, expected: string) {
  const normalizedExpected = expected.replace(/\\/g, '/');
  const candidates = this.codexIconFileCandidates ?? [];
  if (!candidates.some((candidate) => candidate.replace(/\\/g, '/').endsWith(normalizedExpected))) {
    throw new Error(`Expected Codex icon file candidates to include ${expected}, got:\n${this.lastStdout}`);
  }
});

function normalizedLauncherText(value: string): string {
  return value
    .replace(/[`"',()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

Then(/^the Codex install launcher should contain "([^"]+)"$/, function (this: V4World, expected: string) {
  const normalized = normalizedLauncherText(this.lastStdout);
  if (!normalized.includes(expected)) {
    throw new Error(`Expected Codex install launcher to contain "${expected}".\nNormalized:\n${normalized}`);
  }
});

Then(/^the Codex install launcher should not contain "([^"]+)"$/, function (this: V4World, unexpected: string) {
  const raw = this.lastStdout;
  const normalized = normalizedLauncherText(raw);
  if (raw.includes(unexpected) || normalized.includes(unexpected)) {
    throw new Error(`Expected Codex install launcher not to contain "${unexpected}".`);
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

Given(/^pwsh is available and a temporary Codex config\.toml fixture with no entry for the target directory$/, function (this: G8World) {
  if (!pwshAvailable()) return 'pending';
  const fakeHome = path.join(this.tempDir, 'fake-home');
  fs.mkdirSync(fakeHome, { recursive: true });
  this.g8FakeHome = fakeHome;
  this.g8TargetDir = path.join(this.tempDir, 'target-project');
  fs.mkdirSync(this.g8TargetDir, { recursive: true });

  const codexDir = path.join(fakeHome, '.codex');
  fs.mkdirSync(codexDir, { recursive: true });
  this.g8CodexConfigPath = path.join(codexDir, 'config.toml');
  fs.writeFileSync(
    this.g8CodexConfigPath,
    '[projects."C:\\\\Users\\\\x\\\\unrelated-repo"]\ntrust_level = "trusted"\n',
    'utf-8',
  );

  this.g8ClaudeJsonPath = path.join(fakeHome, '.claude.json');
  this.g8ClaudeJsonBefore = JSON.stringify({ projects: { 'C:/Users/x/unrelated-repo': { hasTrustDialogAccepted: true } } });
  fs.writeFileSync(this.g8ClaudeJsonPath, this.g8ClaudeJsonBefore, 'utf-8');
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

When(/^the launch-Codex-tui\.ps1 script is invoked with -Yolo -NoTui and the target directory$/, function (this: G8World) {
  runLaunchScript(this, ['-Yolo', '-NoTui', '-ProjectDir', this.g8TargetDir!], CODEX_LAUNCH_SCRIPT);
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

Then(/^the generated Claude launcher should set TEST_STATUSLINE_PROJECT with forward slashes$/, function () {
  // UNC-safe: the pane is now a PowerShell launcher (.ps1 run by powershell.exe), not a .cmd —
  // cmd.exe cannot hold a WSL/UNC path as its cwd (0x8007010b). The env var is set the PowerShell
  // way: $env:TEST_STATUSLINE_PROJECT = '<forward-slash path>'.
  const launcherPath = path.join(os.tmpdir(), 'dev-pomogator-launch', 'claude-only-pane.ps1');
  if (!fs.existsSync(launcherPath)) {
    throw new Error(`Expected generated launcher to exist at ${launcherPath}`);
  }
  const content = fs.readFileSync(launcherPath, 'utf-8');
  const line = content.split(/\r?\n/).find((candidate) => candidate.startsWith('$env:TEST_STATUSLINE_PROJECT'));
  if (!line) {
    throw new Error(`Expected generated launcher to set TEST_STATUSLINE_PROJECT. Content:\n${content}`);
  }
  if (line.includes('\\')) {
    throw new Error(`Expected TEST_STATUSLINE_PROJECT to use forward slashes, got: ${line}`);
  }
  if (!line.includes('/')) {
    throw new Error(`Expected TEST_STATUSLINE_PROJECT to contain a normalized path, got: ${line}`);
  }
});

Then(/^the fixture should have hasTrustDialogAccepted true for the target directory$/, function (this: G8World) {
  const raw = fs.readFileSync(this.g8ClaudeJsonPath!, 'utf-8');
  const obj = JSON.parse(raw);
  const dir = fs.realpathSync(this.g8TargetDir!);
  const slashDir = dir.replace(/\\/g, '/');
  const entry = obj.projects?.[dir] ?? obj.projects?.[slashDir] ?? obj.projects?.[this.g8TargetDir!];
  if (!entry || entry.hasTrustDialogAccepted !== true) {
    throw new Error(`Expected ~/.claude.json to have hasTrustDialogAccepted:true for "${dir}" but got:\n${raw}`);
  }
});

Then(/^the fixture should be unchanged$/, function (this: G8World) {
  const raw = fs.readFileSync(this.g8ClaudeJsonPath!, 'utf-8');
  const obj = JSON.parse(raw);
  const dir = fs.realpathSync(this.g8TargetDir!);
  const slashDir = dir.replace(/\\/g, '/');
  const entry = obj.projects?.[dir] ?? obj.projects?.[slashDir] ?? obj.projects?.[this.g8TargetDir!];
  if (entry) {
    throw new Error(`Expected ~/.claude.json to have NO entry for "${dir}" (non-Yolo launch must never write trust) but got:\n${raw}`);
  }
});

Then(/^the Codex config fixture should have trust_level "trusted" for the target directory$/, function (this: G8World) {
  const raw = fs.readFileSync(this.g8CodexConfigPath!, 'utf-8');
  const dir = fs.realpathSync(this.g8TargetDir!);
  const escapedDir = dir.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const acceptedHeaders = [
    `[projects."${escapedDir}"]`,
    `[projects.'${dir}']`,
  ];
  const hasHeader = acceptedHeaders.some((header) => raw.includes(header));
  if (!hasHeader || !raw.includes('trust_level = "trusted"')) {
    throw new Error(`Expected config.toml to trust "${dir}" but got:\n${raw}\nstdout: ${this.lastStdout}\nstderr: ${this.lastStderr}`);
  }
});

Then(/^the Claude trust fixture should be unchanged$/, function (this: G8World) {
  const raw = fs.readFileSync(this.g8ClaudeJsonPath!, 'utf-8');
  if (raw !== this.g8ClaudeJsonBefore) {
    throw new Error(`Expected Claude trust fixture to remain unchanged.\nBefore:\n${this.g8ClaudeJsonBefore}\nAfter:\n${raw}`);
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

// ============================================================================
// @feature16 (GitHub #103 canonical plugin context-menu installation)
// CTXMENU001_30..33
// ============================================================================

Then(/^the Nilesoft winget arguments should equal the canonical Nilesoft\.Shell contract$/, function (this: G8World) {
  const expected = [
    'install', '--exact', '--id', 'Nilesoft.Shell', '--source', 'winget',
    '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity',
  ];
  if (JSON.stringify(this.nilesoftArgs) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected winget args: ${JSON.stringify(this.nilesoftArgs)}`);
  }
});

Then(/^the Nilesoft winget arguments should not contain "([^"]+)"$/, function (this: G8World, value: string) {
  if (this.nilesoftArgs?.includes(value)) {
    throw new Error(`Forbidden winget package id remains: ${value}`);
  }
});

Then(/^both context-menu skills should resolve bootstrap from CLAUDE_PLUGIN_ROOT before process cwd$/, function (this: G8World) {
  const expected = 'process.env.CLAUDE_PLUGIN_ROOT || process.cwd()';
  const invalid = (this.contextMenuSkillContents ?? []).filter((content) =>
    !content.includes(expected) || content.includes("join(process.cwd(),'tools','_shared','bootstrap.cjs')"));
  if ((this.contextMenuSkillContents?.length ?? 0) !== 2 || invalid.length !== 0) {
    throw new Error(`Expected both distributed context-menu skills to use plugin-root-first resolution; invalid=${invalid.length}`);
  }
});

Then(/^Nilesoft availability should be required before every context-menu artifact write$/, function (this: G8World) {
  const source = this.postinstallSource ?? '';
  const mainStart = source.indexOf('export function main');
  const installedCheck = source.indexOf('if (!isNilesoftInstalled())', mainStart);
  const failedInstallCheck = source.indexOf('if (!installNilesoft())', installedCheck);
  const gate = installedCheck >= 0 && failedInstallCheck > installedCheck ? installedCheck : -1;
  const firstWrite = Math.min(
    ...['copyLaunchScript()', 'copyCodexLaunchScript()', 'writeNssFile(', 'ensureCodexIcon()', 'ensureShellImports(']
      .map((needle) => source.indexOf(needle, gate))
      .filter((index) => index >= 0),
  );
  if (gate < 0 || firstWrite < 0 || gate > firstWrite) {
    throw new Error(`Nilesoft availability gate must precede every artifact write: gate=${gate}, firstWrite=${firstWrite}`);
  }
});

Then(/^the Claude NSS should not reference an icon that the install plan does not produce$/, async function (this: V4World) {
  const mod = await getPostinstall();
  const nss = this.lastStdout;
  const images = [...nss.matchAll(/image='@app\.dir\\imports\\([^']+)'/g)].map((match) => match[1]);
  const produced = new Set(mod.installPlanForMode('all').iconFiles);
  const dangling = images.filter((image) => !produced.has(image));
  if (dangling.length !== 0) {
    throw new Error(`Claude NSS contains dangling icon targets: ${dangling.join(', ')}`);
  }
});

// ============================================================================
// @feature15 (Codex/worktree UNC and escaped-path regressions)
// CTXMENU001_26..29
// ============================================================================

Given(/^pwsh is available and no stale generated Codex panes exist$/, function (this: G8World) {
  if (!pwshAvailable()) return 'pending';
  const liveEvidencePath = process.env.DEV_POMOGATOR_LIVE_EVIDENCE?.trim();
  if (process.platform === 'win32' && liveEvidencePath) {
    assertLiveEvidence({
      manifestPath: liveEvidencePath,
      repoRoot: REPO_ROOT,
      expectedScenarios: { CTXMENU001_27: 'PASSED' },
      expectedProfiles: { CTXMENU001_27: 'windows-unc-launch' },
    });
    this.liveUncEvidencePath = liveEvidencePath;
  }
  removeGeneratedPanes(/^codex-only-pane\..*\.(cmd|ps1)$/);
  this.g8CodexPaneBefore = new Set(generatedPanes(/^codex-only-pane\..*\.(cmd|ps1)$/));
});

Given(/^Codex resolves to a PowerShell shim beside a cmd shim$/, function (this: G8World) {
  const binDir = path.join(this.tempDir, 'fake-codex-bin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'codex.ps1'), 'exit 0\n', 'utf-8');
  fs.writeFileSync(path.join(binDir, 'codex.cmd'), '@echo off\r\n', 'utf-8');
  this.g8ExtraPath = binDir;
});

When(/^launch-Codex-tui\.ps1 is invoked non-interactively for a UNC project$/, function (this: G8World) {
  if (process.platform !== 'win32') return 'pending';
  if (!this.liveUncEvidencePath) throw new Error('DEV_POMOGATOR_LIVE_EVIDENCE with CTXMENU001_27 producer proof is required');
  const fakeUnc = `\\\\wsl.localhost\\Ubuntu\\tmp\\ctxmenu-${path.basename(this.tempDir)}`;
  runLaunchScript(this, ['-Yolo', '-NoTui', '-ProjectDir', fakeUnc], CODEX_LAUNCH_SCRIPT);
});

When(/^launch-Codex-tui\.ps1 is invoked non-interactively for a drive project containing percent signs$/, function (this: G8World) {
  const target = path.join(this.tempDir, 'project-%PATH%-literal');
  fs.mkdirSync(target, { recursive: true });
  this.g8TargetDir = target;
  runLaunchScript(this, ['-Yolo', '-NoTui', '-ProjectDir', target], CODEX_LAUNCH_SCRIPT);
});

Then(/^exactly one unique Codex (PowerShell|cmd) pane should exist$/, function (this: G8World, kind: string) {
  const extension = kind === 'PowerShell' ? 'ps1' : 'cmd';
  const panes = generatedPanes(new RegExp(`^codex-only-pane\\..*\\.${extension}$`))
    .filter((pane) => !this.g8CodexPaneBefore?.has(pane));
  if (panes.length !== 1) {
    throw new Error(`Expected exactly one new unique Codex ${extension} pane, found ${panes.length}: ${panes.join(', ')}\nstdout: ${this.lastStdout}\nstderr: ${this.lastStderr}`);
  }
  this.g8GeneratedCodexPane = panes[0];
});

Then(/^the Codex PowerShell pane should set the selected project with Set-Location -LiteralPath$/, function (this: G8World) {
  const content = fs.readFileSync(this.g8GeneratedCodexPane!, 'utf-8');
  if (!content.includes('Set-Location -LiteralPath')) {
    throw new Error(`Expected the real generated PowerShell pane to set a literal project path:\n${content}`);
  }
});

Then(/^the Codex launch script should not pass a UNC project to wt\.exe -d$/, function (this: G8World) {
  const content = fs.readFileSync(CODEX_LAUNCH_SCRIPT, 'utf-8');
  if (/wt\.exe\s+-d\s+\$Dir\s+powershell/i.test(content)) {
    throw new Error('Codex launcher still injects the UNC project into wt.exe -d');
  }
});

Then(/^the Codex cmd pane should preserve the literal selected project path$/, function (this: G8World) {
  const content = fs.readFileSync(this.g8GeneratedCodexPane!, 'utf-8');
  const escaped = this.g8TargetDir!.replace(/%/g, '%%');
  if (!content.includes(escaped) || content.split(/\r?\n/).some((line) => line.includes(this.g8TargetDir!) && !line.includes(escaped))) {
    throw new Error(`Expected percent signs to be escaped in the generated batch pane.\nExpected escaped: ${escaped}\nContent:\n${content}`);
  }
});

Then(/^no generated Codex PowerShell pane should exist$/, function () {
  const panes = generatedPanes(/^codex-only-pane\..*\.ps1$/);
  if (panes.length !== 0) {
    throw new Error(`Expected no Codex PowerShell pane for a drive project, found: ${panes.join(', ')}`);
  }
});

Then(/^every worktree launcher should resolve MainRepoRoot through ProviderPath$/, function (this: G8World) {
  const bad = (this.worktreeLauncherContents ?? []).filter((content) =>
    !content.includes('(Resolve-Path -LiteralPath $MainRepoRoot).ProviderPath') ||
    content.includes('(Resolve-Path $MainRepoRoot).Path'));
  if ((this.worktreeLauncherContents?.length ?? 0) !== 2 || bad.length !== 0) {
    throw new Error(`Expected both real worktree launchers to use ProviderPath; invalid count=${bad.length}`);
  }
});
