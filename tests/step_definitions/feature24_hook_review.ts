import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { reviewHookManifest } from '../../tools/hook-review/check.mjs';
import { provisionCredential } from '../../tools/hook-service/credential.mjs';

type Finding = { file: string; event?: string; message: string };
import { V4World } from '../hooks/before-after.ts';

interface HookReviewWorld extends V4World { manifestFile?: string; registryFile?: string; findings?: Finding[]; cliStatus?: number; cliStderr?: string; credentialRoot?: string; credentialPath?: string; credentialResults?: Array<{ token: string; created: boolean }>; }

function writeJson(file: string, value: object): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

Given(/^an approved local HTTP hook registry$/, function (this: HookReviewWorld) {
  this.registryFile = path.join(this.tempDir, 'hook-registry.json');
  fs.copyFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'hook-review', 'approved-registry.json'), this.registryFile);
});

Given(/^a managed hook manifest containing shell, inline Node, drifted, and unapproved hook commands$/, function (this: HookReviewWorld) {
  const registry = JSON.parse(fs.readFileSync(this.registryFile!, 'utf8')) as { routes: Record<string, unknown> };
  registry.routes['Stop/99/0'] = { matcher: '' };
  fs.writeFileSync(this.registryFile!, JSON.stringify(registry));
  this.manifestFile = path.join(this.tempDir, 'hooks.json');
  writeJson(this.manifestFile, { hooks: {
    Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'bash tools/check.sh' }, { type: 'command', command: 'node -e "process.exit(0)"' }] }],
    PreToolUse: [
      { matcher: 'Write|Edit', hooks: [{ type: 'command', command: 'node ${CLAUDE_PLUGIN_ROOT}/tools/hook-service/client.mjs "PreToolUse/0/1"' }] },
      { matcher: 'Read', hooks: [{ type: 'http', url: 'http://127.0.0.1:42619/v1/dispatch/PreToolUse%2F1%2F0', timeout: 30 }] },
    ],
  } });
});

Given(/^a managed hook manifest with extra SessionStart and non-hot hooks$/, function (this: HookReviewWorld) {
  this.manifestFile = path.join(this.tempDir, 'hooks.json');
  writeJson(this.manifestFile, { hooks: {
    SessionStart: [
      { matcher: '', hooks: [{ type: 'command', command: 'node ${CLAUDE_PLUGIN_ROOT}/tools/hook-service/session-bootstrap.mjs' }] },
      { matcher: '', hooks: [{ type: 'command', command: 'node ${CLAUDE_PLUGIN_ROOT}/tools/hook-service/session-bootstrap.mjs' }] },
    ],
    CustomEvent: [{ matcher: '', hooks: [{ type: 'command', command: 'node tools/other.mjs' }] }],
  } });
});

Given(/^a managed hook manifest containing an approved HTTP hook and documented SessionStart bootstrap$/, function (this: HookReviewWorld) {
  this.manifestFile = path.join(this.tempDir, 'hooks.json');
  writeJson(this.manifestFile, { hooks: {
    PreToolUse: [{ matcher: 'Write|Edit', hooks: [{ type: 'http', url: 'http://127.0.0.1:42619/v1/dispatch/PreToolUse%2F0%2F0', timeout: 30 }] }],
    SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'node ${CLAUDE_PLUGIN_ROOT}/tools/hook-service/session-bootstrap.mjs' }] }],
  } });
});

When(/^I run the hook review gate$/, function (this: HookReviewWorld) {
  this.findings = reviewHookManifest(this.manifestFile!, this.registryFile!, process.cwd());
});

Then(/^the gate rejects every prohibited managed hook with its reason$/, function (this: HookReviewWorld) {
  assert.deepEqual(this.findings?.map((finding) => finding.message), [
    'managed hot-path hooks must be URL entries, not command/client/shell/inline-node launchers',
    'managed hot-path hooks must be URL entries, not command/client/shell/inline-node launchers',
    'managed hot-path hooks must be URL entries, not command/client/shell/inline-node launchers',
    'hook route is missing from the approved registry (registry drift)',
    'SessionStart must contain exactly one documented session-bootstrap.mjs command with an empty matcher',
    'registry route has no managed manifest HTTP hook (orphaned route: PreToolUse/0/0)',
    'registry route has no managed manifest HTTP hook (orphaned route: Stop/99/0)',
  ]);
});

Then(/^the hook review gate exits successfully$/, function (this: HookReviewWorld) {
  assert.deepEqual(this.findings, []);
});

Then(/^the gate reports the SessionStart and non-hot event violations$/, function (this: HookReviewWorld) {
  assert.deepEqual(this.findings?.map((finding) => finding.message), [
    'SessionStart must contain exactly one documented session-bootstrap.mjs command with an empty matcher',
    'managed non-SessionStart hook events must be in HOT_PATH_EVENTS',
    'SessionStart must contain exactly one documented session-bootstrap.mjs command with an empty matcher',
    'registry route has no managed manifest HTTP hook (orphaned route: PreToolUse/0/0)',
  ]);
});

Given(/^the canonical hook manifest and registry paths$/, function (this: HookReviewWorld) {
  this.manifestFile = path.resolve(process.cwd(), '.claude-plugin', 'hooks.json');
  this.registryFile = path.resolve(process.cwd(), 'tools', 'hook-service', 'registry.json');
  assert.ok(fs.existsSync(this.manifestFile), `missing manifest: ${this.manifestFile}`);
  assert.ok(fs.existsSync(this.registryFile), `missing registry: ${this.registryFile}`);
});

When(/^I run the hook review CLI from a foreign working directory$/, function (this: HookReviewWorld) {
  const foreignCwd = path.resolve('C:/Users/stigm/OneDrive/Desktop');
  execFileSync(process.execPath, [path.resolve(process.cwd(), 'tools', 'hook-review', 'check.mjs'), this.manifestFile!, this.registryFile!], { cwd: foreignCwd, encoding: 'utf8', stdio: 'pipe' });
  this.cliStatus = 0;
});

Then(/^the foreign-CWD hook review CLI exits successfully$/, function (this: HookReviewWorld) {
  assert.equal(this.cliStatus, 0, this.cliStderr);
});

When(/^I inspect every managed HTTP route authentication contract$/, function (this: HookReviewWorld) {
  this.findings = reviewHookManifest(this.manifestFile!, this.registryFile!, process.cwd());
});

Then(/^every route uses the hook token environment reference and no literal token$/, function (this: HookReviewWorld) {
  assert.deepEqual(this.findings, []);
});

Given(/^an empty isolated hook credential state$/, function (this: HookReviewWorld) {
  this.credentialRoot = fs.mkdtempSync(path.join(this.tempDir, 'hook-credential-bdd-'));
  this.credentialPath = path.join(this.credentialRoot, 'token');
});

When(/^eight hook-service starters provision the credential concurrently$/, async function (this: HookReviewWorld) {
  this.credentialResults = await Promise.all(
    Array.from({ length: 8 }, () => provisionCredential(this.credentialPath!)),
  );
});

Then(/^they share one persisted credential and only one starter creates it$/, function (this: HookReviewWorld) {
  const tokens = this.credentialResults.map((result: any) => result.token);
  assert.equal(new Set(tokens).size, 1);
  assert.equal(this.credentialResults.filter((result: any) => result.created).length, 1);
  assert.equal(fs.readFileSync(this.credentialPath!, 'utf8'), tokens[0]);
});
