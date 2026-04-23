#!/usr/bin/env npx tsx
/**
 * scope-gate-guard — PreToolUse hook
 *
 * Blocks `git commit|push` if staged diff modifies a guard/policy/enum gate
 * without a fresh scope-verification marker AND without an explicit escape hatch.
 *
 * Spec: .specs/verify-generic-scope-fix/FR.md (FR-2 + FR-3 + FR-4 + FR-5 + FR-7)
 * Template: extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts (stdin+exit pattern)
 *
 * Exit codes:
 *   0 — allow (pass-through)
 *   2 — deny (scope-gate triggered)
 *
 * Fail-open: any error → exit(0). Hook silently disabled > false positive deny.
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'node:url';
import { scoreDiff, isDocsOrTestsOnly } from '../_shared/scope-gate-score-diff.ts';
import {
  readFreshMarker,
  runGC,
  sha256,
  appendEscapeLog,
} from '../_shared/scope-gate-marker-store.ts';

const SCORE_THRESHOLD = 2;
const MIN_ESCAPE_REASON_LEN = 8;

interface PreToolUseInput {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

/** Extract commit message from a `git commit` command. Returns null if not found. */
export function extractCommitMessage(command: string): string | null {
  // Match `-m "..."` or `-m '...'`
  const mFlag = command.match(/-m\s+(['"])((?:(?!\1).)*)\1/);
  if (mFlag) return mFlag[2];
  // Match `-m=...` (less common)
  const mEq = command.match(/-m=(['"])((?:(?!\1).)*)\1/);
  if (mEq) return mEq[2];
  return null;
}

/** Match escape hatch in commit message. Returns reason if found, null otherwise. */
export function findEscapeHatch(commitMessage: string | null): string | null {
  if (!commitMessage) return null;
  const match = commitMessage.match(/\[skip-scope-verify:\s*([^\]]+)\]/i);
  return match ? match[1].trim() : null;
}

function denyAndExit(reasonLines: string[], score: number): never {
  const reasonBody = reasonLines.slice(0, 20).map(r => `  • ${r}`).join('\n');
  const message = [
    `[scope-gate] Detected ${reasonLines.length} suspicious pattern(s) in staged diff:`,
    reasonBody,
    '',
    `Score: ${score} (threshold: ${SCORE_THRESHOLD})`,
    '',
    'To proceed:',
    '  1. Run: /verify-generic-scope-fix',
    '     (creates marker, unblocks if all variants traced)',
    '  2. OR add escape hatch to commit message:',
    '     [skip-scope-verify: <reason ≥8 chars>]',
    '',
    'Docs: .claude/rules/scope-gate/when-to-verify.md',
  ].join('\n');

  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: message.slice(0, 1000),
    },
  };
  process.stdout.write(JSON.stringify(output));
  process.exit(2);
}

function tryExec(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

async function main(): Promise<void> {
  let inputData = '';

  if (process.stdin.isTTY) {
    process.exit(0);
  }

  for await (const chunk of process.stdin) {
    inputData += chunk.toString();
  }

  if (!inputData.trim()) {
    process.exit(0);
  }

  let data: PreToolUseInput;
  try {
    data = JSON.parse(inputData);
  } catch {
    process.exit(0); // fail-open
  }

  if (data.tool_name !== 'Bash') {
    process.exit(0);
  }

  const command = typeof data.tool_input?.command === 'string' ? data.tool_input.command : '';
  if (!/^\s*git\s+(commit|push)\b/.test(command)) {
    process.exit(0);
  }

  const cwd = data.cwd || process.cwd();
  const sessionId = data.session_id ?? '';

  // GC stale markers (throttled inside)
  try { runGC(cwd); } catch { /* fail-open */ }

  // Get staged diff
  const diff = tryExec('git diff --cached', cwd);
  if (!diff) {
    process.exit(0); // no staged changes or not a git repo
  }

  // FR-4 rule (c): docs-only short-circuit
  const nameOnly = tryExec('git diff --cached --name-only', cwd);
  if (isDocsOrTestsOnly(nameOnly)) {
    process.exit(0);
  }

  // Compute score with dampening
  const dampenFiles = nameOnly.split(/\r?\n/).map(f => f.trim()).filter(Boolean);
  const { score, reasons } = scoreDiff(diff, { dampenFiles });

  if (score < SCORE_THRESHOLD) {
    process.exit(0);
  }

  // FR-3: escape hatch check
  const commitMessage = extractCommitMessage(command);
  const escapeReason = findEscapeHatch(commitMessage);
  const envSkip = process.env.SCOPE_GATE_SKIP === '1';

  const diffSha = sha256(diff);

  if (escapeReason || envSkip) {
    const reason = escapeReason ?? process.env.SCOPE_GATE_SKIP ?? '1';
    appendEscapeLog(cwd, {
      ts: new Date().toISOString(),
      diff_sha256: diffSha,
      reason,
      session_id: sessionId,
      cwd,
    });
    if (reason.length < MIN_ESCAPE_REASON_LEN) {
      process.stderr.write(
        `[scope-gate] escape reason too short (${reason.length} chars < ${MIN_ESCAPE_REASON_LEN}) — audit entry still written\n`,
      );
    }
    process.exit(0);
  }

  // FR-5: fresh marker check
  const marker = readFreshMarker(cwd, sessionId, diffSha);
  if (marker && marker.should_ship !== false) {
    process.exit(0);
  }

  // FR-7: fresh marker with should_ship: false → still deny
  if (marker && marker.should_ship === false) {
    const unreachable = marker.variants
      .filter(v => v.reach === 'unreachable')
      .map(v => `unreachable variant: ${v.file}:${v.lineNumber} (${v.name}) — ${v.evidence}`);
    denyAndExit(
      unreachable.length > 0
        ? unreachable
        : ['marker says should_ship: false (re-run /verify-generic-scope-fix for updated reach analysis)'],
      score,
    );
  }

  // No marker, no escape → deny
  denyAndExit(reasons, score);
}

// Import guard: only run main() when invoked directly (not on import by tests)
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().catch((err) => {
    process.stderr.write(`[scope-gate-guard] Error: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(0); // fail-open
  });
}
