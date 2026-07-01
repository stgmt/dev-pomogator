// decision-arbiter resolver — given a backlog entry for contradictory NFR values
// across two specs, parses the NFR markers (e.g., "latency = 200ms"), greps the
// implementation for both values, tallies which appears most frequently, and writes
// a DECISION_RECOMMENDATION.md file with the ground truth.
//
// Mechanical — no LLM call. Spec author reviews the recommendation and applies it.
//
// Idempotent: if DECISION_RECOMMENDATION.md already exists for this NFR key,
// returns notes saying so.

import fs from 'node:fs';
import path from 'node:path';
import type { Resolver, ResolverResult } from './types.ts';
import type { BacklogEntry } from '../types.ts';

/**
 * Regex to extract NFR markers in the form:
 * "nfr-key = value" or "nfr_key = value"
 * Supports numbers, units (ms, GB, etc), and boolean-like values.
 */
const NFR_MARKER_RE = /(\w+(?:_|-|\s)*\w+)\s*=\s*([0-9a-zA-Z%.]+)/gi;

/**
 * Parse all NFR markers from a string (e.g., from spec_a or spec_b evidence).
 */
function parseNfrs(text: string): Array<{ key: string; value: string }> {
  const nfrs: Array<{ key: string; value: string }> = [];
  let m: RegExpExecArray | null;
  NFR_MARKER_RE.lastIndex = 0;
  while ((m = NFR_MARKER_RE.exec(text)) !== null) {
    nfrs.push({
      key: m[1].toLowerCase().replace(/\s+/g, '_'),
      value: m[2],
    });
  }
  return nfrs;
}

/**
 * Scan repo/tools for occurrences of a value (numeric or string) inside .ts files.
 * Returns count of matching LINES (mirrors `grep -r --include="*.ts"` line-count semantics).
 *
 * Pure Node fs implementation — cross-platform (no shell-out to grep, which is
 * unavailable on stock Windows). Uses `fs.readdirSync({ recursive: true })` from
 * Node 20+; the project already relies on Node 22+ native strip-types per
 * `ts-import-extensions` rule.
 */
