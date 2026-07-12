#!/usr/bin/env npx tsx
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';

type CheckStatus = 'pass' | 'fail' | 'warn';

interface Check {
  id: string;
  status: CheckStatus;
  detail: string;
}

interface Marketplace {
  plugins?: Array<{
    name?: string;
    source?: { source?: string; path?: string };
    policy?: { installation?: string; authentication?: string };
    category?: string;
  }>;
  'x-dev-pomogator-whitelist'?: Array<{
    pluginName?: string;
    featureSlug?: string;
    status?: string;
    codexManifestPath?: string;
    specPath?: string;
    runtimeContracts?: string[];
    verificationEvidence?: string[];
  }>;
}

interface PluginManifest {
  name?: string;
  version?: string;
  description?: string;
  interface?: { displayName?: string };
  skills?: string;
  hooks?: unknown;
  rules?: unknown;
  commands?: unknown;
}

const repoRoot = findRepoRoot(process.cwd());
const marketplacePath = path.join(repoRoot, '.agents', 'plugins', 'marketplace.json');
const manifestPath = path.join(repoRoot, '.codex-plugin', 'plugin.json');
const codexLaunchPath = path.join(repoRoot, 'scripts', 'launch-Codex-tui.ps1');
const claudeLaunchPath = path.join(repoRoot, 'scripts', 'launch-claude-tui.ps1');
const postinstallPath = path.join(repoRoot, 'tools', 'context-menu', 'postinstall.ts');
const installLauncherPath = path.join(repoRoot, 'scripts', 'install-codex-context-menu.ps1');

const checks: Check[] = [];

function findRepoRoot(start: string): string {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, 'package.json')) && fs.existsSync(path.join(current, '.specs'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(start);
    current = parent;
  }
}

function add(id: string, status: CheckStatus, detail: string): void {
  checks.push({ id, status, detail });
}

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch (error) {
    add(`json:${path.relative(repoRoot, filePath)}`, 'fail', (error as Error).message);
    return null;
  }
}

function exists(relativePath: string): boolean {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function hasBatchShimExitLoggingGuard(content: string, exitLoggerName: string): boolean {
  return (
    content.includes('function Format-BatchCommand') &&
    content.includes("if ($Executable -match '\\.(cmd|bat)$') { 'call ' }") &&
    content.includes('Format-BatchCommand -Executable') &&
    content.includes(exitLoggerName)
  );
}

function hasSafeVersionProbe(content: string, unsafeProbe: string, safeProbe: string): boolean {
  return !content.includes(unsafeProbe) && content.includes(safeProbe);
}

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, '');
}

