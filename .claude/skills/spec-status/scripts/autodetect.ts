/**
 * Active spec auto-detection (honest-status-command FR-2).
 *
 * Deterministic, dependency-free. When /spec-status is invoked without a slug,
 * pick the active spec by newest .specs/<slug>/.progress.json mtime (≤7 days),
 * tie-broken by a matching plan file in the plans dir. Returns null when nothing
 * is active (the skill then prints "Pass slug explicitly").
 *
 * Paths are injectable so this is unit-tested against fixture spec trees.
 */
import fs from 'node:fs';
import path from 'node:path';

const SLUG_RE = /^[a-zA-Z0-9_-]+$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DetectOptions {
  /** Dir holding `<slug>.md` plan files (tie-break). Default: ~/.claude/plans. */
  plansDir?: string;
  /** "now" epoch ms (injectable for tests). Default: Date.now(). */
  now?: number;
  /** Max age of .progress.json to count as active. Default: 7 days. */
  maxAgeDays?: number;
}

export interface DetectResult {
  slug: string;
  specPath: string;
  reason: string;
  mtimeMs: number;
}

/** Validate a slug came from a trusted shape (no path traversal / shell metachars). */
export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

interface Candidate {
  slug: string;
  specPath: string;
  mtimeMs: number;
}

export function detectActiveSpec(specsRoot: string, opts: DetectOptions = {}): DetectResult | null {
  const now = opts.now ?? Date.now();
  const maxAgeMs = (opts.maxAgeDays ?? 7) * DAY_MS;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(specsRoot, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates: Candidate[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || !isValidSlug(e.name)) continue;
    const progress = path.join(specsRoot, e.name, '.progress.json');
    let mtimeMs: number;
    try {
      mtimeMs = fs.statSync(progress).mtimeMs;
    } catch {
      continue; // no .progress.json → not an active spec
    }
    if (now - mtimeMs > maxAgeMs) continue; // too old
    candidates.push({ slug: e.name, specPath: path.join(specsRoot, e.name), mtimeMs });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);

  // Tie-break only when the top two mtimes are within 60s of each other.
  const top = candidates[0];
  const contenders = candidates.filter((c) => top.mtimeMs - c.mtimeMs <= 60_000);
  if (contenders.length > 1 && opts.plansDir) {
    const withPlan = contenders.find((c) => {
      try {
        return fs.statSync(path.join(opts.plansDir!, `${c.slug}.md`)).isFile();
      } catch {
        return false;
      }
    });
    if (withPlan) {
      return { ...withPlan, reason: 'newest .progress.json (≤7d) + matching plan file' };
    }
  }
  return { ...top, reason: 'newest .progress.json (≤7d) by mtime' };
}
