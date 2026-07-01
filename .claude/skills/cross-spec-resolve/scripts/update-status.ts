// cross-spec-resolve step 7 — stamp resolution_status onto each finding
// in `.specs/<slug>/consistency-report.yaml` after the live walker
// applies/skips/overrides a fix. The walker emits a list of decisions,
// this module rewrites the YAML atomically (temp + rename per the
// atomic-config-save rule).
//
// Decision keys map 1:1 to user choices in the AskUserQuestion flow:
//   • 'resolved'      — mechanical fix applied successfully
//   • 'acknowledged'  — CRITICAL override with reason
//   • 'deferred'      — explicit defer to a later spec / OUT_OF_SCOPE marker
//   • 'skipped'       — non-CRITICAL user-skip (no audit entry needed)
//
// The YAML shape is the same the writer in
// `../cross-spec-reconcile/scripts/yaml-writer.ts` produces — list
// of `  - code: ...` blocks under `findings:`. We only ADD lines under
// each matching block; we never reorder or rewrite existing fields.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type ResolutionStatus =
  | 'resolved'
  | 'acknowledged'
  | 'deferred'
  | 'skipped'
  // Step-7 batch re-check outcomes (SPECGEN004_48 / SCHEMA): set when a fresh
  // reconcile re-run is diffed against the original findings.
  | 'still_present'
  | 'transformed';

export interface ResolutionDecision {
  /** Stable key per the walker — `code|spec_a|spec_b|referenced_in`. */
  findingKey: string;
  status: ResolutionStatus;
  /** Required for 'acknowledged' (CRITICAL override) — explains the bypass. */
  overrideReason?: string;
  /** ISO timestamp the decision was taken. */
  timestamp: string;
}

export interface UpdateStatusOptions {
  repoRoot: string;
  slug: string;
  decisions: ResolutionDecision[];
}

export interface UpdateStatusResult {
  /** Absolute path of the YAML the function wrote to. */
  path: string;
  /** Number of decision entries that matched a finding in the YAML. */
  matched: number;
  /** Number of decisions that had no matching block in the YAML. */
  unmatched: number;
}

const TEMP_SUFFIX = '.tmp';

/**
 * Mutate the consistency report by appending resolution metadata under
 * each matched finding block. Returns counters so the caller can warn
 * if a decision was dropped (most likely because a previous round
 * already removed the finding).
 */
export function updateStatus(opts: UpdateStatusOptions): UpdateStatusResult {
  const yamlPath = path.join(
    opts.repoRoot,
    '.specs',
    opts.slug,
    'consistency-report.yaml',
  );
  if (!fs.existsSync(yamlPath)) {
    throw new Error(
      `cross-spec-resolve update-status: ${yamlPath} does not exist — run /cross-spec-reconcile first`,
    );
  }
  const body = fs.readFileSync(yamlPath, 'utf8');
  const decisionMap = new Map<string, ResolutionDecision>();
  for (const d of opts.decisions) decisionMap.set(d.findingKey, d);

  const lines = body.split(/\r?\n/);
  const out: string[] = [];
  let cursor = 0;
  let matched = 0;
  while (cursor < lines.length) {
    const line = lines[cursor];
    out.push(line);
    if (/^\s{2}-\s+code:\s+/.test(line)) {
      // Walk the block until we find the next `  - code:` or end.
      const block: string[] = [];
      let next = cursor + 1;
      while (next < lines.length && !/^\s{2}-\s+code:\s+/.test(lines[next])) {
        block.push(lines[next]);
        next++;
      }
      const key = computeKey(line, block);
      const decision = decisionMap.get(key);
      if (decision) {
        matched++;
        for (const blkLine of block) out.push(blkLine);
        out.push(`    resolution_status: ${decision.status}`);
        out.push(`    resolved_at: "${decision.timestamp}"`);
        if (decision.overrideReason) {
          // Escape quotes + backslashes for YAML round-trip safety.
          const safe = decision.overrideReason.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          out.push(`    override_reason: "${safe}"`);
        }
        cursor = next;
        continue;
      }
    }
    cursor++;
  }
  // Atomic rename — temp file in the same dir to avoid cross-device moves.
  const tmp = `${yamlPath}${TEMP_SUFFIX}.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, out.join('\n'));
  fs.renameSync(tmp, yamlPath);

  const unmatched = opts.decisions.length - matched;
  return { path: yamlPath, matched, unmatched };
}

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
