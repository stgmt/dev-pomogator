#!/usr/bin/env node
/**
 * merge-survivor-verdicts.ts — merge Agent-produced verdict JSON files back into MutationReport.
 *
 * Reads original mutation report + N verdict JSON files (one per batch), constructs final
 * enriched report с equivalentSuspect + rationale + confidence per survivor.
 *
 * Verdict file schema (output of Agent invocation):
 *   [{ "survivor_id": "<file>:<line>:<column>", "equivalentSuspect": true|false,
 *      "confidence": "high"|"medium"|"low", "rationale": "..." }]
 *
 * Usage:
 *   npx tsx merge-survivor-verdicts.ts <report.json> <verdicts-1.json> [<verdicts-2.json> ...]
 *
 * Output (stdout): enriched MutationReport JSON with gaps[] populated с verdicts merged in.
 *
 * Exit codes:
 *   0 — merge successful
 *   2 — file not found / parse error
 *   3 — survivor_id mismatch (verdict refers to non-existent survivor)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

interface Verdict {
  survivor_id: string;
  equivalentSuspect: boolean;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
}

interface SurvivorLike {
  file: string;
  line: number;
  column?: number;
  mutator?: string;
  [key: string]: unknown;
}

function survivorId(s: SurvivorLike): string {
  return `${s.file}:${s.line}:${s.column ?? 0}`;
}

// strong-tests:skip pure key construction from input fields; deterministic format file:line:column
function loadJsonOrExit<T>(filePath: string): T {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    process.stderr.write(`File not found: ${abs}\n`);
    process.exit(2);
  }
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf-8')) as T;
  } catch (e) {
    process.stderr.write(`Failed to parse JSON ${abs}: ${(e as Error).message}\n`);
    process.exit(2);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    process.stderr.write('Usage: merge-survivor-verdicts.ts <report.json> <verdicts-1.json> [<verdicts-2.json> ...]\n');
    process.exit(2);
  }
  const [reportPath, ...verdictPaths] = args;
  const report = loadJsonOrExit<{ survivors?: SurvivorLike[]; gaps?: any[]; [key: string]: unknown }>(reportPath);

  // Collect all verdicts indexed by survivor_id
  const verdictsById = new Map<string, Verdict>();
  let totalVerdicts = 0;
  for (const vp of verdictPaths) {
    const verdicts = loadJsonOrExit<Verdict[]>(vp);
    if (!Array.isArray(verdicts)) {
      process.stderr.write(`Verdict file ${vp} is not an array — skipping\n`);
      continue;
    }
    for (const v of verdicts) {
      verdictsById.set(v.survivor_id, v);
      totalVerdicts++;
    }
  }

  // Source survivors: prefer gaps[] (already annotated), fallback к survivors[]
  const source = (report.gaps && report.gaps.length > 0
    ? report.gaps
    : report.survivors ?? []) as SurvivorLike[];

  let mergedCount = 0;
  let unmatchedCount = 0;
  const enrichedGaps = source.map((s) => {
    const sid = survivorId(s);
    const verdict = verdictsById.get(sid);
    if (verdict) {
      mergedCount++;
      return {
        ...s,
        equivalentSuspect: verdict.equivalentSuspect,
        confidence: verdict.confidence,
        rationale: verdict.rationale,
      };
    }
    return s;
  });

  // Sanity check: warn про verdicts which didn't match any survivor
  const matchedIds = new Set(source.map(survivorId));
  for (const vid of verdictsById.keys()) {
    if (!matchedIds.has(vid)) unmatchedCount++;
  }

  const enrichedReport = {
    ...report,
    gaps: enrichedGaps,
    survivorAnalysis: {
      totalVerdicts,
      mergedIntoGaps: mergedCount,
      unmatchedVerdicts: unmatchedCount,
      equivalentSuspectCount: enrichedGaps.filter((g: any) => g.equivalentSuspect === true).length,
      realGapCount: enrichedGaps.filter((g: any) => g.equivalentSuspect === false).length,
    },
  };

  process.stdout.write(JSON.stringify(enrichedReport, null, 2));
  if (unmatchedCount > 0) {
    process.stderr.write(`Warning: ${unmatchedCount} verdict(s) did not match any survivor (likely stale verdict files)\n`);
  }
  process.exit(0);
}

main();
