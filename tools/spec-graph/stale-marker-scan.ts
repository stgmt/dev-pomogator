#!/usr/bin/env npx tsx
/**
 * FR-49d — stale-marker reconciler CLI.
 *
 * After a full test run lands fresh results, FLAG (never auto-close) tasks the author
 * left `in-progress` whose mapped scenarios ALL PASSED — evidence the work is done but
 * the marker drifted (the FR-17-cluster class this session hit). FLAG-ONLY by contract:
 * the human/agent verifies + closes via `set_entity_status` (false-green guard — a
 * reconciler that auto-closed would be the very false-green the honesty machinery fights).
 *
 *   node --import tsx tools/spec-graph/stale-marker-scan.ts [--json]
 *
 * @see ./task-census.ts (findStaleInProgress) · .specs/spec-generator-v4/FR.md FR-49 (FR-49d)
 */
import { pathToFileURL } from 'node:url';
import { buildGraph } from './builder.ts';
import { findStaleInProgress, type StaleMarker } from './task-census.ts';

/** Human report — FLAG-ONLY wording, points at set_entity_status for the close. */
export function renderStaleReport(stale: StaleMarker[]): string {
  if (stale.length === 0) {
    return 'No stale in-progress markers — every in-progress task still lacks all-green evidence.\n';
  }
  const lines = [
    `⚠️ ${stale.length} likely-stale in-progress marker(s): all mapped scenarios PASS, but the task is still «in-progress».`,
    `   VERIFY each and close via set_entity_status (NOT auto-closed — flag only):`,
  ];
  for (const s of stale) {
    lines.push(`   ${s.id}  «${s.title}»  [${s.scenarios.length} green scenario(s) · ${s.spec}]`);
  }
  return lines.join('\n') + '\n';
}

function isMain(): boolean {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMain()) {
  const json = process.argv.includes('--json');
  // skipNdjson:false → the reconciler needs the LAST run's results to know which scenarios passed.
  const graph = buildGraph({ repoRoot: process.cwd(), skipNdjson: false });
  const stale = findStaleInProgress(graph);
  process.stdout.write(json ? JSON.stringify(stale, null, 2) + '\n' : renderStaleReport(stale));
  process.exit(0);
}
