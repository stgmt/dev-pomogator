// Explicit SPEC-level status marker — NOT algorithmically inferred from task states.
//
// A spec is `backlog` (being built / populated / parked) or `active` (default). A `backlog`
// spec is EXCLUDED from the task-census, so its open tasks no longer count as "open work" and
// the claim-evidence Stop-gate (pinator) stops firing on them. You MARK a spec backlog explicitly
// (via the `set_spec_status` MCP tool) — the census just reads the marker, no status math.
//
// Storage: a one-word sentinel file `.specs/<slug>/.spec-status` (content `backlog`). Absent =
// `active` (the default), so an active spec carries no file (tree stays clean). Atomic write per
// the atomic-config-save rule (temp + rename). The graph builder ignores it (not *.md/*.feature).

import fs from 'node:fs';
import path from 'node:path';

export type SpecStatus = 'active' | 'backlog';
export const SPEC_STATUSES: readonly SpecStatus[] = ['active', 'backlog'] as const;

const SENTINEL = '.spec-status';

function statusPath(repoRoot: string, slug: string): string {
  return path.join(repoRoot, '.specs', slug, SENTINEL);
}

/** Read a spec's explicit status. Absent / unreadable / unknown value → `active` (fail-open). */
export function readSpecStatus(repoRoot: string, slug: string): SpecStatus {
  try {
    const raw = fs.readFileSync(statusPath(repoRoot, slug), 'utf-8').trim();
    return (SPEC_STATUSES as readonly string[]).includes(raw) ? (raw as SpecStatus) : 'active';
  } catch {
    return 'active';
  }
}

/**
 * Set a spec's explicit status (atomic). `active` (the default) REMOVES the sentinel so the tree
 * stays clean. Throws if the spec dir does not exist (so a typo'd slug fails loudly, not silently).
 */
export function writeSpecStatus(repoRoot: string, slug: string, status: SpecStatus): void {
  const specDir = path.join(repoRoot, '.specs', slug);
  if (!fs.existsSync(specDir)) throw new Error(`spec not found: ${slug} (no ${path.join('.specs', slug)})`);
  const p = statusPath(repoRoot, slug);
  if (status === 'active') {
    try { fs.unlinkSync(p); } catch { /* already absent = already active */ }
    return;
  }
  const tmp = `${p}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, status + '\n');
  fs.renameSync(tmp, p);
}

/**
 * Every spec slug currently marked `backlog`. Walks `.specs/` for `.spec-status` sentinels so it
 * handles nested slugs (e.g. `backlog/honest-status-command`). Slug = path relative to `.specs/`
 * with forward slashes (matches `specOf()` in coverage.ts). Fail-open → empty set.
 */
export function backlogSpecs(repoRoot: string): Set<string> {
  const out = new Set<string>();
  const root = path.join(repoRoot, '.specs');
  const walk = (dir: string): void => {
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.name === SENTINEL) {
        try {
          if (fs.readFileSync(full, 'utf-8').trim() === 'backlog') {
            out.add(path.relative(root, dir).split(path.sep).join('/'));
          }
        } catch {
          /* unreadable sentinel → treat as active */
        }
      }
    }
  };
  walk(root);
  return out;
}
