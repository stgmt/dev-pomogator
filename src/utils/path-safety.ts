import path from 'path';

/**
 * Normalize a relative path: backslashes → forward slashes.
 * Used as a defensive measure for paths read from manifests/configs that may
 * have been written on Windows.
 */
export function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, '/');
}

/**
 * Resolve a relative path against a project root, ensuring the result stays
 * inside the project. Returns the absolute path if safe, or `null` if the
 * path escapes the project (path traversal attempt).
 *
 * Used by managed-file operations (updater write, uninstall delete) per
 * `.claude/rules/no-unvalidated-manifest-paths.md` to prevent malicious or
 * malformed manifest entries from touching files outside the target project.
 */
export function resolveWithinProject(
  projectPath: string,
  relativePath: string,
): string | null {
  const normalized = normalizeRelativePath(relativePath);
  if (path.isAbsolute(normalized)) {
    return null;
  }
  const base = path.resolve(projectPath);
  const resolved = path.resolve(base, normalized);
  const relative = path.relative(base, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}
