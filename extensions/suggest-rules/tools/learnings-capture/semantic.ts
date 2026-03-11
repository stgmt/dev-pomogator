// Auto-Capture Learnings — Semantic Detection (LLM-based)
// Called by capture.ts for Stop hook event
// Fallback: regex-only if LLM unavailable or disabled

import { promises as nodeFs } from 'node:fs';
import type { Signal } from './types.js';

async function pathExists(p: string): Promise<boolean> {
  try { await nodeFs.access(p); return true; } catch { return false; }
}
import { TRIGGER_TYPES, MAX_SIGNAL_LENGTH, MAX_CONTEXT_LENGTH } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMResponse {
  choices: Array<{
    message: { content: string };
  }>;
}

interface SemanticResult {
  signals: Array<{
    trigger: string;
    signal: string;
    context: string;
    confidence: number;
  }>;
  selfEval?: {
    nonTrivialInvestigation: boolean;
    nonObviousDiscovery: boolean;
    futureHelpful: boolean;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_TRANSCRIPT_MESSAGES = 20;
const LLM_TIMEOUT_MS = 30_000;
const VALID_TRIGGERS = new Set(TRIGGER_TYPES);

const SYSTEM_PROMPT = `You are analyzing a conversation transcript between a developer and an AI assistant.
Identify learning signals — patterns worth remembering for future sessions.

Signal types:
- T1: New utility/helper/pattern created
- T2: User corrected the AI's approach
- T3: Same topic caused confusion 2+ times
- T4: AI violated an existing rule
- T5: Undocumented convention discovered via code reading
- T6: Workaround applied due to missing documentation

Return a JSON object with:
1. "signals" array: each with trigger (T1-T6), signal (brief description, max 100 chars), context (quote, max 200 chars), confidence (0.0-1.0)
2. "selfEval" object with 3 boolean fields:
   - "nonTrivialInvestigation": Was non-trivial investigation required (>10 min estimated effort)?
   - "nonObviousDiscovery": Was something non-obvious from documentation discovered?
   - "futureHelpful": Would this knowledge help in future similar situations?

Return ONLY valid JSON, no markdown fencing.
If no signals found, return: {"signals":[],"selfEval":{"nonTrivialInvestigation":false,"nonObviousDiscovery":false,"futureHelpful":false}}`;

// ---------------------------------------------------------------------------
// LLM Call (reuses auto-commit pattern)
// ---------------------------------------------------------------------------

async function callLLM(messages: LLMMessage[]): Promise<string | null> {
  const baseUrl = process.env.AUTO_COMMIT_LLM_URL;
  const apiKey = process.env.AUTO_COMMIT_API_KEY;
  const model = process.env.LEARNINGS_LLM_MODEL || 'claude-haiku-4-5-20251001';

  if (!baseUrl || !apiKey) {
    return null;
  }

  const url = `${baseUrl}/chat/completions`;
  const body = {
    model,
    messages,
    max_tokens: 1500,
    temperature: 0.3,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as LLMResponse;
    if (!data.choices || data.choices.length === 0) {
      return null;
    }

    const content = data.choices[0].message?.content;
    return content?.trim() ?? null;
  } catch {
    return null; // timeout, network error, etc.
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Transcript Reading
// ---------------------------------------------------------------------------

export async function readTranscriptText(transcriptPath: string): Promise<string> {
  if (!(await pathExists(transcriptPath))) {
    return '';
  }

  const raw = await nodeFs.readFile(transcriptPath, 'utf-8');
  const lines = raw.trim().split('\n').filter(Boolean);

  // Take last N messages
  const recent = lines.slice(-MAX_TRANSCRIPT_MESSAGES);

  const texts: string[] = [];
  for (const line of recent) {
    try {
      const parsed = JSON.parse(line) as { role?: string; message?: string };
      if (parsed.message) {
        texts.push(`${parsed.role ?? 'unknown'}: ${parsed.message}`);
      }
    } catch {
      // skip malformed lines
    }
  }

  return texts.join('\n');
}

// ---------------------------------------------------------------------------
// Parse LLM Response
// ---------------------------------------------------------------------------

function parseLLMResponse(raw: string): SemanticResult | null {
  // Strip markdown code fencing if present
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  try {
    const parsed = JSON.parse(cleaned) as SemanticResult;
    if (!parsed.signals || !Array.isArray(parsed.signals)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Semantic Detection
// ---------------------------------------------------------------------------

export interface SemanticDetectionResult {
  signals: Signal[];
  transcriptText: string;
}

export async function detectSignalsSemantic(
  transcriptPath: string,
  _projectPath: string
): Promise<SemanticDetectionResult> {
  const text = await readTranscriptText(transcriptPath);
  if (!text.trim()) return { signals: [], transcriptText: text };

  const messages: LLMMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Transcript:\n${text}` },
  ];

  const response = await callLLM(messages);
  if (!response) return { signals: [], transcriptText: text }; // LLM unavailable → caller handles fallback

  const result = parseLLMResponse(response);
  if (!result) return { signals: [], transcriptText: text };

  const signals: Signal[] = [];

  // Process detected signals
  for (const sig of result.signals) {
    if (!VALID_TRIGGERS.has(sig.trigger)) continue;
    if (!sig.signal || !sig.context) continue;

    signals.push({
      trigger: sig.trigger as Signal['trigger'],
      signal: sig.signal.slice(0, MAX_SIGNAL_LENGTH),
      context: sig.context.slice(0, MAX_CONTEXT_LENGTH),
      confidence: Math.max(0, Math.min(1, sig.confidence ?? 0.7)),
    });
  }

  // Self-evaluation gates: if any YES and no T1-T6 found → create T5 entry
  if (signals.length === 0 && result.selfEval) {
    const { nonTrivialInvestigation, nonObviousDiscovery, futureHelpful } = result.selfEval;
    if (nonTrivialInvestigation || nonObviousDiscovery || futureHelpful) {
      signals.push({
        trigger: 'T5',
        signal: 'Non-obvious discovery via self-evaluation',
        context: text.slice(0, 200),
        confidence: 0.7,
      });
    }
  }

  return { signals, transcriptText: text };
}
