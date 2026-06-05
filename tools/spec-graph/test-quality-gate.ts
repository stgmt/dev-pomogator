/**
 * Pre-DONE test-quality gate (FR-35b) — the ENFORCING half of the honesty
 * hardening. The feature-map stage routes to strong-tests/spec-status; this gate
 * makes their verdict binding: a "done" claim is BLOCKED while a session-touched
 * task is marked DONE without a strong test (TASK_TEST_QUALITY = weak/fake-positive,
 * or TASK_UNTESTED = no test at all). Audited escape: `[skip-test-quality: <reason ≥8>]`.
 *
 * Pure decision (`evaluateTestQualityGate`) so the BDD binds it directly; the
 * Stop-hook (`test_quality_gate_stop.ts`) wires stdin/git/exit around it, mirroring
 * `anchor_gate_stop` / `claim-evidence-gate`.
 *
 * @see ./conformance.ts (produces TASK_TEST_QUALITY / TASK_UNTESTED findings)
 * @see .specs/spec-generator-v4/FR.md FR-35b / AC-35.4
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Finding } from './conformance.ts';

export interface GateDecision {
  decision: 'block' | 'approve';
  reason?: string;
  /** The escape reason, when an honoured escape let an otherwise-blocking claim through. */
  escapeUsed?: string;
}

/** Finding codes that mean "marked DONE but the test does not back it". */
const BLOCKING_CODES = new Set<string>(['TASK_TEST_QUALITY', 'TASK_UNTESTED']);

/** Extract a `[skip-test-quality: reason]` escape from any text, else null. */
export function escapeReason(text: string): string | null {
  const m = text.match(/\[skip-test-quality:\s*([^\]]+)\]/i);
  return m ? m[1].trim() : null;
}

/** The escape is honoured only when substantive (≥8 chars) — anti-gaming, mirrors the sibling gates. */
export function escapeHonoured(reason: string | null): boolean {
  return !!reason && reason.length >= 8;
}

/**
 * Pure gate: block when any finding marks a DONE task without a strong test,
 * unless an audited escape is present.
 */
export function evaluateTestQualityGate(
  findings: Finding[],
  opts: { escape?: string | null } = {},
): GateDecision {
  const blockers = findings.filter((f) => BLOCKING_CODES.has(f.code));
  if (blockers.length === 0) return { decision: 'approve' };
  const reason = opts.escape ?? null;
  if (escapeHonoured(reason)) {
    return { decision: 'approve', escapeUsed: reason!.trim() };
  }
  return {
    decision: 'block',
    reason:
      `${blockers.length} task(s) marked DONE without a strong test: ` +
      `${blockers.map((b) => `${b.nodeId} (${b.code})`).join(', ')}. ` +
      `Strengthen the test until strong-tests reports STRONG (or write one), or escape with ` +
      `[skip-test-quality: <reason ≥8 chars>].`,
  };
}

/** Append-log an honoured escape (audit trail) — mirrors anchor/scope-gate escape logs. */
export function logEscape(repoRoot: string, reason: string, sessionId?: string): string {
  const file = path.join(repoRoot, '.claude', 'logs', 'test-quality-escapes.jsonl');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify({ reason, session_id: sessionId ?? null, cwd: repoRoot }) + '\n');
  } catch {
    /* best-effort audit trail */
  }
  return file;
}
