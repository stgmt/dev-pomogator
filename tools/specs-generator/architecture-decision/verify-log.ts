/**
 * Anti-hallucination integrity guard (R3/R15): a `[VERIFIED via context7:<lib> <ver>]` marker
 * must correspond to a REAL context7 call this session — otherwise it's a fabricated citation
 * (the exact failure the skill exists to prevent). The skill records each genuine context7
 * verification to `.architecture-verify.jsonl`; `checkVerifiedMarkers` scans the rendered
 * AXIS-*.md for context7-VERIFIED markers and flags any whose lib has no backing log entry.
 *
 * Presence of a marker ≠ truth of a marker. This makes the discipline auditable, not trust-based.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export const VERIFY_LOG_FILENAME = '.architecture-verify.jsonl';

export interface VerifyEntry {
  lib: string;
  ver?: string;
  ts: string;
}

export interface MarkerFinding {
  code: 'UNBACKED_VERIFIED_MARKER' | 'MARKERS_BACKED';
  severity: 'WARNING' | 'INFO';
  lib?: string;
  file?: string;
  message: string;
}

/** Append a genuine context7 verification (call AFTER a real resolve-library-id + query-docs). */
export function recordVerification(specDir: string, lib: string, ver?: string): void {
  fs.mkdirSync(specDir, { recursive: true });
  const entry: VerifyEntry = { lib: lib.toLowerCase(), ...(ver ? { ver } : {}), ts: new Date().toISOString() };
  fs.appendFileSync(path.join(specDir, VERIFY_LOG_FILENAME), JSON.stringify(entry) + '\n', 'utf-8');
}

/** Set of libs (lowercased) with at least one recorded real verification. */
export function readVerifiedLibs(specDir: string): Set<string> {
  const p = path.join(specDir, VERIFY_LOG_FILENAME);
  const out = new Set<string>();
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as VerifyEntry;
      if (e.lib) out.add(e.lib.toLowerCase());
    } catch {
      /* skip malformed line */
    }
  }
  return out;
}

const MARKER_RE = /\[VERIFIED via context7:\s*([^\]\s]+)(?:\s+([^\]]+))?\]/gi;

/**
 * Scan AXIS-*.md for `[VERIFIED via context7:<lib>]` markers; any lib without a backing
 * log entry → UNBACKED_VERIFIED_MARKER (fabricated citation). Emits MARKERS_BACKED INFO when
 * markers exist and all are backed.
 */
export function checkVerifiedMarkers(specDir: string): MarkerFinding[] {
  const findings: MarkerFinding[] = [];
  if (!fs.existsSync(specDir)) return findings;
  const backed = readVerifiedLibs(specDir);
  const files = fs.readdirSync(specDir).filter((f) => /^AXIS-.*\.md$/.test(f)).sort();
  let markerCount = 0;
  const seenUnbacked = new Set<string>();
  for (const f of files) {
    const md = fs.readFileSync(path.join(specDir, f), 'utf-8');
    for (const m of md.matchAll(MARKER_RE)) {
      markerCount++;
      const lib = m[1].toLowerCase();
      if (!backed.has(lib)) {
        const key = `${lib}::${f}`;
        if (seenUnbacked.has(key)) continue;
        seenUnbacked.add(key);
        findings.push({
          code: 'UNBACKED_VERIFIED_MARKER',
          severity: 'WARNING',
          lib,
          file: f,
          message: `"[VERIFIED via context7:${lib}]" in ${f} has no backing entry in ${VERIFY_LOG_FILENAME} — fabricated citation? Run a real context7 verification or downgrade to [UNVERIFIED].`,
        });
      }
    }
  }
  if (markerCount > 0 && findings.length === 0) {
    findings.push({
      code: 'MARKERS_BACKED',
      severity: 'INFO',
      message: `All ${markerCount} context7-VERIFIED marker(s) backed by ${VERIFY_LOG_FILENAME}.`,
    });
  }
  return findings;
}
