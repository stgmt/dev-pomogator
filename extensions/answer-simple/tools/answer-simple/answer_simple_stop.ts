#!/usr/bin/env npx tsx
/**
 * Answer-Simple Stop Hook — runtime enforcement of the plain-language rule.
 *
 * On agent Stop: inspect the final user-facing message; if it is a wall of internal
 * codes (FR-21 / ARCH012 / VARIANT_COVERAGE …) or excessively verbose prose, BLOCK the
 * stop and feed back a plain-language reason so the agent rewrites it. This is the
 * mechanical guarantee the rule alone could not provide (trust-based → the agent skips
 * it under pressure; same gap architecture-gate closed for Phase 1.75).
 *
 * Anti-loop: hash the response; same text → approve (no progress). Within a cooldown
 * window, allow at most maxRetries blocks then approve (never hard-stuck). Honour
 * stop_hook_active if the runtime provides it.
 *
 * Fail-open: any error → approve (exit 0). Never block on hook bugs.
 */

import fs from 'node:fs';

import { log as _logShared, normalizePath } from '../_shared/hook-utils.ts';
import { markerPath, readMarker, writeMarkerAtomic, isWithinCooldown, hashFileList } from '../_shared/marker-utils.ts';
import { detectJargon } from './jargon_detector.ts';

interface StopHookInput {
  cwd?: string;
  workspace_roots?: string[];
  transcript_path?: string;
  stop_hook_active?: boolean;
  output?: string; // newer Claude Code: full final response text
  hook_event_name?: string;
}

const MARKER_DIR = '.dev-pomogator';
const MARKER_FILENAME = '.answer-simple-marker.json';
const LOG_PREFIX = 'ANSWER-SIMPLE';

function log(level: 'INFO' | 'DEBUG' | 'ERROR', message: string): void {
  _logShared(level, LOG_PREFIX, message);
}

function getConfig() {
  return {
    enabled: process.env.ANSWER_SIMPLE_ENABLED !== 'false',
    cooldownMinutes: parseInt(process.env.ANSWER_SIMPLE_COOLDOWN_MINUTES || '2', 10) || 2,
    maxRetries: parseInt(process.env.ANSWER_SIMPLE_MAX_RETRIES || '2', 10) || 2,
    maxCodes: parseInt(process.env.ANSWER_SIMPLE_MAX_CODES || '2', 10) || 2,
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

/** Last assistant message text — fallback when `output` is absent. Best-effort JSONL parse. */
function lastAssistantText(transcriptPath: string): string {
  try {
    const lines = fs.readFileSync(transcriptPath, 'utf-8').split(/\r?\n/).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      let e: any;
      try {
        e = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      const msg = e?.message ?? e;
      if (msg?.role !== 'assistant') continue;
      const content = msg.content;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        const txt = content
          .filter((c: any) => c?.type === 'text' && typeof c.text === 'string')
          .map((c: any) => c.text)
          .join('\n');
        if (txt.trim()) return txt;
      }
    }
  } catch {
    /* fail-open */
  }
  return '';
}

async function main(): Promise<void> {
  const config = getConfig();
  if (!config.enabled) return approve();

  const raw = await readStdin();
  if (!raw.trim()) return approve();

  let input: StopHookInput;
  try {
    input = JSON.parse(raw) as StopHookInput;
  } catch {
    log('ERROR', `bad stdin: ${raw.slice(0, 120)}`);
    return approve();
  }

  // Already inside a stop-hook continuation → don't re-block (loop guard).
  if (input.stop_hook_active === true) return approve();

  const message = (input.output && input.output.trim()) || (input.transcript_path ? lastAssistantText(input.transcript_path) : '');
  if (!message.trim()) {
    log('DEBUG', 'no final message text available');
    return approve();
  }

  const result = detectJargon(message, { maxCodes: config.maxCodes });
  if (!result.block) {
    log('DEBUG', `clean: ${result.stats.distinctCodes} codes, ${result.stats.words} words`);
    return approve();
  }

  // Anti-loop bookkeeping.
  const repoRoot = normalizePath(input.cwd || input.workspace_roots?.[0] || process.cwd());
  const mp = markerPath(repoRoot, MARKER_DIR, MARKER_FILENAME);
  const marker = readMarker(mp);
  const currentHash = hashFileList([message]);

  if (marker && marker.hash === currentHash) {
    log('INFO', 'same response re-submitted → approve (no loop)');
    return approve();
  }
  const within = marker ? isWithinCooldown(marker.timestamp, config.cooldownMinutes) : false;
  const newCount = within ? (marker?.count ?? 0) + 1 : 1;
  if (within && newCount > config.maxRetries) {
    log('INFO', `max retries (${config.maxRetries}) in cooldown → approve (no loop)`);
    return approve();
  }

  writeMarkerAtomic(mp, { hash: currentHash, timestamp: new Date().toISOString(), count: newCount });
  log('INFO', `blocking: ${result.stats.distinctCodes} codes, ${result.stats.words} words (attempt ${newCount})`);
  block('Перепиши ответ проще — он не пройдёт читателя:\n- ' + result.reasons.join('\n- '));
}

main()
  .catch((err) => {
    log('ERROR', `unhandled: ${err instanceof Error ? err.message : String(err)}`);
    approve();
  })
  .finally(() => process.exit(0));
