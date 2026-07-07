// cross-spec-resolve step 7 — batch RE-CHECK (SPECGEN004_48 / FR-18).
//
// After the interactive loop has applied/skipped/overridden fixes, the skill
// re-runs `cross-spec-reconcile (mode: full)` exactly once and diffs the FRESH
// findings against the ORIGINAL ones to classify each original finding by
// OUTCOME:
//
//   • resolved      — the finding's exact key is gone from the fresh run.
//   • still_present  — the same finding (exact key) is still emitted.
//   • transformed    — the exact key is gone, but a fresh finding shares the
//                      same `code` (the fix shifted the finding rather than
//                      removing it — e.g. the path/line moved).
//
// This is DELIBERATELY independent of update-status.ts: that module stamps the
// user's DECISION (resolved/acknowledged/deferred/skipped); re-check stamps the
// post-fix OUTCOME (resolved/still_present/transformed). The two status families
// are kept separate, so this owns its own atomic stamp rather than widening the
// decision union. Reconcile is the CALLER's responsibility (run once, results
// passed in) — "invoked exactly once" is enforced by this signature.

import fs from 'node:fs';
import path from 'node:path';
import { findingKey, type ReportFinding } from './walker.ts';

export type RecheckStatus = 'resolved' | 'still_present' | 'transformed';

/**
 * Classify each ORIGINAL finding against the FRESH reconcile findings. Pure —
 * no I/O. Keyed by the canonical `findingKey` (code|spec_a|spec_b|referenced_in);
 * `transformed` falls back to a same-`code` match.
 */
export function recheckStatuses(
  original: ReportFinding[],
  fresh: ReportFinding[],
): Map<string, RecheckStatus> {
  const freshKeys = new Set(fresh.map(findingKey));
  const freshCodes = new Set(fresh.map((f) => f.code));
  const out = new Map<string, RecheckStatus>();
  for (const f of original) {
    const key = findingKey(f);
    if (freshKeys.has(key)) out.set(key, 'still_present');
    else if (freshCodes.has(f.code)) out.set(key, 'transformed');
    else out.set(key, 'resolved');
  }
  return out;
}

export interface ApplyRecheckOptions {
  repoRoot: string;
  slug: string;
  original: ReportFinding[];
  /** Findings from the single fresh `cross-spec-reconcile (mode: full)` re-run. */
  fresh: ReportFinding[];
  /** ISO timestamp stamped onto each finding; defaults to now. */
  timestamp?: string;
}

export interface ApplyRecheckResult {
  /** Absolute path of the YAML stamped. */
  path: string;
  /** Number of findings matched + stamped in the YAML. */
  matched: number;
  /** findingKey → re-check outcome, for the caller / audit. */
  statuses: Record<string, RecheckStatus>;
}

/**
 * Compute the re-check outcomes and stamp `resolution_status` + `resolved_at`
 * onto each matched finding block atomically (temp file + rename per the
 * atomic-config-save rule). Existing fields are preserved — we only append.
 */
export function applyRecheck(opts: ApplyRecheckOptions): ApplyRecheckResult {
  const statuses = recheckStatuses(opts.original, opts.fresh);
  const timestamp = opts.timestamp ?? new Date().toISOString();
  const yamlPath = path.join(opts.repoRoot, '.specs', opts.slug, 'consistency-report.yaml');
  if (!fs.existsSync(yamlPath)) {
    throw new Error(`cross-spec-resolve recheck: ${yamlPath} does not exist — run /cross-spec-reconcile first`);
  }
  const lines = fs.readFileSync(yamlPath, 'utf8').split(/\r?\n/);
  const out: string[] = [];
  let cursor = 0;
  let matched = 0;
  while (cursor < lines.length) {
    const line = lines[cursor];
    out.push(line);
    if (/^\s{2}-\s+code:\s+/.test(line)) {
      const block: string[] = [];
      let next = cursor + 1;
      while (next < lines.length && !/^\s{2}-\s+code:\s+/.test(lines[next])) {
        block.push(lines[next]);
        next++;
      }
      const status = statuses.get(computeKey(line, block));
      if (status) {
        matched++;
        for (const blk of block) out.push(blk);
        out.push(`    resolution_status: ${status}`);
        out.push(`    resolved_at: "${timestamp}"`);
        cursor = next;
        continue;
      }
    }
    cursor++;
  }
  const tmp = `${yamlPath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, out.join('\n'));
  fs.renameSync(tmp, yamlPath);
  return { path: yamlPath, matched, statuses: Object.fromEntries(statuses) };
}

/** Recompute a finding block's `findingKey` from its YAML lines. */
function computeKey(headerLine: string, block: string[]): string {
  const code = headerLine.replace(/^\s{2}-\s+code:\s+/, '').replace(/^"|"$/g, '').trim();
  const fields: Record<string, string> = { code, spec_a: '', spec_b: '', referenced_in: '' };
  for (const line of block) {
    const m = line.match(/^\s{4}(\w+):\s*(.+)$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (key === 'spec_a' || key === 'spec_b' || key === 'referenced_in') {
      fields[key] = raw.replace(/^"|"$/g, '').trim();
    }
  }
  return `${fields.code}|${fields.spec_a}|${fields.spec_b}|${fields.referenced_in}`;
}
