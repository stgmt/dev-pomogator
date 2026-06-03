/**
 * Append-only JSONL writer for the side-channel conformance log (FR-15).
 *
 * Each invocation appends one JSON entry to
 * `<repoRoot>/.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl`, switching
 * to `<YYYY-MM-DD>-1.jsonl`, `<YYYY-MM-DD>-2.jsonl`, … when the active file
 * crosses 10 MB. Writes use `fs.appendFileSync` (O_APPEND), so concurrent
 * processes don't shred each other's lines.
 *
 * Each finding produced by `checkConformance` becomes one entry; the
 * envelope adds `timestamp`, `session_id`, `source`, and `spec_slug` so the
 * CLI reader can answer «who emitted this and from where» without joining
 * an extra index.
 *
 * @see ./cli.ts (reader CLI)
 * @see .specs/spec-generator-v4/FR.md FR-15
 * @see .specs/spec-generator-v4/NFR.md NFR-Reliability-5
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Finding } from '../spec-graph/conformance.ts';

export const ROTATION_BYTES = 10 * 1024 * 1024;
const DIR_REL = '.dev-pomogator/.spec-check-log';

export interface LogEntry {
  timestamp: string;
  finding_code: string;
  severity: 'error' | 'warning' | 'info';
  location: { file: string; line: number };
  message: string;
  spec_slug?: string;
  node_id?: string;
  related_id?: string;
  session_id?: string;
  source: string;
}

export interface AppendOptions {
  repoRoot: string;
  sessionId?: string;
  /** Identifies which hook / tool produced the entry (e.g. `spec-conformance-push`). */
  source: string;
  /** Date stamp override for tests; defaults to `today` in UTC. */
  now?: Date;
  /** Rotation threshold override for tests; defaults to 10 MB. */
  rotationBytes?: number;
}

function utcDateStamp(d: Date): string {
  // YYYY-MM-DD in UTC — stable across timezones; matches the spec text.
  return d.toISOString().slice(0, 10);
}

/** `slug` from a `.specs/<slug>/...` path; empty string for anything else. */
function specSlugOf(filePath: string): string | undefined {
  const m = filePath.replace(/\\/g, '/').match(/(?:^|\/)\.specs\/([^/]+)\//);
  return m ? m[1] : undefined;
}

/**
 * Resolve the active log file path — the highest-numbered shard for the day.
 *
 * Suffix order: base file (`<date>.jsonl`) is treated as suffix 0; `-N` is
 * suffix N. We can't sort the filenames lexicographically because `-` < `.`
 * in ASCII would put `-1.jsonl` BEFORE `.jsonl`, inverting the intent.
 */
export function activeShardPath(repoRoot: string, dateStamp: string): string {
  const dir = path.join(repoRoot, DIR_REL);
  const base = path.join(dir, `${dateStamp}.jsonl`);
  if (!fs.existsSync(dir)) return base;
  const suffixOf = (name: string): number | null => {
    if (name === `${dateStamp}.jsonl`) return 0;
    const m = name.match(new RegExp(`^${dateStamp}-(\\d+)\\.jsonl$`));
    return m ? parseInt(m[1], 10) : null;
  };
  let bestName: string | null = null;
  let bestSuffix = -1;
  for (const name of fs.readdirSync(dir)) {
    const s = suffixOf(name);
    if (s === null) continue;
    if (s > bestSuffix) {
      bestSuffix = s;
      bestName = name;
    }
  }
  return bestName ? path.join(dir, bestName) : base;
}

/** `<YYYY-MM-DD>.jsonl` → `<YYYY-MM-DD>-1.jsonl`; `-N.jsonl` → `-N+1.jsonl`. */
function nextShard(current: string, dateStamp: string): string {
  const dir = path.dirname(current);
  const base = path.basename(current, '.jsonl');
  if (base === dateStamp) return path.join(dir, `${dateStamp}-1.jsonl`);
  const m = base.match(/-(\d+)$/);
  if (!m) return path.join(dir, `${dateStamp}-1.jsonl`);
  const n = parseInt(m[1], 10) + 1;
  return path.join(dir, `${dateStamp}-${n}.jsonl`);
}

/** Compose the JSONL envelope for a finding + emit-time metadata. */
export function composeEntry(finding: Finding, opts: AppendOptions, now: Date): LogEntry {
  const entry: LogEntry = {
    timestamp: now.toISOString(),
    finding_code: finding.code,
    severity: finding.severity,
    location: { file: finding.location.file, line: finding.location.line },
    message: finding.message,
    source: opts.source,
  };
  const slug = specSlugOf(finding.location.file);
  if (slug) entry.spec_slug = slug;
  if (finding.nodeId) entry.node_id = finding.nodeId;
  if (finding.relatedId) entry.related_id = finding.relatedId;
  if (opts.sessionId) entry.session_id = opts.sessionId;
  return entry;
}

/**
 * Append one finding. Returns the absolute path of the shard that received
 * the write (may be a freshly-rolled-over shard if the active one crossed
 * the rotation threshold).
 */
export function appendFinding(finding: Finding, opts: AppendOptions): string {
  const now = opts.now ?? new Date();
  const dateStamp = utcDateStamp(now);
  const rotationAt = opts.rotationBytes ?? ROTATION_BYTES;
  const dir = path.join(opts.repoRoot, DIR_REL);
  fs.mkdirSync(dir, { recursive: true });

  let shard = activeShardPath(opts.repoRoot, dateStamp);
  if (fs.existsSync(shard) && fs.statSync(shard).size >= rotationAt) {
    shard = nextShard(shard, dateStamp);
  }
  const entry = composeEntry(finding, opts, now);
  fs.appendFileSync(shard, JSON.stringify(entry) + '\n');
  return shard;
}

/** Append every finding from a batch (one call per finding). */
export function appendFindings(findings: Finding[], opts: AppendOptions): string[] {
  return findings.map((f) => appendFinding(f, opts));
}

/**
 * Append an arbitrary JSON entry to the active shard — same path resolution +
 * 10 MB rotation as findings. Used by the spec-conformance-guard for
 * NON-finding events: per-file parse crashes (FR-19, SPECGEN004_50) and
 * ALLOW_AFTER_MIGRATION decisions (FR-22, SPECGEN004_51). A `timestamp` is
 * stamped automatically if the caller didn't supply one. Returns the shard path.
 */
export function appendRawEntry(
  entry: Record<string, unknown>,
  opts: Pick<AppendOptions, 'repoRoot' | 'now' | 'rotationBytes'>,
): string {
  const now = opts.now ?? new Date();
  const dateStamp = utcDateStamp(now);
  const rotationAt = opts.rotationBytes ?? ROTATION_BYTES;
  const dir = path.join(opts.repoRoot, DIR_REL);
  fs.mkdirSync(dir, { recursive: true });

  let shard = activeShardPath(opts.repoRoot, dateStamp);
  if (fs.existsSync(shard) && fs.statSync(shard).size >= rotationAt) {
    shard = nextShard(shard, dateStamp);
  }
  const withTs = { timestamp: entry.timestamp ?? now.toISOString(), ...entry };
  fs.appendFileSync(shard, `${JSON.stringify(withTs)}\n`);
  return shard;
}
