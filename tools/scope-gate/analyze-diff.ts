#!/usr/bin/env npx tsx
/**
 * analyze-diff — deterministic helper for /verify-generic-scope-fix skill.
 *
 * Usage: npx tsx .dev-pomogator/tools/scope-gate/analyze-diff.ts [--session-id=X]
 *
 * Responsibilities:
 *   1. Run `git diff --cached` to get staged diff
 *   2. Parse added variants (enum-items, switch-cases, array-entries)
 *   3. Score diff via _shared/scope-gate-score-diff.ts (reused by plan-gate, audit-spec, hook)
 *   4. Output variant list as JSON to stdout — AI then uses grep tools to do reach analysis
 *   5. Accept `--write-marker=<path>` with JSON blob from stdin to write marker atomically
 *
 * Spec: .specs/verify-generic-scope-fix/FR.md#fr-1
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'crypto';

import { scoreDiff, parseFilesFromDiff } from '../_shared/scope-gate-score-diff.ts';
import {
  writeMarker,
  sha256,
  type Marker,
  type MarkerVariant,
} from '../_shared/scope-gate-marker-store.ts';

interface VariantFound {
  file: string;
  kind: MarkerVariant['kind'];
  name: string;
  lineNumber: number;
}

/** Extract added variants (enum-items, switch-cases) from unified diff. */
export function extractAddedVariants(unifiedDiff: string): VariantFound[] {
  const files = parseFilesFromDiff(unifiedDiff);
  const variants: VariantFound[] = [];

  for (const file of files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.kind !== 'add') continue;
        const content = line.content.trim();

        // enum/array string literal: 'foo' or "foo"
        const stringMatch = content.match(/^['"`]([^'"`]+)['"`]\s*,?\s*$/);
        if (stringMatch) {
          variants.push({
            file: file.path,
            kind: 'enum-item',
            name: stringMatch[1],
            lineNumber: line.lineNumber,
          });
          continue;
        }

        // switch case
        const caseMatch = content.match(/^case\s+([\w.]+)\s*:/);
        if (caseMatch) {
          variants.push({
            file: file.path,
            kind: 'switch-case',
            name: caseMatch[1],
            lineNumber: line.lineNumber,
          });
          continue;
        }

        // enum member: `Foo = 'bar'` or `Foo,` inside an enum
        const memberMatch = content.match(/^(\w+)\s*(=\s*['"`][^'"`]+['"`])?\s*,?\s*$/);
        if (memberMatch && /^[A-Z]/.test(memberMatch[1])) {
          variants.push({
            file: file.path,
            kind: 'array-entry',
            name: memberMatch[1],
            lineNumber: line.lineNumber,
          });
        }
      }
    }
  }

  return variants;
}

function getStagedDiff(cwd: string): string {
  try {
    return execSync('git diff --cached', { cwd, encoding: 'utf-8' });
  } catch {
    return '';
  }
}

function parseArgs(argv: string[]): { sessionId: string; cwd: string } {
  let sessionId = process.env.CLAUDE_SESSION_ID || '';
  let cwd = process.cwd();
  for (const arg of argv) {
    if (arg.startsWith('--session-id=')) sessionId = arg.slice('--session-id='.length);
    if (arg.startsWith('--cwd=')) cwd = arg.slice('--cwd='.length);
  }
  if (!sessionId) sessionId = `manual-${randomUUID()}`;
  return { sessionId, cwd };
}

async function main(): Promise<void> {
  const { sessionId, cwd } = parseArgs(process.argv.slice(2));
  const diff = getStagedDiff(cwd);

  if (!diff) {
    process.stderr.write('[analyze-diff] No staged diff found. Run `git add` first.\n');
    process.exit(1);
  }

  const variants = extractAddedVariants(diff);
  const { score, reasons } = scoreDiff(diff);

  // Default classification to 'conditional' — AI is expected to replace with 'traced' or 'unreachable'
  // after performing manual grep-based reach analysis per SKILL.md steps 1-3.
  const markerVariants: MarkerVariant[] = variants.map((v) => ({
    ...v,
    reach: 'conditional',
    evidence: 'PENDING — run dedicated-flow grep + dataflow trace per SKILL.md',
  }));

  const result = {
    cwd,
    session_id: sessionId,
    diff_sha256: sha256(diff),
    score,
    reasons,
    variants: markerVariants,
  };

  // Emit analysis report to stdout for AI / user to read
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');

  // Write initial marker with should_ship: false (pending reach classification).
  // AI/user is expected to re-run with classified variants via a follow-up write.
  const marker: Marker = {
    timestamp: Date.now(),
    diff_sha256: result.diff_sha256,
    session_id: sessionId,
    variants: markerVariants,
    should_ship: false, // until AI/user confirms all traced
  };

  try {
    writeMarker(cwd, marker);
    process.stderr.write(
      `[analyze-diff] Wrote PENDING marker for ${variants.length} variant(s). ` +
      'Classify each as traced/unreachable via SKILL.md workflow, then re-run with --classify flag.\n',
    );
  } catch (err) {
    process.stderr.write(`[analyze-diff] Failed to write marker: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().catch((err) => {
    process.stderr.write(`[analyze-diff] Error: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
  });
}
