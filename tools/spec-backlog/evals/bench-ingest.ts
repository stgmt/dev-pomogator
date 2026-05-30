// Benchmark backlog ingest at varying corpus sizes (1, 10, 30, 48 specs).
// Synthetic fixtures — each "spec" gets FR.md + 1 dead link + 1 missing-fr-section.
// Measures end-to-end: reconcileLight → classify → appendEntry → readAll.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { reconcileLight } from '../../../.claude/skills/cross-spec-reconcile/scripts/reconcile.ts';
import { classify } from '../classifier.ts';
import { appendEntry, entryId, readEntry } from '../writer.ts';

interface BenchResult {
  specs: number;
  findings_total: number;
  backlog_queued: number;
  ms_reconcile: number;
  ms_classify: number;
  ms_append: number;
  ms_total: number;
}

function seedSpec(repoRoot: string, slug: string, frCount: number): void {
  const dir = path.join(repoRoot, '.specs', slug);
  fs.mkdirSync(dir, { recursive: true });
  // FR.md with N FR headings + 1 dead link
  const frs: string[] = ['# FR — ' + slug, ''];
  for (let i = 1; i <= frCount; i++) {
    frs.push(`## FR-${i}: Requirement ${i}`);
    frs.push('');
    frs.push(`Body of FR-${i}. See [missing-doc](MISSING_${i}.md) for more.`);
    frs.push('');
  }
  // Trigger missing-fr-section: cite FR-99 which is never defined.
  frs.push('Out-of-band citation: FR-99 should be defined later.');
  fs.writeFileSync(path.join(dir, 'FR.md'), frs.join('\n'));
}

