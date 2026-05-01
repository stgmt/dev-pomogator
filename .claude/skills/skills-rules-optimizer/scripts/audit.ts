#!/usr/bin/env npx tsx
/**
 * audit.ts — dispatcher for rules / skills audit pipelines.
 *
 * Routes by --dir path:
 *   --dir .claude/rules    → audit-rules.ts (FR-9 verbatim, backward compat)
 *   --dir .claude/skills   → audit-skills.ts (FR-1, FR-2, FR-3)
 *   --dir <other>          → tries to detect: if directory contains *.md files
 *                            directly → rules; if contains <name>/SKILL.md
 *                            subdirs → skills; else error.
 *
 * CLI args forwarded as-is to chosen sub-script via spawnSync. Exit code
 * propagated. FR-9 backward compat: existing /suggest-rules Phase 6 invocation
 * `audit.ts --dir .claude/rules --save audit_before.json` produces byte-identical
 * output (audit-rules.ts is the original logic verbatim).
 */

import { spawnSync } from 'child_process';
import { resolve, normalize, dirname, join } from 'path';
import { existsSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type AuditMode = 'rules' | 'skills' | 'unknown';

function detectMode(dirPath: string): AuditMode {
  const norm = normalize(dirPath).toLowerCase();
  if (norm.includes(normalize('.claude/rules').toLowerCase())) return 'rules';
  if (norm.includes(normalize('.claude/skills').toLowerCase())) return 'skills';

  // Heuristic: inspect directory contents
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) return 'unknown';

  const entries = readdirSync(dirPath, { withFileTypes: true });
  const hasDirectMd = entries.some((e) => e.isFile() && e.name.endsWith('.md'));
  const hasSkillSubdirs = entries.some((e) => {
    if (!e.isDirectory()) return false;
    return existsSync(join(dirPath, e.name, 'SKILL.md'));
  });

  if (hasSkillSubdirs && !hasDirectMd) return 'skills';
  if (hasDirectMd && !hasSkillSubdirs) return 'rules';
  if (hasSkillSubdirs && hasDirectMd) return 'skills'; // mixed → prefer skills

  return 'unknown';
}

function findDirArg(argv: string[]): string {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir') return argv[i + 1] ?? '';
  }
  return '';
}

function main() {
  const argv = process.argv.slice(2);
  const dirArg = findDirArg(argv);

  if (!dirArg) {
    console.error('Usage: audit.ts --dir <path> [--save <file>] [--strict]');
    console.error('Routes по path:');
    console.error('  --dir .claude/rules   → rules audit (audit-rules.ts)');
    console.error('  --dir .claude/skills  → skills audit (audit-skills.ts)');
    process.exit(2);
  }

  const absDir = resolve(dirArg);
  const mode = detectMode(absDir);

  let target: string;
  if (mode === 'rules') target = join(__dirname, 'audit-rules.ts');
  else if (mode === 'skills') target = join(__dirname, 'audit-skills.ts');
  else {
    console.error(`Cannot determine audit mode for path: ${absDir}`);
    console.error('Expected directory containing *.md (rules) or <name>/SKILL.md (skills).');
    process.exit(2);
  }

  // Forward all args including --dir verbatim
  const result = spawnSync('npx', ['tsx', target, ...argv], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  process.exit(result.status ?? 1);
}

main();
