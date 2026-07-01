/**
 * FR-20 — author-facing conformance summary, threshold-only + ack state.
 *
 * Replaces the v3 «every prompt aggregate»: the UserPromptSubmit hook emits a
 * ONE-LINE summary only when unresolved DENY events exist since the author's
 * last acknowledgment; otherwise it is silent (zero-noise default).
 *
 *   - Soft tier source: ~/.dev-pomogator/logs/form-guards.log (audit-logger DENY lines)
 *   - Hard tier source: <repo>/.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl
 *     (finding entries appended by spec-conformance-guard on deny)
 *   - Ack state: ~/.dev-pomogator/state/last-summary-ack.json
 *     {ack_timestamp, ack_event_count} — written ATOMICALLY (temp + rename,
 *     per .claude/rules/atomic-config-save.md) by the /spec-status skill via
 *     `ack-summary.ts`.
 *
 * NFR-Performance-6: render ≤50ms p95 — both reads are capped at the last
 * 1000 entries per file (tail-slice before parse) to bound scan cost.
 *
 * Everything is exported + path-injectable so the contract test exercises the
 * REAL functions in-process (latency p95) and via subprocess (hook surface).
 *
 * @see .specs/spec-generator-v4/FR.md FR-20, NFR.md NFR-Performance-6
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readRecentEvents } from './audit-logger.ts';
import { readTaskCensusCache, readTaskCensusPrev, sumTotal } from '../spec-graph/task-census.ts';

export interface AckState {
  ack_timestamp: string;
  ack_event_count: number;
}

export interface SummaryPaths {
  /** Ack state file. Default: ~/.dev-pomogator/state/last-summary-ack.json */
  ackFile?: string;
  /** Repo root holding .dev-pomogator/.spec-check-log/. Default: cwd. */
  repoRoot?: string;
  /** Soft-tier audit-log override (tests/isolation). Default: the real form-guards.log. */
  softLog?: string;
}

const ENTRY_CAP = 1000; // FR-20: bound scan cost per file

export function defaultAckFile(): string {
  return path.join(os.homedir(), '.dev-pomogator', 'state', 'last-summary-ack.json');
}

export function readAck(ackFile = defaultAckFile()): AckState | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(ackFile, 'utf-8'));
    if (typeof parsed?.ack_timestamp !== 'string') return null;
    return parsed as AckState;
  } catch {
    return null; // missing / torn / malformed → treat as never-acked
  }
}

