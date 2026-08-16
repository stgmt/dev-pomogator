// spec-generator-orchestrator — self-improving merge ledger (FR-33).
//
// The orchestrator appends DATED entries to `.specs/<slug>/SELF_IMPROVE.md`
// when it notices friction/gaps during a run. The ledger is under a
// HUMAN-MERGE GATE: a `pending` entry is a reminder and is NEVER auto-applied
// to spec or code. Only after the human flips an entry to `approved` may the
// orchestrator apply it (→ `applied` with an applied-at date).
//
// Pure file I/O — no spec/code mutation here. Cross-links the existing
// `suggest-rules` / `self-improving` / `/reflect` mechanics rather than
// duplicating them (FR-33).
//
// @see .specs/spec-generator-v4/FR.md FR-33
// @see .specs/spec-generator-v4/ACCEPTANCE_CRITERIA.md AC-33.2..33.4

import fs from 'node:fs';
import path from 'node:path';

export type LedgerStatus = 'pending' | 'approved' | 'applied';

export interface LedgerEntry {
  date: string;
  trigger: string;
  observation: string;
  proposed_change: string;
  affected_files: string[];
  confidence: string;
  status: LedgerStatus;
  /** Set when status flips to `applied`. */
  applied_at?: string;
}

const ENTRY_MARKER = '<!-- entry -->';
const HEADER =
  '# Self-Improve Ledger\n\n' +
  '<!-- orchestrator merge-ledger (FR-33): `pending` entries are reminders, ' +
  'NEVER auto-applied. The human flips an entry to `approved`; only then may ' +
  'the orchestrator apply it. Reuses /reflect + suggest-rules mechanics. -->\n';

export function ledgerPath(repoRoot: string, slug: string): string {
  return path.join(repoRoot, '.specs', slug, 'SELF_IMPROVE.md');
}

function serialiseEntry(e: LedgerEntry): string {
  const lines = [
    ENTRY_MARKER,
    `- date: ${e.date}`,
    `- trigger: ${e.trigger}`,
    `- observation: ${e.observation}`,
    `- proposed_change: ${e.proposed_change}`,
    `- affected_files: ${e.affected_files.join(', ')}`,
    `- confidence: ${e.confidence}`,
    `- status: ${e.status}`,
  ];
  if (e.applied_at) lines.push(`- applied_at: ${e.applied_at}`);
  return lines.join('\n');
}

function parseEntry(block: string): LedgerEntry | null {
  const get = (key: string): string | undefined => {
    const m = block.match(new RegExp(`^-\\s*${key}:\\s*(.*)$`, 'm'));
    return m ? m[1].trim() : undefined;
  };
  const date = get('date');
  const status = get('status') as LedgerStatus | undefined;
  if (!date || !status) return null;
  const affected = get('affected_files') ?? '';
  const entry: LedgerEntry = {
    date,
    trigger: get('trigger') ?? '',
    observation: get('observation') ?? '',
    proposed_change: get('proposed_change') ?? '',
    affected_files: affected ? affected.split(',').map((s) => s.trim()).filter(Boolean) : [],
    confidence: get('confidence') ?? '',
    status,
  };
  const appliedAt = get('applied_at');
  if (appliedAt) entry.applied_at = appliedAt;
  return entry;
}

/** Read every entry from the ledger (empty array if the file doesn't exist). */
export function readLedger(repoRoot: string, slug: string): LedgerEntry[] {
  const file = ledgerPath(repoRoot, slug);
  if (!fs.existsSync(file)) return [];
  const body = fs.readFileSync(file, 'utf8');
  return body
    .split(ENTRY_MARKER)
    .slice(1) // drop the header preamble before the first marker
    .map((chunk) => parseEntry(`${ENTRY_MARKER}\n${chunk}`))
    .filter((e): e is LedgerEntry => e !== null);
}

function writeLedger(repoRoot: string, slug: string, entries: LedgerEntry[]): void {
  const file = ledgerPath(repoRoot, slug);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = `${HEADER}\n${entries.map(serialiseEntry).join('\n\n')}\n`;
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, file); // atomic per atomic-config-save
}

/**
 * AC-33.2: append a DATED `pending` entry. This ONLY writes SELF_IMPROVE.md —
 * it never touches a spec or code file. Returns the appended entry.
 */
export function appendPendingEntry(
  repoRoot: string,
  slug: string,
  input: {
    trigger: string;
    observation: string;
    proposed_change: string;
    affected_files: string[];
    confidence?: string;
  },
  now: Date = new Date(),
): LedgerEntry {
  const entry: LedgerEntry = {
    date: now.toISOString().slice(0, 10),
    trigger: input.trigger,
    observation: input.observation,
    proposed_change: input.proposed_change,
    affected_files: input.affected_files,
    confidence: input.confidence ?? 'medium',
    status: 'pending',
  };
  writeLedger(repoRoot, slug, [...readLedger(repoRoot, slug), entry]);
  return entry;
}

/**
 * AC-33.3: the session-start reminder — pending count + the top entries'
 * observations (most-recently-appended first).
 */
export function pendingReminder(
  repoRoot: string,
  slug: string,
  topN = 3,
): { count: number; observations: string[] } {
  const pending = readLedger(repoRoot, slug).filter((e) => e.status === 'pending');
  return {
    count: pending.length,
    observations: pending.slice(-topN).reverse().map((e) => e.observation),
  };
}

/**
 * AC-33.4: flip every `approved` entry to `applied` (stamping applied-at);
 * `pending` entries are left untouched. Returns the entries that were applied
 * and how many remain pending.
 */
export function applyApproved(
  repoRoot: string,
  slug: string,
  now: Date = new Date(),
): { applied: LedgerEntry[]; leftPending: number } {
  const entries = readLedger(repoRoot, slug);
  const applied: LedgerEntry[] = [];
  for (const e of entries) {
    if (e.status === 'approved') {
      e.status = 'applied';
      e.applied_at = now.toISOString().slice(0, 10);
      applied.push(e);
    }
  }
  if (applied.length > 0) writeLedger(repoRoot, slug, entries);
  return { applied, leftPending: entries.filter((e) => e.status === 'pending').length };
}
