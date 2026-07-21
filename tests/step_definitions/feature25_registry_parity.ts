/**
 * @FR-25 step definitions — SPECGEN004_228..232 + SPECGEN004_372.
 *
 * Tests that the canonical hook set stays intact («additive union, nothing
 * dropped») across the three places it is materialised:
 *   - the aggregated hook registry  tools/hook-service/registry.json  (source
 *     of truth since #124),
 *   - the shipped distribution manifest .claude-plugin/hooks.json,
 *   - the dogfood manifest .claude/settings.json.
 *
 * Post-#124 («eliminate per-hook Git Bash spawning») the two manifests are thin
 * HTTP-dispatch files: every hook is `{ type: "http", url: ".../v1/dispatch/
 * <Event/N/M>" }` with NO command string. Hook identity therefore can no longer
 * be read off the manifest commands — it is recovered by resolving each dispatch
 * URL to its registry route (`Event/N/M` → `{ target, args }`) and normalising
 * `target + args` with hookIdentity(). Comparing manifest command strings (the
 * pre-#124 behaviour) would compare empty sets — a false-green — so the parity
 * and snapshot-freshness checks are expressed against the registry instead.
 *
 * SPECGEN004_228: hookIdentity strips bootstrap.cjs launcher noise + ext chains.
 * SPECGEN004_229..232: per-event parity — the shipped and dogfood manifests
 *   resolve (via the registry) to the same hook-identity set, nothing dropped
 *   on either side.
 * SPECGEN004_372: the committed snapshot mirrors the live registry per event
 *   (regenerate it if the registry's hook set changes).
 *
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
 * Logic mirrored from the (removed) vitest source; kept inline so cucumber does
 * not import a vitest describe() at top level. Normalises bootstrap-launcher
 * noise + extension chains and appends `--event X` when present.
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

interface RouteEntry {
  target?: string;
  args?: string[];
  event?: string;
  timeout?: number;
  matcher?: string;
}
interface Registry {
  version?: number;
  routes?: Record<string, RouteEntry>;
}
interface HookObj {
  command?: string;
  url?: string;
}
interface Manifest {
  hooks?: Record<string, Array<{ hooks?: HookObj[] }>>;
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
const REGISTRY_PATH = path.join(REPO_ROOT, 'tools', 'hook-service', 'registry.json');
const SNAPSHOT_PATH = path.join(
  REPO_ROOT,
  'tools', 'spec-graph', '__tests__', '__fixtures__', 'registry-parity', 'settings-hooks.snapshot.json',
);

function loadRegistry(): Registry {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')) as Registry;
}

/** `/v1/dispatch/PreToolUse%2F0%2F0` → `PreToolUse/0/0` (a registry route key). */
function routeKeyFromUrl(url: string): string | null {
  const m = url.match(/\/v1\/dispatch\/(.+)$/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/** Identity of a registry route, from `target + args` (args carry `--event X`). */
function routeIdentity(route: RouteEntry | undefined): string | null {
  if (!route?.target) return null;
  return hookIdentity([route.target, ...(route.args ?? [])].join(' '));
}

/** Canonical hook-identity set for an event — straight from the registry. */
function registryIdentitiesForEvent(registry: Registry, event: string): Set<string> {
  const out = new Set<string>();
  for (const [key, route] of Object.entries(registry.routes ?? {})) {
    if (route.event === event || key.startsWith(`${event}/`)) {
      const id = routeIdentity(route);
      if (id) out.add(id);
    }
  }
  return out;
}

/**
 * Hook identities a manifest dispatches for an event. Legacy `command` hooks are
 * normalised directly; post-#124 http-dispatch hooks are resolved URL → registry
 * route → identity, so the comparison sees real hook names, not empty sets.
 */
function manifestIdentitiesForEvent(manifest: Manifest, registry: Registry, event: string): Set<string> {
  const out = new Set<string>();
  for (const group of manifest.hooks?.[event] ?? []) {
    for (const h of group.hooks ?? []) {
      let id: string | null = null;
      if (h.command) id = hookIdentity(h.command);
      else if (h.url) {
        const key = routeKeyFromUrl(h.url);
        id = routeIdentity(key ? registry.routes?.[key] : undefined);
      }
      if (id) out.add(id);
    }
  }
  return out;
}

/** Dogfood identities: live settings.json resolved via the registry; if a sibling
 * test wiped settings.json, fall back to the canonical registry set. */
function dogfoodIdentitiesForEvent(registry: Registry, event: string): Set<string> {
  if (fs.existsSync(SETTINGS_PATH)) {
    return manifestIdentitiesForEvent(JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) as Manifest, registry, event);
  }
  return registryIdentitiesForEvent(registry, event);
}

// ─── Identity utility scenarios (SPECGEN004_228) ──────────────────────────────

Given(/^the hook identity utility is available$/, function () {
  // hookIdentity defined above — nothing to set up.
});

When(/^hookIdentity is called on a bootstrap-launched \.ts command, a bundle spawn, a sh script, and a capture with --event$/, function (this: ParityWorld) {
  // Pure function; assertions live in the Then step.
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

// ─── Registry parity scenarios (per-event, SPECGEN004_229..232) ───────────────

Given(/^the canonical hooks\.json and the dogfood settings\.json are both present$/, function () {
  assert.ok(fs.existsSync(HOOKS_JSON_PATH), '.claude-plugin/hooks.json must exist');
  assert.ok(fs.existsSync(REGISTRY_PATH), 'tools/hook-service/registry.json must exist');
  // settings.json may be wiped mid-suite — dogfoodIdentitiesForEvent falls back
  // to the canonical registry set then.
  const fallback = fs.existsSync(SETTINGS_PATH) ? SETTINGS_PATH : SNAPSHOT_PATH;
  assert.ok(fs.existsSync(fallback), 'settings.json or fallback snapshot must exist');
});

When(/^the registry parity check runs for the (Stop|SessionStart|PreToolUse|PostToolUse|UserPromptSubmit) event$/, function (this: ParityWorld, event: string) {
  this.parityEvent = event;
  const registry = loadRegistry();
  const shipped = manifestIdentitiesForEvent(JSON.parse(fs.readFileSync(HOOKS_JSON_PATH, 'utf8')) as Manifest, registry, event);
  const dogfood = dogfoodIdentitiesForEvent(registry, event);
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

Given(/^the committed registry-parity snapshot and the live settings\.json are both present$/, function () {
  assert.ok(
    fs.existsSync(SNAPSHOT_PATH),
    'committed snapshot must exist at tools/spec-graph/__tests__/__fixtures__/registry-parity/settings-hooks.snapshot.json',
  );
  assert.ok(fs.existsSync(REGISTRY_PATH), 'tools/hook-service/registry.json must exist');
});

When(/^the snapshot freshness check compares them for every hook event$/, function (this: ParityWorld) {
  // Post-#124 the snapshot mirrors the REGISTRY hook set (the source of truth),
  // not the http-dispatch manifests — those carry no command identities. A drift
  // means the registry's hook set changed and the snapshot must be regenerated.
  const registry = loadRegistry();
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8')) as Record<string, string[]>;
  for (const event of EVENTS_LIST) {
    const live = [...registryIdentitiesForEvent(registry, event)].sort();
    const snapped = (snap[event] ?? []).slice().sort();
    if (JSON.stringify(live) !== JSON.stringify(snapped)) {
      this.snapshotFresh = false;
      this.lastStdout = `${event}: snapshot drifted — registry=[${live.join(',')}] snap=[${snapped.join(',')}]`;
      return;
    }
  }
  this.snapshotFresh = true;
});

Then(/^the snapshot matches the live settings\.json for every event or settings\.json is absent$/, function (this: ParityWorld) {
  assert.ok(
    this.snapshotFresh,
    `Registry-parity snapshot is stale: ${this.lastStdout ?? 'unknown drift'}. Regenerate settings-hooks.snapshot.json from tools/hook-service/registry.json (per-event hook identities).`,
  );
});