/** Atomic write per atomic-config-save: temp file + rename. */
export function writeAckAtomic(state: AckState, ackFile = defaultAckFile()): void {
  const dir = path.dirname(ackFile);
  fs.mkdirSync(dir, { recursive: true });
  // Unique temp per writer so concurrent acks never interleave bytes.
  const tmp = `${ackFile}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, ackFile);
}

/** Soft-tier unresolved DENY count: audit-log DENY events newer than the ack. */
export function countSoftDenySince(sinceTs: Date | null, softLog?: string): number {
  const entries = (softLog === undefined ? readRecentEvents(24) : readRecentEvents(24, softLog)).slice(
    -ENTRY_CAP,
  );
  let n = 0;
  for (const e of entries) {
    if (e.event !== 'DENY') continue;
    if (sinceTs && e.timestamp <= sinceTs) continue;
    n++;
  }
  return n;
}

/**
 * Hard-tier unresolved DENY count: finding entries (carry a `code` field —
 * appended by spec-conformance-guard ON DENY) in TODAY'S JSONL, newer than
 * the ack. Non-finding events (`kind`/parse-crash envelopes) don't count.
 */
export function countHardDenySince(sinceTs: Date | null, repoRoot = process.cwd()): number {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const file = path.join(repoRoot, '.dev-pomogator', '.spec-check-log', `${today}.jsonl`);
    if (!fs.existsSync(file)) return 0;
    const lines = fs.readFileSync(file, 'utf-8').split('\n').filter((l) => l.trim());
    let n = 0;
    for (const line of lines.slice(-ENTRY_CAP)) {
      try {
        const e = JSON.parse(line);
        // REAL envelope (spec-check-log composeEntry) carries `finding_code`;
        // `code` kept for legacy seeds. Caught 2026-06-07 by SPECGEN004_122:
        // the original check looked for `code` only — real guard findings were
        // NEVER counted (the live "13 unresolved" proof was all soft-tier).
        const findingCode = e.finding_code ?? e.code;
        if (typeof findingCode !== 'string') continue; // not a deny finding
        // Second 2026-06-07 catch (the fix above instantly surfaced it live —
        // the prompt line jumped to 1052): spec-conformance-push side-channels
        // EVERY edit's findings (info severity, NOT denies) into the same
        // shard. Unresolved-DENY counts only DENY producers — exclude push.
        if (e.source === 'spec-conformance-push') continue;
        const ts = new Date(e.timestamp);
        if (isNaN(ts.getTime())) continue;
        if (sinceTs && ts <= sinceTs) continue;
        n++;
      } catch {
        // torn/garbage line — skip
      }
    }
    return n;
  } catch {
    return 0;
  }
}

/**
 * The FR-20 surface: one line when unresolved DENY ≥ 1 since the last ack,
 * `null` (silence) otherwise. Pure-ish: paths injectable for tests.
 */
export function buildConformanceSummary(paths: SummaryPaths = {}): string | null {
  const ack = readAck(paths.ackFile ?? defaultAckFile());
  const sinceTs = ack ? new Date(ack.ack_timestamp) : null;
  const unresolved =
    countSoftDenySince(sinceTs, paths.softLog) +
    countHardDenySince(sinceTs, paths.repoRoot ?? process.cwd());
  if (unresolved === 0) return null; // zero-noise default
  const sinceLabel = ack ? `since last ack ${ack.ack_timestamp}` : 'since the last 24h (never acked)';
  return `📊 Spec conformance: ${unresolved} unresolved DENY ${sinceLabel} — run /spec-status for the full aggregate, which also acknowledges them`;
}

/**
 * P21-6 task-census banner: a PER-SPEC, multi-line view of UNFINISHED work from
 * the cached census (written by the MCP-server watcher + spec-conformance-push
 * while the graph was hot — this reads ONLY the tiny JSON, never builds the
 * graph, per NFR-Performance-6). Honest by construction: `open` = author-admitted
 * not-done, `🔴` = DONE-but-a-test-fails, `⏸` = DONE-but-can't-confirm (not_run /
 * no scenario) — surfaced, not hidden. A было→стало history line fires when the
 * total changed since the prev snapshot. Header + top-5 specs + «ещё N»; silent
 * when nothing is unfinished or the cache is absent.
 */
export function buildTaskCensusLine(repoRoot = process.cwd()): string | null {
  const c = readTaskCensusCache(repoRoot);
  if (!c) return null;
  if (c.total.open === 0 && c.total.doneRed === 0 && c.total.doneUnrun === 0) return null; // all clean → silent

  const parts = [`${c.total.open} open`];
  if (c.total.doneRed > 0) parts.push(`${c.total.doneRed} 🔴 done-but-red`);
  if (c.total.doneUnrun > 0) parts.push(`${c.total.doneUnrun} ⏸ done-but-not-run`);
  let header = `📋 Spec tasks (census ${c.ts}): ${parts.join(', ')} — run /spec-status for the per-task breakdown`;

  // History: было→стало when the total moved since the previous snapshot.
  const prev = readTaskCensusPrev(repoRoot);
  if (prev && sumTotal(prev) !== sumTotal(c)) {
    header += `  [было ${sumTotal(prev)} → стало ${sumTotal(c)}, не подтверждено]`;
  }

  const lines = [header];
  // FR-49a: name ONE concrete next open task (busiest unfinished spec with an
  // open task) so «what's next» rides the standing signal, not just counts.
  const nextSpec = c.specs.find((s) => s.nextOpen);
  if (nextSpec?.nextOpen) {
    lines.push(`   👉 следующее: ${nextSpec.nextOpen.title} [${nextSpec.nextOpen.id}]`);
  }
  const TOP = 5;
  for (const s of c.specs.slice(0, TOP)) {
    const p: string[] = [];
    if (s.open) p.push(`${s.open} open`);
    if (s.doneRed) p.push(`${s.doneRed}🔴`);
    if (s.doneUnrun) p.push(`${s.doneUnrun}⏸`);
    lines.push(`   ${s.slug}: ${p.join(', ')}`);
  }
  if (c.specs.length > TOP) lines.push(`   …ещё ${c.specs.length - TOP} спек`);
  return lines.join('\n');
}
