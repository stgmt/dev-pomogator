/**
 * Additive merge helper for `.claude-plugin/hooks.json` (FR-25 invariant).
 *
 * v4 install MUST NOT replace the 5 existing v3 form-guard hooks. Instead,
 * new v4 hook entries are appended next to existing ones, and only
 * collisions on the identity key `(event, matcher, command)` are dedup'd.
 *
 *   currentHooks      what's already in `.claude-plugin/hooks.json`
 *   newHookEntries    what v4 install wants to add
 *   ──────────────►   merged hooks.json content (object form)
 *
 * The merger:
 *   • Preserves the order of `currentHooks` (v3 entries stay first).
 *   • Appends any `newHookEntries` whose `(event, matcher, command)` tuple
 *     does NOT already appear in `currentHooks`.
 *   • If a `newHookEntries` row matches an existing tuple, the existing
 *     row wins (idempotent re-install behavior).
 *
 * Identity key chosen per the v3 meta-guard's reasoning: `event` separates
 * lifecycle phases, `matcher` separates tool-name regexes, `command`
 * separates implementations. Two hooks differing on any of these are
 * semantically distinct.
 *
 * @see .specs/spec-generator-v4/FR.md FR-25
 */

/**
 * The on-disk shape of `.claude-plugin/hooks.json` follows the Anthropic
 * plugin spec — a map of event names to arrays of `{matcher, hooks:[…]}`.
 * Each inner hook is `{type, command}` plus arbitrary metadata.
 */
export type HookEvent = 'PreToolUse' | 'PostToolUse' | 'Stop' | 'UserPromptSubmit' | string;

export interface HookEntry {
  type: 'command';
  command: string;
  [key: string]: unknown;
}

export interface MatcherGroup {
  matcher?: string;
  hooks: HookEntry[];
}

export type HooksManifest = Partial<Record<HookEvent, MatcherGroup[]>>;

function tupleKey(event: HookEvent, matcher: string | undefined, command: string): string {
  return `${event}${matcher ?? '*'}${command}`;
}

/**
 * Merge `newManifest` into `currentManifest` additively. Identity key
 * `(event, matcher, command)` dedup'd to avoid double-install regressions.
 *
 * Returns a NEW object; neither input is mutated.
 */
export function additiveMergeHooks(
  currentManifest: HooksManifest,
  newManifest: HooksManifest,
): HooksManifest {
  const seen = new Set<string>();
  const out: HooksManifest = {};

  // Pass 1 — copy current as-is, seeding the dedup set.
  for (const [event, groups] of Object.entries(currentManifest) as Array<[HookEvent, MatcherGroup[]]>) {
    if (!groups) continue;
    const newGroups: MatcherGroup[] = [];
    for (const g of groups) {
      const cloned: MatcherGroup = { matcher: g.matcher, hooks: [...g.hooks] };
      for (const h of g.hooks) seen.add(tupleKey(event, g.matcher, h.command));
      newGroups.push(cloned);
    }
    out[event] = newGroups;
  }

  // Pass 2 — append entries from new manifest that aren't already there.
  for (const [event, groups] of Object.entries(newManifest) as Array<[HookEvent, MatcherGroup[]]>) {
    if (!groups) continue;
    const dest: MatcherGroup[] = out[event] ?? (out[event] = []);
    for (const g of groups) {
      const fresh: HookEntry[] = [];
      for (const h of g.hooks) {
        const k = tupleKey(event, g.matcher, h.command);
        if (seen.has(k)) continue;
        seen.add(k);
        fresh.push(h);
      }
      if (fresh.length === 0) continue;
      // If a matcher group with the same `matcher` string already exists in
      // dest, splice into it; otherwise add a new group. This keeps the
      // on-disk JSON readable (no two groups for the same matcher).
      const target = dest.find((d) => (d.matcher ?? '*') === (g.matcher ?? '*'));
      if (target) target.hooks.push(...fresh);
      else dest.push({ matcher: g.matcher, hooks: fresh });
    }
  }
  return out;
}

/**
 * Count the total hook entries across all events in a manifest.
 * Useful for regression tests asserting «count after install ≥ count before».
 */
export function countHookEntries(manifest: HooksManifest): number {
  let n = 0;
  for (const groups of Object.values(manifest)) {
    if (!groups) continue;
    for (const g of groups) n += g.hooks.length;
  }
  return n;
}
