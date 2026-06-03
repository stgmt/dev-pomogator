/**
 * SPECGEN004_52 (FR-25) — canonical plugin ships a complete static hooks.json.
 *
 * The v1/npm install-merge model is deprecated; the v2 canonical plugin ships
 * its own `.claude-plugin/hooks.json` loaded by Claude Code directly. The
 * additive-union invariant is asserted against the REAL shipped manifest: the
 * v4 spec hooks coexist with the pre-existing protective hooks, nothing dropped.
 *
 * @see .specs/spec-generator-v4/FR.md FR-25
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';

interface HookEntry {
  matcher?: string;
  hooks: Array<{ command?: string }>;
}
interface HooksManifest {
  hooks: Record<string, HookEntry[]>;
}

interface HooksWorld extends V4World {
  manifest?: HooksManifest;
  manifestJson?: string;
}

const HOOKS_PATH = path.join(process.cwd(), '.claude-plugin', 'hooks.json');

/** Every `command` string across a manifest event array. */
const commandsOf = (entries: HookEntry[] = []): string[] =>
  entries.flatMap((e) => e.hooks.map((h) => h.command ?? ''));

Given(/dev-pomogator v4 is distributed as a canonical plugin that ships its own static .*hooks\.json/, function () {
  assert.ok(fs.existsSync(HOOKS_PATH), 'the canonical .claude-plugin/hooks.json must exist');
});

When(/the plugin hook manifest is loaded/, function (this: HooksWorld) {
  this.manifestJson = fs.readFileSync(HOOKS_PATH, 'utf8');
  this.manifest = JSON.parse(this.manifestJson) as HooksManifest;
});

Then(/.* declares the v4 spec hooks .*spec-conformance-guard.*spec-conformance-push.*bash-post-test/, function (
  this: HooksWorld,
) {
  for (const target of [
    'spec-conformance-guard/spec-conformance-guard.ts',
    'spec-conformance-push/spec-conformance-push.ts',
    'bash-post-test/ingest.ts',
  ]) {
    assert.ok(this.manifestJson!.includes(target), `hooks.json must declare ${target}`);
  }
});

Then(/it retains the pre-existing protective hook entries .* never a replacement/, function (
  this: HooksWorld,
) {
  // The v4 spec guard lives in PreToolUse ALONGSIDE the protective gates —
  // proving the spec hook was added, not substituted for, the existing set.
  const pre = commandsOf(this.manifest!.hooks.PreToolUse);
  assert.ok(pre.some((c) => c.includes('spec-conformance-guard')), 'PreToolUse must include the v4 spec guard');
  assert.ok(
    pre.some((c) => /plan-gate|build_guard|test_guard|phase-gate/.test(c)),
    'PreToolUse must still carry a pre-existing protective hook (additive union)',
  );
});

Then(/length\(hooks\.PreToolUse\) >= 1.*length\(hooks\.PostToolUse\) >= 1/, function (this: HooksWorld) {
  assert.ok((this.manifest!.hooks.PreToolUse?.length ?? 0) >= 1);
  assert.ok((this.manifest!.hooks.PostToolUse?.length ?? 0) >= 1);
});
