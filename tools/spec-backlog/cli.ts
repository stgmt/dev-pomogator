// dev-pomogator-spec-backlog CLI.
//
// Subcommands:
//   list                          — print all open entries grouped by category
//   list --all                    — include resolved/wontfix
//   list --category <cat>         — filter
//   list --slug <slug>            — filter
//   list --resolvers              — print available resolver agents
//   resolve <id>                  — run the suggested resolver for one entry
//   resolve <id> --resolver <r>   — override resolver
//   resolve --category <cat>      — run resolver on every open entry in category
//   ingest                        — run dogfood reconcile and classify ALL findings
//                                   into backlog entries (drops duplicates by id)

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  appendEntry,
  entryId,
  readAll,
  readAllIds,
  readByCategory,
  readEntry,
  readOpen,
  updateStatus,
} from './writer.ts';
import { classify } from './classifier.ts';
import { findResolver, listResolvers } from './resolvers/registry.ts';
import type { BacklogEntry, BacklogStatus } from './types.ts';

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}
function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function printEntry(entry: BacklogEntry): void {
  const evidence = entry.evidence.file
    ? `${entry.evidence.file}${entry.evidence.line ? ':' + entry.evidence.line : ''}`
    : entry.evidence.spec_a
      ? `${entry.evidence.spec_a} ↔ ${entry.evidence.spec_b}`
      : '(no location)';
  console.log(
    `  ${entry.id}  [${entry.status.padEnd(11)}] ${entry.category.padEnd(20)} ${entry.slug.padEnd(28)} → ${entry.suggested_resolver.padEnd(18)} | ${evidence}`,
  );
}

function cmdList(args: string[]): number {
  const repoRoot = getArg(args, '--root') ?? process.cwd();
  const all = hasFlag(args, '--all');
  const wantCategory = getArg(args, '--category');
  const wantSlug = getArg(args, '--slug');

  if (hasFlag(args, '--resolvers')) {
    console.log('Available resolvers:\n');
    for (const r of listResolvers()) {
      console.log(`  ${r.name.padEnd(16)} ${r.description}`);
    }
    return 0;
  }

  let entries = all ? readAll(repoRoot) : readOpen(repoRoot);
  if (wantCategory) entries = entries.filter((e) => e.category === wantCategory);
  if (wantSlug) entries = entries.filter((e) => e.slug === wantSlug);

  if (entries.length === 0) {
    console.log('No backlog entries match the filter.');
    return 0;
  }

  // Group by category for readability
  const byCat = new Map<string, BacklogEntry[]>();
  for (const e of entries) {
    if (!byCat.has(e.category)) byCat.set(e.category, []);
    byCat.get(e.category)!.push(e);
  }
  console.log(`\nBacklog (${entries.length} entries${all ? ', incl. resolved/wontfix' : ', open only'}):\n`);
  for (const [cat, list] of byCat) {
    console.log(`## ${cat}  (${list.length})`);
    for (const e of list) printEntry(e);
    console.log();
  }
  return 0;
}

async function cmdResolve(args: string[]): Promise<number> {
  const repoRoot = getArg(args, '--root') ?? process.cwd();
  const resolverOverride = getArg(args, '--resolver');
  const wantCategory = getArg(args, '--category');
  const wantSlug = getArg(args, '--slug');
  // Pick positional id — skip the command name AND values that immediately
  // follow a flag (those are flag-values, not ids).
  const flagValues = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) flagValues.add(args[i + 1]);
  }
  const id = args.find(
    (a, i) => !a.startsWith('--') && a !== 'resolve' && !flagValues.has(a),
  );

  if (id) {
    const entry = readEntry(repoRoot, id);
    if (!entry) {
      console.error(`No entry with id=${id}`);
      return 1;
    }
    return await applyResolver(repoRoot, entry, resolverOverride);
  }

  if (wantCategory) {
    let entries = readOpen(repoRoot).filter((e) => e.category === wantCategory);
    if (wantSlug) entries = entries.filter((e) => e.slug === wantSlug);
    if (entries.length === 0) {
      console.error(`No open entries in category=${wantCategory}${wantSlug ? ` slug=${wantSlug}` : ''}`);
      return 1;
    }
    let failures = 0;
    for (const entry of entries) {
      const code = await applyResolver(repoRoot, entry, resolverOverride);
      if (code !== 0) failures++;
    }
    return failures > 0 ? 1 : 0;
  }

  console.error('Usage: spec-backlog resolve <id> [--resolver <name>]  OR  resolve --category <cat>');
  return 1;
}

