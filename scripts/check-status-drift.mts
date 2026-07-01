#!/usr/bin/env tsx
// check-status-drift — flag status docs that claim "deferred/todo/partial" for
// work whose code already exists on disk. Status docs drift from code reality.
// Ported from presentation-reels (a sister repo hit this 6× in one session:
// rule said a shim "still exists" — removed; spec marked an FR "DEFERRED" —
// implemented + tests passing; etc.). See
// .claude/rules/verify-status-against-code-before-acting.md
//
// Heuristic (conservative — false positives waste less than re-discovery): for
// every doc line carrying an "incomplete" status marker AND a concrete repo
// file path, if that path EXISTS → drift candidate.
//
// Usage:
//   npx tsx scripts/check-status-drift.mts          # report, exit 0
//   npx tsx scripts/check-status-drift.mts --strict  # exit 1 if any drift

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const rootIdx = args.indexOf('--root');
const ROOT = resolve(rootIdx >= 0 ? args[rootIdx + 1] : process.cwd());

const DOC_GLOBS = ['.specs', '.claude/rules', 'docs'];
const SKIP_DIRS = new Set([
  '_archived', '_proposals', 'node_modules', '.git',
  '.stryker-tmp', '.dev-pomogator-tmp', 'dist',
]);

// "pending" excluded — it appears in feature names → false positives.
const STATUS_RE =
  /(🟡|\bdeferred\b|\bDEFERRED\b|\bTODO\b|\bWIP\b|\bplanned\b|\bpartial\b|not[\s-]?(yet[\s-]?)?(implemented|done|started|wired)|🔴)/i;

// Concrete repo file path — dev-pomogator code dirs.
const PATH_RE =
  /\b((?:tools|plugin-dev|tests|scripts|extensions|oem|src|\.claude\/(?:hooks|skills|rules|commands))\/[\w./@-]+\.(?:ts|tsx|mts|js|mjs|feature|cs|json))\b/g;

interface Drift { doc: string; line: number; marker: string; path: string; text: string }

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e)) continue;
    const full = join(dir, e);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else if (e.endsWith('.md')) out.push(full);
  }
}

const docFiles: string[] = [];
for (const g of DOC_GLOBS) {
  const base = join(ROOT, g);
  if (existsSync(base)) walk(base, docFiles);
}

const drifts: Drift[] = [];
for (const doc of docFiles) {
  const lines = readFileSync(doc, 'utf-8').split('\n');
  lines.forEach((line, i) => {
    const m = line.match(STATUS_RE);
    if (!m) return;
    if (/check-status-drift|verify-status-against-code/.test(line)) return;
    const paths = Array.from(line.matchAll(PATH_RE), (p) => p[1]);
    for (const p of paths) {
      if (existsSync(join(ROOT, p))) {
        drifts.push({ doc: relative(ROOT, doc), line: i + 1, marker: m[1], path: p, text: line.trim().slice(0, 90) });
      }
    }
  });
}

if (drifts.length === 0) {
  console.log('✓ status-drift: no docs marking existing code as incomplete');
  process.exit(0);
}

console.log(`⚠ status-drift: ${drifts.length} doc line(s) mark code-that-EXISTS as incomplete — verify before acting:\n`);
for (const d of drifts) {
  console.log(`  ${d.doc}:${d.line}  [${d.marker}]  → ${d.path} EXISTS`);
  console.log(`      "${d.text}"`);
}
console.log(
  `\nThese are candidates, not proof — the file existing doesn't guarantee the feature is complete.\n` +
  `Verify each: grep usage + run the test. See verify-status-against-code-before-acting.md.`,
);
process.exit(strict ? 1 : 0);
