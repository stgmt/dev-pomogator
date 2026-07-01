/**
 * Content-addressed cache for `claude -p` semantic-drift verdicts.
 *
 * NFR-Performance-5 requires that repeated calls with identical (FR text +
 * Scenario text) inputs return the prior verdict without re-spawning the
 * subprocess. Cache key is `sha256(fr_text \n "::" \n scenario_text)` —
 * matches the contract laid out in `.specs/spec-generator-v4/NFR.md`.
 *
 * Storage shape (one file per key) so concurrent writers don't fight:
 *
 *   `.dev-pomogator/.cross-spec-cache/<sha256>.json`
 *     { fr_id, scenario_id, verdict, generated_at, model? }
 *
 * Atomic write per [`atomic-config-save`](../../.claude/rules/atomic-config-save.md):
 * temp file + rename.
 *
 * @see ./index.ts (caller)
 * @see .specs/spec-generator-v4/NFR.md NFR-Performance-5
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CACHE_DIR_REL = '.dev-pomogator/.cross-spec-cache';

export type Verdict =
  | { result: 'NO_DRIFT_DETECTED' }
  | { result: 'DRIFT'; explanation: string; severity: 'warning' | 'error' };

export interface CacheEntry {
  fr_id: string;
  scenario_id: string;
  verdict: Verdict;
  generated_at: string;
  model?: string;
}

/** sha256 hex of the canonical (fr_text \n :: \n scenario_text) concat. */
export function cacheKey(frText: string, scenarioText: string): string {
  return crypto
    .createHash('sha256')
    .update(frText)
    .update('\n::\n')
    .update(scenarioText)
    .digest('hex');
}

function entryPath(repoRoot: string, key: string): string {
  return path.join(repoRoot, CACHE_DIR_REL, `${key}.json`);
}

export function readEntry(repoRoot: string, key: string): CacheEntry | null {
  const p = entryPath(repoRoot, key);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as CacheEntry;
  } catch {
    // Corrupt or partially-written entry — treat as miss.
    return null;
  }
}

export function writeEntry(repoRoot: string, key: string, entry: CacheEntry): void {
  const p = entryPath(repoRoot, key);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(entry, null, 2));
  fs.renameSync(tmp, p);
}

/** Wipe the entire cache directory — used by `--no-cache` CLI runs + tests. */
export function clearCache(repoRoot: string): void {
  const dir = path.join(repoRoot, CACHE_DIR_REL);
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}
