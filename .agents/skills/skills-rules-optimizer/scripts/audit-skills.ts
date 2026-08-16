#!/usr/bin/env npx tsx
/**
 * audit-skills.ts — FR-1, FR-2, FR-3.
 *
 * Scans .claude/skills/<name>/SKILL.md files и emits findings:
 *   FR-2 frontmatter validation:
 *     name: ≤64 chars, lowercase + hyphens, no "anthropic"/"claude" tokens
 *     description: ≤1024 chars (third-person heuristic — manual review)
 *     allowed-tools: non-empty list
 *   FR-3 allowed-tools coverage:
 *     body parsed for tool invocations (Bash, Edit, Write, Read, Skill(, Agent(, etc.)
 *     missing tools → error
 *   Anthropic 500-line cap (FR-2 oversize):
 *     SKILL.md > 500 lines → warning
 *
 * CLI: audit-skills.ts --dir <path> [--save <file>] [--strict]
 *   --dir       parent directory containing skill subdirs
 *   --save      write JSON output to file (default stdout)
 *   --strict    exit 1 if withErrors[].length > 0
 *
 * Output JSON shape: SkillAuditResult (see shared.ts).
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve, basename, dirname, join } from 'path';

import {
  buildAsset,
  collectSkillDirs,
  validateDir,
  type Asset,
  type SkillAuditEntry,
  type SkillAuditResult,
  type SkillFinding,
} from './shared.ts';

// ── Constants ───────────────────────────────────────────────────────────────

const ANTHROPIC_LINE_CAP = 500;
const NAME_MAX_LENGTH = 64;
const DESCRIPTION_MAX_LENGTH = 1024;
const FORBIDDEN_NAME_TOKENS = ['anthropic', 'claude'];

/**
 * Tool invocation patterns в SKILL.md body. Maps regex → declared tool name.
 * Order matters: more-specific Skill( before generic Skill word.
 */
/**
 * Tool invocation patterns. Use code-fence-aware matching: tool names в `inline code`
 * или fenced ``` ``` блоках = invocation; bare word в narrative prose = NOT invocation.
 *
 * Skill( и Agent( with literal paren — direct call syntax (e.g. `Skill("name")`) —
 * always count as invocation regardless of fencing.
 */
