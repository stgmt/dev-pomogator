// owner-picker resolver — given a backlog entry for ownership-conflict between
// two specs claiming the same path, uses git log to find the first-commit date of
// the contested path, compares against spec creation dates, and recommends the
// canonical owner. Resolves module-ownership-conflict findings.
//
// Mechanical — queries git history only. Authors validate recommendation.
//
// Idempotent: if OWNERSHIP_RECOMMENDATION.md already exists in the winning spec,
// returns notes saying so.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import type { Resolver, ResolverResult } from './types.ts';
import type { BacklogEntry } from '../types.ts';

export const ownerPicker: Resolver = {
  name: 'owner-picker',
  description:
    'Uses git log on contested path to recommend canonical owner — compares spec creation dates against first-commit date of the path.',

  async resolve(opts): Promise<ResolverResult> {
    return ownerPickerImpl(opts.repoRoot, opts.entry);
  },
};

function ownerPickerImpl(repoRoot: string, entry: BacklogEntry): ResolverResult {
  const specA = entry.evidence.spec_a as string | undefined;
  const specB = entry.evidence.spec_b as string | undefined;

  // Parse spec_a and spec_b strings. Expected format:
  // "spec-slug (path/to/file.ts)" or similar — extract slug and path.
  if (!specA || !specB) {
    return {
      confidence: 0,
      files_changed: [],
      notes: `Missing spec_a or spec_b in evidence — cannot determine contested path.`,
      bailed_out: { reason: 'missing-specs' },
    };
  }

  const parseSpec = (spec: string): { slug: string; path: string } | null => {
    // Try to parse "slug (path)" format
    const match = spec.match(/^([a-z0-9_-]+)\s*\(([^)]+)\)$/);
    if (match) {
      return { slug: match[1], path: match[2] };
    }
    // Fallback: if it's just "slug/path", try to split intelligently
    const parts = spec.split('/');
    if (parts.length >= 2) {
      return { slug: parts[0], path: parts.slice(1).join('/') };
    }
    return null;
  };

  const parsedA = parseSpec(specA);
  const parsedB = parseSpec(specB);

  if (!parsedA || !parsedB) {
    return {
      confidence: 0,
      files_changed: [],
      notes: `Could not parse spec_a='${specA}' or spec_b='${specB}' — expected format: 'slug (path/to/file)'.`,
      bailed_out: { reason: 'parse-error' },
    };
  }

  if (parsedA.path !== parsedB.path) {
    return {
      confidence: 0,
      files_changed: [],
      notes: `Contested paths differ: '${parsedA.path}' vs '${parsedB.path}' — cannot determine canonical owner.`,
      bailed_out: { reason: 'path-mismatch' },
    };
  }

  const contestedPath = parsedA.path;
  const slugA = parsedA.slug;
  const slugB = parsedB.slug;

  // Validate spec directories exist
  const specDirA = path.join(repoRoot, '.specs', slugA);
  const specDirB = path.join(repoRoot, '.specs', slugB);

  if (!fs.existsSync(specDirA)) {
    return {
      confidence: 0,
      files_changed: [],
      notes: `Spec directory .specs/${slugA} does not exist.`,
      bailed_out: { reason: 'spec-dir-missing' },
    };
  }
  if (!fs.existsSync(specDirB)) {
    return {
      confidence: 0,
      files_changed: [],
      notes: `Spec directory .specs/${slugB} does not exist.`,
      bailed_out: { reason: 'spec-dir-missing' },
    };
  }

  // Get the first-commit date of the contested path
  let pathFirstCommitDate: Date | null = null;
  try {
    const output = execSync(
      `git log --follow --diff-filter=A --format=%aI --reverse -- "${contestedPath}"`,
      {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    ).trim();
    if (output) {
      const firstLine = output.split('\n')[0];
      pathFirstCommitDate = new Date(firstLine);
    }
  } catch (err) {
    return {
      confidence: 0,
      files_changed: [],
      notes: `Git log query failed for '${contestedPath}': ${err instanceof Error ? err.message : String(err)}`,
      bailed_out: { reason: 'git-error' },
    };
  }

  if (!pathFirstCommitDate || isNaN(pathFirstCommitDate.getTime())) {
    return {
      confidence: 0,
      files_changed: [],
      notes: `Could not determine first-commit date for '${contestedPath}' — path may not be tracked.`,
      bailed_out: { reason: 'no-commit-date' },
    };
  }

  // Get spec creation dates by looking at directory creation or .progress.json
  const getSpecCreationDate = (slug: string): Date | null => {
    const progressFile = path.join(repoRoot, '.specs', slug, '.progress.json');
    if (fs.existsSync(progressFile)) {
      try {
        const progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
        if (progress.created_at) {
          return new Date(progress.created_at);
        }
      } catch {
        // Fall through to stat
      }
    }
    // Fallback to directory stat
    const stats = fs.statSync(path.join(repoRoot, '.specs', slug));
    return new Date(stats.birthtime);
  };

  let specCreationDateA: Date | null = null;
  let specCreationDateB: Date | null = null;

  try {
    specCreationDateA = getSpecCreationDate(slugA);
    specCreationDateB = getSpecCreationDate(slugB);
  } catch (err) {
    return {
      confidence: 0,
      files_changed: [],
      notes: `Could not determine spec creation dates: ${err instanceof Error ? err.message : String(err)}`,
      bailed_out: { reason: 'stat-error' },
    };
  }

  // Determine canonical owner: spec created closest to (earliest after or latest before) the path's first commit
  const distA = specCreationDateA ? Math.abs(specCreationDateA.getTime() - pathFirstCommitDate.getTime()) : Infinity;
  const distB = specCreationDateB ? Math.abs(specCreationDateB.getTime() - pathFirstCommitDate.getTime()) : Infinity;

  const canonicalSlug = distA <= distB ? slugA : slugB;
  const otherSlug = distA <= distB ? slugB : slugA;

  const recommendationFile = path.join(repoRoot, '.specs', canonicalSlug, 'OWNERSHIP_RECOMMENDATION.md');
  if (fs.existsSync(recommendationFile)) {
    return {
      confidence: 1,
      files_changed: [],
      notes: `${canonicalSlug}/OWNERSHIP_RECOMMENDATION.md already exists — nothing to create.`,
      bailed_out: { reason: 'already-exists' },
    };
  }

  // Write recommendation
  const lines: string[] = [
    `# Ownership Recommendation — ${canonicalSlug}`,
    '',
    `> Generated by \`owner-picker\` resolver from cross-spec-reconcile.`,
    '',
    `## Contested Path`,
    '',
    `\`${contestedPath}\``,
    '',
    `## Analysis`,
    '',
    `- **First commit date:** ${pathFirstCommitDate.toISOString().split('T')[0]}`,
    `- **${slugA} created:** ${specCreationDateA ? specCreationDateA.toISOString().split('T')[0] : 'unknown'}`,
    `- **${slugB} created:** ${specCreationDateB ? specCreationDateB.toISOString().split('T')[0] : 'unknown'}`,
    `- **Canonical owner (by proximity to first commit):** \`${canonicalSlug}\``,
    '',
    `## Recommendation`,
    '',
    `The path \`${contestedPath}\` should be owned by spec \`${canonicalSlug}\`.`,
    `Spec \`${otherSlug}\` claims the same path but was created further from the file's`,
    `first-commit date in git history. Consider updating \`${otherSlug}\` to reference the`,
    `asset via the canonical owner's module instead.`,
    '',
    `## Next Steps`,
    '',
    `1. Review the ownership claim in \`${otherSlug}\` spec files (DESIGN.md, TASKS.md).`,
    `2. Update cross-references to point to \`${canonicalSlug}\` module.`,
    `3. Remove duplicate module claims from \`${otherSlug}\`.`,
    `4. Re-run \`cross-spec-reconcile\` to confirm conflict is resolved.`,
    '',
  ];

  fs.writeFileSync(recommendationFile, lines.join('\n'));

  return {
    confidence: 0.65,
    files_changed: [path.relative(repoRoot, recommendationFile)],
    notes:
      `Generated OWNERSHIP_RECOMMENDATION.md for \`${canonicalSlug}\` based on git history. ` +
      `Path \`${contestedPath}\` was first committed on ${pathFirstCommitDate.toISOString().split('T')[0]}; ` +
      `spec \`${canonicalSlug}\` (created ${specCreationDateA?.toISOString().split('T')[0]}) ` +
      `is closer in time than \`${otherSlug}\` (created ${specCreationDateB?.toISOString().split('T')[0]}). ` +
      `Recommendation is advisory — spec authors should validate before acting.`,
  };
}
