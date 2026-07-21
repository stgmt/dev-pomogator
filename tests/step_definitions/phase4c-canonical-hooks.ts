/**
 * SPECGEN004_52 (FR-25) — canonical plugin ships a complete hook manifest;
 * the additive-union invariant («nothing dropped») holds.
 *
 * The v1/npm install-merge model is deprecated; the v2 canonical plugin ships
 * its own hook surface loaded by Claude Code directly. Since #124 («eliminate
 * per-hook Git Bash spawning») the shipped `.claude-plugin/hooks.json` is a
 * thin HTTP-dispatch manifest pointing at the local hook-service; the ACTUAL
 * hook definitions (the v4 spec hooks + every pre-existing protective gate)
 * live in the aggregated registry `tools/hook-service/registry.json` that the
 * service dispatches to (the pre-#124 static form is preserved as
 * `.claude-plugin/hooks.legacy.json`).
 *
 * Therefore the FR-25 «nothing dropped» invariant is asserted against the
 * registry — the current source of truth for which hooks ship — while the
 * generated hooks.json is only checked for the PreToolUse/PostToolUse dispatch
 * arrays being non-empty. Asserting gate names against the generated http
 * manifest (the pre-#124 behaviour) would be a false-red: the names moved to
 * the registry by design, nothing was dropped.
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
  /** Generated HTTP-dispatch manifest (.claude-plugin/hooks.json). */
  manifest?: HooksManifest;
  manifestJson?: string;
  /** Aggregated hook registry — source of truth for which hooks ship (#124). */
  registryJson?: string;
}

const HOOKS_PATH = path.join(process.cwd(), '.claude-plugin', 'hooks.json');
const REGISTRY_PATH = path.join(process.cwd(), 'tools', 'hook-service', 'registry.json');

/** The v4 spec hooks FR-25 adds to the canonical plugin. */
const V4_SPEC_HOOKS = ['spec-conformance-guard', 'spec-conformance-push', 'bash-post-test'];
/** Every pre-existing protective gate that must survive the additive union. */
const PROTECTIVE_GATES = [
  'plan-gate',
  'phase-gate',
  'build_guard',
  'test_guard',
  'extension-json-meta-guard',
  'form-guards-dispatch',
  'spec-access-guard',
];

Given(/dev-pomogator v4 is distributed as a canonical plugin that ships its own static .*hooks\.json/, function () {
  assert.ok(fs.existsSync(HOOKS_PATH), 'the canonical .claude-plugin/hooks.json must exist');
  assert.ok(
    fs.existsSync(REGISTRY_PATH),
    'the canonical tools/hook-service/registry.json (the hook definitions the manifest dispatches to) must exist',
  );
});

When(/the plugin hook manifest is loaded/, function (this: HooksWorld) {
  this.manifestJson = fs.readFileSync(HOOKS_PATH, 'utf8');
  this.manifest = JSON.parse(this.manifestJson) as HooksManifest;
  this.registryJson = fs.readFileSync(REGISTRY_PATH, 'utf8');
  // The registry must be well-formed JSON, not just a string blob.
  JSON.parse(this.registryJson);
});

Then(/.* declares the v4 spec hooks .*spec-conformance-guard.*spec-conformance-push.*bash-post-test/, function (
  this: HooksWorld,
) {
  // Match each hook by its tool-directory name only — stable across BOTH form changes:
  // (a) extension: raw `.ts` (bootstrap launcher) vs bundled `.bundle.mjs` (WS-E deps-safe);
  // (b) path syntax: slash path `tools/x/x.ts` vs join-array `'tools','x','x.bundle.mjs'`.
  // The dir name appears verbatim in every form, so this proves the hook is declared without
  // re-breaking each time the launcher is rewritten. Post-#124 the declarations live in the
  // aggregated registry, not the generated http manifest.
  for (const target of V4_SPEC_HOOKS) {
    assert.ok(this.registryJson!.includes(target), `registry.json must declare the ${target} hook`);
  }
});

Then(/it retains the pre-existing protective hook entries .* never a replacement/, function (
  this: HooksWorld,
) {
  // The v4 spec guard ships ALONGSIDE the protective gates — proving the spec
  // hook was added, not substituted for, the existing set.
  assert.ok(
    this.registryJson!.includes('spec-conformance-guard'),
    'the shipped registry must include the v4 spec guard',
  );
  // T-Trans.7 hardening: «nothing dropped» means EVERY member of the
  // protective family, enumerated BY NAME (a single `.some()` would stay green
  // while one gate silently vanished — the exact regression FR-25 forbids).
  // Matching by name, never by array index (AC-25 matching-by-name clause).
  for (const gate of PROTECTIVE_GATES) {
    assert.ok(
      this.registryJson!.includes(gate),
      `the shipped registry must still carry the protective ${gate} hook (additive union, nothing dropped)`,
    );
  }
});

Then(/length\(hooks\.PreToolUse\) >= 1.*length\(hooks\.PostToolUse\) >= 1/, function (this: HooksWorld) {
  // The generated manifest must still dispatch at least one PreToolUse and one
  // PostToolUse entry to the hook-service (the dispatch surface is non-empty).
  assert.ok((this.manifest!.hooks.PreToolUse?.length ?? 0) >= 1);
  assert.ok((this.manifest!.hooks.PostToolUse?.length ?? 0) >= 1);
});