async function applyResolver(
  repoRoot: string,
  entry: BacklogEntry,
  overrideName?: string,
): Promise<number> {
  const name = overrideName ?? entry.suggested_resolver;
  const resolver = findResolver(name);
  if (!resolver) {
    console.error(`No resolver named "${name}". Available: ${listResolvers().map((r) => r.name).join(', ')}`);
    return 1;
  }
  console.log(`[${entry.id}] running resolver "${resolver.name}" on slug=${entry.slug} category=${entry.category}`);
  updateStatus(repoRoot, entry.id, 'in-progress');
  let result;
  try {
    result = await resolver.resolve({ repoRoot, entry });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ resolver threw: ${msg}`);
    updateStatus(repoRoot, entry.id, 'open', { resolver: resolver.name, at: new Date().toISOString(), notes: `threw: ${msg}` });
    return 1;
  }
  if (result.bailed_out) {
    console.log(`  ⏭  bailed: ${result.bailed_out.reason}`);
    console.log(`     notes: ${result.notes}`);
    const newStatus: BacklogStatus = result.bailed_out.reason === 'already-exists' ? 'resolved' : 'open';
    updateStatus(repoRoot, entry.id, newStatus, {
      resolver: resolver.name,
      at: new Date().toISOString(),
      notes: result.notes,
      files_changed: result.files_changed,
    });
    return 0;
  }
  console.log(`  ✓ confidence=${result.confidence.toFixed(2)} files_changed=${result.files_changed.length}`);
  for (const f of result.files_changed) console.log(`    - ${f}`);
  console.log(`     notes: ${result.notes}`);
  updateStatus(repoRoot, entry.id, 'resolved', {
    resolver: resolver.name,
    at: new Date().toISOString(),
    notes: result.notes,
    files_changed: result.files_changed,
  });
  return 0;
}

async function cmdIngest(args: string[]): Promise<number> {
  const repoRoot = getArg(args, '--root') ?? process.cwd();
  const { reconcileLight } = (await import('../../.claude/skills/cross-spec-reconcile/scripts/reconcile.ts')) as typeof import('../../.claude/skills/cross-spec-reconcile/scripts/reconcile.ts');
  const reports = reconcileLight({ repoRoot });
  // Batch-17 perf fix: cache existing ids in one disk pass — was O(N²)
  // via readEntry() in the loop.
  const existingIds = readAllIds(repoRoot);
  let auto = 0;
  let backlog = 0;
  let noise = 0;
  let appended = 0;
  const seenIds = new Set<string>();
  for (const r of reports) {
    for (const f of r.findings) {
      // Pass repoRoot so dead-link classifier can run basename-glob
      // pre-flight (filters out 0-match findings to NOISE, routes 2+
      // matches to ambiguous-link, keeps 1-match for link-fixer).
      const verdict = classify(r.specSlug, f, repoRoot);
      if (verdict.verdict === 'AUTO_FIX') {
        auto++;
        continue;
      }
      if (verdict.verdict === 'NOISE') {
        noise++;
        continue;
      }
      if (!verdict.entry) continue;
      const id = entryId(r.specSlug, f.code, verdict.entry.evidence);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      // Batch-17: O(1) Set lookup instead of readEntry() disk scan.
      if (existingIds.has(id)) continue;
      appendEntry(repoRoot, verdict.entry);
      existingIds.add(id);
      appended++;
      backlog++;
    }
  }
  console.log(`Ingested ${reports.reduce((a, r) => a + r.findings.length, 0)} findings:`);
  console.log(`  AUTO_FIX (skipped): ${auto}`);
  console.log(`  NOISE (skipped):    ${noise}`);
  console.log(`  BACKLOG (queued):   ${backlog} (${appended} new entries, rest deduped)`);
  return 0;
}

async function main(argv: string[]): Promise<number> {
  const args = argv.slice(2);
  const sub = args[0];
  if (sub === 'list') return cmdList(args.slice(1));
  if (sub === 'resolve') return await cmdResolve(args);
  if (sub === 'ingest') return await cmdIngest(args.slice(1));
  console.log(
    'dev-pomogator-spec-backlog — manage cross-spec-reconcile finding backlog\n' +
      '\n' +
      'Usage:\n' +
      '  spec-backlog list [--all] [--category <c>] [--slug <s>] [--resolvers]\n' +
      '  spec-backlog resolve <id> [--resolver <name>]\n' +
      '  spec-backlog resolve --category <cat> [--resolver <name>]\n' +
      '  spec-backlog ingest    — re-run reconcile and classify findings into backlog',
  );
  return sub ? 1 : 0;
}

const isDirectRun =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  main(process.argv).then((code) => process.exit(code));
}

export { main };