function runBench(specCount: number, frPerSpec: number): BenchResult {
  const root = path.join(os.tmpdir(), `bench-${randomUUID()}`);
  fs.mkdirSync(root, { recursive: true });
  try {
    for (let i = 0; i < specCount; i++) {
      seedSpec(root, `bench-spec-${i}`, frPerSpec);
    }

    const t0 = performance.now();
    const reports = reconcileLight({ repoRoot: root });
    const t1 = performance.now();

    let queued = 0;
    const seen = new Set<string>();
    const verdicts = [];
    for (const r of reports) {
      for (const f of r.findings) {
        const v = classify(r.specSlug, f);
        verdicts.push({ slug: r.specSlug, finding: f, verdict: v });
      }
    }
    const t2 = performance.now();

    for (const { slug, finding, verdict } of verdicts) {
      if (verdict.verdict !== 'BACKLOG' || !verdict.entry) continue;
      const id = entryId(slug, finding.code, verdict.entry.evidence);
      if (seen.has(id) || readEntry(root, id)) continue;
      seen.add(id);
      appendEntry(root, verdict.entry);
      queued++;
    }
    const t3 = performance.now();

    return {
      specs: specCount,
      findings_total: reports.reduce((a, r) => a + r.findings.length, 0),
      backlog_queued: queued,
      ms_reconcile: Math.round(t1 - t0),
      ms_classify: Math.round(t2 - t1),
      ms_append: Math.round(t3 - t2),
      ms_total: Math.round(t3 - t0),
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/** Warm-dedup bench: same corpus but pre-populated backlog → measures the dedup hit path. */
function runWarmDedup(specCount: number, frPerSpec: number): BenchResult {
  const root = path.join(os.tmpdir(), `bench-warm-${randomUUID()}`);
  fs.mkdirSync(root, { recursive: true });
  try {
    for (let i = 0; i < specCount; i++) seedSpec(root, `bench-spec-${i}`, frPerSpec);
    // Cold prepass — populate backlog
    const cold = reconcileLight({ repoRoot: root });
    for (const r of cold) {
      for (const f of r.findings) {
        const v = classify(r.specSlug, f);
        if (v.verdict !== 'BACKLOG' || !v.entry) continue;
        const id = entryId(r.specSlug, f.code, v.entry.evidence);
        if (readEntry(root, id)) continue;
        appendEntry(root, v.entry);
      }
    }
    // Now measure WARM run — every entry should hit dedup
    const t0 = performance.now();
    const reports = reconcileLight({ repoRoot: root });
    const t1 = performance.now();
    let dedupHits = 0;
    let appended = 0;
    for (const r of reports) {
      for (const f of r.findings) {
        const v = classify(r.specSlug, f);
        if (v.verdict !== 'BACKLOG' || !v.entry) continue;
        const id = entryId(r.specSlug, f.code, v.entry.evidence);
        if (readEntry(root, id)) {
          dedupHits++;
          continue;
        }
        appendEntry(root, v.entry);
        appended++;
      }
    }
    const t3 = performance.now();
    return {
      specs: specCount,
      findings_total: reports.reduce((a, r) => a + r.findings.length, 0),
      backlog_queued: appended,
      ms_reconcile: Math.round(t1 - t0),
      ms_classify: 0,
      ms_append: Math.round(t3 - t1),
      ms_total: Math.round(t3 - t0),
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function main(): void {
  const SIZES = [
    { specs: 1, fr: 5 },
    { specs: 10, fr: 10 },
    { specs: 30, fr: 10 },
    { specs: 50, fr: 12 },
    { specs: 100, fr: 10 },
  ];
  console.log(
    '\n=== COLD-START INGEST (empty backlog) ===\n' +
    'specs | FR/spec | findings | queued | reconcile (ms) | classify (ms) | append (ms) | total (ms)\n' +
    '------|---------|----------|--------|----------------|---------------|-------------|----------',
  );
  const results: BenchResult[] = [];
  for (const size of SIZES) {
    const result = runBench(size.specs, size.fr);
    results.push(result);
    console.log(
      `${result.specs.toString().padStart(5)} | ${size.fr.toString().padStart(7)} | ` +
        `${result.findings_total.toString().padStart(8)} | ` +
        `${result.backlog_queued.toString().padStart(6)} | ` +
        `${result.ms_reconcile.toString().padStart(14)} | ` +
        `${result.ms_classify.toString().padStart(13)} | ` +
        `${result.ms_append.toString().padStart(11)} | ` +
        `${result.ms_total.toString().padStart(8)}`,
    );
  }

  console.log(
    '\n=== WARM-DEDUP INGEST (pre-populated backlog) ===\n' +
    'specs | FR/spec | findings | new-queued | reconcile (ms) | dedup+append (ms) | total (ms)\n' +
    '------|---------|----------|------------|----------------|-------------------|----------',
  );
  // Warm-dedup only for medium+large corpora (cold prepass cost dominates small ones)
  for (const size of SIZES.slice(1)) {
    const warm = runWarmDedup(size.specs, size.fr);
    console.log(
      `${warm.specs.toString().padStart(5)} | ${size.fr.toString().padStart(7)} | ` +
        `${warm.findings_total.toString().padStart(8)} | ` +
        `${warm.backlog_queued.toString().padStart(10)} | ` +
        `${warm.ms_reconcile.toString().padStart(14)} | ` +
        `${warm.ms_append.toString().padStart(17)} | ` +
        `${warm.ms_total.toString().padStart(8)}`,
    );
  }

  // NFR check: 30 specs cold-start ≤ 2000 ms
  const benchmark30 = results.find((r) => r.specs === 30);
  if (benchmark30 && benchmark30.ms_total > 2000) {
    console.log(
      `\n⚠️  NFR-Performance-1 BREACH: 30-spec total ${benchmark30.ms_total}ms > 2000ms budget`,
    );
    process.exit(1);
  }
  console.log('\nNFR-Performance-1 budget (30 specs ≤2s): ✓');

  // Soft check: 100 specs ≤ 10s (early warning for scale regression)
  const benchmark100 = results.find((r) => r.specs === 100);
  if (benchmark100 && benchmark100.ms_total > 10000) {
    console.log(
      `\n⚠️  Scale regression: 100-spec cold ${benchmark100.ms_total}ms > 10s soft budget`,
    );
  }
}

main();