function parseJsonOutput<T>(stdout: string): T | null {
  const clean = stripAnsi(stdout).trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(clean.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

function runCodex(args: string[], env?: NodeJS.ProcessEnv) {
  return spawnSync('codex', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: env ? { ...process.env, ...env } : process.env,
    shell: process.platform === 'win32',
    timeout: 90000,
  });
}

function processDetail(result: ReturnType<typeof runCodex>): string {
  return stripAnsi(result.error?.message || result.stderr || result.stdout || `exit ${result.status}`).trim();
}

function addSkippedCodexInstallChecks(reason: string): void {
  for (const id of [
    'codex-cli.marketplace-add',
    'codex-cli.available-list',
    'codex-cli.plugin-add',
    'codex-cli.installed-list',
  ]) {
    add(id, 'warn', `real Codex install check skipped: ${reason}`);
  }
}

const marketplace = fs.existsSync(marketplacePath) ? readJson<Marketplace>(marketplacePath) : null;
if (!marketplace) {
  add('marketplace.exists', 'fail', '.agents/plugins/marketplace.json is missing or invalid');
} else {
  add('marketplace.exists', 'pass', '.agents/plugins/marketplace.json exists and parses');
}

const manifest = fs.existsSync(manifestPath) ? readJson<PluginManifest>(manifestPath) : null;
if (!manifest) {
  add('manifest.exists', 'fail', '.codex-plugin/plugin.json is missing or invalid');
} else {
  add('manifest.exists', 'pass', '.codex-plugin/plugin.json exists and parses');
}

const pluginEntries = marketplace?.plugins ?? [];
const firstPlugin = pluginEntries[0];
if (firstPlugin?.name === 'context-menu') {
  add('marketplace.first-plugin', 'pass', 'first marketplace plugin is context-menu');
} else {
  add('marketplace.first-plugin', 'fail', `first marketplace plugin is ${firstPlugin?.name ?? '<missing>'}`);
}

if (
  firstPlugin?.source?.source === 'local' &&
  firstPlugin.source.path === './' &&
  firstPlugin.policy?.installation === 'AVAILABLE' &&
  firstPlugin.policy.authentication === 'ON_INSTALL' &&
  typeof firstPlugin.category === 'string' &&
  firstPlugin.category.length > 0
) {
  add('marketplace.official-fields', 'pass', 'context-menu marketplace entry has source, policy, and category');
} else {
  add('marketplace.official-fields', 'fail', 'context-menu marketplace entry is missing required marketplace fields');
}

const whitelistEntries = marketplace?.['x-dev-pomogator-whitelist'] ?? [];
const firstWhitelist = whitelistEntries[0];
if (firstWhitelist?.pluginName === 'context-menu' && firstWhitelist.featureSlug === 'context-menu') {
  add('whitelist.first-entry', 'pass', 'first whitelist entry is context-menu');
} else {
  add('whitelist.first-entry', 'fail', `first whitelist entry is ${firstWhitelist?.pluginName ?? '<missing>'}`);
}

if (firstWhitelist?.status === 'Supported') {
  add('whitelist.status', 'pass', 'context-menu is marked Supported');
} else {
  add('whitelist.status', 'fail', `context-menu status is ${firstWhitelist?.status ?? '<missing>'}`);
}

if (firstWhitelist?.codexManifestPath === '.codex-plugin/plugin.json') {
  add('whitelist.manifest-path', 'pass', 'Codex manifest path is .codex-plugin/plugin.json');
} else {
  add('whitelist.manifest-path', 'fail', `Codex manifest path is ${firstWhitelist?.codexManifestPath ?? '<missing>'}`);
}

if (firstWhitelist?.specPath === '.specs/context-menu' && exists('.specs/context-menu')) {
  add('whitelist.spec-link', 'pass', 'context-menu whitelist links to .specs/context-menu');
} else {
  add('whitelist.spec-link', 'fail', `spec link is ${firstWhitelist?.specPath ?? '<missing>'}`);
}

if (manifest?.name === 'context-menu') {
  add('manifest.name', 'pass', 'manifest name matches the whitelisted plugin');
} else {
  add('manifest.name', 'fail', `manifest name is ${manifest?.name ?? '<missing>'}`);
}

if (manifest?.skills && exists(manifest.skills.replace(/^\.\//, ''))) {
  add('manifest.skills', 'pass', `skills path exists: ${manifest.skills}`);
} else {
  add('manifest.skills', 'fail', `skills path is missing: ${manifest?.skills ?? '<missing>'}`);
}

if (manifest?.skills === './.codex-plugin/skills') {
  const skillsDir = path.join(repoRoot, '.codex-plugin', 'skills');
  const skillNames = fs.existsSync(skillsDir)
    ? fs.readdirSync(skillsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    : [];
  if (skillNames.length === 1 && skillNames[0] === 'context-menu' && exists('.codex-plugin/skills/context-menu/SKILL.md')) {
    add('manifest.scope', 'pass', 'Codex manifest exposes only the context-menu skill surface');
  } else {
    add('manifest.scope', 'fail', `Codex skills directory must contain only context-menu, got: ${JSON.stringify(skillNames)}`);
  }
} else {
  add('manifest.scope', 'fail', `Codex manifest must point at ./.codex-plugin/skills, got ${manifest?.skills ?? '<missing>'}`);
}

if (manifest?.hooks === undefined && manifest?.rules === undefined && manifest?.commands === undefined) {
  add('manifest.no-claude-surfaces', 'pass', 'Codex manifest does not expose hooks, rules, or commands');
} else {
  add('manifest.no-claude-surfaces', 'fail', 'Codex manifest must not expose Claude hooks, rules, or commands');
}

for (const [id, filePath] of [
  ['runtime.codex-launch', codexLaunchPath],
  ['runtime.claude-launch', claudeLaunchPath],
  ['runtime.postinstall', postinstallPath],
  ['runtime.install-launcher', installLauncherPath],
] as const) {
  if (fs.existsSync(filePath)) {
    add(id, 'pass', `${path.relative(repoRoot, filePath)} exists`);
  } else {
    add(id, 'fail', `${path.relative(repoRoot, filePath)} is missing`);
  }
}

if (fs.existsSync(installLauncherPath)) {
  const installLauncher = fs.readFileSync(installLauncherPath, 'utf8');
  const normalized = installLauncher.replace(/[`"',()[\]{}]/g, ' ').replace(/\s+/g, ' ');
  if (
    normalized.includes('FilePath codex') &&
    normalized.includes('plugin marketplace add') &&
    normalized.includes('plugin add context-menu@dev-pomogator-codex') &&
    normalized.includes('tools/context-menu/postinstall.ts') &&
    normalized.includes('--codex-only') &&
    !installLauncher.includes('npx') &&
    !installLauncher.includes('--Codex')
  ) {
    add('runtime.install-launcher-contract', 'pass', 'Codex install launcher wraps plugin add and Codex-only postinstall without deprecated installers');
  } else {
    add('runtime.install-launcher-contract', 'fail', 'Codex install launcher is missing plugin add, Codex-only postinstall, or contains deprecated installer text');
  }
}

if (fs.existsSync(postinstallPath)) {
  const postinstall = fs.readFileSync(postinstallPath, 'utf8');
  if (
    postinstall.includes("path.join(MODULE_DIR, '..', '..', 'scripts', 'launch-claude-tui.ps1')") &&
    postinstall.includes("path.join(MODULE_DIR, '..', '..', 'scripts', 'launch-Codex-tui.ps1')") &&
    postinstall.includes('copyLaunchScript') &&
    postinstall.includes('copyCodexLaunchScript')
  ) {
    add('runtime.launcher-source-of-truth', 'pass', 'postinstall copies Claude and Codex launchers from the repo scripts directory');
  } else {
    add('runtime.launcher-source-of-truth', 'fail', 'postinstall must copy both installed launchers from repo scripts/ so local and user installs share one source');
  }

  if (
    postinstall.includes('generateFallbackCodexIcon') &&
    postinstall.includes('findInstalledCodexIconFile') &&
    postinstall.includes('Get-AppxPackage OpenAI.Codex') &&
    postinstall.includes('findInstalledCodexExecutable') &&
    postinstall.includes('ExtractAssociatedIcon') &&
    postinstall.includes('codex-icon.ico') &&
    postinstall.includes('writeCodexIcon')
  ) {
    add('runtime.codex-icon', 'pass', 'postinstall prefers the installed OpenAI Codex app icon and can fall back to generated codex-icon.ico');
  } else {
    add('runtime.codex-icon', 'fail', 'postinstall must prefer the installed OpenAI Codex app icon and generate/install codex-icon.ico only as fallback');
  }
}

if (fs.existsSync(claudeLaunchPath)) {
  const claudeLaunch = fs.readFileSync(claudeLaunchPath, 'utf8');
  if (hasBatchShimExitLoggingGuard(claudeLaunch, 'Get-ClaudeExitLogBatch')) {
    add('runtime.claude-cmd-shim-exit-logging', 'pass', 'Claude launcher calls .cmd/.bat shims with CALL before logging CM_EXIT');
  } else {
    add('runtime.claude-cmd-shim-exit-logging', 'fail', 'Claude launcher must CALL .cmd/.bat shims so CM_EXIT logging still runs');
  }
  if (hasSafeVersionProbe(claudeLaunch, 'claude --version', "Get-ClaudeCommand -Arguments @('--version')")) {
    add('runtime.claude-version-probe-cmd-shim', 'pass', 'Claude version probe also uses the batch-safe command builder');
  } else {
    add('runtime.claude-version-probe-cmd-shim', 'fail', 'Claude launcher must not call bare `claude --version` from a generated .cmd');
  }
}

if (fs.existsSync(codexLaunchPath)) {
  const codexLaunch = fs.readFileSync(codexLaunchPath, 'utf8');
  if (codexLaunch.includes('--dangerously-bypass-approvals-and-sandbox') && codexLaunch.includes('codex')) {
    add('runtime.codex-flags', 'pass', 'Codex launch script uses Codex-native full-access invocation');
  } else {
    add('runtime.codex-flags', 'fail', 'Codex launch script is missing Codex-native invocation details');
  }
  if (codexLaunch.includes('--dangerously-skip-permissions')) {
    add('runtime.codex-stale-claude-flag', 'fail', 'Codex launch script contains Claude-only permission flag');
  } else {
    add('runtime.codex-stale-claude-flag', 'pass', 'Codex launch script does not contain Claude-only permission flag');
  }
  if (hasBatchShimExitLoggingGuard(codexLaunch, 'Get-CodexExitLogBatch')) {
    add('runtime.codex-cmd-shim-exit-logging', 'pass', 'Codex launcher calls .cmd/.bat shims with CALL before logging CM_EXIT');
  } else {
    add('runtime.codex-cmd-shim-exit-logging', 'fail', 'Codex launcher must CALL .cmd/.bat shims so CM_EXIT logging still runs');
  }
  if (hasSafeVersionProbe(codexLaunch, 'codex --version', "Get-CodexCommandWithArgs -Arguments @('--version')")) {
    add('runtime.codex-version-probe-cmd-shim', 'pass', 'Codex version probe also uses the batch-safe command builder');
  } else {
    add('runtime.codex-version-probe-cmd-shim', 'fail', 'Codex launcher must not call bare `codex --version` from a generated .cmd');
  }
}

const evidence = firstWhitelist?.verificationEvidence ?? [];
const requiredEvidence = [
  'tools/codex-plugin-support/verify-whitelist.ts',
  '.specs/context-menu/context-menu.feature#CTXMENU001_18',
  '.specs/context-menu/context-menu.feature#CTXMENU001_21',
  '.specs/context-menu/context-menu.feature#CTXMENU001_22',
  '.specs/context-menu/context-menu.feature#CTXMENU001_23',
  '.specs/context-menu/context-menu.feature#CTXMENU001_24',
  '.specs/context-menu/context-menu.feature#CTXMENU001_25',
  '.specs/codex-init/codex-init.feature#CODEXINIT001_07',
];
const missingEvidence = requiredEvidence.filter((item) => !evidence.includes(item));
if (missingEvidence.length === 0) {
  add('whitelist.evidence', 'pass', 'whitelist evidence covers integration harness and Codex runtime expectations');
} else {
  add('whitelist.evidence', 'fail', `missing evidence: ${missingEvidence.join(', ')}`);
}

const codexPluginHelp = spawnSync('codex', ['plugin', '--help'], {
  cwd: repoRoot,
  encoding: 'utf8',
  shell: process.platform === 'win32',
  timeout: 10000,
});
if (codexPluginHelp.status === 0) {
  add('codex-cli.plugin-help', 'pass', 'codex plugin --help ran successfully');
} else {
  const detail = codexPluginHelp.error?.message || codexPluginHelp.stderr || codexPluginHelp.stdout || `exit ${codexPluginHelp.status}`;
  add('codex-cli.plugin-help', 'warn', `codex plugin --help unavailable in this environment: ${detail.trim()}`);
}

function verifyRealCodexPluginInstall(): void {
  if (codexPluginHelp.status !== 0) {
    addSkippedCodexInstallChecks(processDetail(codexPluginHelp));
    return;
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-pomogator-codex-verify-'));
  const codexHome = path.join(tempRoot, '.codex');
  fs.mkdirSync(codexHome, { recursive: true });

  const env = {
    HOME: tempRoot,
    USERPROFILE: tempRoot,
    CODEX_HOME: codexHome,
    FORCE_COLOR: '0',
  };

  try {
    const marketplaceAdd = runCodex(['plugin', 'marketplace', 'add', '.', '--json'], env);
    const marketplaceReport = parseJsonOutput<{ marketplaceName?: string; installedRoot?: string }>(marketplaceAdd.stdout);
    if (marketplaceAdd.status === 0 && marketplaceReport?.marketplaceName === 'dev-pomogator-codex') {
      add('codex-cli.marketplace-add', 'pass', 'codex plugin marketplace add . succeeded in isolated CODEX_HOME');
    } else {
      add('codex-cli.marketplace-add', 'fail', `marketplace add failed or returned unexpected JSON: ${processDetail(marketplaceAdd)}`);
      return;
    }

    const availableList = runCodex(['plugin', 'list', '--available', '--json', '--marketplace', 'dev-pomogator-codex'], env);
    const availableReport = parseJsonOutput<{ available?: Array<{ pluginId?: string; installed?: boolean }> }>(availableList.stdout);
    const availableContextMenu = availableReport?.available?.find((plugin) => plugin.pluginId === 'context-menu@dev-pomogator-codex');
    if (availableList.status === 0 && availableContextMenu?.installed === false) {
      add('codex-cli.available-list', 'pass', 'context-menu is visible as an available Codex plugin');
    } else {
      add('codex-cli.available-list', 'fail', `context-menu was not visible in available list: ${processDetail(availableList)}`);
      return;
    }

    const pluginAdd = runCodex(['plugin', 'add', 'context-menu@dev-pomogator-codex', '--json'], env);
    const pluginAddReport = parseJsonOutput<{ pluginId?: string; installedPath?: string }>(pluginAdd.stdout);
    if (
      pluginAdd.status === 0 &&
      pluginAddReport?.pluginId === 'context-menu@dev-pomogator-codex' &&
      typeof pluginAddReport.installedPath === 'string' &&
      pluginAddReport.installedPath.startsWith(codexHome) &&
      fs.existsSync(pluginAddReport.installedPath)
    ) {
      add('codex-cli.plugin-add', 'pass', 'context-menu installed into isolated CODEX_HOME plugin cache');
    } else {
      add('codex-cli.plugin-add', 'fail', `plugin add failed or installed outside isolated CODEX_HOME: ${processDetail(pluginAdd)}`);
      return;
    }

    const installedList = runCodex(['plugin', 'list', '--json', '--marketplace', 'dev-pomogator-codex'], env);
    const installedReport = parseJsonOutput<{ installed?: Array<{ pluginId?: string; installed?: boolean; enabled?: boolean }> }>(installedList.stdout);
    const installedContextMenu = installedReport?.installed?.find((plugin) => plugin.pluginId === 'context-menu@dev-pomogator-codex');
    if (installedList.status === 0 && installedContextMenu?.installed === true && installedContextMenu.enabled === true) {
      add('codex-cli.installed-list', 'pass', 'context-menu appears installed and enabled after Codex plugin add');
    } else {
      add('codex-cli.installed-list', 'fail', `context-menu was not installed/enabled in Codex plugin list: ${processDetail(installedList)}`);
    }
  } finally {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
}

verifyRealCodexPluginInstall();

const failed = checks.filter((check) => check.status === 'fail');
const report = {
  status: failed.length === 0 ? 'pass' : 'fail',
  repoRoot,
  marketplacePath: path.relative(repoRoot, marketplacePath),
  manifestPath: path.relative(repoRoot, manifestPath),
  checks,
};

console.log(JSON.stringify(report, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
