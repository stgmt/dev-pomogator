/**
 * Step definitions for personal-pomogator @feature11 scenarios (PERSO001_B0-B9, FR-16).
 *
 * Drive the REAL global-MCP-bootstrap code:
 *   - the SessionStart hook `tools/mcp-setup/mcp-bootstrap.ts` (spawned, integration),
 *   - the key writer `tools/mcp-setup/set-mcp-key.ts` (in-process),
 *   - the auth predicates `tools/mcp-setup/mcp-auth-detect.ts` (in-process),
 *   - the doctor checks C-MCPA (`mcp-auth.ts`) and C11 (`mcp-parse.ts`) (in-process).
 *
 * HOME isolation: the hook is spawned with HOME=USERPROFILE=world.tempDir; the writer/checks
 * receive homeDir=world.tempDir. The developer's real ~/.claude.json is never touched. All step
 * patterns are REGEX (verbatim `"`, `/`, `.`).
 */

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { setMcpKey } from '../../tools/mcp-setup/set-mcp-key.ts';
import { context7Configured, octocodeConfigured, type McpEntry } from '../../tools/mcp-setup/mcp-auth-detect.ts';
import { mcpAuthCheck } from '../../.claude/skills/pomogator-doctor/scripts/engine/checks/mcp-auth.ts';
import { mcpParseCheck } from '../../.claude/skills/pomogator-doctor/scripts/engine/checks/mcp-parse.ts';
import type { CheckContext } from '../../.claude/skills/pomogator-doctor/scripts/engine/types.ts';

const REPO_ROOT = path.resolve(path.join(import.meta.dirname, '..', '..'));
const HOOK = path.join(REPO_ROOT, 'tools', 'mcp-setup', 'mcp-bootstrap.ts');

// Per-scenario state lives on the cucumber World (`this`); typed loosely via this cast helper.
interface McpWorld extends V4World {
  extraEnv?: Record<string, string>;
  payload?: { continue: boolean; suppressOutput?: boolean; additionalContext?: string };
  setKeyResult?: { written: boolean; verified: boolean };
  entry?: McpEntry;
  gh?: () => boolean;
  referenced?: string[];
  checkResult?: { severity: string; message: string };
  missing?: string[];
}

function claudeJsonPath(world: McpWorld): string {
  return path.join(world.tempDir, '.claude.json');
}
function writeClaudeJson(world: McpWorld, mcpServers: Record<string, McpEntry>): void {
  fs.writeFileSync(claudeJsonPath(world), JSON.stringify({ mcpServers }, null, 2), 'utf-8');
}
function readMcpServers(world: McpWorld): Record<string, McpEntry> {
  try {
    return (JSON.parse(fs.readFileSync(claudeJsonPath(world), 'utf-8')).mcpServers ?? {}) as Record<string, McpEntry>;
  } catch {
    return {};
  }
}
function makeCtx(world: McpWorld, referenced: string[]): CheckContext {
  return {
    config: null,
    configError: null,
    referencedMcpServers: new Set(referenced),
    installedExtensions: [],
    projectRoot: world.tempDir, // no project .mcp.json inside the temp dir
    homeDir: world.tempDir,
    signal: new AbortController().signal,
    packageVersion: null,
  };
}

// --- Given ---------------------------------------------------------------

Given(/^an empty isolated claude home$/, function (this: McpWorld) {
  // tempDir is fresh + empty (V4World Before hook) — nothing to seed.
});

Given(/^an isolated claude home with a custom "([^"]+)" entry$/, function (this: McpWorld, name: string) {
  writeClaudeJson(this, { [name]: { command: 'custom-marker', args: ['stay'] } });
});

Given(/^an isolated claude home with "context7" keyed and "octocode" tokened$/, function (this: McpWorld) {
  writeClaudeJson(this, {
    context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp@latest'], env: { CONTEXT7_API_KEY: 'k' } },
    octocode: { command: 'npx', args: ['-y', 'octocode-mcp@latest'], env: { GITHUB_TOKEN: 't' } },
  });
});

Given(/^an isolated claude home with "context7" unkeyed and "octocode" tokened$/, function (this: McpWorld) {
  writeClaudeJson(this, {
    context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp@latest'] },
    octocode: { command: 'npx', args: ['-y', 'octocode-mcp@latest'], env: { GITHUB_TOKEN: 't' } },
  });
});

Given(/^env "([^"]+)" is "([^"]+)"$/, function (this: McpWorld, key: string, value: string) {
  this.extraEnv = { ...(this.extraEnv ?? {}), [key]: value };
});

Given(/^a context7 entry without a key$/, function (this: McpWorld) {
  this.entry = { command: 'npx', args: ['-y', '@upstash/context7-mcp@latest'] };
});

Given(/^an octocode entry without a token and gh auth logged out$/, function (this: McpWorld) {
  this.entry = { command: 'npx', args: ['-y', 'octocode-mcp@latest'] };
  this.gh = () => false;
});

Given(/^referenced mcp servers "([^"]+)" with empty config$/, function (this: McpWorld, csv: string) {
  this.referenced = csv.split(',').map((s) => s.trim()).filter(Boolean);
});

// --- When ----------------------------------------------------------------

