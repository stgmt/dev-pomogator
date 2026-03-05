/**
 * Shared utilities for rules-optimizer scripts.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { createHash } from 'crypto';
import { parse as parseYaml } from 'yaml';

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface RuleAuditEntry {
  file: string;
  tokens: number;
  hasFrontmatter: boolean;
  hasPaths: boolean;
  paths: string[];
  antipatterns: string[];
  sha256: string;
}

export interface MergeGroup {
  file: string;
  tokens: number;
  paths: string[];
}

export interface AuditResult {
  totalFiles: number;
  totalTokens: number;
  withPaths: string[];
  withoutPaths: string[];
  mergeCandidates: Record<string, MergeGroup[]>;
  antipatternFiles: { file: string; patterns: string[] }[];
  details: RuleAuditEntry[];
}

export interface AntipatternDef {
  name: string;
  description: string;
  regex: RegExp;
  fix: string;
}

// ── Canonical antipattern definitions ───────────────────────────────────────

export const ANTIPATTERNS: AntipatternDef[] = [
  {
    name: '@import syntax',
    description: 'Claude Code rules do not support @import. Each rule must be self-contained.',
    regex: /^@import\s+(.+)/mi,
    fix: 'Remove the @import line. Copy needed content directly into the rule file.',
  },
  {
    name: 'paths in HTML comment',
    description: 'Path specifications in HTML comments are ignored. Use YAML frontmatter.',
    regex: /<!--\s*paths?:.*?-->/si,
    fix: 'Replace with YAML frontmatter: ---\\npaths:\\n  - "pattern"\\n---',
  },
  {
    name: '"When to use/apply/trigger" section',
    description: 'Trigger sections should be replaced with paths: frontmatter for file-based triggers.',
    regex: /^##\s+When to (?:use|apply|trigger)/mi,
    fix: 'Move trigger info into paths: frontmatter, or remove if rule is global.',
  },
  {
    name: '"File patterns" header',
    description: 'File pattern headers are not parsed. Use YAML frontmatter paths: field.',
    regex: /^#\s+File patterns?\s*$/mi,
    fix: 'Replace with YAML frontmatter: ---\\npaths:\\n  - "pattern"\\n---',
  },
  {
    name: 'scope tags [ALWAYS]/[GLOBAL]/[SCOPED]',
    description: 'Custom scope tags are not recognized by Claude Code.',
    regex: /\[ALWAYS\]|\[GLOBAL\]|\[SCOPED\]/i,
    fix: '[ALWAYS]/[GLOBAL]: remove tag (rules are global by default). [SCOPED]: replace with paths: frontmatter.',
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

export function estimateTokens(text: string): number {
  return Math.ceil(Buffer.byteLength(text, 'utf-8') / 4);
}

export function computeSha256(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex');
}

export function parseFrontmatter(content: string, filePath?: string): { paths: string[]; hasFrontmatter: boolean; hasPaths: boolean } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return { paths: [], hasFrontmatter: false, hasPaths: false };
  }

  try {
    const parsed = parseYaml(match[1]);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.paths)) {
      return {
        paths: parsed.paths.map((p: unknown) => String(p)),
        hasFrontmatter: true,
        hasPaths: true,
      };
    }
    return { paths: [], hasFrontmatter: true, hasPaths: false };
  } catch (e) {
    if (filePath) {
      console.warn(`Warning: malformed YAML frontmatter in ${filePath}: ${(e as Error).message}`);
    }
    return { paths: [], hasFrontmatter: true, hasPaths: false };
  }
}

export function detectAntipatterns(content: string): string[] {
  const found: string[] = [];
  for (const ap of ANTIPATTERNS) {
    if (ap.regex.test(content)) {
      found.push(ap.name);
    }
  }
  return found;
}

/**
 * Collect all .md files recursively from a directory.
 * Note: symlinks are not followed (isFile/isDirectory return false for symlinks).
 */
export function collectMdFiles(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMdFiles(fullPath));
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Validate that a path is an existing directory. Exits with error if not.
 */
export function validateDir(absDir: string): void {
  if (!existsSync(absDir)) {
    console.error(`Error: path not found: ${absDir}`);
    process.exit(2);
  }
  if (!statSync(absDir).isDirectory()) {
    console.error(`Error: path is not a directory: ${absDir}`);
    process.exit(2);
  }
}
