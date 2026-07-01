// Append-only audit log for CRITICAL findings the user chose to override.
//
// FR-17 + spec scenario SPECGEN004_41 require that when a user clicks
// «Acknowledge & override» on a CRITICAL prompt, the action is recorded
// in TWO places:
//   1. inline on the YAML finding (acknowledged_by + override_reason +
//      override_timestamp) — handled by the cross-spec-resolve skill
//   2. a parallel JSONL line in `.claude/logs/cross-spec-overrides.jsonl`
//      (this file)
//
// The JSONL is the durable, append-only audit trail — reviewers can
// grep through it to answer «who overrode what and why».

import fs from 'node:fs';
import path from 'node:path';

export interface OverrideEntry {
  timestamp: string;
  session_id?: string;
  finding_code: string;
  spec_slug: string;
  reason: string;
  /** Optional location anchor copied from the finding for grep-ability. */
  referenced_in?: string;
}

const LOG_REL = '.claude/logs/cross-spec-overrides.jsonl';

export function appendOverride(repoRoot: string, entry: OverrideEntry): string {
  const target = path.join(repoRoot, LOG_REL);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.appendFileSync(target, JSON.stringify(entry) + '\n');
  return target;
}

/** Read all entries in insertion order. Tolerant of malformed lines. */
export function readOverrides(repoRoot: string): OverrideEntry[] {
  const p = path.join(repoRoot, LOG_REL);
  if (!fs.existsSync(p)) return [];
  const out: OverrideEntry[] = [];
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as OverrideEntry);
    } catch {
      // Skip broken line — JSONL is append-only so corruption is rare,
      // but be robust to a concurrent crash mid-write.
    }
  }
  return out;
}
