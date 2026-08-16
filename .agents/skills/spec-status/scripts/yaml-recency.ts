/**
 * Test-results recency audit (honest-status-command FR-5).
 *
 * Reads a .dev-pomogator/.test-status/status.*.yaml and classifies the run as
 * fresh / stale / not_run. "stale" = state:running but the heartbeat (file mtime)
 * is older than the threshold → the test process likely died on an environmental
 * hang, which must NOT be reported as a test failure (see FR-8 / HSCMD001_03).
 *
 * Dependency-free flat-field parse (the status YAML is flat top-level keys).
 */
import fs from 'node:fs';

export type RecencyClass = 'fresh' | 'stale' | 'not_run';

export interface RecencyReport {
  classification: RecencyClass;
  state: string | null;
  total: number;
  passed: number;
  failed: number;
  ageMs: number | null;
  reason: string;
}

const STALE_THRESHOLD_MS = 5 * 60 * 1000;

function field(src: string, key: string): string | null {
  const m = src.match(new RegExp(`^${key}:\\s*["']?(.*?)["']?\\s*$`, 'm'));
  return m ? m[1] : null;
}
function num(src: string, key: string): number {
  const v = field(src, key);
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param yamlContent  contents of the latest status.*.yaml, or null if none exists
 * @param mtimeMs      file mtime epoch ms (heartbeat), or null if no file
 * @param now          "now" epoch ms (injectable for tests)
 */
export function classifyTestStatus(
  yamlContent: string | null,
  mtimeMs: number | null,
  now: number = Date.now(),
): RecencyReport {
  if (yamlContent == null || mtimeMs == null) {
    return { classification: 'not_run', state: null, total: 0, passed: 0, failed: 0, ageMs: null, reason: 'no status YAML found — tests never executed for this scope' };
  }
  const state = field(yamlContent, 'state');
  const ageMs = now - mtimeMs;
  const base = { state, total: num(yamlContent, 'total'), passed: num(yamlContent, 'passed'), failed: num(yamlContent, 'failed'), ageMs };
  if (state === 'running' && ageMs >= STALE_THRESHOLD_MS) {
    return { ...base, classification: 'stale', reason: `heartbeat dead — last update ${Math.round(ageMs / 60000)} min ago (process likely hung)` };
  }
  return { ...base, classification: 'fresh', reason: `last update ${Math.round(ageMs / 1000)}s ago` };
}

/** Convenience: read the latest status.*.yaml from a dir + classify. */
export function classifyTestStatusDir(statusDir: string, now: number = Date.now()): RecencyReport {
  let latest: { file: string; mtimeMs: number } | null = null;
  try {
    for (const f of fs.readdirSync(statusDir)) {
      if (!/^status\..+\.yaml$/.test(f)) continue;
      const mtimeMs = fs.statSync(`${statusDir}/${f}`).mtimeMs;
      if (!latest || mtimeMs > latest.mtimeMs) latest = { file: `${statusDir}/${f}`, mtimeMs };
    }
  } catch {
    return classifyTestStatus(null, null, now);
  }
  if (!latest) return classifyTestStatus(null, null, now);
  return classifyTestStatus(fs.readFileSync(latest.file, 'utf-8'), latest.mtimeMs, now);
}
