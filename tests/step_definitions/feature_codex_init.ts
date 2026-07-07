import { Given, When, Then } from '@cucumber/cucumber';
import type { V4World } from '../hooks/before-after.ts';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = process.env.APP_DIR || process.cwd();
const MARKETPLACE_PATH = path.join(REPO_ROOT, '.agents', 'plugins', 'marketplace.json');
const MANIFEST_PATH = path.join(REPO_ROOT, '.codex-plugin', 'plugin.json');
const VERIFY_WHITELIST = path.join(REPO_ROOT, 'tools', 'codex-plugin-support', 'verify-whitelist.ts');
const CONTEXT_SPEC_PATH = path.join(REPO_ROOT, '.specs', 'context-menu');
const POSTINSTALL_PATH = path.join(REPO_ROOT, 'tools', 'context-menu', 'postinstall.ts');
const CLAUDE_LAUNCH_PATH = path.join(REPO_ROOT, 'scripts', 'launch-claude-tui.ps1');
const CODEX_LAUNCH_PATH = path.join(REPO_ROOT, 'scripts', 'launch-Codex-tui.ps1');

interface Marketplace {
  plugins?: Array<{ name?: string; source?: { source?: string; path?: string }; policy?: { installation?: string; authentication?: string }; category?: string }>;
  'x-dev-pomogator-whitelist'?: Array<WhitelistEntry>;
}

interface WhitelistEntry {
  pluginName?: string;
  featureSlug?: string;
  status?: string;
  codexManifestPath?: string;
  specPath?: string;
  runtimeContracts?: string[];
  verificationEvidence?: string[];
}

interface PluginManifest {
  name?: string;
  skills?: string;
  hooks?: unknown;
  rules?: unknown;
  commands?: unknown;
}

