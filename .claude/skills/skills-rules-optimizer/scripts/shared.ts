/**
 * Shared utilities for skills-rules-optimizer scripts.
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

// ── Skill-side interfaces (FR-1, FR-4, FR-8) ────────────────────────────────

/**
 * Generic asset interface — common base для rule (.claude/rules/ markdown) и
 * skill (.claude/skills/{name}/SKILL.md). FR-8 unified scoring engine.
 */
export interface Asset {
  type: 'rule' | 'skill';
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
  tokens: number;
  lines: number;
  sha256: string;
}

/**
 * Skill audit finding с error/warning code, file location + actionable suggestion.
 */
export interface SkillFinding {
  code: string; // e.g. "FRONTMATTER_NAME_FORBIDDEN_TOKEN", "ALLOWED_TOOLS_MISSING", "OVERSIZE"
  path: string;
  severity: 'error' | 'warning';
  message: string;
  suggestion?: string;
  details?: Record<string, unknown>;
}

/**
 * Per-skill audit entry в `details[]` поле SkillAuditResult.
 */
export interface SkillAuditEntry {
  path: string;
  name: string;
  tokens: number;
  lines: number;
  frontmatter: Record<string, unknown>;
  hasFrontmatter: boolean;
  errors: string[]; // codes
  warnings: string[]; // codes
}

/**
 * Overlap detection result (FR-4 triple-axis Jaccard).
 */
export interface OverlapPair {
  a: string; // skill name (basename of dir)
  b: string;
  axis: 'trigger' | 'sections' | 'functional';
  similarity: number; // 0.0–1.0 Jaccard
  recommendation: 'merge' | 'cross-reference' | 'reorganize' | 'keep separate';
}

/**
 * Skill audit result (FR-1 output JSON shape).
 */
export interface SkillAuditResult {
  totalSkills: number;
  withErrors: SkillFinding[];
  withWarnings: SkillFinding[];
  overlaps: OverlapPair[];
  details: SkillAuditEntry[];
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
 * Parse YAML frontmatter and return the full object (rule + skill compatible).
 *
 * Returns:
 *   - `{}` if no frontmatter found
 *   - parsed object (any keys) if frontmatter present and valid YAML
 *   - `{}` if YAML malformed (warning logged when filePath provided)
 *
 * Used by both rule (`paths:`) и skill (`name`, `description`, `allowed-tools`)
 * pipelines. FR-8 unified scoring engine.
 */
export function parseFrontmatterFlexible(
  content: string,
  filePath?: string,
): { frontmatter: Record<string, unknown>; hasFrontmatter: boolean; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, hasFrontmatter: false, body: content };
  }

  try {
    const parsed = parseYaml(match[1]);
    const fm = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
    return { frontmatter: fm, hasFrontmatter: true, body: match[2] ?? '' };
  } catch (e) {
    if (filePath) {
      console.warn(`Warning: malformed YAML frontmatter in ${filePath}: ${(e as Error).message}`);
    }
    return { frontmatter: {}, hasFrontmatter: true, body: match[2] ?? '' };
  }
}

/**
 * Build Asset from file content (FR-8 unified asset model).
 */
export function buildAsset(
  filePath: string,
  type: 'rule' | 'skill',
): Asset {
  const content = readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatterFlexible(content, filePath);
  return {
    type,
    path: filePath,
    frontmatter,
    body,
    tokens: estimateTokens(content),
    lines: content.split(/\r?\n/).length,
    sha256: computeSha256(content),
  };
}

/**
 * Collect all skill directories under given parent dir. Returns paths to
 * SKILL.md files. Each skill lives in `<parent>/<name>/SKILL.md`.
 */
export function collectSkillDirs(parentDir: string): string[] {
  const results: string[] = [];
  if (!existsSync(parentDir)) return results;

  const entries = readdirSync(parentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(parentDir, entry.name, 'SKILL.md');
    if (existsSync(skillPath) && statSync(skillPath).isFile()) {
      results.push(skillPath);
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
