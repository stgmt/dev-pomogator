/**
 * @FR-25 step definitions — SPECGEN004_228..232. Tests that the dogfood hooks
 * registry (.claude/settings.json) and the distribution hooks manifest
 * (.claude-plugin/hooks.json) stay in sync per-event so neither chain silently
 * drifts ahead (additive union, nothing dropped). Also tests the hookIdentity()
 * utility that normalises bootstrap-launcher noise and extension variants for
 * stable set comparison.
 *
 * SPECGEN004_228: hookIdentity strips bootstrap.cjs launcher noise + ext chains.
 * SPECGEN004_229..232: per-event parity (Stop / SessionStart / PreToolUse /
 *   PostToolUse / UserPromptSubmit). Each loads the REAL files and asserts
 *   symmetric set equality — artifact class (reads live files, no mocks).
 *
 * @see tools/spec-graph/__tests__/registry-parity.test.ts (vitest source)
 * @see .specs/spec-generator-v4/FR.md FR-25
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_228
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';

const STRIP_EXT = /\.(?:bundle\.mjs|ts|cjs|mjs|sh)$/;

/**
 * hookIdentity: stable hook id from a command string.
 * Inlined from tools/spec-graph/__tests__/registry-parity.test.ts — kept here
 * to avoid importing that file under cucumber (vitest describe() at top-level
 * crashes outside a vitest context). Logic is identical; no production module
 * exists for this utility (it lives in the test file as an export).
 */
function hookIdentity(command: string): string | null {
  const event = command.match(/--event\s+(\w+)/)?.[1];
  const tokens = [...command.matchAll(/([\w.-]+\.(?:bundle\.mjs|ts|cjs|mjs|sh))/g)]
    .map((m) => m[1])
    .filter((t) => t !== 'bootstrap.cjs');
  if (tokens.length === 0) return null;
  const base = tokens[tokens.length - 1].replace(STRIP_EXT, '');
  return event ? `${base} --event ${event}` : base;
}

interface ParityWorld extends V4World {
  parityEvent?: string;
  missingInDogfood?: string[];
  missingInShipped?: string[];
  snapshotFresh?: boolean;
}

const REPO_ROOT = process.cwd();
const HOOKS_JSON_PATH = path.join(REPO_ROOT, '.claude-plugin', 'hooks.json');
const SETTINGS_PATH = path.join(REPO_ROOT, '.claude', 'settings.json');
const SNAPSHOT_PATH = path.join(
  REPO_ROOT,
  'tools', 'spec-graph', '__tests__', '__fixtures__', 'registry-parity', 'settings-hooks.snapshot.json',
);

function identitiesForEvent(registry: { hooks?: Record<string, unknown> }, event: string): Set<string> {
  const out = new Set<string>();
  const groups = (registry.hooks?.[event] ?? []) as Array<{ hooks?: Array<{ command?: string }> }>;
  for (const group of groups) {
    for (const h of group.hooks ?? []) {
      const id = h.command ? hookIdentity(h.command) : null;
      if (id) out.add(id);
    }
  }
  return out;
}

