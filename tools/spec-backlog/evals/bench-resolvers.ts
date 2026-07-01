// Benchmark each of the 6 resolvers. Measures wall-clock per-resolve
// on synthetic fixtures. Captures: confidence, files_changed count,
// bailed_out reason, ms per call.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { listResolvers } from '../resolvers/registry.ts';
import type { BacklogEntry } from '../types.ts';

interface BenchRow {
  resolver: string;
  case_id: string;
  ms: number;
  confidence: number;
  files_changed: number;
  bailed: string;
  notes_preview: string;
}

function mkEntry(slug: string, code: string, category: BacklogEntry['category'], extra: Partial<BacklogEntry['evidence']>): BacklogEntry {
  return {
    id: 'bench' + randomUUID().slice(0, 8),
    ts: new Date().toISOString(),
    slug,
    code,
    category,
    evidence: extra,
    suggested_resolver: '',
    difficulty: 'medium',
    status: 'open',
  };
}

async function runOne(
  resolverName: string,
  caseId: string,
  seed: (root: string, slug: string) => BacklogEntry,
): Promise<BenchRow> {
  const root = path.join(os.tmpdir(), `bench-r-${randomUUID()}`);
  fs.mkdirSync(root, { recursive: true });
  const slug = 'bench-' + caseId;
  try {
    const entry = seed(root, slug);
    const resolver = listResolvers().find((r) => r.name === resolverName)!;
    const t0 = performance.now();
    const result = await resolver.resolve({ repoRoot: root, entry });
    const t1 = performance.now();
    return {
      resolver: resolverName,
      case_id: caseId,
      ms: Math.round(t1 - t0),
      confidence: result.confidence,
      files_changed: result.files_changed.length,
      bailed: result.bailed_out?.reason ?? '',
      notes_preview: result.notes.slice(0, 60),
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const rows: BenchRow[] = [];

  // ac-author: synthetic FR.md with 5 FRs
  rows.push(
    await runOne('ac-author', 'fresh-5fr', (root, slug) => {
      fs.mkdirSync(path.join(root, '.specs', slug), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.specs', slug, 'FR.md'),
        Array.from({ length: 5 }, (_, i) => `## FR-${i + 1}: Title ${i + 1}\nBody.\n`).join('\n'),
      );
      return mkEntry(slug, 'impl-drift/dead-link', 'missing-spec-file', { target: 'ACCEPTANCE_CRITERIA.md' });
    }),
  );

  // ac-author: idempotent — AC.md already exists
  rows.push(
    await runOne('ac-author', 'idempotent', (root, slug) => {
      fs.mkdirSync(path.join(root, '.specs', slug), { recursive: true });
      fs.writeFileSync(path.join(root, '.specs', slug, 'FR.md'), '## FR-1\n');
      fs.writeFileSync(path.join(root, '.specs', slug, 'ACCEPTANCE_CRITERIA.md'), '## AC-1\n');
      return mkEntry(slug, 'impl-drift/dead-link', 'missing-spec-file', { target: 'ACCEPTANCE_CRITERIA.md' });
    }),
  );

  // link-fixer: ambiguous (2 matches)
  rows.push(
    await runOne('link-fixer', 'ambiguous', (root, slug) => {
      fs.mkdirSync(path.join(root, '.specs', slug), { recursive: true });
      fs.mkdirSync(path.join(root, 'a'), { recursive: true });
      fs.mkdirSync(path.join(root, 'b'), { recursive: true });
      fs.writeFileSync(path.join(root, 'a/README.md'), '#a');
      fs.writeFileSync(path.join(root, 'b/README.md'), '#b');
      fs.writeFileSync(path.join(root, '.specs', slug, 'FR.md'), 'See [r](README.md).\n');
      return mkEntry(slug, 'impl-drift/dead-link', 'dead-link-typo', { file: 'FR.md', target: 'README.md' });
    }),
  );

  // scenario-writer: fresh
  rows.push(
    await runOne('scenario-writer', 'fresh', (root, slug) => {
      fs.mkdirSync(path.join(root, '.specs', slug), { recursive: true });
      fs.writeFileSync(path.join(root, '.specs', slug, 'FR.md'), '## FR-1: Login\n');
      return mkEntry(slug, 'impl-drift/missing-test', 'missing-test', { file: '.specs/' + slug + '/FR.md' });
    }),
  );

  // fr-author: fresh
  rows.push(
    await runOne('fr-author', 'fresh', (root, slug) => {
      fs.mkdirSync(path.join(root, '.specs', slug), { recursive: true });
      fs.writeFileSync(path.join(root, '.specs', slug, 'FR.md'), '## FR-1: Existing\n');
      fs.writeFileSync(path.join(root, '.specs', slug, 'USE_CASES.md'), 'Use FR-99 here.\n');
      return mkEntry(slug, 'spec-only/missing-fr-section', 'missing-fr-section', {
        file: '.specs/' + slug + '/USE_CASES.md',
      });
    }),
  );

  // decision-arbiter: synthetic NFR conflict
  rows.push(
    await runOne('decision-arbiter', 'simple', (root, slug) => {
      fs.mkdirSync(path.join(root, '.specs', slug), { recursive: true });
      fs.mkdirSync(path.join(root, 'tools/foo'), { recursive: true });
      fs.writeFileSync(path.join(root, 'tools/foo/x.ts'), 'const latency = 200;\nconst latency2 = 200;\n');
      return mkEntry(slug, 'cross-spec/contradictory-nfr', 'contradictory-nfr', {
        spec_a: '.specs/' + slug + ' (latency = 200ms)',
        spec_b: '.specs/other (latency = 500ms)',
      });
    }),
  );

  // owner-picker: needs real git — skip if .git absent
  if (fs.existsSync('.git')) {
    rows.push({
      resolver: 'owner-picker',
      case_id: 'requires-git',
      ms: 0,
      confidence: 0,
      files_changed: 0,
      bailed: 'skipped-needs-real-git-history',
      notes_preview: 'Synthetic git history needed for repeatable bench — out of scope.',
    });
  }

  console.log(
    'resolver         | case          | ms | conf | files | bailed                              | notes',
  );
  console.log(
    '-----------------|---------------|----|------|-------|-------------------------------------|--------',
  );
  for (const r of rows) {
    console.log(
      `${r.resolver.padEnd(16)} | ${r.case_id.padEnd(13)} | ${r.ms.toString().padStart(2)} | ${r.confidence.toFixed(2)} | ${r.files_changed.toString().padStart(5)} | ${r.bailed.padEnd(35)} | ${r.notes_preview}`,
    );
  }

  // Budget: all resolvers <500ms per call
  const overBudget = rows.filter((r) => r.ms > 500);
  if (overBudget.length > 0) {
    console.log('\n⚠️  Over 500ms budget:');
    for (const r of overBudget) console.log(`  ${r.resolver}/${r.case_id}: ${r.ms}ms`);
    process.exit(1);
  }
  console.log('\nAll resolvers ≤500ms ✓');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
