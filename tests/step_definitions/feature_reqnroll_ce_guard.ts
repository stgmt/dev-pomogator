/**
 * CEGUARD001 step definitions — reqnroll-ce-guard (ce_slash_guard.ts).
 *
 * Migrated from tests/e2e/reqnroll-ce-guard.test.ts. Drives the REAL guard by spawning
 * tools/reqnroll-ce-guard/ce_slash_guard.ts through the same bootstrap launcher the plugin
 * registers, feeding a hook payload on stdin and asserting the deny/allow decision + reason.
 *
 * @see tests/features/plugins/reqnroll-ce-guard/CEGUARD001_reqnroll-ce-guard.feature
 * @see .claude/rules/reqnroll-ce-guard/reqnroll-ce-slash.md
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
const GUARD_LAUNCHER = [
  '-e',
  "require(require('path').join(process.cwd(), 'tools', '_shared', 'bootstrap.cjs'))",
  '--',
  'tools/reqnroll-ce-guard/ce_slash_guard.ts',
];

interface CeWorld extends V4World {
  ceStatus?: number;
  ceDecision?: 'allow' | 'deny';
  ceReason?: string;
}

function runGuard(this: CeWorld, toolName: string, toolInput: Record<string, unknown>): void {
  runGuardRaw.call(this, JSON.stringify({ session_id: 'ceguard', cwd: REPO_ROOT, tool_name: toolName, tool_input: toolInput }));
}

function runGuardRaw(this: CeWorld, rawStdin: string): void {
  const r = spawnSync(process.execPath, GUARD_LAUNCHER, { input: rawStdin, cwd: REPO_ROOT, encoding: 'utf-8', timeout: 20000 });
  this.ceStatus = r.status ?? 1;
  const out = (r.stdout || '').trim();
  this.ceDecision = undefined;
  this.ceReason = undefined;
  if (out.startsWith('{')) {
    try {
      const parsed = JSON.parse(out);
      this.ceDecision = parsed.hookSpecificOutput?.permissionDecision;
      this.ceReason = parsed.hookSpecificOutput?.permissionDecisionReason;
    } catch { /* fail-open parse */ }
  }
}

// ── Background ──────────────────────────────────────────────────────────────
Given(/^reqnroll-ce-guard extension is enabled$/, function () {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'tools', 'reqnroll-ce-guard', 'ce_slash_guard.ts')), 'guard tool must exist');
});

// ── @feature1/2/3 — Write of a .cs file carrying a single CE pattern ────────
When(/^hook receives Write of `\.cs` file with `(.+)`$/, function (this: CeWorld, pattern: string) {
  runGuard.call(this, 'Write', { file_path: '/tmp/ChannelSteps.cs', content: `${pattern}\npublic void Method() {}` });
});

When(/^hook receives Write of `\.cs` file containing two bad step definitions on different lines$/, function (this: CeWorld) {
  runGuard.call(this, 'Write', { file_path: '/tmp/Multi.cs', content: '[When(@"запрос через /v1/models")]\npublic void A() {}\n[Then(@"курс USD/RUB корректен")]\npublic void B() {}\n' });
});

When(/^hook receives Edit with clean `old_string` and bad CE pattern in `new_string`$/, function (this: CeWorld) {
  runGuard.call(this, 'Edit', { file_path: '/tmp/X.cs', old_string: 'public void Foo() {}', new_string: '[Then(@"курс USD/RUB корректен")]\npublic void Foo() {}' });
});

// ── @feature4 — scope ───────────────────────────────────────────────────────
When(/^hook receives Write of `\.ts` file containing `(.+)` as string$/, function (this: CeWorld, pattern: string) {
  runGuard.call(this, 'Write', { file_path: '/tmp/X.ts', content: `const bad = \`${pattern}\`;` });
});

When(/^hook receives Write of `\.cs` file with ordinary class and methods, no attributes$/, function (this: CeWorld) {
  runGuard.call(this, 'Write', { file_path: '/tmp/Plain.cs', content: 'public class Foo { public void Bar() { /* url: /v1/models */ } }' });
});

When(/^hook receives tool name "Bash" with command containing `(.+)`$/, function (this: CeWorld, urlPath: string) {
  runGuard.call(this, 'Bash', { command: `curl ${urlPath}` });
});

// ── @feature5 — resilience ──────────────────────────────────────────────────
When(/^hook receives invalid JSON on stdin$/, function (this: CeWorld) {
  runGuardRaw.call(this, '{not valid json{{{');
});

// ── shared outcome steps ────────────────────────────────────────────────────
Then(/^hook SHALL deny with exit code 2$/, function (this: CeWorld) {
  assert.equal(this.ceStatus, 2, `expected exit 2, got ${this.ceStatus}`);
  assert.equal(this.ceDecision, 'deny');
});

Then(/^hook SHALL allow with exit code 0$/, function (this: CeWorld) {
  assert.equal(this.ceStatus, 0, `expected exit 0, got ${this.ceStatus} (reason: ${this.ceReason ?? ''})`);
});

Then(/^deny message SHALL name the violating line and keyword `When`$/, function (this: CeWorld) {
  assert.match(this.ceReason ?? '', /line 1/);
  assert.match(this.ceReason ?? '', /When/);
});

Then(/^deny message SHALL show both fix options — `\^\$` anchors AND `\\\/` escape$/, function (this: CeWorld) {
  assert.match(this.ceReason ?? '', /\^\$/);
  assert.match(this.ceReason ?? '', /\\\//);
});

Then(/^deny message SHALL list both violations with their line numbers$/, function (this: CeWorld) {
  assert.match(this.ceReason ?? '', /2 violation\(s\)/);
  assert.match(this.ceReason ?? '', /line 1/);
  assert.match(this.ceReason ?? '', /line 3/);
});

// ── @feature6 — registration + asset presence (guard now wired, FR-13 gap fixed) ──
Then(/^reqnroll-ce-guard is registered as a Write\|Edit PreToolUse hook in both plugin manifests$/, function () {
  for (const rel of ['.claude-plugin/hooks.json', '.claude/settings.json']) {
    const json = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8'));
    const pre = json.hooks?.PreToolUse ?? [];
    const wb = pre.find((b: { matcher?: string }) => b.matcher === 'Write|Edit');
    assert.ok(wb, `${rel}: no Write|Edit PreToolUse block`);
    assert.ok((wb.hooks ?? []).some((h: { command?: string }) => (h.command ?? '').includes('reqnroll-ce-guard')), `${rel}: reqnroll-ce-guard not registered`);
  }
});

Then(/^the reqnroll-ce-guard rule file is present under `\.claude\/rules\/`$/, function () {
  const ruleFile = path.join(REPO_ROOT, '.claude', 'rules', 'reqnroll-ce-guard', 'reqnroll-ce-slash.md');
  assert.ok(fs.existsSync(ruleFile), `rule file missing: ${ruleFile}`);
  const content = fs.readFileSync(ruleFile, 'utf-8');
  assert.match(content, /Cucumber Expression/);
  assert.match(content, /Alternative may not be empty/);
});

Then(/^the ce_slash_guard hook script is present under `tools\/`$/, function () {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'tools', 'reqnroll-ce-guard', 'ce_slash_guard.ts')), 'hook script missing');
});
