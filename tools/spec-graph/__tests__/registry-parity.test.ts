// Registry-parity guard (FR-6). The repo runs hooks from `.claude/settings.json`
// (dogfood) while users get `.claude-plugin/hooks.json` (distribution). When a hook is
// added to one but not the other, a gate "code+tests but never fires" — the exact
// dead-integration class that let an untraced "spec not done" slip past (incident
// 2026-06-12). This test asserts the two registries declare the SAME hooks per event,
// so neither chain silently drifts ahead of the other.
//
// Identity = the hook script's basename without its extension chain (so a hook shipped
// as `x.bundle.mjs` in hooks.json and run as `x.ts` in settings.json count as ONE) plus
// any `--event X` arg (capture.ts is registered under two events). The `bootstrap.cjs`
// loader is dropped — it is the launcher, not the hook.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
// .claude-plugin/hooks.json is never touched by the suite — safe to read at load.
const hooksJson = JSON.parse(fs.readFileSync(path.join(repoRoot, '.claude-plugin', 'hooks.json'), 'utf8'));
// .claude/settings.json IS wiped mid-suite by a destructive sibling test
// (tests/e2e/helpers.ts setupCleanState → fs.remove(appPath('.claude','settings.json'))),
// so it is read LAZILY at test-run time (not at module load) with a committed-snapshot
// fallback — see dogfoodIdentitiesForEvent below.
const SETTINGS = path.join(repoRoot, '.claude', 'settings.json');
const SNAPSHOT = path.join(here, '__fixtures__', 'registry-parity', 'settings-hooks.snapshot.json');

const EVENTS = ['Stop', 'SessionStart', 'PreToolUse', 'PostToolUse', 'UserPromptSubmit'] as const;
const STRIP = /\.(?:bundle\.mjs|ts|cjs|mjs|sh)$/;

/** A single hook command → its stable identity (script basename sans ext [+ --event X]). */
export function hookIdentity(command: string): string | null {
  const event = command.match(/--event\s+(\w+)/)?.[1];
  // every script-file token referenced in the command, minus the bootstrap loader
  const tokens = [...command.matchAll(/([\w.-]+\.(?:bundle\.mjs|ts|cjs|mjs|sh))/g)]
    .map((m) => m[1])
    .filter((t) => t !== 'bootstrap.cjs');
  if (tokens.length === 0) return null;
  // the hook is the last remaining script token (handles `node -e "<loader>" -- "<hook>"`)
  const base = tokens[tokens.length - 1].replace(STRIP, '');
  return event ? `${base} --event ${event}` : base;
}

/** All hook identities declared for one event in a registry object. */
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

/**
 * Dogfood hook identities for one event. Reads the LIVE .claude/settings.json when it
 * survives the suite; falls back to the committed snapshot when a destructive sibling test
 * (setupCleanState → fs.remove(appPath('.claude','settings.json'))) wiped it. The snapshot
 * is kept honest by PARITY_SNAPSHOT_FRESH below. Read happens at test-RUN time, not at
 * module load, so load-order vs the wipe can't ENOENT-crash the file.
 */
function dogfoodIdentitiesForEvent(event: string): Set<string> {
  if (fs.existsSync(SETTINGS)) {
    return identitiesForEvent(JSON.parse(fs.readFileSync(SETTINGS, 'utf8')), event);
  }
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')) as Record<string, string[]>;
  return new Set(snap[event] ?? []);
}

describe('hookIdentity — stable across .ts vs .bundle.mjs and loader noise', () => {
  it('PARITY_ID_01: bootstrap-launched .ts → basename; bundle spawn → same basename', () => {
    expect(hookIdentity('node -e "require(...bootstrap.cjs...)" -- "tools/anchor-integrity/anchor_gate_stop.ts"')).toBe('anchor_gate_stop');
    expect(hookIdentity("const b=p.join(x,'tools','spec-graph','test_quality_gate_stop.bundle.mjs')")).toBe('test_quality_gate_stop');
    expect(hookIdentity('bash tools/bg-task-guard/stop-guard.sh')).toBe('stop-guard');
    expect(hookIdentity('... "tools/learnings-capture/capture.ts" --event Stop')).toBe('capture --event Stop');
  });
});

describe('registry parity — settings.json (dogfood) vs hooks.json (distribution)', () => {
  for (const event of EVENTS) {
    it(`PARITY_${event}: both registries declare the same hooks`, () => {
      const dogfood = dogfoodIdentitiesForEvent(event);
      const shipped = identitiesForEvent(hooksJson, event);
      const missingInDogfood = [...shipped].filter((id) => !dogfood.has(id)).sort();
      const missingInShipped = [...dogfood].filter((id) => !shipped.has(id)).sort();
      expect(missingInDogfood, `${event}: shipped to users but NOT armed in dogfood settings.json`).toEqual([]);
      expect(missingInShipped, `${event}: in dogfood settings.json but NOT shipped to users`).toEqual([]);
    });
  }

  // Drift guard: when the live .claude/settings.json IS present (host / before a sibling
  // wipe), the committed snapshot MUST still match it — otherwise the Docker-suite fallback
  // silently validates against a stale set. Regenerate the snapshot when this fails.
  it('PARITY_SNAPSHOT_FRESH: committed snapshot matches the live settings.json (when present)', () => {
    if (!fs.existsSync(SETTINGS)) return; // wiped by a sibling test → snapshot is the only source; nothing to compare
    const liveJson = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')) as Record<string, string[]>;
    for (const event of EVENTS) {
      const live = [...identitiesForEvent(liveJson, event)].sort();
      const snapped = (snap[event] ?? []).slice().sort();
      expect(live, `${event}: snapshot drifted from live settings.json — regenerate settings-hooks.snapshot.json`).toEqual(snapped);
    }
  });
});
