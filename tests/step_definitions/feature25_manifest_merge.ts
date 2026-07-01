/**
 * @feature25 step definitions — additiveMergeHooks / countHookEntries invariants
 * (FR-25: canonical plugin hooks.json is an additive union — nothing dropped).
 *
 * SPECGEN004_300..304: pure in-process tests driving the REAL additiveMergeHooks
 * and countHookEntries functions from tools/_shared/manifest-merge.ts.
 *
 * Note: additiveMergeHooks has no non-test consumer at time of migration; the
 * function exists as an invariant-guard utility for the FR-25 install-time contract.
 *
 * @see tools/_shared/manifest-merge.ts
 * @see tools/_shared/__tests__/manifest-merge.test.ts (vitest source, retired)
 * @see .specs/spec-generator-v4/FR.md FR-25
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_300..304
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { additiveMergeHooks, countHookEntries, type HooksManifest } from '../../tools/_shared/manifest-merge.ts';
import { V4World } from '../hooks/before-after.ts';

// ── Shared fixture data (mirrors manifest-merge.test.ts fixtures) ──────────────

const v3Manifest: HooksManifest = {
  PreToolUse: [
    {
      matcher: 'Write|Edit',
      hooks: [
        { type: 'command', command: 'tools/v3-form-guard-a.ts' },
        { type: 'command', command: 'tools/v3-form-guard-b.ts' },
      ],
    },
    {
      matcher: 'Bash',
      hooks: [{ type: 'command', command: 'tools/v3-bash-guard.ts' }],
    },
  ],
  PostToolUse: [
    {
      matcher: 'Write|Edit',
      hooks: [
        { type: 'command', command: 'tools/v3-audit-logger.ts' },
        { type: 'command', command: 'tools/v3-meta-guard.ts' },
      ],
    },
  ],
};

const v4Additions: HooksManifest = {
  PreToolUse: [
    {
      matcher: 'Write|Edit',
      hooks: [{ type: 'command', command: 'tools/spec-conformance-guard/spec-conformance-guard.ts' }],
    },
  ],
  PostToolUse: [
    {
      matcher: 'Write|Edit',
      hooks: [{ type: 'command', command: 'tools/spec-conformance-push/spec-conformance-push.ts' }],
    },
    {
      matcher: 'Bash',
      hooks: [{ type: 'command', command: 'tools/bash-post-test-ingest/bash-post-test-ingest.ts' }],
    },
  ],
};

// ── World extension for manifest-merge scenarios ──────────────────────────────

interface MergeWorld {
  mergedManifest?: HooksManifest;
  onceMergedManifest?: HooksManifest;
  twiceMergedManifest?: HooksManifest;
  mergedWithNewEvent?: HooksManifest;
  beforeCount?: number;
  v4Count?: number;
  afterCount?: number;
}

// ── SPECGEN004_300 — preserves every v3 hook entry after merge ────────────────

Given(/^a v3 hooks manifest with five named hook commands across PreToolUse and PostToolUse matchers$/, function (this: V4World & MergeWorld) {
  // v3Manifest is defined above — 5 commands total
  this.mergedManifest = additiveMergeHooks(v3Manifest, v4Additions);
});

Then(/^the merged manifest JSON still contains every v3 command string$/, function (this: V4World & MergeWorld) {
  const json = JSON.stringify(this.mergedManifest);
  const v3Commands = [
    'v3-form-guard-a.ts',
    'v3-form-guard-b.ts',
    'v3-bash-guard.ts',
    'v3-audit-logger.ts',
    'v3-meta-guard.ts',
  ];
  for (const cmd of v3Commands) {
    assert.ok(json.includes(cmd), `merged manifest missing v3 command: ${cmd}`);
  }
});

// ── SPECGEN004_301 — v4 entries land in the right matcher group ───────────────

When(/^additiveMergeHooks merges the v4 additions into the v3 manifest$/, function (this: V4World & MergeWorld) {
  this.mergedManifest = additiveMergeHooks(v3Manifest, v4Additions);
});

Then(/^the PreToolUse Write\|Edit matcher group contains v3 entries followed by the v4 spec-conformance-guard entry$/, function (this: V4World & MergeWorld) {
  const preWriteEdit = this.mergedManifest!.PreToolUse!.find((g) => g.matcher === 'Write|Edit');
  assert.ok(preWriteEdit, 'PreToolUse Write|Edit matcher group missing');
  const commands = preWriteEdit.hooks.map((h) => h.command);
  assert.deepEqual(commands, [
    'tools/v3-form-guard-a.ts',
    'tools/v3-form-guard-b.ts',
    'tools/spec-conformance-guard/spec-conformance-guard.ts',
  ]);
});

// ── SPECGEN004_302 — idempotent: merging twice equals merging once ────────────

When(/^additiveMergeHooks is called once on v3 and v4$/, function (this: V4World & MergeWorld) {
  this.onceMergedManifest = additiveMergeHooks(v3Manifest, v4Additions);
});

When(/^additiveMergeHooks is called a second time on the already-merged result and v4$/, function (this: V4World & MergeWorld) {
  this.twiceMergedManifest = additiveMergeHooks(this.onceMergedManifest!, v4Additions);
});

Then(/^the twice-merged manifest deep-equals the once-merged manifest$/, function (this: V4World & MergeWorld) {
  assert.deepEqual(this.twiceMergedManifest, this.onceMergedManifest);
});

// ── SPECGEN004_303 — hook count grows by exactly the new v4 count ─────────────

When(/^countHookEntries is called before and after the merge$/, function (this: V4World & MergeWorld) {
  this.beforeCount = countHookEntries(v3Manifest);
  this.v4Count = countHookEntries(v4Additions);
  this.afterCount = countHookEntries(additiveMergeHooks(v3Manifest, v4Additions));
});

Then(/^the count after merge equals the count before plus the number of new v4 entries$/, function (this: V4World & MergeWorld) {
  assert.strictEqual(
    this.afterCount!,
    this.beforeCount! + this.v4Count!,
    `expected ${this.beforeCount! + this.v4Count!} but got ${this.afterCount}`,
  );
});

// ── SPECGEN004_304 — a new event type absent from v3 is added ────────────────

Given(/^a v3 hooks manifest that has no Stop event$/, function (this: V4World & MergeWorld) {
  assert.ok(!v3Manifest.Stop, 'expected v3Manifest to have no Stop event');
});

When(/^additiveMergeHooks merges a new Stop event entry into the v3 manifest$/, function (this: V4World & MergeWorld) {
  const newEvent: HooksManifest = {
    Stop: [
      {
        matcher: '*',
        hooks: [{ type: 'command', command: 'tools/spec-stop-hook.ts' }],
      },
    ],
  };
  this.mergedWithNewEvent = additiveMergeHooks(v3Manifest, newEvent);
});

Then(/^the merged manifest has a Stop event group containing the new entry$/, function (this: V4World & MergeWorld) {
  assert.ok(this.mergedWithNewEvent!.Stop, 'Stop event missing from merged manifest');
  assert.strictEqual(
    this.mergedWithNewEvent!.Stop![0].hooks[0].command,
    'tools/spec-stop-hook.ts',
  );
});
