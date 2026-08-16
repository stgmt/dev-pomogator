#!/usr/bin/env npx tsx
/**
 * Bulk-run verify.ts over every .specs/ folder in the repo. Capture summary.
 *
 * Output: .claude/skills/spec-reality-check/evals/iterations/iteration-2/bulk-real-specs.json
 *
 * Useful for surfacing edge cases, false positives, perf outliers on the entire
 * real corpus — not just hand-picked baselines.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runChecks } from '../scripts/verify';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SPECS_DIR = path.join(REPO_ROOT, '.specs');
const OUT_PATH = path.join(__dirname, 'iterations', 'iteration-2', 'bulk-real-specs.json');

// strong-tests:skip diagnostic-only helper; output is the inspection itself, fail-loud on broken fs.readdirSync
function listSpecs(): string[] {
  const items = fs.readdirSync(SPECS_DIR, { withFileTypes: true });
  return items
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'backlog')
    .map((d) => d.name)
    .sort();
}

interface SpecResult {
  slug: string;
  duration_ms: number;
  total: number;
  error: number;
  warning: number;
  info: number;
  codes: Record<string, number>;
  has_fr_md: boolean;
  has_fc_md: boolean;
  has_tasks_md: boolean;
  errored?: string;
}

function inspect(slug: string): SpecResult {
  const specDir = path.join(SPECS_DIR, slug);
  const start = process.hrtime.bigint();
  try {
    const r = runChecks(specDir, REPO_ROOT);
    const ns = Number(process.hrtime.bigint() - start);
    const codes: Record<string, number> = {};
    for (const f of r.findings) codes[f.check] = (codes[f.check] || 0) + 1;
    return {
      slug,
      duration_ms: Math.round((ns / 1e6) * 100) / 100,
      total: r.summary.total,
      error: r.summary.by_severity.ERROR,
      warning: r.summary.by_severity.WARNING,
      info: r.summary.by_severity.INFO,
      codes,
      has_fr_md: fs.existsSync(path.join(specDir, 'FR.md')),
      has_fc_md: fs.existsSync(path.join(specDir, 'FILE_CHANGES.md')),
      has_tasks_md: fs.existsSync(path.join(specDir, 'TASKS.md')),
    };
  } catch (e: any) {
    const ns = Number(process.hrtime.bigint() - start);
    return {
      slug,
      duration_ms: Math.round((ns / 1e6) * 100) / 100,
      total: -1,
      error: -1,
      warning: -1,
      info: -1,
      codes: {},
      has_fr_md: false,
      has_fc_md: false,
      has_tasks_md: false,
      errored: e?.message || String(e),
    };
  }
}

function main(): number {
  const slugs = listSpecs();
  console.log(`Inspecting ${slugs.length} specs in ${SPECS_DIR}...`);

  const start = Date.now();
  const results = slugs.map((s) => {
    const r = inspect(s);
    const indicator = r.errored ? 'CRASH' : r.error > 0 ? 'ERR ' : r.warning > 5 ? 'WARN' : 'OK  ';
    console.log(`  ${indicator} ${s.padEnd(40)} ${r.duration_ms.toString().padStart(6)}ms  err=${r.error} warn=${r.warning} info=${r.info}${r.errored ? ' — ' + r.errored : ''}`);
    return r;
  });

  const crashed = results.filter((r) => r.errored);
  const erroring = results.filter((r) => !r.errored && r.error > 0);
  const clean = results.filter((r) => !r.errored && r.error === 0);

  const slowest = [...results].filter((r) => !r.errored).sort((a, b) => b.duration_ms - a.duration_ms).slice(0, 5);

  const codeFreq: Record<string, number> = {};
  for (const r of results) {
    if (r.errored) continue;
    for (const [code, n] of Object.entries(r.codes)) {
      codeFreq[code] = (codeFreq[code] || 0) + n;
    }
  }

  const totalDuration = results.reduce((s, r) => s + (r.errored ? 0 : r.duration_ms), 0);

  const out = {
    ran_at: new Date().toISOString(),
    specs_total: slugs.length,
    crashed_count: crashed.length,
    erroring_count: erroring.length,
    clean_count: clean.length,
    duration_total_ms: Math.round(totalDuration * 100) / 100,
    duration_wall_ms: Date.now() - start,
    crashed,
    erroring: erroring.map((r) => ({ slug: r.slug, error: r.error, codes: r.codes, duration_ms: r.duration_ms })),
    slowest,
    code_frequency: codeFreq,
    per_spec: results,
  };
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log(`\nSummary:`);
  console.log(`  crashed: ${crashed.length}`);
  console.log(`  with ERRORs: ${erroring.length}`);
  console.log(`  clean (0 ERROR): ${clean.length}`);
  console.log(`  total findings duration: ${Math.round(totalDuration)}ms (algorithm only)`);
  console.log(`  wall time: ${Date.now() - start}ms`);
  console.log(`  output: ${OUT_PATH}`);
  return 0;
}

const isDirectRun = (() => {
  try {
    const entry = process.argv[1] || '';
    return entry.endsWith('bulk-run.ts') || entry.endsWith('bulk-run.js');
  } catch { return false; }
})();

if (isDirectRun) process.exit(main());