interface CodexInitWorld extends V4World {
  codexInitFeatureSlug?: string;
  codexInitMarketplace?: Marketplace;
  codexInitWhitelistEntry?: WhitelistEntry;
  codexInitManifest?: PluginManifest;
  codexInitMissingEvidence?: string[];
  codexInitHarnessReport?: {
    status?: string;
    checks?: Array<{ id: string; status: string; detail: string }>;
  };
  codexInitClaimDrift?: boolean;
  codexInitClaimReason?: string;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function loadMarketplace(): Marketplace {
  return readJson<Marketplace>(MARKETPLACE_PATH);
}

function whitelistEntries(marketplace: Marketplace): WhitelistEntry[] {
  return marketplace['x-dev-pomogator-whitelist'] ?? [];
}

function contextMenuEntry(marketplace: Marketplace): WhitelistEntry | undefined {
  return whitelistEntries(marketplace).find((entry) => entry.pluginName === 'context-menu' || entry.featureSlug === 'context-menu');
}

function requireFile(filePath: string, label: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} is missing at ${path.relative(REPO_ROOT, filePath)}`);
  }
}

function evaluateFeatureSupport(featureSlug: string): { supported: boolean; missing: string[] } {
  const marketplace = fs.existsSync(MARKETPLACE_PATH) ? loadMarketplace() : {};
  const entry = whitelistEntries(marketplace).find((candidate) => candidate.featureSlug === featureSlug || candidate.pluginName === featureSlug);
  if (!entry) {
    return {
      supported: false,
      missing: [
        'manifest evidence',
        'marketplace evidence',
        'runtime evidence',
        'verification evidence',
      ],
    };
  }

  const missing: string[] = [];
  if (!entry.codexManifestPath || !fs.existsSync(path.join(REPO_ROOT, entry.codexManifestPath))) missing.push('manifest evidence');
  if (!marketplace.plugins?.some((plugin) => plugin.name === entry.pluginName)) missing.push('marketplace evidence');
  if (!entry.runtimeContracts || entry.runtimeContracts.length === 0) missing.push('runtime evidence');
  if (!entry.verificationEvidence || entry.verificationEvidence.length === 0) missing.push('verification evidence');

  return { supported: entry.status === 'Supported' && missing.length === 0, missing };
}

Given(/^the dev-pomogator repository has existing Claude Code plugin support$/, function () {
  requireFile(POSTINSTALL_PATH, 'context-menu postinstall script');
  requireFile(CLAUDE_LAUNCH_PATH, 'Claude launch script');
  const postinstall = fs.readFileSync(POSTINSTALL_PATH, 'utf-8');
  if (!postinstall.includes('generateNss') || !postinstall.includes('claude-code.nss')) {
    throw new Error('Expected context-menu postinstall to retain Claude Code NSS generation');
  }
});

Given(/^Codex plugin support is being added as a parallel channel$/, function () {
  requireFile(CODEX_LAUNCH_PATH, 'Codex launch script');
  const postinstall = fs.readFileSync(POSTINSTALL_PATH, 'utf-8');
  if (!postinstall.includes('generateCodexNss') || !postinstall.includes('Codex.nss')) {
    throw new Error('Expected context-menu postinstall to expose a separate Codex NSS channel');
  }
});

Given(/^a dev-pomogator feature has no Codex plugin whitelist entry$/, function (this: CodexInitWorld) {
  this.codexInitFeatureSlug = 'unlisted-feature';
});

When(/^the feature is evaluated for Codex plugin support$/, function (this: CodexInitWorld) {
  const result = evaluateFeatureSupport(this.codexInitFeatureSlug ?? 'unlisted-feature');
  this.lastStdout = JSON.stringify(result, null, 2);
  this.codexInitMissingEvidence = result.missing;
  this.lastExitCode = result.supported ? 0 : 1;
});

Then(/^it is not reported as supported$/, function (this: CodexInitWorld) {
  if (this.lastExitCode === 0) {
    throw new Error(`Expected feature not to be supported, got:\n${this.lastStdout}`);
  }
});

Then(/^the missing manifest, marketplace, runtime, and verification evidence are listed$/, function (this: CodexInitWorld) {
  for (const expected of ['manifest evidence', 'marketplace evidence', 'runtime evidence', 'verification evidence']) {
    if (!this.codexInitMissingEvidence?.includes(expected)) {
      throw new Error(`Expected missing evidence to include "${expected}", got ${JSON.stringify(this.codexInitMissingEvidence)}`);
    }
  }
});

Given(/^a feature already has Claude Code plugin artifacts$/, function (this: CodexInitWorld) {
  this.codexInitFeatureSlug = 'context-menu';
  requireFile(CLAUDE_LAUNCH_PATH, 'Claude launch script');
  requireFile(CONTEXT_SPEC_PATH, 'context-menu spec');
});

When(/^Codex plugin support is added for that feature$/, function (this: CodexInitWorld) {
  this.codexInitMarketplace = loadMarketplace();
  this.codexInitWhitelistEntry = contextMenuEntry(this.codexInitMarketplace);
});

Then(/^the Claude Code artifacts remain present$/, function () {
  requireFile(CLAUDE_LAUNCH_PATH, 'Claude launch script');
  const postinstall = fs.readFileSync(POSTINSTALL_PATH, 'utf-8');
  if (!postinstall.includes('generateNss') || !postinstall.includes('CLAUDE_NSS')) {
    throw new Error('Claude Code postinstall path was removed or renamed unexpectedly');
  }
});

Then(/^the Codex artifacts are verified through a separate channel$/, function (this: CodexInitWorld) {
  requireFile(CODEX_LAUNCH_PATH, 'Codex launch script');
  requireFile(MANIFEST_PATH, 'Codex plugin manifest');
  if (!this.codexInitWhitelistEntry || this.codexInitWhitelistEntry.featureSlug !== 'context-menu') {
    throw new Error('Expected separate Codex whitelist entry for context-menu');
  }
});

Given(/^the Codex plugin support whitelist exists$/, function (this: CodexInitWorld) {
  this.codexInitMarketplace = loadMarketplace();
  if (whitelistEntries(this.codexInitMarketplace).length === 0) {
    throw new Error('Codex plugin support whitelist is empty');
  }
});

When(/^the whitelist entries are ordered$/, function (this: CodexInitWorld) {
  const entries = whitelistEntries(this.codexInitMarketplace ?? loadMarketplace());
  this.lastStdout = JSON.stringify(entries, null, 2);
  this.codexInitWhitelistEntry = entries[0];
});

Then(/^the first entry is "context-menu"$/, function (this: CodexInitWorld) {
  if (this.codexInitWhitelistEntry?.pluginName !== 'context-menu') {
    throw new Error(`Expected first whitelist entry to be context-menu, got ${this.codexInitWhitelistEntry?.pluginName ?? '<missing>'}`);
  }
});

Then(/^it links to "\.specs\/context-menu\/" for detailed launcher behavior$/, function (this: CodexInitWorld) {
  const specPath = this.codexInitWhitelistEntry?.specPath;
  if (specPath !== '.specs/context-menu') {
    throw new Error(`Expected whitelist entry to link to .specs/context-menu/, got ${specPath ?? '<missing>'}`);
  }
  requireFile(CONTEXT_SPEC_PATH, 'context-menu spec directory');
});

Given(/^a plugin entry is whitelisted for Codex$/, function (this: CodexInitWorld) {
  this.codexInitMarketplace = loadMarketplace();
  this.codexInitWhitelistEntry = contextMenuEntry(this.codexInitMarketplace);
  if (!this.codexInitWhitelistEntry) {
    throw new Error('Expected a context-menu whitelist entry');
  }
});

When(/^its packaging contract is inspected$/, function (this: CodexInitWorld) {
  requireFile(MARKETPLACE_PATH, 'Codex marketplace');
  requireFile(MANIFEST_PATH, 'Codex manifest');
  this.lastStdout = JSON.stringify({
    manifestPath: this.codexInitWhitelistEntry?.codexManifestPath,
    marketplacePath: '.agents/plugins/marketplace.json',
  });
});

When(/^its Codex manifest install surface is inspected$/, function (this: CodexInitWorld) {
  requireFile(MANIFEST_PATH, 'Codex manifest');
  this.codexInitManifest = readJson<PluginManifest>(MANIFEST_PATH);
  this.lastStdout = JSON.stringify(this.codexInitManifest, null, 2);
});

Then(/^the Codex manifest path is "\.codex-plugin\/plugin\.json"$/, function (this: CodexInitWorld) {
  if (this.codexInitWhitelistEntry?.codexManifestPath !== '.codex-plugin/plugin.json') {
    throw new Error(`Expected manifest path .codex-plugin/plugin.json, got ${this.codexInitWhitelistEntry?.codexManifestPath}`);
  }
});

Then(/^the Codex marketplace path is "\.agents\/plugins\/marketplace\.json"$/, function () {
  requireFile(MARKETPLACE_PATH, 'Codex marketplace');
});

Then(/^the Codex manifest should expose only the context-menu skill surface$/, function (this: CodexInitWorld) {
  const skillsPath = this.codexInitManifest?.skills;
  if (skillsPath !== './.codex-plugin/skills') {
    throw new Error(`Expected Codex manifest skills to be ./.codex-plugin/skills, got ${skillsPath ?? '<missing>'}`);
  }

  const skillsDir = path.join(REPO_ROOT, skillsPath.replace(/^\.\//, ''));
  requireFile(path.join(skillsDir, 'context-menu', 'SKILL.md'), 'Codex context-menu skill');
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  if (entries.length !== 1 || entries[0] !== 'context-menu') {
    throw new Error(`Expected only context-menu skill under ${skillsPath}, got ${JSON.stringify(entries)}`);
  }
});

Then(/^the Codex manifest should not expose Claude hooks, Claude rules, or Claude commands$/, function (this: CodexInitWorld) {
  const manifest = this.codexInitManifest;
  if (!manifest) throw new Error('Codex manifest was not loaded');
  for (const forbidden of ['hooks', 'rules', 'commands'] as const) {
    if (manifest[forbidden] !== undefined) {
      throw new Error(`Codex manifest must not expose ${forbidden}: ${this.lastStdout}`);
    }
  }
  if (manifest.skills?.includes('.claude/skills')) {
    throw new Error(`Codex manifest must not expose the Claude skill catalog: ${this.lastStdout}`);
  }
});

Given(/^a whitelist entry is marked "Supported"$/, function (this: CodexInitWorld) {
  this.codexInitMarketplace = loadMarketplace();
  this.codexInitWhitelistEntry = contextMenuEntry(this.codexInitMarketplace);
  if (this.codexInitWhitelistEntry?.status !== 'Supported') {
    throw new Error(`Expected context-menu whitelist status Supported, got ${this.codexInitWhitelistEntry?.status ?? '<missing>'}`);
  }
});

When(/^its verification evidence is inspected$/, function (this: CodexInitWorld) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', VERIFY_WHITELIST], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    timeout: 90000,
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  this.lastExitCode = result.status;
  this.lastStdout = result.stdout || '';
  this.lastStderr = result.stderr || '';
  try {
    this.codexInitHarnessReport = JSON.parse(this.lastStdout);
  } catch {
    throw new Error(`verify-whitelist did not produce JSON.\nstdout:\n${this.lastStdout}\nstderr:\n${this.lastStderr}`);
  }
});

Then(/^the evidence includes a real Codex plugin CLI run or equivalent integration harness$/, function (this: CodexInitWorld) {
  const evidence = this.codexInitWhitelistEntry?.verificationEvidence ?? [];
  if (!evidence.includes('tools/codex-plugin-support/verify-whitelist.ts')) {
    throw new Error(`Expected whitelist evidence to include verify-whitelist.ts, got ${JSON.stringify(evidence)}`);
  }
  if (this.lastExitCode !== 0 || this.codexInitHarnessReport?.status !== 'pass') {
    throw new Error(`Expected verify-whitelist harness to pass.\nstdout:\n${this.lastStdout}\nstderr:\n${this.lastStderr}`);
  }
});

Then(/^the evidence covers marketplace visibility, manifest validity, installed state, and runtime loading expectations$/, function (this: CodexInitWorld) {
  const checkIds = new Set((this.codexInitHarnessReport?.checks ?? []).map((check) => check.id));
  for (const id of [
    'marketplace.first-plugin',
    'manifest.exists',
    'manifest.skills',
    'manifest.scope',
    'manifest.no-claude-surfaces',
    'runtime.postinstall',
    'runtime.install-launcher',
    'runtime.install-launcher-contract',
    'runtime.codex-icon',
    'runtime.codex-launch',
    'codex-cli.marketplace-add',
    'codex-cli.available-list',
    'codex-cli.plugin-add',
    'codex-cli.installed-list',
  ]) {
    if (!checkIds.has(id)) {
      throw new Error(`Expected verify-whitelist report to include check "${id}". Report:\n${this.lastStdout}`);
    }
  }
});

Given(/^a Codex implementation claim is copied from a Claude-only behavior$/, function (this: CodexInitWorld) {
  this.lastStdout = 'Codex YOLO uses --dangerously-skip-permissions and writes ~/.claude.json';
});

When(/^local Codex CLI output or official Codex documentation contradicts the claim$/, function (this: CodexInitWorld) {
  const codexLaunch = fs.readFileSync(CODEX_LAUNCH_PATH, 'utf-8');
  const hasCodexNativeFlag = codexLaunch.includes('--dangerously-bypass-approvals-and-sandbox');
  const avoidsClaudeTrustStore = codexLaunch.includes('.codex') && !codexLaunch.includes('.claude.json');
  this.codexInitClaimDrift = this.lastStdout.includes('--dangerously-skip-permissions') && hasCodexNativeFlag && avoidsClaudeTrustStore;
  this.codexInitClaimReason = 'Codex launch path uses --dangerously-bypass-approvals-and-sandbox and ~/.codex/config.toml, not Claude permission/trust behavior';
});

Then(/^the claim is marked as drift$/, function (this: CodexInitWorld) {
  if (!this.codexInitClaimDrift) {
    throw new Error(`Expected stale Claude-to-Codex claim to be marked drift: ${this.codexInitClaimReason ?? '<no reason>'}`);
  }
});

Then(/^it cannot be used as a requirement until corrected$/, function (this: CodexInitWorld) {
  if (!this.codexInitClaimDrift || !this.codexInitClaimReason?.includes('not Claude permission/trust behavior')) {
    throw new Error('Expected stale claim to be rejected until corrected');
  }
});
