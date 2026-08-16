import fs from 'node:fs';
import path from 'node:path';

/**
 * Canonical Anthropic plugin manifest shape (v2). `skills`/`commands` are arrays of
 * path strings pointing at source directories (or files), NOT `{ name }` objects —
 * that older shape only ever existed in the v1 installer fixtures.
 */
export interface CanonicalManifest {
  version?: string;
  skills?: unknown;
  commands?: unknown;
}

/**
 * Reads the canonical plugin manifest at `<projectRoot>/.claude-plugin/plugin.json`.
 *
 * Deliberately checks ONLY the repo-root location (where `/plugin install` and the
 * dogfood repo keep it) — NOT the nested `.dev-pomogator/.claude-plugin/` path used by
 * the v1 doctor fixtures. This keeps canonical-mode detection disjoint from the legacy
 * test fixtures, so existing checks' behaviour is unchanged under test.
 */
export function readCanonicalManifest(projectRoot: string): CanonicalManifest | null {
  const manifestPath = path.join(projectRoot, '.claude-plugin', 'plugin.json');
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as CanonicalManifest;
  } catch {
    return null;
  }
}

/** True when the project is a canonical v2 plugin install (has root .claude-plugin/plugin.json). */
export function isCanonicalInstall(projectRoot: string): boolean {
  return readCanonicalManifest(projectRoot) !== null;
}

/** Canonical reinstall command — replaces the deprecated v1 `npx dev-pomogator` flow. */
export const CANONICAL_REINSTALL_HINT =
  'Run `/plugin install dev-pomogator@stgmt --force` (canonical) — `npx dev-pomogator` is the deprecated v1 flow';
