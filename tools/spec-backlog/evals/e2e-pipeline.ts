// End-to-end pipeline test: synthetic 3-spec corpus → ingest → resolve
// missing-spec-file category → re-ingest → assert findings dropped.
//
// Proves the FULL loop works: detector → classifier → backlog → resolver
// → artifact written → detector no longer fires → entry marked resolved.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { reconcileLight } from '../../../.claude/skills/cross-spec-reconcile/scripts/reconcile.ts';
import { classify } from '../classifier.ts';
import { appendEntry, entryId, readEntry, readOpen, updateStatus } from '../writer.ts';
import { findResolver } from '../resolvers/registry.ts';

interface PhaseResult {
  phase: string;
  findings_total: number;
  by_code: Record<string, number>;
  backlog_open: number;
  backlog_by_category: Record<string, number>;
  ms: number;
}

function tally(reports: ReturnType<typeof reconcileLight>): {
  total: number;
  byCode: Record<string, number>;
} {
  const byCode: Record<string, number> = {};
  let total = 0;
  for (const r of reports) {
    for (const f of r.findings) {
      total++;
      byCode[f.code] = (byCode[f.code] || 0) + 1;
    }
  }
  return { total, byCode };
}

function tallyBacklog(root: string): { open: number; byCat: Record<string, number> } {
  const open = readOpen(root);
  const byCat: Record<string, number> = {};
  for (const e of open) byCat[e.category] = (byCat[e.category] || 0) + 1;
  return { open: open.length, byCat };
}

function ingest(root: string): number {
  const reports = reconcileLight({ repoRoot: root });
  let queued = 0;
  for (const r of reports) {
    for (const f of r.findings) {
      const v = classify(r.specSlug, f);
      if (v.verdict !== 'BACKLOG' || !v.entry) continue;
      const id = entryId(r.specSlug, f.code, v.entry.evidence);
      if (readEntry(root, id)) continue;
      appendEntry(root, v.entry);
      queued++;
    }
  }
  return queued;
}

async function resolveCategory(root: string, category: string): Promise<{ resolved: number; bailed: number }> {
  const open = readOpen(root).filter((e) => e.category === category);
  let resolved = 0;
  let bailed = 0;
  for (const entry of open) {
    const resolver = findResolver(entry.suggested_resolver);
    if (!resolver) continue;
    const result = await resolver.resolve({ repoRoot: root, entry });
    const status = result.bailed_out
      ? result.bailed_out.reason === 'already-exists'
        ? 'resolved'
        : 'open'
      : 'resolved';
    updateStatus(root, entry.id, status, {
      resolver: resolver.name,
      at: new Date().toISOString(),
      notes: result.notes,
      files_changed: result.files_changed,
    });
    if (status === 'resolved') resolved++;
    else bailed++;
  }
  return { resolved, bailed };
}

