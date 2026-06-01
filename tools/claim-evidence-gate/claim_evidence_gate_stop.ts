#!/usr/bin/env npx tsx
/**
 * Claim-Evidence Gate — Stop hook.
 *
 * On agent Stop: read the current turn window (final assistant message + the tool_uses
 * issued since the user last spoke). If the message presents a RESULT-class claim —
 *   - analysis-verdict: a grid of PASS/FAIL verdicts
 *   - works-done: "работает / фикс деплоен / готово"
 *   - not-found-impossible: "не нашёл / не существует / архитектурно невозможно"
 *   - verified-marker: a literal [VERIFIED via X]
 * — but NO matching tool was actually run this turn, BLOCK the stop and tell the agent to
 * run the real check first. This catches the failure that motivated the gate: presenting a
 * fact-check verdict table without ever running fact-check.
 *
 * Modes (CLAIM_GATE_ENABLED): "true" (enforce, default) | "shadow" (log only, never block)
 * | "false" (off). Every detection is appended to .dev-pomogator/.claim-evidence-gate-fires.jsonl.
 *
 * Anti-loop: hash the claim; same text → approve; max retries within cooldown → approve;
 * self-marker in the message → approve. Fail-open: any error → approve.
 */

import fs from 'node:fs';
import path from 'node:path';

import { log as _logShared, normalizePath } from '../_shared/hook-utils.ts';
import { markerPath, readMarker, writeMarkerAtomic, isWithinCooldown, hashFileList } from '../_shared/marker-utils.ts';
import { extractTurnWindow } from './turn_window.ts';
import { firstUnsupported } from './claim_classifier.ts';

interface StopHookInput {
  cwd?: string;
  workspace_roots?: string[];
  transcript_path?: string;
  stop_hook_active?: boolean;
  session_id?: string;
}

const MARKER_DIR = '.dev-pomogator';
const MARKER_FILENAME = '.claim-evidence-gate-marker.json';
const FIRES_FILENAME = '.claim-evidence-gate-fires.jsonl';
const SELF_MARKER = 'claim-evidence-gate';
const LOG_PREFIX = 'CLAIM-EVIDENCE-GATE';

function log(level: 'INFO' | 'DEBUG' | 'ERROR', message: string): void {
  _logShared(level, LOG_PREFIX, message);
}

function getConfig() {
  const mode = (process.env.CLAIM_GATE_ENABLED ?? 'true').toLowerCase();
  return {
    mode: mode === 'false' ? 'false' : mode === 'shadow' ? 'shadow' : 'true',
    cooldownMinutes: parseInt(process.env.CLAIM_GATE_COOLDOWN_MINUTES || '2', 10) || 2,
    maxRetries: parseInt(process.env.CLAIM_GATE_MAX_RETRIES || '2', 10) || 2,
    minSearch: parseInt(process.env.CLAIM_GATE_MIN_SEARCH || '2', 10) || 2,
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

function approve(): void {
  process.stdout.write('{}');
}
function block(reason: string): void {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
}

function logFire(repoRoot: string, entry: Record<string, unknown>): void {
  try {
    const p = path.join(repoRoot, MARKER_DIR, FIRES_FILENAME);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify(entry) + '\n');
  } catch {
    /* logging is best-effort */
  }
}

async function main(): Promise<void> {
  const config = getConfig();
  if (config.mode === 'false') return approve();

  const raw = await readStdin();
  if (!raw.trim()) return approve();

  let input: StopHookInput;
  try {
    input = JSON.parse(raw) as StopHookInput;
  } catch {
    log('ERROR', `bad stdin: ${raw.slice(0, 120)}`);
    return approve();
  }

  if (input.stop_hook_active === true) return approve(); // inside a continuation → don't re-block
  const tx = input.transcript_path;
  if (!tx || !fs.existsSync(tx)) return approve();

  let rawTranscript = '';
  try {
    rawTranscript = fs.readFileSync(tx, 'utf-8');
  } catch {
    return approve();
  }

  const { claimText, toolUses } = extractTurnWindow(rawTranscript);
  if (!claimText.trim() || claimText.includes(SELF_MARKER)) return approve();

  const unsupported = firstUnsupported(claimText, toolUses, config.minSearch);
  if (!unsupported) return approve();

  const repoRoot = normalizePath(input.cwd || input.workspace_roots?.[0] || process.cwd());
  logFire(repoRoot, {
    ts: new Date().toISOString(),
    class: unsupported.cls,
    need: unsupported.need,
    detail: unsupported.detail ?? null,
    tool_uses: toolUses.map((t) => t.name),
    claim_snippet: claimText.replace(/\s+/g, ' ').slice(0, 200),
    mode: config.mode,
    session_id: input.session_id ?? null,
    cwd: repoRoot,
  });

  if (config.mode === 'shadow') {
    log('INFO', `shadow: would block ${unsupported.cls}`);
    return approve();
  }

  // Anti-loop bookkeeping.
  const mp = markerPath(repoRoot, MARKER_DIR, MARKER_FILENAME);
  const marker = readMarker(mp);
  const currentHash = hashFileList([claimText]);
  if (marker && marker.hash === currentHash) return approve(); // same message re-submitted
  const within = marker ? isWithinCooldown(marker.timestamp, config.cooldownMinutes) : false;
  const newCount = within ? (marker?.count ?? 0) + 1 : 1;
  if (within && newCount > config.maxRetries) {
    log('INFO', `max retries (${config.maxRetries}) in cooldown → approve`);
    return approve();
  }
  writeMarkerAtomic(mp, { hash: currentHash, timestamp: new Date().toISOString(), count: newCount });

  log('INFO', `blocking ${unsupported.cls} (attempt ${newCount})`);
  block(
    `⚠️ ${SELF_MARKER}: ты заявил результат (${unsupported.cls}), но в этом ходе нет улики, которая его породила.\n` +
      `Нужно: ${unsupported.need}.\n` +
      `Сначала реально прогони проверку, потом заявляй — либо явно пометь [UNVERIFIED] если проверить нельзя.`,
  );
}

main()
  .catch((err) => {
    log('ERROR', `unhandled: ${err instanceof Error ? err.message : String(err)}`);
    approve();
  })
  .finally(() => process.exit(0));
