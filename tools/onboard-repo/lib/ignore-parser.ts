/**
 * Ignore-files parser for Phase 0 scanning (FR-17, AC-17).
 *
 * Aggregates patterns from `.gitignore`, `.cursorignore`, `.aiderignore` (и любые
 * другие переданные ignore-файлы) + enforces always-exclude sensitive patterns
 * regardless of declared ignores (NFR-S3 defence-in-depth).
 *
 * Uses `ignore` npm package — gitignore-spec compliant (negation, directory `/`
 * suffix, `**` globstar, escape via `\`).
 *
 * See .specs/onboard-repo-phase0/{FR.md#fr-17, AC.md#ac-17, NFR.md#security}.
 */

import * as path from 'node:path';
import * as fsExtra from 'fs-extra';
import ignore, { type Ignore } from 'ignore';


export const ALWAYS_EXCLUDE_PATTERNS = [
  '.env',
  '.env.local',
  '.env.*.local',
  '**/.env',
  '**/.env.local',
  '**/*.secret',
  '**/*.secret.*',
  '**/credentials',
  '**/credentials.*',
  '**/*.pem',
  '**/*.key',
  '.aws/credentials',
];


export const SUPPORTED_IGNORE_FILES = ['.gitignore', '.cursorignore', '.aiderignore'] as const;


export interface IgnoreMatcher {
  /** Returns true if path MUST be excluded from AI-facing artifacts. */
  isIgnored: (relPath: string) => boolean;
  /** Subset of relative paths that passed the filter. */
  filter: (relPaths: string[]) => string[];
  /** Ignore files discovered on disk (for onboarding.json.ignore.external_configs_found). */
  externalConfigsFound: string[];
  /** User-supplied patterns extracted from ignore files (excluding always-exclude baseline). */
  userExcludedPaths: string[];
}


export interface LoadIgnoreOptions {
  /** Additional ignore files (relative paths from projectPath). Default: supported set. */
  files?: readonly string[];
  /** Add these patterns regardless of file contents. */
  extraPatterns?: string[];
}


export async function loadIgnoreMatcher(projectPath: string, options: LoadIgnoreOptions = {}): Promise<IgnoreMatcher> {
  const files = options.files ?? SUPPORTED_IGNORE_FILES;
  const ig: Ignore = ignore();
  ig.add(ALWAYS_EXCLUDE_PATTERNS);
  if (options.extraPatterns && options.extraPatterns.length > 0) {
    ig.add(options.extraPatterns);
  }

  const foundConfigs: string[] = [];
  const userPatterns: string[] = [];

  for (const file of files) {
    const absPath = path.join(projectPath, file);
    if (!(await fsExtra.pathExists(absPath))) continue;
    const content = await fsExtra.readFile(absPath, 'utf-8');
    const parsedPatterns = parsePatternLines(content);
    if (parsedPatterns.length === 0) continue;
    ig.add(parsedPatterns);
    foundConfigs.push(file);
    userPatterns.push(...parsedPatterns);
  }

  return {
    isIgnored: (relPath) => ig.ignores(normalizePath(relPath)),
    filter: (relPaths) => ig.filter(relPaths.map(normalizePath)),
    externalConfigsFound: foundConfigs,
    userExcludedPaths: [...new Set(userPatterns)],
  };
}


export function parsePatternLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}


export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}