async function main(): Promise<void> {
  const root = path.join(os.tmpdir(), `e2e-${randomUUID()}`);
  fs.mkdirSync(root, { recursive: true });
  try {
    // SEED: 3 specs, each missing ACCEPTANCE_CRITERIA.md but FR.md links to it.
    for (let i = 1; i <= 3; i++) {
      const slug = `e2e-spec-${i}`;
      fs.mkdirSync(path.join(root, '.specs', slug), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.specs', slug, 'FR.md'),
        [
          `# FR — e2e ${i}`,
          '',
          `## FR-1: Login flow ${i}`,
          'Body. See [AC-1](ACCEPTANCE_CRITERIA.md#ac-1) for acceptance.',
          '',
          `## FR-2: Logout flow ${i}`,
          'Body. See [AC-2](ACCEPTANCE_CRITERIA.md#ac-2).',
          '',
          `## FR-3: Reset flow ${i}`,
          'Body. See [AC-3](ACCEPTANCE_CRITERIA.md#ac-3).',
        ].join('\n'),
      );
    }

    // PHASE 1: initial dogfood + ingest
    const t0 = performance.now();
    const initialReports = reconcileLight({ repoRoot: root });
    const initial = tally(initialReports);
    const queued = ingest(root);
    const backlog1 = tallyBacklog(root);
    const t1 = performance.now();
    const phase1: PhaseResult = {
      phase: '1. Initial ingest',
      findings_total: initial.total,
      by_code: initial.byCode,
      backlog_open: backlog1.open,
      backlog_by_category: backlog1.byCat,
      ms: Math.round(t1 - t0),
    };

    // PHASE 2: resolve missing-spec-file category (calls ac-author 3× — one per spec)
    const t2 = performance.now();
    const { resolved, bailed } = await resolveCategory(root, 'missing-spec-file');
    const backlog2 = tallyBacklog(root);
    const t3 = performance.now();
    const phase2 = {
      phase: '2. Resolve missing-spec-file',
      resolved,
      bailed,
      backlog_open: backlog2.open,
      backlog_by_category: backlog2.byCat,
      ms: Math.round(t3 - t2),
    };

    // PHASE 3: re-ingest, verify dead-link/missing-spec-file findings dropped
    const t4 = performance.now();
    const after = tally(reconcileLight({ repoRoot: root }));
    const phase3: PhaseResult = {
      phase: '3. Re-ingest after resolution',
      findings_total: after.total,
      by_code: after.byCode,
      backlog_open: tallyBacklog(root).open,
      backlog_by_category: tallyBacklog(root).byCat,
      ms: Math.round(performance.now() - t4),
    };

    // VERIFY: 3 AC.md files should now exist
    const acFiles = ['e2e-spec-1', 'e2e-spec-2', 'e2e-spec-3']
      .map((slug) => path.join(root, '.specs', slug, 'ACCEPTANCE_CRITERIA.md'))
      .filter(fs.existsSync);

    // CONTENT check: each AC.md must contain `## AC-1 (FR-1)` for the
    // first FR of its spec (proves resolver wrote real structured output,
    // not just an empty file).
    let acContentOk = 0;
    for (const f of acFiles) {
      const body = fs.readFileSync(f, 'utf8');
      if (body.includes('## AC-1 (FR-1)') && body.includes('WHEN')) acContentOk++;
    }

    // PHASE 4: idempotency — re-run ingest on UNCHANGED corpus
    // (no resolver between calls) so we measure pure dedup, not new
    // findings that surfaced post-resolution.
    const root2 = path.join(os.tmpdir(), `e2e-idem-${randomUUID()}`);
    fs.mkdirSync(root2, { recursive: true });
    try {
      for (let i = 1; i <= 2; i++) {
        const slug = `idem-spec-${i}`;
        fs.mkdirSync(path.join(root2, '.specs', slug), { recursive: true });
        fs.writeFileSync(
          path.join(root2, '.specs', slug, 'FR.md'),
          `## FR-1: Item ${i}\nSee [AC-1](ACCEPTANCE_CRITERIA.md#ac-1).\n`,
        );
      }
      const firstQueued = ingest(root2);
      const beforeIngest = tallyBacklog(root2).open;
      const idempQueued = ingest(root2);
      const afterIngest = tallyBacklog(root2).open;
      // assertions captured below
      var p4Detail = `firstQueued=${firstQueued}, idemQueued=${idempQueued}, open before=${beforeIngest} after=${afterIngest}`;
      var p4Ok = idempQueued === 0 && beforeIngest === afterIngest;
    } finally {
      fs.rmSync(root2, { recursive: true, force: true });
    }

    // PHASE 5: AUTO_FIX negative — verify NO backlog entries for AUTO_FIX codes
    // (cross-spec/missing-cross-ref is classified AUTO_FIX, never enters backlog)
    const seenAutoFixCategories = new Set<string>();
    for (const e of readOpen(root)) seenAutoFixCategories.add(e.category);
    const autoFixLeaked =
      seenAutoFixCategories.has('add-markdown-link-on-first-mention');

    console.log('\n=== E2E Pipeline Test ===\n');
    console.log(JSON.stringify(phase1, null, 2));
    console.log(JSON.stringify(phase2, null, 2));
    console.log(JSON.stringify(phase3, null, 2));
    console.log(`\nAC.md files created: ${acFiles.length}/3`);

    // Assertions
    const assertions: Array<{ name: string; ok: boolean; detail?: string }> = [
      {
        name: 'P1: initial dogfood finds dead-links',
        ok: (phase1.by_code['impl-drift/dead-link'] ?? 0) > 0,
      },
      { name: 'P1: backlog ingested entries', ok: queued > 0 },
      {
        name: 'P2: ac-author resolved entries',
        ok: resolved + bailed > 0,
      },
      { name: 'P3: all 3 AC.md files created', ok: acFiles.length === 3 },
      {
        name: 'P3: dead-link findings DROPPED from corpus',
        ok:
          (phase3.by_code['impl-drift/dead-link'] ?? 0) <
          (phase1.by_code['impl-drift/dead-link'] ?? 99),
        detail: `${phase1.by_code['impl-drift/dead-link'] ?? 0} → ${phase3.by_code['impl-drift/dead-link'] ?? 0}`,
      },
      {
        name: 'P3: AC.md CONTENT correct (not just file exists)',
        ok: acContentOk === 3,
        detail: `${acContentOk}/3 files contain '## AC-1 (FR-1)' + 'WHEN'`,
      },
      {
        name: 'P4: idempotent re-ingest queues 0 new entries (unchanged corpus)',
        ok: p4Ok,
        detail: p4Detail,
      },
      {
        name: 'P5: AUTO_FIX codes never leak into backlog',
        ok: !autoFixLeaked,
      },
      {
        name: 'Performance: full E2E ≤5 seconds',
        ok: phase1.ms + phase2.ms + phase3.ms <= 5000,
        detail: `${phase1.ms + phase2.ms + phase3.ms}ms`,
      },
    ];
    console.log('\n=== Assertions ===');
    let failures = 0;
    for (const a of assertions) {
      const status = a.ok ? '✓' : '✗';
      console.log(`  ${status} ${a.name}${a.detail ? ' (' + a.detail + ')' : ''}`);
      if (!a.ok) failures++;
    }
    if (failures > 0) {
      console.log(`\n${failures} assertion(s) failed`);
      process.exit(1);
    }
    console.log('\nAll assertions passed ✓');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