When(/^the mcp-bootstrap hook runs$/, function (this: McpWorld) {
  const env: Record<string, string> = {
    ...process.env,
    HOME: this.tempDir,
    USERPROFILE: this.tempDir,
    FORCE_COLOR: '0',
    ...(this.extraEnv ?? {}),
  };
  // Strip ambient tokens so Octocode auth detection is deterministic (entry/explicit only).
  delete env.GITHUB_TOKEN;
  delete env.GH_TOKEN;
  delete env.OCTOCODE_TOKEN;
  delete env.CONTEXT7_API_KEY;
  const r = spawnSync(process.execPath, ['--import', 'tsx', HOOK], {
    cwd: REPO_ROOT,
    env,
    input: '{}',
    encoding: 'utf-8',
    timeout: 30_000,
  });
  const out = (r.stdout ?? '').trim();
  const lastLine = out.split('\n').filter(Boolean).pop() ?? '{}';
  this.payload = JSON.parse(lastLine);
});

When(/^I set the "([^"]+)" mcp key to "([^"]+)"$/, function (this: McpWorld, which: string, value: string) {
  this.setKeyResult = setMcpKey({ which: which as 'context7' | 'octocode', value, homeDir: this.tempDir, platform: 'linux' });
});

When(/^the context7 entry gets api key "([^"]+)"$/, function (this: McpWorld, key: string) {
  this.entry = { ...(this.entry ?? {}), env: { ...((this.entry ?? {}).env ?? {}), CONTEXT7_API_KEY: key } };
});

When(/^gh auth is logged in$/, function (this: McpWorld) {
  this.gh = () => true;
});

When(/^the doctor mcp-auth check runs$/, async function (this: McpWorld) {
  const res = await mcpAuthCheck.run(makeCtx(this, ['context7', 'octocode']));
  this.checkResult = { severity: (res as { severity: string }).severity, message: (res as { message: string }).message };
});

When(/^the doctor mcp-parse check runs$/, async function (this: McpWorld) {
  const out = await mcpParseCheck.run(makeCtx(this, this.referenced ?? []));
  const arr = Array.isArray(out) ? out : [out];
  this.missing = (arr[0]?.details?.missing as string[]) ?? [];
});

// --- Then ----------------------------------------------------------------

Then(/^global mcpServers should contain "([^"]+)"$/, function (this: McpWorld, name: string) {
  assert.ok(readMcpServers(this)[name], `expected mcpServers to contain ${name}`);
});

Then(/^global mcpServers should be empty$/, function (this: McpWorld) {
  assert.strictEqual(Object.keys(readMcpServers(this)).length, 0);
});

Then(/^hook output should warn about "([^"]+)"$/, function (this: McpWorld, text: string) {
  assert.ok(this.payload?.additionalContext?.includes(text), `expected warning to mention ${text}`);
});

Then(/^hook output should be suppressed$/, function (this: McpWorld) {
  assert.strictEqual(this.payload?.suppressOutput, true);
  assert.ok(!this.payload?.additionalContext, 'expected no additionalContext');
});

Then(/^the "([^"]+)" entry should be the custom one$/, function (this: McpWorld, name: string) {
  assert.strictEqual(readMcpServers(this)[name]?.command, 'custom-marker');
});

Then(/^the "([^"]+)" entry env "([^"]+)" should be "([^"]+)"$/, function (this: McpWorld, name: string, key: string, val: string) {
  assert.strictEqual(readMcpServers(this)[name]?.env?.[key], val);
});

Then(/^the set-mcp-key result should be verified$/, function (this: McpWorld) {
  assert.strictEqual(this.setKeyResult?.verified, true);
});

Then(/^context7 should be reported as not configured$/, function (this: McpWorld) {
  assert.strictEqual(context7Configured(this.entry, {}), false);
});
Then(/^context7 should be reported as configured$/, function (this: McpWorld) {
  assert.strictEqual(context7Configured(this.entry, {}), true);
});
Then(/^octocode should be reported as not configured$/, function (this: McpWorld) {
  assert.strictEqual(octocodeConfigured(this.entry, {}, this.gh), false);
});
Then(/^octocode should be reported as configured$/, function (this: McpWorld) {
  assert.strictEqual(octocodeConfigured(this.entry, {}, this.gh), true);
});

Then(/^the C-MCPA severity should be "([^"]+)"$/, function (this: McpWorld, sev: string) {
  assert.strictEqual(this.checkResult?.severity, sev);
});
Then(/^the C-MCPA message should mention "([^"]+)"$/, function (this: McpWorld, text: string) {
  assert.ok(this.checkResult?.message.includes(text), `expected C-MCPA message to mention ${text}`);
});

Then(/^the missing list should contain "([^"]+)"$/, function (this: McpWorld, name: string) {
  assert.ok((this.missing ?? []).includes(name), `expected missing to contain ${name}: ${JSON.stringify(this.missing)}`);
});
Then(/^the missing list should not contain "([^"]+)"$/, function (this: McpWorld, name: string) {
  assert.ok(!(this.missing ?? []).includes(name), `expected missing to NOT contain ${name}: ${JSON.stringify(this.missing)}`);
});