function dogfoodIdentitiesForEvent(event: string): Set<string> {
  if (fs.existsSync(SETTINGS_PATH)) {
    return identitiesForEvent(JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')), event);
  }
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8')) as Record<string, string[]>;
  return new Set(snap[event] ?? []);
}

// ─── Identity utility scenarios ───────────────────────────────────────────────

Given(/^the hook identity utility is available$/, function () {
  // hookIdentity imported above — nothing to set up
});

When(/^hookIdentity is called on a bootstrap-launched \.ts command, a bundle spawn, a sh script, and a capture with --event$/, function (this: ParityWorld) {
  // All assertions inline — pure function, no async, no shared state needed.
  // Verified immediately; failures surface in the Then step.
  this.lastStdout = 'ready';
});

Then(/^it returns the script basename without extension chain and appends --event when present$/, function () {
  assert.equal(
    hookIdentity('node -e "require(...bootstrap.cjs...)" -- "tools/anchor-integrity/anchor_gate_stop.ts"'),
    'anchor_gate_stop',
    'bootstrap-launched .ts → basename',
  );
  assert.equal(
    hookIdentity("const b=p.join(x,'tools','spec-graph','test_quality_gate_stop.bundle.mjs')"),
    'test_quality_gate_stop',
    'bundle spawn → basename',
  );
  assert.equal(
    hookIdentity('bash tools/bg-task-guard/stop-guard.sh'),
    'stop-guard',
    'shell script → basename',
  );
  assert.equal(
    hookIdentity('... "tools/learnings-capture/capture.ts" --event Stop'),
    'capture --event Stop',
    '--event appended',
  );
});

// ─── Registry parity scenarios (per-event) ────────────────────────────────────

Given(/^the canonical hooks\.json and the dogfood settings\.json are both present$/, function () {
  assert.ok(fs.existsSync(HOOKS_JSON_PATH), '.claude-plugin/hooks.json must exist');
  // settings.json may be wiped mid-suite — snapshot fallback is used then.
  const fallback = fs.existsSync(SETTINGS_PATH) ? SETTINGS_PATH : SNAPSHOT_PATH;
  assert.ok(fs.existsSync(fallback), 'settings.json or fallback snapshot must exist');
});

When(/^the registry parity check runs for the (Stop|SessionStart|PreToolUse|PostToolUse|UserPromptSubmit) event$/, function (this: ParityWorld, event: string) {
  this.parityEvent = event;
  const hooksJson = JSON.parse(fs.readFileSync(HOOKS_JSON_PATH, 'utf8'));
  const dogfood = dogfoodIdentitiesForEvent(event);
  const shipped = identitiesForEvent(hooksJson, event);
  this.missingInDogfood = [...shipped].filter((id) => !dogfood.has(id)).sort();
  this.missingInShipped = [...dogfood].filter((id) => !shipped.has(id)).sort();
});

Then(/^both registries declare identical hook identities for that event$/, function (this: ParityWorld) {
  const ev = this.parityEvent!;
  assert.deepEqual(
    this.missingInDogfood,
    [],
    `${ev}: shipped to users but NOT armed in dogfood settings.json`,
  );
  assert.deepEqual(
    this.missingInShipped,
    [],
    `${ev}: in dogfood settings.json but NOT shipped to users`,
  );
});

// ─── Snapshot freshness scenario (SPECGEN004_372) ─────────────────────────────

const EVENTS_LIST = ['Stop', 'SessionStart', 'PreToolUse', 'PostToolUse', 'UserPromptSubmit'] as const;

Given(/^the committed registry-parity snapshot and the live settings\.json are both present$/, function (this: ParityWorld) {
  assert.ok(fs.existsSync(SNAPSHOT_PATH), 'committed snapshot must exist at tools/spec-graph/__tests__/__fixtures__/registry-parity/settings-hooks.snapshot.json');
  // settings.json may be absent if a sibling test wiped it — scenario handles that gracefully (pass silently)
});

When(/^the snapshot freshness check compares them for every hook event$/, function (this: ParityWorld) {
  if (!fs.existsSync(SETTINGS_PATH)) {
    // settings.json absent (wiped by sibling test or Docker) — snapshot IS the source of truth; nothing to compare
    this.snapshotFresh = true;
    return;
  }
  const liveJson = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8')) as Record<string, string[]>;
  for (const event of EVENTS_LIST) {
    const live = [...identitiesForEvent(liveJson, event)].sort();
    const snapped = (snap[event] ?? []).slice().sort();
    if (JSON.stringify(live) !== JSON.stringify(snapped)) {
      this.snapshotFresh = false;
      this.lastStdout = `${event}: snapshot drifted — live=[${live.join(',')}] snap=[${snapped.join(',')}]`;
      return;
    }
  }
  this.snapshotFresh = true;
});

Then(/^the snapshot matches the live settings\.json for every event or settings\.json is absent$/, function (this: ParityWorld) {
  assert.ok(
    this.snapshotFresh,
    `Registry-parity snapshot is stale: ${this.lastStdout ?? 'unknown drift'}. Regenerate settings-hooks.snapshot.json to match live .claude/settings.json.`,
  );
});
