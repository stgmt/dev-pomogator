#!/usr/bin/env npx tsx
/**
 * Rules Optimizer — Antipattern Checker
 *
 * Scans .claude/rules/ for deprecated syntax patterns.
 * CRLF-safe, case-insensitive detection.
 */

import { readFileSync } from 'fs';
import { resolve, relative } from 'path';
import { ANTIPATTERNS, collectMdFiles, validateDir } from './shared.js';

// ── Types ───────────────────────────────────────────────────────────────────

interface Finding {
  file: string;
  antipattern: string;
  line: number;
  match: string;
  fix: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function truncateMatch(text: string, maxLen: number = 80): string {
  const oneLine = text.replace(/\r?\n/g, ' ').trim();
  if (oneLine.length <= maxLen) return oneLine;
  return oneLine.slice(0, maxLen - 3) + '...';
}

function findLineNumber(content: string, matchIndex: number): number {
  const before = content.slice(0, matchIndex);
  return before.split(/\r?\n/).length;
}

// ── Main ────────────────────────────────────────────────────────────────────

function check(dir: string): Finding[] {
  const absDir = resolve(dir);
  const files = collectMdFiles(absDir);
  const findings: Finding[] = [];

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf-8');
    const relPath = relative(process.cwd(), filePath).replace(/\\/g, '/');

    for (const ap of ANTIPATTERNS) {
      const regex = new RegExp(ap.regex.source, ap.regex.flags);
      const match = regex.exec(content);
      if (match) {
        findings.push({
          file: relPath,
          antipattern: ap.name,
          line: findLineNumber(content, match.index),
          match: truncateMatch(match[0]),
          fix: ap.fix,
        });
      }
    }
  }

  return findings;
}

function main() {
  const args = process.argv.slice(2);
  let dir = '.claude/rules';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) {
      dir = args[++i];
    }
  }

  validateDir(resolve(dir));

  const findings = check(dir);

  if (findings.length === 0) {
    console.log('No antipatterns detected. All rules use modern syntax.');
    process.exit(0);
  }

  console.log(`\n=== Antipattern Check ===`);
  console.log(`Found ${findings.length} issue(s):\n`);

  let currentFile = '';
  for (const f of findings) {
    if (f.file !== currentFile) {
      currentFile = f.file;
      console.log(`${f.file}:`);
    }
    console.log(`  Line ${f.line}: ${f.antipattern}`);
    console.log(`    Match: ${f.match}`);
    console.log(`    Fix: ${f.fix}`);
    console.log();
  }

  process.exit(1);
}

main();