const TOOL_INVOCATION_PATTERNS: Array<{ regex: RegExp; tool: string }> = [
  { regex: /\bSkill\(/g, tool: 'Skill' }, // direct call: Skill("...")
  { regex: /\bAgent\(/g, tool: 'Agent' }, // direct call: Agent({...})
];

/**
 * Tool words to scan ТОЛЬКО внутри backtick code (inline `Bash` или fenced ```).
 * Narrative mentions ("the Bash tool runs commands") ignored.
 */
const CODE_FENCE_TOOLS = [
  'Bash', 'Edit', 'Write', 'Read', 'Glob', 'Grep',
  'AskUserQuestion', 'WebFetch', 'WebSearch', 'Skill', 'Agent',
];

// ── Validation rules ────────────────────────────────────────────────────────

function validateFrontmatter(asset: Asset): SkillFinding[] {
  const findings: SkillFinding[] = [];
  const fm = asset.frontmatter;
  const path = asset.path;

  // name
  const nameRaw = fm.name;
  if (typeof nameRaw !== 'string' || nameRaw.length === 0) {
    findings.push({
      code: 'FRONTMATTER_NAME_MISSING',
      path,
      severity: 'error',
      message: 'frontmatter `name` is missing or empty',
      suggestion: 'Add `name: <kebab-case-skill-name>` to frontmatter',
    });
  } else {
    const lower = nameRaw.toLowerCase();
    if (nameRaw.length > NAME_MAX_LENGTH) {
      findings.push({
        code: 'FRONTMATTER_NAME_TOO_LONG',
        path,
        severity: 'error',
        message: `frontmatter \`name\` (${nameRaw.length} chars) exceeds Anthropic limit ${NAME_MAX_LENGTH}`,
        details: { value: nameRaw, length: nameRaw.length },
      });
    }
    if (!/^[a-z0-9-]+$/.test(nameRaw)) {
      findings.push({
        code: 'FRONTMATTER_NAME_INVALID_FORMAT',
        path,
        severity: 'error',
        message: `frontmatter \`name\` "${nameRaw}" must be lowercase + hyphens only`,
        suggestion: 'Use kebab-case: lowercase letters, digits, hyphens',
      });
    }
    for (const token of FORBIDDEN_NAME_TOKENS) {
      if (lower.includes(token)) {
        findings.push({
          code: 'FRONTMATTER_NAME_FORBIDDEN_TOKEN',
          path,
          severity: 'error',
          message: `frontmatter \`name\` contains forbidden token "${token}" (Anthropic spec)`,
          details: { value: nameRaw, token },
          suggestion: `Rename без токена "${token}" в name field`,
        });
      }
    }
  }

  // description
  const descRaw = fm.description;
  if (typeof descRaw !== 'string' || descRaw.length === 0) {
    findings.push({
      code: 'FRONTMATTER_DESCRIPTION_MISSING',
      path,
      severity: 'error',
      message: 'frontmatter `description` is missing or empty',
    });
  } else if (descRaw.length > DESCRIPTION_MAX_LENGTH) {
    findings.push({
      code: 'FRONTMATTER_DESCRIPTION_TOO_LONG',
      path,
      severity: 'error',
      message: `frontmatter \`description\` (${descRaw.length} chars) exceeds Anthropic limit ${DESCRIPTION_MAX_LENGTH}`,
      details: { length: descRaw.length },
    });
  }

  // allowed-tools
  const tools = fm['allowed-tools'];
  const toolsList = parseAllowedTools(tools);
  if (toolsList.length === 0) {
    findings.push({
      code: 'FRONTMATTER_ALLOWED_TOOLS_EMPTY',
      path,
      severity: 'error',
      message: 'frontmatter `allowed-tools` is missing or empty',
      suggestion: 'Add `allowed-tools: Read, Write, ...` listing every tool used in body',
    });
  }

  return findings;
}

function checkAllowedToolsCoverage(asset: Asset): SkillFinding | null {
  const declaredList = parseAllowedTools(asset.frontmatter['allowed-tools']);
  const declared = new Set(declaredList.map((s) => s.trim()).filter(Boolean));

  const used = new Set<string>();

  // Direct invocation patterns (always count, regardless of fencing):
  for (const { regex, tool } of TOOL_INVOCATION_PATTERNS) {
    regex.lastIndex = 0;
    if (regex.test(asset.body)) {
      used.add(tool);
    }
  }

  // Code-fenced tool words: scan только внутри backticks/fences
  // Inline: `Bash`, `Edit`, ...
  // Fenced: ```...Bash...```
  const codeRegions = extractCodeRegions(asset.body);
  for (const tool of CODE_FENCE_TOOLS) {
    const wordRe = new RegExp(`\\b${tool}\\b`);
    for (const region of codeRegions) {
      if (wordRe.test(region)) {
        used.add(tool);
        break;
      }
    }
  }

  // MCP tool patterns: mcp__<server>__<tool>
  const mcpRegex = /\bmcp__[a-z0-9_-]+__[a-z0-9_-]+\b/gi;
  const mcpMatches = asset.body.match(mcpRegex) ?? [];
  for (const m of mcpMatches) used.add(m);

  const missing: string[] = [];
  for (const tool of used) {
    // Wildcard "*" в declared = covers everything
    if (declared.has('*')) break;
    if (!declared.has(tool)) {
      // Tolerate exact match — check if any declared entry equals or includes tool
      const declaredHasTool = Array.from(declared).some(
        (d) => d === tool || d.toLowerCase() === tool.toLowerCase(),
      );
      if (!declaredHasTool) missing.push(tool);
    }
  }

  if (missing.length === 0) return null;

  return {
    code: 'ALLOWED_TOOLS_MISSING',
    path: asset.path,
    severity: 'error',
    message: `body uses tools NOT declared в \`allowed-tools\`: ${missing.join(', ')}`,
    details: { missing, declared: Array.from(declared) },
    suggestion: `Add to frontmatter \`allowed-tools\`: ${missing.join(', ')}`,
  };
}

function checkOversize(asset: Asset): SkillFinding | null {
  if (asset.lines <= ANTHROPIC_LINE_CAP) return null;
  return {
    code: 'OVERSIZE',
    path: asset.path,
    severity: 'warning',
    message: `SKILL.md ${asset.lines} lines > Anthropic cap ${ANTHROPIC_LINE_CAP}`,
    details: { lines: asset.lines, cap: ANTHROPIC_LINE_CAP },
    suggestion: 'split domain-specific sections to references/<topic>.md',
  };
}

/**
 * T07 — Detect transitive references (Anthropic anti-pattern: depth >1).
 * Walks references/*.md mentioned в SKILL.md body; if any referenced file
 * itself contains references/*.md links → flag.
 */
function checkTransitiveReferences(asset: Asset): SkillFinding | null {
  const skillDir = asset.path.replace(/[\\/]SKILL\.md$/, '');
  const refRegex = /references\/([a-zA-Z0-9_-]+\.md)/g;
  const directRefs = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = refRegex.exec(asset.body)) !== null) directRefs.add(m[1]);

  for (const refFile of directRefs) {
    const refPath = join(skillDir, 'references', refFile);
    if (!existsSync(refPath)) continue;
    const refContent = readFileSync(refPath, 'utf-8');
    const nestedRefs: string[] = [];
    refRegex.lastIndex = 0;
    let n: RegExpExecArray | null;
    while ((n = refRegex.exec(refContent)) !== null) {
      if (n[1] !== refFile) nestedRefs.push(n[1]);
    }
    if (nestedRefs.length > 0) {
      return {
        code: 'TRANSITIVE_REFERENCES',
        path: asset.path,
        severity: 'warning',
        message: `references chain depth > 1: SKILL.md → ${refFile} → ${nestedRefs.join(', ')}`,
        details: { chain: ['SKILL.md', refFile, ...nestedRefs] },
        suggestion: 'Anthropic spec: references one-level-deep only. Inline B.md content into A.md или собирай в SKILL.md.',
      };
    }
  }

  return null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract all code-fenced regions from markdown body:
 *   - inline code: `foo`
 *   - fenced blocks: ```...```
 * Returns concatenated content (joined with newlines) so word-search
 * can scan all code regions в one pass.
 */
function extractCodeRegions(body: string): string[] {
  const regions: string[] = [];

  // Fenced blocks ```...``` (multiline)
  const fencedRe = /```[a-z]*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = fencedRe.exec(body)) !== null) {
    regions.push(m[1]);
  }

  // Inline code `...`
  const inlineRe = /`([^`\n]+)`/g;
  while ((m = inlineRe.exec(body)) !== null) {
    regions.push(m[1]);
  }

  return regions;
}

function parseAllowedTools(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function skillNameFromPath(skillMdPath: string): string {
  return basename(dirname(skillMdPath));
}

// ── Main ────────────────────────────────────────────────────────────────────

function audit(parentDir: string): SkillAuditResult {
  const skillPaths = collectSkillDirs(parentDir);

  const withErrors: SkillFinding[] = [];
  const withWarnings: SkillFinding[] = [];
  const details: SkillAuditEntry[] = [];

  for (const skillMdPath of skillPaths) {
    const asset = buildAsset(skillMdPath, 'skill');
    const errors: string[] = [];
    const warnings: string[] = [];

    // FR-2 frontmatter validation
    const fmFindings = validateFrontmatter(asset);
    for (const f of fmFindings) {
      if (f.severity === 'error') {
        withErrors.push(f);
        errors.push(f.code);
      } else {
        withWarnings.push(f);
        warnings.push(f.code);
      }
    }

    // FR-3 tools coverage
    const coverageFinding = checkAllowedToolsCoverage(asset);
    if (coverageFinding) {
      withErrors.push(coverageFinding);
      errors.push(coverageFinding.code);
    }

    // FR-2 oversize
    const oversizeFinding = checkOversize(asset);
    if (oversizeFinding) {
      withWarnings.push(oversizeFinding);
      warnings.push(oversizeFinding.code);
    }

    // T07 transitive references chain (Anthropic anti-pattern)
    const transitiveFinding = checkTransitiveReferences(asset);
    if (transitiveFinding) {
      withWarnings.push(transitiveFinding);
      warnings.push(transitiveFinding.code);
    }

    details.push({
      path: asset.path,
      name: skillNameFromPath(asset.path),
      tokens: asset.tokens,
      lines: asset.lines,
      frontmatter: asset.frontmatter,
      hasFrontmatter: Object.keys(asset.frontmatter).length > 0,
      errors,
      warnings,
    });
  }

  return {
    totalSkills: skillPaths.length,
    withErrors,
    withWarnings,
    overlaps: [], // populated by detect-overlap.ts; this script does not run overlap detection
    details,
  };
}

function parseArgs(argv: string[]): { dir: string; save?: string; strict: boolean } {
  let dir = '';
  let save: string | undefined;
  let strict = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dir') dir = argv[++i] ?? '';
    else if (arg === '--save') save = argv[++i];
    else if (arg === '--strict') strict = true;
  }
  if (!dir) {
    console.error('Usage: audit-skills.ts --dir <path> [--save <file>] [--strict]');
    process.exit(2);
  }
  return { dir, save, strict };
}

function main() {
  const { dir, save, strict } = parseArgs(process.argv.slice(2));
  const absDir = resolve(dir);
  validateDir(absDir);

  const result = audit(absDir);
  const output = JSON.stringify(result, null, 2);

  if (save) {
    writeFileSync(save, output, 'utf-8');
  } else {
    process.stdout.write(output + '\n');
  }

  if (strict && result.withErrors.length > 0) {
    process.exit(1);
  }
}

const isDirectRun =
  process.argv[1]?.endsWith('audit-skills.ts') ||
  process.argv[1]?.endsWith('audit-skills.js');
if (isDirectRun) {
  main();
}

export { audit, validateFrontmatter, checkAllowedToolsCoverage, checkOversize };