function grepValueInRepo(repoRoot: string, value: string): number {
  try {
    const toolsDir = path.join(repoRoot, 'tools');
    if (!fs.existsSync(toolsDir)) return 0;

    const entries = fs.readdirSync(toolsDir, { withFileTypes: true, recursive: true }) as fs.Dirent[];
    let count = 0;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
      // `parentPath` is the Node 20.12+ stable name (replaces deprecated `path`).
      const parentDir = (entry as unknown as { parentPath?: string; path?: string }).parentPath
        ?? (entry as unknown as { path?: string }).path
        ?? toolsDir;
      const fullPath = path.join(parentDir, entry.name);
      let content: string;
      try {
        content = fs.readFileSync(fullPath, 'utf8');
      } catch {
        continue;
      }
      for (const line of content.split(/\r?\n/)) {
        if (line.includes(value)) count++;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

export const decisionArbiter: Resolver = {
  name: 'decision-arbiter',
  description:
    'Parses contradictory NFR values from spec_a / spec_b, greps the implementation for both values, recommends ground truth based on code frequency.',

  async resolve(opts): Promise<ResolverResult> {
    return decisionArbiterImpl(opts.repoRoot, opts.entry);
  },
};

function decisionArbiterImpl(repoRoot: string, entry: BacklogEntry): ResolverResult {
  const specDir = path.join(repoRoot, '.specs', entry.slug);

  // Extract spec_a and spec_b from evidence
  const specA = entry.evidence.spec_a ?? '';
  const specB = entry.evidence.spec_b ?? '';

  if (!specA || !specB) {
    return {
      confidence: 0,
      files_changed: [],
      notes: 'spec_a or spec_b missing from evidence — cannot parse NFR contradiction.',
      bailed_out: { reason: 'incomplete-evidence' },
    };
  }

  // Parse NFR markers from both specs
  const nfrsA = parseNfrs(specA);
  const nfrsB = parseNfrs(specB);

  if (nfrsA.length === 0 || nfrsB.length === 0) {
    return {
      confidence: 0,
      files_changed: [],
      notes: 'No NFR markers found in spec_a or spec_b — cannot identify contradiction.',
      bailed_out: { reason: 'no-nfr-markers' },
    };
  }

  // Find conflicting NFR keys (same key, different values)
  const conflicts: Array<{ key: string; valueA: string; valueB: string; countA: number; countB: number }> = [];
  for (const nfrA of nfrsA) {
    const nfrB = nfrsB.find((n) => n.key === nfrA.key);
    if (nfrB && nfrB.value !== nfrA.value) {
      const countA = grepValueInRepo(repoRoot, nfrA.value);
      const countB = grepValueInRepo(repoRoot, nfrB.value);
      conflicts.push({
        key: nfrA.key,
        valueA: nfrA.value,
        valueB: nfrB.value,
        countA,
        countB,
      });
    }
  }

  if (conflicts.length === 0) {
    return {
      confidence: 0,
      files_changed: [],
      notes: 'No contradictory NFR keys found between spec_a and spec_b.',
      bailed_out: { reason: 'no-conflicts' },
    };
  }

  // Check if DECISION_RECOMMENDATION.md already exists for the primary conflict
  const recFile = path.join(specDir, 'DECISION_RECOMMENDATION.md');
  if (fs.existsSync(recFile)) {
    return {
      confidence: 1,
      files_changed: [],
      notes: `${entry.slug}/DECISION_RECOMMENDATION.md already exists — nothing to create.`,
      bailed_out: { reason: 'already-arbitrated' },
    };
  }

  // Build recommendation markdown
  const lines: string[] = [
    `# Decision Recommendation — ${entry.slug}`,
    '',
    `> Generated by \`decision-arbiter\` resolver. **Spec author must review and apply the ground-truth recommendation to the spec.**`,
    '',
    '## Contradictory NFRs Detected',
    '',
    `Spec A: \`${specA}\`  `,
    `Spec B: \`${specB}\`  `,
    '',
    '---',
    '',
    `## Code-Based Ground Truth`,
    '',
  ];

  for (const conflict of conflicts) {
    const groundTruth = conflict.countA > conflict.countB ? conflict.valueA : conflict.valueB;
    const recommendation =
      conflict.countA > conflict.countB
        ? `Use **spec_a** value: \`${conflict.valueA}\``
        : `Use **spec_b** value: \`${conflict.valueB}\``;

    lines.push(`### NFR: \`${conflict.key}\``);
    lines.push('');
    lines.push(`| Source | Value | Code Occurrences |`);
    lines.push(`|--------|-------|------------------|`);
    lines.push(`| Spec A | \`${conflict.valueA}\` | ${conflict.countA} |`);
    lines.push(`| Spec B | \`${conflict.valueB}\` | ${conflict.countB} |`);
    lines.push('');
    lines.push(`**Recommendation:** ${recommendation}`);
    lines.push('');
    lines.push(`**Rationale:** The implementation codebase references the recommended value `);
    lines.push(`\`${groundTruth}\` in ${Math.max(conflict.countA, conflict.countB)} locations, `);
    lines.push(`indicating it is the established ground truth.`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push(`## Next Steps`);
  lines.push('');
  lines.push(`1. Review each recommendation above.`);
  lines.push(`2. Update the contradictory NFR in the appropriate spec file (FR.md or DESIGN.md).`);
  lines.push(`3. Mark this issue as \`resolved\` in the backlog.`);
  lines.push('');

  fs.writeFileSync(recFile, lines.join('\n'));

  return {
    confidence: 0.7,
    files_changed: [path.relative(repoRoot, recFile)],
    notes:
      `Generated DECISION_RECOMMENDATION.md with ground-truth analysis of ${conflicts.length} ` +
      `contradictory NFR(s). Recommendations based on code frequency tally. Spec author MUST ` +
      `review and apply recommendations to reconcile the contradiction.`,
  };
}
