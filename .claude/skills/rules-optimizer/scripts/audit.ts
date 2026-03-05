#!/usr/bin/env npx tsx
/**
 * Rules Optimizer — Audit Script
 *
 * Analyzes .claude/rules/ directory:
 * - Parses YAML frontmatter (paths field)
 * - Estimates token count
 * - Detects antipatterns
 * - Identifies merge candidates (semantic overlap, not just prefix)
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, relative, basename } from 'path';
import {
  type RuleAuditEntry, type AuditResult, type MergeGroup,
  estimateTokens, computeSha256, parseFrontmatter, detectAntipatterns,
  collectMdFiles, validateDir,
} from './shared.js';

// ── Merge candidates ────────────────────────────────────────────────────────

/**
 * Compute Jaccard similarity between two sets of glob patterns.
 */
function globJaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a.map(p => p.toLowerCase().replace(/\\/g, '/')));
  const setB = new Set(b.map(p => p.toLowerCase().replace(/\\/g, '/')));
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Group files into merge candidates based on:
 * 1. Common filename prefix (at least 2 segments for files without paths)
 * 2. Overlapping paths (Jaccard > 0.3) for files WITH paths
 * 3. Both files < 200 tokens
 */
function findMergeCandidates(entries: RuleAuditEntry[]): Record<string, MergeGroup[]> {
  const candidates: Record<string, MergeGroup[]> = {};
  const smallEntries = entries.filter(e => e.tokens < 200);

  for (let i = 0; i < smallEntries.length; i++) {
    for (let j = i + 1; j < smallEntries.length; j++) {
      const a = smallEntries[i];
      const b = smallEntries[j];

      const nameA = basename(a.file, '.md');
      const nameB = basename(b.file, '.md');

      const partsA = nameA.split('-');
      const partsB = nameB.split('-');

      let commonPrefix = 0;
      for (let k = 0; k < Math.min(partsA.length, partsB.length); k++) {
        if (partsA[k] === partsB[k]) commonPrefix++;
        else break;
      }

      if (commonPrefix === 0) continue;

      if (a.hasPaths && b.hasPaths) {
        const jaccard = globJaccard(a.paths, b.paths);
        if (jaccard < 0.3) continue;
      } else if (a.hasPaths || b.hasPaths) {
        continue;
      }
      // Both without paths — require at least 2 common prefix segments
      if (!a.hasPaths && !b.hasPaths && commonPrefix < 2) continue;

      const groupKey = partsA.slice(0, commonPrefix).join('-');
      if (!candidates[groupKey]) candidates[groupKey] = [];

      const existing = candidates[groupKey];
      if (!existing.some(e => e.file === a.file)) {
        existing.push({ file: a.file, tokens: a.tokens, paths: a.paths });
      }
      if (!existing.some(e => e.file === b.file)) {
        existing.push({ file: b.file, tokens: b.tokens, paths: b.paths });
      }
    }
  }

  return candidates;
}

// ── Main ────────────────────────────────────────────────────────────────────

function audit(dir: string): AuditResult {
  const absDir = resolve(dir);
  const files = collectMdFiles(absDir);

  const details: RuleAuditEntry[] = [];
  const withPaths: string[] = [];
  const withoutPaths: string[] = [];
  const antipatternFiles: { file: string; patterns: string[] }[] = [];
  let totalTokens = 0;

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf-8');
    const relPath = relative(process.cwd(), filePath).replace(/\\/g, '/');
    const tokens = estimateTokens(content);
    const sha256 = computeSha256(content);
    const { paths, hasFrontmatter, hasPaths } = parseFrontmatter(content, relPath);
    const antipatterns = detectAntipatterns(content);

    const entry: RuleAuditEntry = {
      file: relPath,
      tokens,
      hasFrontmatter,
      hasPaths,
      paths,
      antipatterns,
      sha256,
    };

    details.push(entry);
    totalTokens += tokens;

    if (hasPaths) {
      withPaths.push(relPath);
    } else {
      withoutPaths.push(relPath);
    }

    if (antipatterns.length > 0) {
      antipatternFiles.push({ file: relPath, patterns: antipatterns });
    }
  }

  const mergeCandidates = findMergeCandidates(details);

  return {
    totalFiles: details.length,
    totalTokens,
    withPaths,
    withoutPaths,
    mergeCandidates,
    antipatternFiles,
    details,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  let dir = '.claude/rules';
  let savePath: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) {
      dir = args[++i];
    } else if (args[i] === '--save' && args[i + 1]) {
      savePath = args[++i];
    }
  }

  validateDir(resolve(dir));

  const result = audit(dir);

  // Print summary
  console.log(`\n=== Rules Audit ===`);
  console.log(`Total files: ${result.totalFiles}`);
  console.log(`Total tokens: ${result.totalTokens}`);
  console.log(`With paths (scoped): ${result.withPaths.length}`);
  console.log(`Without paths (global): ${result.withoutPaths.length}`);

  if (result.withoutPaths.length > 0) {
    console.log(`\n--- Global rules (candidates for scoping) ---`);
    for (const f of result.withoutPaths) {
      const entry = result.details.find(d => d.file === f);
      console.log(`  ${f} (${entry?.tokens ?? '?'} tokens)`);
    }
  }

  const mergeKeys = Object.keys(result.mergeCandidates);
  if (mergeKeys.length > 0) {
    console.log(`\n--- Merge candidates ---`);
    for (const key of mergeKeys) {
      const group = result.mergeCandidates[key];
      const totalTok = group.reduce((s, g) => s + g.tokens, 0);
      console.log(`  Group "${key}" (${group.length} files, ${totalTok} tokens):`);
      for (const g of group) {
        console.log(`    - ${g.file} (${g.tokens} tokens, paths: [${g.paths.join(', ')}])`);
      }
    }
  }

  if (result.antipatternFiles.length > 0) {
    console.log(`\n--- Antipatterns detected ---`);
    for (const af of result.antipatternFiles) {
      console.log(`  ${af.file}:`);
      for (const p of af.patterns) {
        console.log(`    - ${p}`);
      }
    }
  } else {
    console.log(`\nNo antipatterns detected.`);
  }

  if (savePath) {
    const absPath = resolve(savePath);
    writeFileSync(absPath, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`\nAudit saved to: ${absPath}`);
  }

  const hasIssues = result.antipatternFiles.length > 0 || mergeKeys.length > 0;
  process.exit(hasIssues ? 1 : 0);
}

main();
