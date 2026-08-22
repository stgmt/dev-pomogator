import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolve a candidate through its deepest existing parent. This preserves
 * realpath's symlink handling for every path component that exists while also
 * allowing containment checks for paths a caller intends to create.
 */
function resolveWithExistingParent(candidate: string): string | null {
  let current = path.resolve(candidate);
  const missing: string[] = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(current), ...missing);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return null;
      try {
        if (fs.lstatSync(current).isSymbolicLink()) return null;
      } catch (lstatError) {
        if ((lstatError as NodeJS.ErrnoException).code !== 'ENOENT') return null;
      }
      const parent = path.dirname(current);
      if (parent === current) return null;
      missing.unshift(path.basename(current));
      current = parent;
    }
  }
}

/**
 * Realpath-based containment check: is `candidate` inside `root`?
 *
 * Existing path components are resolved through realpath (symlinks followed),
 * so a symlinked escape (`<root>/link -> /elsewhere`) is rejected. Missing
 * descendants are interpreted relative to their deepest existing parent.
 * Used by MCP handlers to keep every read/mutation inside the single resolved
 * target repository root (FR-83c "single target repository root").
 */
export function isPathWithin(root: string, candidate: string): boolean {
  let rootReal: string;
  try {
    rootReal = fs.realpathSync.native(root);
  } catch {
    return false;
  }
  const candidateReal = resolveWithExistingParent(candidate);
  if (!candidateReal) return false;
  const relative = path.relative(rootReal, candidateReal);
  return relative === ''
    || (relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative));
}

/** Stable public refusal for a process/request worktree that is not this MCP's resolved root. */
export const ROOT_WORKTREE_MISMATCH = 'ROOT_WORKTREE_MISMATCH';

export interface RootWorktreeIdentity {
  /** Opaque, stable identifier; never exposes an absolute host path. */
  id: string;
}

export interface RootWorktreeCheck {
  ok: boolean;
  actual: RootWorktreeIdentity;
  declared: RootWorktreeIdentity | null;
}

/**
 * Canonicalize a real root for identity comparison. NTFS is case-insensitive;
 * POSIX is not, so lowercasing there could merge two different worktrees.
 */
function canonicalRoot(value: string): string | null {
  try {
    const real = fs.realpathSync.native(value).replace(/\\/g, '/').replace(/\/+$/, '');
    return process.platform === 'win32' ? real.toLowerCase() : real;
  } catch {
    return null;
  }
}

/** Redact a filesystem root into a deterministic identity suitable for MCP replies and provenance. */
export function redactedRootIdentity(root: string): RootWorktreeIdentity {
  const resolved = path.resolve(root).replace(/\\/g, '/').replace(/\/+$/, '');
  const canonical = canonicalRoot(root) ?? (process.platform === 'win32' ? resolved.toLowerCase() : resolved);
  return { id: crypto.createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 16) };
}

/**
 * Compare the server's resolved root with a declared/requested worktree before
 * any mutation. Missing declarations retain legacy behaviour; an unreadable or
 * different declaration fails closed.
 */
export function checkDeclaredWorktree(repoRoot: string, declaredWorktree?: string): RootWorktreeCheck {
  const actual = redactedRootIdentity(repoRoot);
  // Legacy headless launchers pass this exact unexpanded value. Treat only that
  // known spelling as absent; every other `${...}` declaration fails closed.
  if (declaredWorktree === undefined || declaredWorktree.trim() === '' || declaredWorktree.trim() === '${CLAUDE_PROJECT_DIR}') {
    return { ok: true, actual, declared: null };
  }
  const declaredCanonical = canonicalRoot(declaredWorktree);
  const declared = declaredCanonical
    ? { id: crypto.createHash('sha256').update(declaredCanonical, 'utf8').digest('hex').slice(0, 16) }
    : redactedRootIdentity(declaredWorktree);
  return { ok: declaredCanonical !== null && declared.id === actual.id, actual, declared };
}
