/**
 * Managed gitignore block writer for target projects.
 *
 * Writes a marker-bounded block to `.gitignore` containing all files managed
 * by dev-pomogator installer. This prevents `git add .` from accidentally
 * committing tools/rules/skills/commands to team repo.
 *
 * Block format:
 *   # >>> dev-pomogator (managed — do not edit) >>>
 *   .claude/settings.local.json
 *   .dev-pomogator/
 *   .claude/rules/plan-pomogator/
 *   .claude/skills/dedup-tests/
 *   ...
 *   # <<< dev-pomogator (managed — do not edit) <<<
 *
 * Idempotent: re-install regenerates block from scratch. Stale entries from
 * removed extensions disappear automatically.
 *
 * Atomic: writes via temp + move per .claude/rules/atomic-config-save.md.
 */

import fs from 'fs-extra';
import path from 'path';
import { writeFileAtomic } from '../utils/atomic-json.js';

export const MARKER_BEGIN = '# >>> dev-pomogator (managed — do not edit) >>>';
export const MARKER_END = '# <<< dev-pomogator (managed — do not edit) <<<';

/**
 * Normalize path to forward slashes (.gitignore convention, cross-platform).
 */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Collapse a flat list of file paths into directory entries where possible.
 *
 * If every managed file under a directory D is in `paths`, we can replace all
 * of them with a single entry `D/`. This keeps the marker block concise for
 * per-tool/per-skill/per-rule-subfolder directories (e.g., `.dev-pomogator/tools/specs-generator/`
 * has 30+ files — better as single entry).
 *
 * Algorithm:
 *   1. Sort paths
 *   2. Group by parent directory at each level
 *   3. If all entries under a dir prefix are in the list, collapse to dir entry
 *   4. Deduplicate
 *
 * This is a simple greedy collapse: if a directory has ALL managed content
 * (the caller ensures nothing outside managed is in `paths`), we collapse.
 *
 * Exported for unit tests.
 */
export function collapseToDirectoryEntries(paths: string[]): string[] {
  if (paths.length === 0) return [];

  // Normalize and deduplicate
  const normalized = Array.from(new Set(paths.map(normalizePath)));

  // Namespace dirs to collapse: any path matching `prefix/<name>/...` becomes `prefix/<name>/`.
  // Collapse depth = number of segments to keep (3 = `.claude/rules/plan-pomogator/`).
  // Adding a new namespace (e.g. `.claude/agents`) requires only adding an entry here.
  const COLLAPSE_DEPTH: Record<string, number> = {
    '.dev-pomogator/tools': 3,
    '.claude/rules': 3,
    '.claude/skills': 3,
  };

  const collapsedSet = new Set<string>();
  for (const p of normalized) {
    const segments = p.split('/');
    let collapsed = false;
    for (const [prefix, depth] of Object.entries(COLLAPSE_DEPTH)) {
      if (p.startsWith(prefix + '/') && segments.length > depth) {
        collapsedSet.add(segments.slice(0, depth).join('/') + '/');
        collapsed = true;
        break;
      }
    }
    if (!collapsed) {
      collapsedSet.add(p);
    }
  }

  // Special case: if the whole `.dev-pomogator/` tree is managed (plugin.json
  // metadata AND tools both present), collapse all `.dev-pomogator/...` entries
  // into a single root entry. Typical install always satisfies both.
  const hasPluginJson = normalized.some(p => p.startsWith('.dev-pomogator/.claude-plugin/'));
  const hasTools = normalized.some(p => p.startsWith('.dev-pomogator/tools/'));
  if (hasPluginJson && hasTools) {
    for (const e of Array.from(collapsedSet)) {
      if (e.startsWith('.dev-pomogator/')) {
        collapsedSet.delete(e);
      }
    }
    collapsedSet.add('.dev-pomogator/');
  }

  return Array.from(collapsedSet).sort();
}

/**
 * Write managed gitignore marker block to `{repoRoot}/.gitignore`.
 *
 * - Creates `.gitignore` if it does not exist
 * - Replaces existing marker block contents if present
 * - Appends new block at end of file if marker not found
 * - Preserves all lines outside the marker block
 * - Atomic write via temp + fs.move
 *
 * @param repoRoot Absolute path to repository root
 * @param managedPaths Array of paths to include (already normalized by caller)
 */
export async function writeManagedGitignoreBlock(
  repoRoot: string,
  managedPaths: string[],
): Promise<void> {
  const gitignorePath = path.join(repoRoot, '.gitignore');

  // Pin `.claude/settings.local.json` as the first entry (FR-1 AC-1),
  // then sort the rest alphabetically for stable bytes (idempotent re-install).
  // Deduplicate first to avoid double entries if caller included it twice.
  const LOCAL_SETTINGS = '.claude/settings.local.json';
  const normalized = Array.from(new Set(managedPaths.map(normalizePath)));
  const rest = normalized.filter(p => p !== LOCAL_SETTINGS).sort();
  const sortedPaths = [LOCAL_SETTINGS, ...rest];

  // Read existing content
  let existing = '';
  try {
    existing = await fs.readFile(gitignorePath, 'utf-8');
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code !== 'ENOENT') throw err;
    // File doesn't exist — will create
  }

  const lines = existing.length > 0 ? existing.split('\n') : [];
  const beginIdx = lines.findIndex(line => line.trim() === MARKER_BEGIN);
  const endIdx = lines.findIndex(line => line.trim() === MARKER_END);

  let newLines: string[];

  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    // Replace existing block contents
    const before = lines.slice(0, beginIdx + 1);
    const after = lines.slice(endIdx);
    newLines = [...before, ...sortedPaths, ...after];
  } else {
    // Append new block at end of file
    const prefix = lines.length > 0 && lines[lines.length - 1] !== '' ? [...lines, ''] : [...lines];
    newLines = [...prefix, MARKER_BEGIN, ...sortedPaths, MARKER_END, ''];
  }

  const newContent = newLines.join('\n');
  await writeFileAtomic(gitignorePath, newContent);
}

/**
 * Remove managed gitignore marker block from `{repoRoot}/.gitignore`.
 *
 * Preserves all lines outside the marker block. No-op if marker block absent
 * or `.gitignore` missing. Atomic write.
 *
 * Used by per-project uninstall (FR-8).
 */
export async function removeManagedGitignoreBlock(repoRoot: string): Promise<void> {
  const gitignorePath = path.join(repoRoot, '.gitignore');

  let existing = '';
  try {
    existing = await fs.readFile(gitignorePath, 'utf-8');
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'ENOENT') return; // No .gitignore — nothing to remove
    throw err;
  }

  const lines = existing.split('\n');
  const beginIdx = lines.findIndex(line => line.trim() === MARKER_BEGIN);
  const endIdx = lines.findIndex(line => line.trim() === MARKER_END);

  if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) {
    return; // No block to remove
  }

  // Remove block including markers; also remove trailing blank line if left by block
  const before = lines.slice(0, beginIdx);
  let after = lines.slice(endIdx + 1);

  // Drop single leading blank line in `after` if `before` ends on non-blank
  if (after.length > 0 && after[0] === '' && before.length > 0 && before[before.length - 1] !== '') {
    after = after.slice(1);
  }

  const newContent = [...before, ...after].join('\n');
  await writeFileAtomic(gitignorePath, newContent);
}
