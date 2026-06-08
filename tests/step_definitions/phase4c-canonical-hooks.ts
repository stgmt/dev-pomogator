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
  // Match each hook by its tool-directory name only — stable across BOTH the form changes:
  // (a) extension: raw `.ts` (bootstrap launcher) vs bundled `.bundle.mjs` (WS-E deps-safe);
  // (b) path syntax: slash path `tools/x/x.ts` vs join-array `'tools','x','x.bundle.mjs'`.
  // The dir name appears verbatim in every form, so this proves the hook is declared without
  // re-breaking each time the launcher is rewritten.
  for (const target of [
    'spec-conformance-guard',
    'spec-conformance-push',
    'bash-post-test',
  ]) {
    assert.ok(this.manifestJson!.includes(target), `hooks.json must declare the ${target} hook`);
  }
});

Then(/it retains the pre-existing protective hook entries .* never a replacement/, function (
  this: HooksWorld,
) {
  // The v4 spec guard lives in PreToolUse ALONGSIDE the protective gates —
  // proving the spec hook was added, not substituted for, the existing set.
  const pre = commandsOf(this.manifest!.hooks.PreToolUse);
  assert.ok(pre.some((c) => c.includes('spec-conformance-guard')), 'PreToolUse must include the v4 spec guard');
  // T-Trans.7 hardening: «nothing dropped» means EVERY member of the
  // protective family, enumerated BY NAME (a `.some()` would stay green while
  // a single gate silently vanished — the exact regression FR-25 forbids).
  // Matching by name, never by array index (AC-25 matching-by-name clause).
  for (const gate of ['plan-gate', 'phase-gate', 'build_guard', 'test_guard', 'extension-json-meta-guard', 'form-guards-dispatch', 'spec-access-guard']) {
    assert.ok(
      pre.some((c) => c.includes(gate)),
      `PreToolUse must still carry the protective ${gate} hook (additive union, nothing dropped)`,
    );
  }
});

Then(/length\(hooks\.PreToolUse\) >= 1.*length\(hooks\.PostToolUse\) >= 1/, function (this: HooksWorld) {
  assert.ok((this.manifest!.hooks.PreToolUse?.length ?? 0) >= 1);
  assert.ok((this.manifest!.hooks.PostToolUse?.length ?? 0) >= 1);
});
