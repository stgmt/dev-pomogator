#!/usr/bin/env npx tsx
/**
 * Prompt-Suggest Stop Hook
 *
 * On agent Stop event:
 * 1. Check stop_hook_active (skip if true — loop prevention)
 * 2. Load config, check enabled/apiKey
 * 3. Extract first user message from transcript JSONL
 * 4. Combine with last_assistant_message
 * 5. Call Haiku LLM with v2 prompt
 * 6. If non-empty: write state file + output systemMessage with lightbulb
 * 7. If empty (silence): approve without state/systemMessage
 *
 * Fail-open: exit 0 always, never block on errors.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadConfig,
  readStdin,
  extractFirstUserMessage,
  callSuggestionLLM,
  writeSuggestionState,
  redactSecrets,
  log,
  type LLMMessage,
} from './prompt_suggest_core.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StopHookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  stop_hook_active?: boolean;
  last_assistant_message?: string;
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function approve(systemMessage?: string): void {
  if (systemMessage) {
    process.stdout.write(JSON.stringify({ decision: 'approve', systemMessage }));
  } else {
    process.stdout.write('{}');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const config = loadConfig();

  if (!config.enabled) {
    log('DEBUG', 'Disabled via PROMPT_SUGGEST_ENABLED=false');
    approve();
    return;
  }

  // Read stdin
  const raw = await readStdin();
  if (!raw.trim()) {
    approve();
    return;
  }

  let input: StopHookInput;
  try {
    input = JSON.parse(raw) as StopHookInput;
  } catch {
    log('ERROR', `Failed to parse stdin: ${raw.slice(0, 200)}`);
    approve();
    return;
  }

  // Check stop_hook_active — prevent infinite loops
  if (input.stop_hook_active) {
    log('DEBUG', 'stop_hook_active=true, skipping suggestion generation');
    approve();
    return;
  }

  // Check API key
  if (!config.llm.apiKey) {
    log('DEBUG', 'No API key configured, skipping');
    approve();
    return;
  }

  // Get session context
  const lastAssistantMessage = input.last_assistant_message ?? '';
  if (!lastAssistantMessage.trim()) {
    log('DEBUG', 'No last_assistant_message, skipping');
    approve();
    return;
  }

  // Extract first user message from transcript
  let firstUserMessage = '';
  if (input.transcript_path) {
    firstUserMessage = extractFirstUserMessage(input.transcript_path) ?? '';
  }

  // Build LLM context
  let userContent = '';
  if (firstUserMessage) {
    userContent = `User's request: ${firstUserMessage}\n\nClaude's final response: ${lastAssistantMessage.slice(0, 3000)}`;
  } else {
    userContent = `Claude's final response: ${lastAssistantMessage.slice(0, 3000)}`;
  }

  // Redact secrets before sending to LLM
  const safeContent = redactSecrets(userContent);

  // Read system prompt
  const promptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'prompt_suggest_prompt.md');
  let systemPrompt: string;
  try {
    systemPrompt = fs.readFileSync(promptPath, 'utf-8').trim();
  } catch {
    // Fallback: try relative to cwd
    try {
      const fallbackPath = path.join(process.cwd(), '.dev-pomogator', 'tools', 'prompt-suggest', 'prompt_suggest_prompt.md');
      systemPrompt = fs.readFileSync(fallbackPath, 'utf-8').trim();
    } catch {
      log('ERROR', 'Cannot read prompt file');
      approve();
      return;
    }
  }

  // Call LLM
  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: safeContent },
  ];

  log('INFO', `Calling LLM for suggestion (model: ${config.llm.model})`);
  const suggestion = await callSuggestionLLM(config, messages);

  // Check for silence
  const trimmed = suggestion.trim();
  if (!trimmed) {
    log('INFO', 'LLM returned silence — no suggestion');
    approve();
    return;
  }

  // Write state file
  const sessionId = input.session_id ?? 'unknown';
  writeSuggestionState({
    suggestion: trimmed,
    timestamp: Date.now(),
    sessionId,
  });

  log('INFO', `Suggestion generated: "${trimmed}"`);

  // Output with systemMessage for immediate visibility
  approve(`\u{1F4A1} ${trimmed}`);
}

// Fail-open wrapper: always exit 0
main()
  .catch((err) => {
    log('ERROR', `Unhandled: ${err instanceof Error ? err.message : String(err)}`);
    approve();
  })
  .finally(() => {
    process.exit(0);
  });
