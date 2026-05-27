/**
 * Live version fetcher with 24h cache (FR-8 guardrail). Fetches "latest stable"
 * version strings so the skill cites current versions instead of stale memory.
 * Fetcher is INJECTABLE — default uses global fetch; tests pass a stub so CI
 * never hits the network. Cost numbers are NOT fetched (they go stale → qualitative
 * $/$$/$$$ chips instead); only versions.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export type Fetcher = (tech: string) => Promise<string | null>;

export interface CacheEntry {
  version: string | null;
  fetched_at: number; // epoch ms
}

const CACHE_FILENAME = '.architecture-cache.json';
const TTL_MS = 24 * 60 * 60 * 1000;

function cachePath(cwd: string): string {
  const override = process.env.ARCHITECTURE_LOG_DIR;
  return path.join(override ?? cwd, CACHE_FILENAME);
}

function readCache(cwd: string): Record<string, CacheEntry> {
  const p = cachePath(cwd);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return {};
  }
}

function writeCache(cwd: string, cache: Record<string, CacheEntry>): void {
  const p = cachePath(cwd);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cache, null, 2), 'utf-8');
}

// Default fetcher — best-effort, returns null on any failure (never throws).
const defaultFetcher: Fetcher = async () => null;

/**
 * Return latest-stable version for `tech`, using a 24h on-disk cache.
 * `now` is injectable for TTL tests. Cache hit within TTL skips the fetcher.
 */
export async function getLatestVersion(
  tech: string,
  cwd: string,
  opts: { fetcher?: Fetcher; now?: number } = {},
): Promise<{ version: string | null; cached: boolean }> {
  const fetcher = opts.fetcher ?? defaultFetcher;
  const now = opts.now ?? Date.now();
  const cache = readCache(cwd);
  const hit = cache[tech];

  if (hit && now - hit.fetched_at < TTL_MS) {
    return { version: hit.version, cached: true };
  }

  const version = await fetcher(tech);
  cache[tech] = { version, fetched_at: now };
  writeCache(cwd, cache);
  return { version, cached: false };
}
