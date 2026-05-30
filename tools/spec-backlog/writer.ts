// spec-backlog writer + reader — append-only JSONL per day.
//
// Storage: `.dev-pomogator/.specs-backlog/<YYYY-MM-DD>.jsonl`
// Append semantics: O_APPEND (atomic per the OS) — multiple writers safe.
// Updates: re-append a new line with same `id`, latest wins (lifecycle status).

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { BacklogEntry } from './types.ts';

function todayUtc(): string {
  // YYYY-MM-DD slice of current UTC time. Deterministic per-day file.
  return new Date().toISOString().slice(0, 10);
}

function backlogDir(repoRoot: string): string {
  return path.join(repoRoot, '.dev-pomogator', '.specs-backlog');
}

function backlogFile(repoRoot: string, day: string = todayUtc()): string {
  return path.join(backlogDir(repoRoot), `${day}.jsonl`);
}

/** Stable id for an entry — first 12 hex chars of sha256(slug|code|evidence-canonical-key). */
export function entryId(
  slug: string,
  code: string,
  evidence: BacklogEntry['evidence'],
): string {
  // Compose a canonical evidence key from primary location fields.
  const key = [
    evidence.file ?? '',
    evidence.line ?? '',
    evidence.target ?? '',
    evidence.spec_a ?? '',
    evidence.spec_b ?? '',
  ].join('|');
  return createHash('sha256')
    .update(`${slug}|${code}|${key}`)
    .digest('hex')
    .slice(0, 12);
}

/** Append one entry. Creates the day file if it doesn't exist. */
export function appendEntry(
  repoRoot: string,
  entry: Omit<BacklogEntry, 'id' | 'ts' | 'status'> & {
    id?: string;
    ts?: string;
    status?: BacklogEntry['status'];
  },
): BacklogEntry {
  const full: BacklogEntry = {
    id: entry.id ?? entryId(entry.slug, entry.code, entry.evidence),
    ts: entry.ts ?? new Date().toISOString(),
    slug: entry.slug,
    code: entry.code,
    category: entry.category,
    evidence: entry.evidence,
    suggested_resolver: entry.suggested_resolver,
    difficulty: entry.difficulty,
    status: entry.status ?? 'open',
    resolution: entry.resolution,
  };
  const file = backlogFile(repoRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(full) + '\n');
  return full;
}

/** Append a status-update line for an existing id. Latest line wins. */
export function updateStatus(
  repoRoot: string,
  id: string,
  status: BacklogEntry['status'],
  resolution?: BacklogEntry['resolution'],
): BacklogEntry | null {
  const existing = readEntry(repoRoot, id);
  if (!existing) return null;
  const updated: BacklogEntry = {
    ...existing,
    status,
    resolution: resolution ?? existing.resolution,
    ts: new Date().toISOString(),
  };
  const file = backlogFile(repoRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(updated) + '\n');
  return updated;
}

/** Read all entries across all day files. Latest line per id wins. */
export function readAll(repoRoot: string): BacklogEntry[] {
  const dir = backlogDir(repoRoot);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort();
  const byId = new Map<string, BacklogEntry>();
  for (const f of files) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as BacklogEntry;
        if (parsed.id) byId.set(parsed.id, parsed);
      } catch {
        // Skip malformed lines — append-only logs may have partial writes
        // on crash; future reads tolerate them.
      }
    }
  }
  return [...byId.values()];
}

/** Read entries filtered to status='open'. */
export function readOpen(repoRoot: string): BacklogEntry[] {
  return readAll(repoRoot).filter((e) => e.status === 'open');
}

/** Read one entry by id. */
export function readEntry(repoRoot: string, id: string): BacklogEntry | null {
  return readAll(repoRoot).find((e) => e.id === id) ?? null;
}

/**
 * Batch-17 perf fix: bulk-read all ids into a Set in one disk pass.
 * Callers loop N findings × O(1) Set.has() instead of N × readEntry()
 * (which is N × readAll() under the hood = O(N²) at scale).
 * Expected 11× speedup on warm-dedup at N=1200 per workflow wljjmhkm9.
 */
export function readAllIds(repoRoot: string): Set<string> {
  return new Set(readAll(repoRoot).map((e) => e.id));
}

/** Read entries grouped by category. */
export function readByCategory(repoRoot: string): Map<string, BacklogEntry[]> {
  const out = new Map<string, BacklogEntry[]>();
  for (const e of readAll(repoRoot)) {
    if (!out.has(e.category)) out.set(e.category, []);
    out.get(e.category)!.push(e);
  }
  return out;
}
