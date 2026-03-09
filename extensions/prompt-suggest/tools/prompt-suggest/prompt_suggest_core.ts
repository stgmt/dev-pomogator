#!/usr/bin/env node
/**
 * Prompt-Suggest Core Module
 *
 * Shared utilities for Stop and Submit hooks:
 * - Config loading with auto-detect API
 * - State file CRUD (atomic write)
 * - JSONL transcript parser
 * - LLM caller
 * - Secret redaction
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromptSuggestConfig {
  enabled: boolean;
  ttl: number;
  llm: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
}

export interface SuggestionState {
  suggestion: string;
  timestamp: number;
  sessionId: string;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATE_DIR = path.join(os.homedir(), '.claude');
const STATE_FILE = path.join(STATE_DIR, 'prompt-suggestion.json');
const DEFAULT_TTL = 600_000; // 10 min
const DEFAULT_MODEL = 'anthropic/claude-3-haiku';

// ---------------------------------------------------------------------------
// Logging (stderr only — stdout reserved for hook output)
// ---------------------------------------------------------------------------

export function log(level: 'INFO' | 'DEBUG' | 'ERROR', message: string): void {
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] [PROMPT-SUGGEST] [${level}] ${message}\n`);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export function loadConfig(): PromptSuggestConfig {
  const enabled = process.env.PROMPT_SUGGEST_ENABLED !== 'false';
  const ttl = parseInt(process.env.PROMPT_SUGGEST_TTL || '', 10) || DEFAULT_TTL;

  // Auto-detect API: OPENROUTER has priority
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const autoCommitKey = process.env.AUTO_COMMIT_API_KEY;

  let baseUrl = '';
  let apiKey = '';
  let model = process.env.PROMPT_SUGGEST_MODEL || DEFAULT_MODEL;

  if (openrouterKey) {
    baseUrl = 'https://openrouter.ai/api/v1';
    apiKey = openrouterKey;
  } else if (autoCommitKey) {
    baseUrl = 'https://aipomogator.ru/go/v1';
    apiKey = autoCommitKey;
    model = process.env.PROMPT_SUGGEST_MODEL || 'openrouter/anthropic/claude-3-haiku';
  }

  return { enabled, ttl, llm: { baseUrl, apiKey, model } };
}

// ---------------------------------------------------------------------------
// State file CRUD (atomic write per atomic-config-save rule)
// ---------------------------------------------------------------------------

export function readSuggestionState(): SuggestionState | null {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    const data = JSON.parse(raw) as SuggestionState;
    if (data && typeof data.suggestion === 'string' && typeof data.timestamp === 'number') {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeSuggestionState(state: SuggestionState): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const tmpFile = STATE_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf-8');
  fs.renameSync(tmpFile, STATE_FILE);
}

export function clearSuggestionState(): void {
  try {
    fs.unlinkSync(STATE_FILE);
  } catch {
    // already gone — fine
  }
}

export function isSuggestionExpired(state: SuggestionState, ttl: number): boolean {
  return Date.now() - state.timestamp > ttl;
}

// ---------------------------------------------------------------------------
// JSONL transcript parser (minimal, 15 lines)
// ---------------------------------------------------------------------------

export function extractFirstUserMessage(transcriptPath: string): string | null {
  try {
    // Read only first 64KB — first user message is always near the top
    const fd = fs.openSync(transcriptPath, 'r');
    const buf = Buffer.alloc(65536);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const content = buf.toString('utf-8', 0, bytesRead);
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        if (obj && obj.role === 'user' && typeof obj.message === 'string') {
          return obj.message.slice(0, 2000);
        }
        if (obj && obj.type === 'human' && typeof obj.content === 'string') {
          return obj.content.slice(0, 2000);
        }
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// LLM caller
// ---------------------------------------------------------------------------

export async function callSuggestionLLM(
  config: PromptSuggestConfig,
  messages: LLMMessage[]
): Promise<string> {
  const url = `${config.llm.baseUrl}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify({
      model: config.llm.model,
      messages,
      max_tokens: 50,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data?.choices?.[0]?.message?.content?.trim() ?? '';
  return content;
}

// ---------------------------------------------------------------------------
// Secret redaction (copied from auto_commit_stop.ts)
// ---------------------------------------------------------------------------

export function redactSecrets(text: string): string {
  return text
    .replace(/authorization:\s*bearer\s+[a-z0-9._-]+/gi, 'Authorization: Bearer [REDACTED]')
    .replace(/sk-[a-z0-9]{10,}/gi, 'sk-[REDACTED]')
    .replace(/api[_-]?key\s*[:=]\s*['"]?[^'"\s]+/gi, 'apiKey: [REDACTED]')
    .replace(/token\s*[:=]\s*['"]?[^'"\s]+/gi, 'token: [REDACTED]');
}

// ---------------------------------------------------------------------------
// Stdin reader
// ---------------------------------------------------------------------------

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf-8');
}
