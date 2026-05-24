#!/usr/bin/env npx tsx
/**
 * In-process bench for spec-reality-check verify checks.
 *
 * Measures runChecks() latency on synthetic specs with N FILE_CHANGES rows
 * (10/100/500/1000/2000). Calls verify functions directly — NO npx/tsx spawn
 * overhead. Output: bench.json with per-size timing + p50/p95 percentiles.
 *
 * Usage:
 *   npx tsx .claude/skills/spec-reality-check/evals/bench-synthetic.ts
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { runChecks } from '../scripts/verify';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_PATH = path.join(__dirname, 'iterations', 'iteration-2', 'bench.json');

const SIZES = [10, 100, 500, 1000, 2000];
const RUNS_PER_SIZE = 5;

function generateSpec(repoRoot: string, name: string, rows: number): string {
  const specDir = path.join(repoRoot, '.specs', name);
  fs.mkdirSync(specDir, { recursive: true });

  const fcLines: string[] = ['# File Changes', '', '| Path | Action | Reason |', '|------|--------|--------|'];
  for (let i = 0; i < rows; i++) {
    const action = i % 3 === 0 ? 'create' : i % 3 === 1 ? 'edit' : 'delete';
    fcLines.push(`| \`src/synthetic_${i}.ts\` | ${action} | synthetic row ${i} |`);
  }
  fs.writeFileSync(path.join(specDir, 'FILE_CHANGES.md'), fcLines.join('\n') + '\n');

  fs.writeFileSync(
    path.join(specDir, 'FR.md'),
    `# FR\n\nSynthetic spec with ${rows} rows. References: FR-1, FR-2, FR-3.\n`,
  );

  const taskLines: string[] = ['# Tasks', '', '## Phase 1', ''];
  for (let i = 0; i < Math.min(rows, 50); i++) {
    taskLines.push(`- [ ] Task ${i}`);
    taskLines.push(`  - **files:** \`src/synthetic_${i}.ts\``);
  }
  fs.writeFileSync(path.join(specDir, 'TASKS.md'), taskLines.join('\n') + '\n');

  return specDir;
}

function quantile(sortedAscending: number[], q: number): number {
  if (sortedAscending.length === 0) return 0;
  const pos = (sortedAscending.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedAscending[base + 1] !== undefined) {
    return sortedAscending[base] + rest * (sortedAscending[base + 1] - sortedAscending[base]);
  }
  return sortedAscending[base];
}

function benchSize(rows: number): { rows: number; runs: number; runs_ms: number[]; mean_ms: number; p50_ms: number; p95_ms: number; min_ms: number; max_ms: number; findings_count: number } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `bench-srcheck-${rows}-`));
  fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"bench-tmp"}\n');
  const specDir = generateSpec(tmpDir, `synthetic-${rows}`, rows);

  let lastCount = 0;
  const runs_ms: number[] = [];
  for (let i = 0; i < RUNS_PER_SIZE; i++) {
    const start = process.hrtime.bigint();
    const result = runChecks(specDir, tmpDir);
    const ns = Number(process.hrtime.bigint() - start);
    runs_ms.push(ns / 1e6);
    lastCount = result.findings.length;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });

  const sorted = [...runs_ms].sort((a, b) => a - b);
  const sum = runs_ms.reduce((s, v) => s + v, 0);
  return {
    rows,
    runs: RUNS_PER_SIZE,
    runs_ms,
    mean_ms: Math.round((sum / runs_ms.length) * 100) / 100,
    p50_ms: Math.round(quantile(sorted, 0.5) * 100) / 100,
    p95_ms: Math.round(quantile(sorted, 0.95) * 100) / 100,
    min_ms: Math.round(sorted[0] * 100) / 100,
    max_ms: Math.round(sorted[sorted.length - 1] * 100) / 100,
    findings_count: lastCount,
  };
}

function main(): number {
  console.log('In-process bench (runChecks, no spawn)');
  console.log(`Sizes: ${SIZES.join(', ')} FC rows; ${RUNS_PER_SIZE} runs per size`);
  console.log('');

  const results = SIZES.map((s) => {
    process.stdout.write(`  rows=${s.toString().padStart(5)} ... `);
    const r = benchSize(s);
    console.log(`mean=${r.mean_ms}ms p50=${r.p50_ms}ms p95=${r.p95_ms}ms (findings=${r.findings_count})`);
    return r;
  });

  const out = {
    ran_at: new Date().toISOString(),
    platform: process.platform,
    node_version: process.version,
    skill_root: '.claude/skills/spec-reality-check',
    runs_per_size: RUNS_PER_SIZE,
    method: 'runChecks() called directly in-process via import; no npx spawn',
    nfr_performance_bound_seconds: 30,
    results,
    scaling_analysis: results.map((r, i) => {
      if (i === 0) return { rows: r.rows, mean_ms: r.mean_ms, vs_prev: 'baseline' };
      const prev = results[i - 1];
      const ratio = r.mean_ms / prev.mean_ms;
      const rowRatio = r.rows / prev.rows;
      return {
        rows: r.rows,
        mean_ms: r.mean_ms,
        rows_x_vs_prev: rowRatio,
        time_x_vs_prev: Math.round(ratio * 100) / 100,
        verdict: ratio <= rowRatio * 1.2 ? 'linear-or-better' : 'super-linear',
      };
    }),
    nfr_verdict: (() => {
      const largest = results[results.length - 1];
      const bound = 30000;
      return {
        largest_size: largest.rows,
        largest_mean_ms: largest.mean_ms,
        nfr_bound_ms: bound,
        headroom_x: Math.round((bound / largest.mean_ms) * 100) / 100,
        passes_nfr: largest.mean_ms < bound,
      };
    })(),
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log(`\nBench written to: ${OUT_PATH}`);
  console.log(`NFR (≤30s) verdict:`, out.nfr_verdict);
  return 0;
}

const isDirectRun = (() => {
  try {
    const entry = process.argv[1] || '';
    return entry.endsWith('bench-synthetic.ts') || entry.endsWith('bench-synthetic.js');
  } catch { return false; }
})();

if (isDirectRun) process.exit(main());
