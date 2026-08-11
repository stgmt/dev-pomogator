import fs from 'node:fs';
import path from 'node:path';

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

/**
 * Resolve request-owned project state without ever treating installed plugin
 * code, daemon startup cwd, or a long-lived process environment as project
 * identity. Invalid, missing, non-directory, and relative candidates are
 * ignored so callers can fail open without writing into the plugin cache.
 */
export function normalizeProjectRoot(candidate) {
  if (typeof candidate !== 'string' || candidate.trim() === '' || !path.isAbsolute(candidate)) return null;
  try {
    const canonical = fs.realpathSync.native(candidate);
    return fs.statSync(canonical).isDirectory() ? canonical : null;
  } catch {
    return null;
  }
}

export function resolveHookProjectRoot({ input, requestProjectRoot, env = process.env } = {}) {
  const candidates = [
    input?.cwd,
    input?.project_dir,
    requestProjectRoot,
    env?.CLAUDE_PROJECT_DIR,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeProjectRoot(candidate);
    if (normalized) return normalized;
  }
  return null;
}

export function projectHasSpecs(projectRoot) {
  if (!projectRoot) return false;
  try {
    const specs = path.join(projectRoot, '.specs');
    const canonical = fs.realpathSync.native(specs);
    return isWithin(projectRoot, canonical) && fs.statSync(canonical).isDirectory();
  } catch {
    return false;
  }
}

/** Resolve a project-owned path while rejecting traversal and symlink escapes. */
export function resolveProjectPath(projectRoot, candidate, { mustExist = true } = {}) {
  const root = normalizeProjectRoot(projectRoot);
  if (!root || typeof candidate !== 'string' || candidate.trim() === '') return null;
  const absolute = path.resolve(root, candidate);
  if (!isWithin(root, absolute)) return null;
  try {
    const canonical = fs.realpathSync.native(absolute);
    return isWithin(root, canonical) ? canonical : null;
  } catch {
    if (mustExist) return null;
  }
  let parent = path.dirname(absolute);
  while (isWithin(root, parent)) {
    try {
      const canonicalParent = fs.realpathSync.native(parent);
      return isWithin(root, canonicalParent) ? absolute : null;
    } catch {
      if (parent === root) break;
      parent = path.dirname(parent);
    }
  }
  return null;
}

export function encodeProjectRootHeader(projectRoot) {
  return projectRoot ? Buffer.from(projectRoot, 'utf8').toString('base64url') : '';
}

export function decodeProjectRootHeader(value) {
  if (typeof value !== 'string' || value === '' || value.length > 16_384) return null;
  try {
    return Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}
