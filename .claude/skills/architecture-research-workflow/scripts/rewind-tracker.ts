// architecture-research-workflow rewind tracker (SPECGEN004_27 / FR-12).
//
// When the user reveals a new constraint inside Stage 5 (decision Q&A
// loop), the skill should suggest «restart-from-stage 4» and record the
// rewind in `5-decisions-locked.md` as `[REWIND] Stage 5 → Stage 4:
// <reason>`. A 3-rewind hard limit prevents infinite loops.
//
// This module is the pure state-machine side. The interactive prompt
// + actual stage-file mutation happens in the live skill flow; this
// file just decides «can we rewind, and how do we format the entry».

import fs from 'node:fs';
import path from 'node:path';

export const REWIND_LIMIT = 3;

export interface RewindAttempt {
  fromStage: number;
  toStage: number;
  reason: string;
  timestamp: string;
}

export interface RewindDecision {
  allowed: boolean;
  reason: string;          // diagnostic — surfaced to the user
  entry?: string;          // the `[REWIND] ...` line to append, when allowed
  attemptsUsed: number;
}

/** Count how many `[REWIND]` lines already live in `5-decisions-locked.md`. */
export function countRewinds(repoRoot: string, slug: string): number {
  const file = path.join(
    repoRoot, '.specs', slug, '.architecture-research', '5-decisions-locked.md',
  );
  if (!fs.existsSync(file)) return 0;
  const body = fs.readFileSync(file, 'utf8');
  const matches = body.match(/^\[REWIND\] Stage \d+ → Stage \d+:/gm);
  return matches ? matches.length : 0;
}

/** Decide whether to allow a rewind + produce the audit-trail entry. */
export function decideRewind(opts: {
  repoRoot: string;
  slug: string;
  attempt: Omit<RewindAttempt, 'timestamp'>;
  now: Date;
}): RewindDecision {
  const used = countRewinds(opts.repoRoot, opts.slug);
  if (used >= REWIND_LIMIT) {
    return {
      allowed: false,
      reason: `${REWIND_LIMIT}-rewind hard limit reached — finish the current Stage 5 cycle or restart the whole flow.`,
      attemptsUsed: used,
    };
  }
  const entry =
    `[REWIND] Stage ${opts.attempt.fromStage} → Stage ${opts.attempt.toStage}: ` +
    `${opts.attempt.reason} (at ${opts.now.toISOString()})`;
  return {
    allowed: true,
    reason: `rewind ${used + 1}/${REWIND_LIMIT}`,
    entry,
    attemptsUsed: used + 1,
  };
}

/** Append a `[REWIND]` line to `5-decisions-locked.md`. Caller decides whether to call. */
export function appendRewindEntry(
  repoRoot: string,
  slug: string,
  entry: string,
): string {
  const file = path.join(
    repoRoot, '.specs', slug, '.architecture-research', '5-decisions-locked.md',
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Append on a fresh line so the marker is unambiguous.
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const sep = existing && !existing.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(file, `${existing}${sep}${entry}\n`);
  return file;
}
