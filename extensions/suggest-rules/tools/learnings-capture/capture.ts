#!/usr/bin/env npx tsx
// Auto-Capture Learnings — Hook Entry Point
// Called by UserPromptSubmit / Stop hooks
// Exit 0 always — hook failure must never block user (NFR-R7)

import {
  readQueue,
  appendEntries,
  acquireLock,
  releaseLock,
  appendEntriesInPlace,
  writeQueueAtomic,
} from './queue.js';
import { detectSignalsSemantic, readTranscriptText } from './semantic.js';
import { extractKeywords } from './dedupe.js';
import type { Signal, HookInput, Platform, Queue } from './types.js';
import { DEFAULT_SUGGEST_THRESHOLD, MAX_SIGNAL_LENGTH } from './types.js';

const APPROVAL_BOOST = 0.15;

// ---------------------------------------------------------------------------
// Regex Patterns (FR-1a)
// ---------------------------------------------------------------------------

interface PatternDef {
  trigger: Signal['trigger'];
  pattern: RegExp;
  confidence: number;
}

const PATTERNS: PatternDef[] = [
  // T2 — User Correction (EN)
  { trigger: 'T2', pattern: /\bno,?\s*use\b/i, confidence: 0.85 },
  { trigger: 'T2', pattern: /\bdon'?t\s+use\b/i, confidence: 0.8 },
  { trigger: 'T2', pattern: /\bactually[,.]\s*/i, confidence: 0.7 },
  { trigger: 'T2', pattern: /\bI\s+meant\b/i, confidence: 0.8 },
  { trigger: 'T2', pattern: /\buse\s+\w+\s+not\s+\w+/i, confidence: 0.9 },
  { trigger: 'T2', pattern: /\binstead\s+of\b/i, confidence: 0.75 },

  // T2 — User Correction (RU)
  // Note: \b doesn't work with Cyrillic in JS regex (\w = [a-zA-Z0-9_] only)
  { trigger: 'T2', pattern: /(?:^|\s)нет,?\s*(делай|используй)/i, confidence: 0.85 },
  { trigger: 'T2', pattern: /(?:^|\s)не\s+так(?:\s|$)/i, confidence: 0.7 },
  { trigger: 'T2', pattern: /(?:^|\s)на\s+самом\s+деле/i, confidence: 0.7 },
  { trigger: 'T2', pattern: /(?:^|\s)используй\s+\S+\s+а?\s*не\s+\S+/i, confidence: 0.9 },

  // T3 — Repeated Confusion (EN)
  { trigger: 'T3', pattern: /\bagain\b/i, confidence: 0.6 },
  { trigger: 'T3', pattern: /\bsame\s+(issue|problem)\b/i, confidence: 0.75 },
  { trigger: 'T3', pattern: /\bstill\s+not\b/i, confidence: 0.7 },
  { trigger: 'T3', pattern: /\bkeeps\s+happening\b/i, confidence: 0.8 },

  // T3 — Repeated Confusion (RU)
  { trigger: 'T3', pattern: /(?:^|\s)опять(?:\s|$)/i, confidence: 0.7 },
  { trigger: 'T3', pattern: /(?:^|\s)снова(?:\s|$)/i, confidence: 0.7 },
  { trigger: 'T3', pattern: /(?:^|\s)та\s+же\s+(проблема|ошибка)/i, confidence: 0.8 },
  { trigger: 'T3', pattern: /(?:^|\s)до\s+сих\s+пор/i, confidence: 0.75 },

  // T6 — Workaround Applied (EN)
  { trigger: 'T6', pattern: /\bworkaround\b/i, confidence: 0.8 },
  { trigger: 'T6', pattern: /\bhack\b/i, confidence: 0.65 },
  { trigger: 'T6', pattern: /\btemporary\s+fix\b/i, confidence: 0.75 },
  { trigger: 'T6', pattern: /\bfor\s+now\b/i, confidence: 0.65 },

  // T6 — Workaround Applied (RU)
  { trigger: 'T6', pattern: /(?:^|\s)костыль/i, confidence: 0.8 },
  { trigger: 'T6', pattern: /(?:^|\s)обход(ное|)?(?:\s|$)/i, confidence: 0.7 },
  { trigger: 'T6', pattern: /(?:^|\s)пока\s+что/i, confidence: 0.65 },
  { trigger: 'T6', pattern: /(?:^|\s)временно(?:\s|$)/i, confidence: 0.7 },
];

const EXPLICIT_MARKERS: PatternDef[] = [
  { trigger: 'T5', pattern: /\bremember:\s*/i, confidence: 0.95 },
  { trigger: 'T5', pattern: /(?:^|\s)запомни:\s*/i, confidence: 0.95 },
  { trigger: 'T5', pattern: /\balways\s+/i, confidence: 0.9 },
  { trigger: 'T5', pattern: /\bnever\s+/i, confidence: 0.9 },
  { trigger: 'T5', pattern: /(?:^|\s)всегда\s+/i, confidence: 0.9 },
  { trigger: 'T5', pattern: /(?:^|\s)никогда\s+/i, confidence: 0.9 },
];

const APPROVAL_PATTERNS: RegExp[] = [
  /\bperfect\b/i,
  /\bexactly\b/i,
  /\bcorrect\b/i,
  /\bworks?\s*(perfectly|great|well)\b/i,
  /\bgood\s+(job|work)\b/i,
  /\bthat's\s+(what\s+I\s+(needed|wanted))\b/i,
  /(?:^|\s)отлично(?:\s|$)/i,
  /(?:^|\s)идеально(?:\s|$)/i,
  /(?:^|\s)правильно(?:\s|$)/i,
  /(?:^|\s)именно\s+(так|это)/i,
  /(?:^|\s)то\s+что\s+(нужно|надо)/i,
];

// extractKeywords imported from dedupe.ts (shared STOP_WORDS + keyword extraction)

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

function accumulateMatches(
  patterns: PatternDef[],
  text: string,
  map: Map<string, { maxConf: number; count: number }>
): void {
  for (const def of patterns) {
    if (def.pattern.test(text)) {
      const existing = map.get(def.trigger);
      if (existing) {
        existing.maxConf = Math.max(existing.maxConf, def.confidence);
        existing.count++;
      } else {
        map.set(def.trigger, { maxConf: def.confidence, count: 1 });
      }
    }
  }
}

function detectSignalsRegex(text: string): Signal[] {
  const matchesByTrigger = new Map<string, { maxConf: number; count: number }>();

  accumulateMatches(EXPLICIT_MARKERS, text, matchesByTrigger);
  accumulateMatches(PATTERNS, text, matchesByTrigger);

  const signals: Signal[] = [];
  for (const [trigger, { maxConf, count }] of matchesByTrigger) {
    // Multi-match confidence boost
    const confidence = count > 1
      ? Math.min(maxConf * 1.1, 1.0)
      : maxConf;

    signals.push({
      trigger: trigger as Signal['trigger'],
      signal: extractSignal(text),
      context: text,
      confidence,
    });
  }

  return signals;
}

function extractSignal(text: string): string {
  // Extract meaningful content: remove filler, keep substance
  const cleaned = text
    .replace(/^(no,?\s*|actually,?\s*|нет,?\s*)/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, MAX_SIGNAL_LENGTH);
}

// ---------------------------------------------------------------------------
// Approval Boost (FR-1a)
// ---------------------------------------------------------------------------

function isApproval(text: string): boolean {
  return APPROVAL_PATTERNS.some((p) => p.test(text));
}

/** Apply approval boost in-place on queue entries. Returns true if text was an approval. */
function applyApprovalBoost(queue: Queue, text: string): boolean {
  if (!isApproval(text)) return false;

  const pending = queue.entries.filter((e) => e.status === 'pending');
  if (pending.length === 0) return true;

  const keywords = extractKeywords(text);
  let boosted = false;

  if (keywords.size > 0) {
    for (const entry of pending) {
      const entryWords = new Set([
        ...extractKeywords(entry.signal),
        ...extractKeywords(entry.context),
      ]);
      let overlapCount = 0;
      for (const k of keywords) {
        if (entryWords.has(k)) overlapCount++;
      }
      if (overlapCount > 0) {
        entry.confidence = Math.min(entry.confidence + APPROVAL_BOOST, 1.0);
        boosted = true;
      }
    }
  }

  // If no keyword overlap, boost the most recent pending entry
  if (!boosted) {
    let mostRecent = pending[0];
    for (const entry of pending) {
      if (entry.timestamp > mostRecent.timestamp) mostRecent = entry;
    }
    mostRecent.confidence = Math.min(mostRecent.confidence + APPROVAL_BOOST, 1.0);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Threshold Check (FR-10)
// ---------------------------------------------------------------------------

function checkThreshold(pendingCount: number): void {
  const threshold = parseInt(
    process.env.LEARNINGS_SUGGEST_THRESHOLD ?? String(DEFAULT_SUGGEST_THRESHOLD),
    10
  );
  if (threshold <= 0) return;

  if (pendingCount >= threshold) {
    process.stderr.write(
      `📥 ${pendingCount} pending learnings. Run /suggest-rules to process.\n`
    );
  }
}

// ---------------------------------------------------------------------------
// Platform Detection
// ---------------------------------------------------------------------------

function detectPlatform(): Platform {
  // Cursor sets CURSOR_* env vars
  if (process.env.CURSOR_TRACE_ID || process.env.CURSOR_SESSION_ID) {
    return 'cursor';
  }
  return 'claude';
}

// ---------------------------------------------------------------------------
// Stdin Reader
// ---------------------------------------------------------------------------

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
    // If stdin is a TTY (no piped input), resolve immediately
    if (process.stdin.isTTY) resolve('');
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Parse --event argument
  const eventIdx = process.argv.indexOf('--event');
  const event = eventIdx >= 0 ? process.argv[eventIdx + 1] : undefined;
  if (!event || !['UserPromptSubmit', 'Stop'].includes(event)) {
    process.stderr.write('Usage: capture.ts --event UserPromptSubmit|Stop\n');
    return;
  }

  // Read stdin
  const raw = await readStdin();
  if (!raw.trim()) return;

  let input: HookInput;
  try {
    input = JSON.parse(raw);
  } catch {
    process.stderr.write('Invalid JSON input\n');
    return;
  }

  const platform = detectPlatform();
  const sessionId = input.conversation_id || 'unknown';

  // Resolve project path from workspace_roots
  const projectPath = input.workspace_roots?.[0] || process.cwd();

  if (event === 'UserPromptSubmit') {
    const prompt = input.prompt;
    if (!prompt) return;

    // Detect signals before acquiring lock (pure computation, no I/O)
    const signals = detectSignalsRegex(prompt);
    const isApprovalText = isApproval(prompt);

    if (signals.length === 0 && !isApprovalText) return;

    // Single locked read-modify-write cycle
    await acquireLock(projectPath);
    try {
      const queue = await readQueue(projectPath);

      // 1. Apply approval boost in-place
      if (isApprovalText) {
        applyApprovalBoost(queue, prompt);
      }

      // 2. Append new signals in-place
      if (signals.length > 0) {
        appendEntriesInPlace(queue, signals, 'UserPromptSubmit', platform, sessionId);
      }

      // 3. Write once
      await writeQueueAtomic(projectPath, queue);

      // 4. Threshold check (no I/O — uses in-memory count)
      const pendingCount = queue.entries.filter((e) => e.status === 'pending').length;
      checkThreshold(pendingCount);
    } finally {
      await releaseLock(projectPath);
    }
  } else if (event === 'Stop') {
    const transcriptPath = input.transcript_path;
    if (!transcriptPath) return;

    const semanticEnabled = process.env.LEARNINGS_SEMANTIC_ENABLED !== 'false';
    let signals: Signal[];

    if (semanticEnabled) {
      const result = await detectSignalsSemantic(transcriptPath, projectPath);
      signals = result.signals;
      // Fallback to regex if LLM returned nothing (reuse already-read text)
      if (signals.length === 0 && result.transcriptText) {
        signals = detectSignalsRegex(result.transcriptText);
      }
    } else {
      const text = await readTranscriptText(transcriptPath);
      signals = detectSignalsRegex(text);
    }

    if (signals.length > 0) {
      await appendEntries(projectPath, signals, 'Stop', platform, sessionId);
      // Re-read for threshold (Stop path is not latency-critical)
      const queue = await readQueue(projectPath);
      const pendingCount = queue.entries.filter((e) => e.status === 'pending').length;
      checkThreshold(pendingCount);
    }
  }
}

main().catch((err) => {
  process.stderr.write(`capture error: ${err?.message ?? err}\n`);
  // Always exit 0 — hook failure must not block user
}).finally(() => {
  process.exit(0);
});
