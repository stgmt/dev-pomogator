#!/usr/bin/env npx tsx
/**
 * FR-20 — acknowledge the conformance summary (the B4 «on-demand pull» side).
 *
 * Invoked by the /spec-status skill after it renders the full 24h aggregate:
 * stamps ~/.dev-pomogator/state/last-summary-ack.json with the current moment
 * + current unresolved count, ATOMICALLY (temp + rename). The next
 * UserPromptSubmit summary is then silent until a NEW deny arrives.
 *
 * Usage: npx tsx tools/specs-validator/ack-summary.ts [--ack-file <path>] [--repo-root <path>]
 * (path flags exist for tests — default = real home/state + cwd)
 *
 * @see .specs/spec-generator-v4/FR.md FR-20
 */
import {
  buildConformanceSummary,
  countHardDenySince,
  countSoftDenySince,
  defaultAckFile,
  writeAckAtomic,
} from './conformance-summary.ts';

export function runAck(argv: string[] = process.argv.slice(2)): string {
  let ackFile = defaultAckFile();
  let repoRoot = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--ack-file' && argv[i + 1]) ackFile = argv[++i];
    if (argv[i] === '--repo-root' && argv[i + 1]) repoRoot = argv[++i];
  }
  const count = countSoftDenySince(null) + countHardDenySince(null, repoRoot);
  const state = { ack_timestamp: new Date().toISOString(), ack_event_count: count };
  writeAckAtomic(state, ackFile);
  // Show what was acknowledged (or confirm silence) for the skill transcript.
  const line = buildConformanceSummary({ ackFile, repoRoot });
  return `acknowledged at ${state.ack_timestamp} (${count} event(s) in window); next-prompt summary: ${line ?? 'SILENT'}`;
}

const isDirectRun =
  process.argv[1]?.endsWith('ack-summary.ts') || process.argv[1]?.endsWith('ack-summary.js');
if (isDirectRun) {
  console.log(runAck());
}
