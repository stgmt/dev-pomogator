#!/usr/bin/env npx tsx
/**
 * Prompt Capture — UserPromptSubmit Hook
 *
 * Captures user prompts to a session-specific file for use by plan-gate.ts
 * during Phase 2 validation. The plan-gate reads these prompts and includes
 * them in the deny message so the agent can see what the user actually asked.
 *
 * Storage: ~/.dev-pomogator/.plan-prompts-{conversationId}.json
 * Format:  { sessionId: string, prompts: Array<{ ts: number, text: string }> }
 * Rolling window: last 10 prompts
 * GC: deletes prompt files older than 2 hours (probabilistic, ~1-in-10 writes)
 *
 * Exit codes:
 *   0 — always (fail-open, never blocks user input)
 */

import fs from 'fs';
import {
  PROMPT_FILE_PREFIX,
  MAX_PROMPTS,
  GC_MAX_AGE_MS,
  getPromptsDir,
  getPromptFilePath,
  readPromptFile,
  writePromptFile,
  type PromptFile,
} from './prompt-store.js';

interface HookInput {
  conversation_id?: string;
  workspace_roots?: string[];
  prompt?: string;
}

/**
 * Delete prompt files older than GC_MAX_AGE_MS.
 */
function gcOldFiles(): void {
  const dir = getPromptsDir();
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }

  const now = Date.now();
  for (const entry of entries) {
    if (!entry.startsWith(PROMPT_FILE_PREFIX) || !entry.endsWith('.json')) continue;
    const filePath = `${dir}/${entry}`;
    try {
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > GC_MAX_AGE_MS) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // ignore GC errors
    }
  }
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

async function main(): Promise<void> {
  const raw = await readStdin();
  if (!raw.trim()) return;

  let input: HookInput;
  try {
    input = JSON.parse(raw);
  } catch {
    return; // invalid JSON — fail-open
  }

  const prompt = (input.prompt ?? '').trim();
  if (!prompt) return;

  const sessionId = input.conversation_id || 'default';
  const filePath = getPromptFilePath(sessionId);

  // Read existing or create new
  const existing = readPromptFile(filePath);
  const data: PromptFile = existing && existing.sessionId === sessionId
    ? existing
    : { sessionId, prompts: [] };

  // Append new prompt
  data.prompts.push({ ts: Date.now(), text: prompt });

  // Rolling window
  if (data.prompts.length > MAX_PROMPTS) {
    data.prompts = data.prompts.slice(-MAX_PROMPTS);
  }

  // Write atomically
  writePromptFile(filePath, data);

  // Probabilistic GC (~1-in-10 writes)
  if (Math.random() < 0.1) {
    try { gcOldFiles(); } catch { /* ignore */ }
  }
}

// Fail-open wrapper: always exit 0
main().catch((err) => {
  process.stderr.write(`[prompt-capture] Error: ${err instanceof Error ? err.message : String(err)}\n`);
}).finally(() => {
  process.exit(0);
});
