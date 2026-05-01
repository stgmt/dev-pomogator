#!/usr/bin/env npx tsx
/**
 * Rules Optimizer — Report Script
 *
 * Compares before/after audit JSON files and produces a summary.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { AuditResult } from './shared.js';

// ── Validation ──────────────────────────────────────────────────────────────

function validateAudit(data: unknown, label: string): AuditResult {
  if (!data || typeof data !== 'object') {
    throw new Error(`${label}: invalid JSON — expected object`);
  }
  const obj = data as Record<string, unknown>;

  if (typeof obj.totalFiles !== 'number') {
    throw new Error(`${label}: missing or invalid "totalFiles"`);
  }
  if (typeof obj.totalTokens !== 'number') {
    throw new Error(`${label}: missing or invalid "totalTokens"`);
  }
  if (!Array.isArray(obj.withPaths)) {
    throw new Error(`${label}: missing or invalid "withPaths"`);
  }
  if (!Array.isArray(obj.withoutPaths)) {
    throw new Error(`${label}: missing or invalid "withoutPaths"`);
  }
  if (!Array.isArray(obj.details)) {
    throw new Error(`${label}: missing or invalid "details"`);
  }
  if (!obj.mergeCandidates || typeof obj.mergeCandidates !== 'object') {
    throw new Error(`${label}: missing or invalid "mergeCandidates"`);
  }
  if (!Array.isArray(obj.antipatternFiles)) {
    throw new Error(`${label}: missing or invalid "antipatternFiles"`);
  }

  return data as AuditResult;
}

// ── Report ──────────────────────────────────────────────────────────────────

function generateReport(before: AuditResult, after: AuditResult): void {
  const fileDelta = after.totalFiles - before.totalFiles;
  const tokenDelta = after.totalTokens - before.totalTokens;
  const scopedDelta = after.withPaths.length - before.withPaths.length;
  const globalDelta = after.withoutPaths.length - before.withoutPaths.length;

  const antipatternsBefore = before.antipatternFiles.reduce((s, f) => s + f.patterns.length, 0);
  const antipatternsAfter = after.antipatternFiles.reduce((s, f) => s + f.patterns.length, 0);
  const antipatternDelta = antipatternsAfter - antipatternsBefore;

  const mergeBefore = Object.keys(before.mergeCandidates).length;
  const mergeAfter = Object.keys(after.mergeCandidates).length;

  // Token change percentage (positive = increase, negative = decrease)
  let tokenChangePct = '0%';
  if (before.totalTokens > 0) {
    const pct = ((after.totalTokens - before.totalTokens) / before.totalTokens * 100);
    tokenChangePct = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  }

  console.log(`\n=== Rules Optimization Report ===\n`);

  console.log(`| Metric | Before | After | Delta |`);
  console.log(`|--------|--------|-------|-------|`);
  console.log(`| Files | ${before.totalFiles} | ${after.totalFiles} | ${formatDelta(fileDelta)} |`);
  console.log(`| Tokens | ${before.totalTokens} | ${after.totalTokens} | ${formatDelta(tokenDelta)} (${tokenChangePct}) |`);
  console.log(`| Scoped (with paths) | ${before.withPaths.length} | ${after.withPaths.length} | ${formatDelta(scopedDelta)} |`);
  console.log(`| Global (no paths) | ${before.withoutPaths.length} | ${after.withoutPaths.length} | ${formatDelta(globalDelta)} |`);
  console.log(`| Antipatterns | ${antipatternsBefore} | ${antipatternsAfter} | ${formatDelta(antipatternDelta)} |`);
  console.log(`| Merge groups | ${mergeBefore} | ${mergeAfter} | ${formatDelta(mergeAfter - mergeBefore)} |`);

  // New scoped files
  const newScoped = after.withPaths.filter(f => !before.withPaths.includes(f));
  if (newScoped.length > 0) {
    console.log(`\n--- Newly scoped rules ---`);
    for (const f of newScoped) {
      const entry = after.details.find(d => d.file === f);
      console.log(`  ${f}: paths = [${entry?.paths.join(', ') ?? ''}]`);
    }
  }

  // Removed files (merged)
  const removed = before.details
    .filter(d => !after.details.some(a => a.file === d.file))
    .map(d => d.file);
  if (removed.length > 0) {
    console.log(`\n--- Removed (merged) ---`);
    for (const f of removed) {
      console.log(`  ${f}`);
    }
  }

  // Fixed antipatterns
  if (antipatternDelta < 0) {
    console.log(`\n--- Fixed antipatterns ---`);
    const beforeSet = new Set(before.antipatternFiles.flatMap(f => f.patterns.map(p => `${f.file}: ${p}`)));
    const afterSet = new Set(after.antipatternFiles.flatMap(f => f.patterns.map(p => `${f.file}: ${p}`)));
    for (const item of beforeSet) {
      if (!afterSet.has(item)) {
        console.log(`  Fixed: ${item}`);
      }
    }
  }

  console.log();
}

function formatDelta(n: number): string {
  if (n === 0) return '0';
  return n > 0 ? `+${n}` : `${n}`;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  let beforePath: string | null = null;
  let afterPath: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--before' && args[i + 1]) {
      beforePath = args[++i];
    } else if (args[i] === '--after' && args[i + 1]) {
      afterPath = args[++i];
    }
  }

  if (!beforePath || !afterPath) {
    console.error('Usage: report.ts --before <path> --after <path>');
    process.exit(2);
  }

  const absBeforePath = resolve(beforePath);
  const absAfterPath = resolve(afterPath);

  if (!existsSync(absBeforePath)) {
    console.error(`Error: before file not found: ${absBeforePath}`);
    process.exit(2);
  }
  if (!existsSync(absAfterPath)) {
    console.error(`Error: after file not found: ${absAfterPath}`);
    process.exit(2);
  }

  let beforeData: unknown;
  let afterData: unknown;

  try {
    beforeData = JSON.parse(readFileSync(absBeforePath, 'utf-8'));
  } catch (e) {
    console.error(`Error: invalid JSON in before file: ${(e as Error).message}`);
    process.exit(2);
  }

  try {
    afterData = JSON.parse(readFileSync(absAfterPath, 'utf-8'));
  } catch (e) {
    console.error(`Error: invalid JSON in after file: ${(e as Error).message}`);
    process.exit(2);
  }

  const before = validateAudit(beforeData, 'before');
  const after = validateAudit(afterData, 'after');

  generateReport(before, after);
}

main();
