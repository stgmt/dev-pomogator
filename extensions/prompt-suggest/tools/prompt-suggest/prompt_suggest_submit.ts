#!/usr/bin/env npx tsx
/**
 * Prompt-Suggest UserPromptSubmit Hook
 *
 * On user prompt submit:
 * 1. Check if enabled
 * 2. If prompt.trim() !== "+" → pass through
 * 3. Read state file → check TTL
 * 4. If valid: inject suggestion via additionalContext + clear state
 * 5. If expired/missing: pass through
 *
 * Fail-open: exit 0 always.
 */

import {
  loadConfig,
  readStdin,
  readSuggestionState,
  clearSuggestionState,
  isSuggestionExpired,
  log,
} from './prompt_suggest_core.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubmitHookInput {
  session_id?: string;
  prompt?: string;
  cwd?: string;
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function passThrough(): void {
  process.stdout.write('{}');
}

function injectSuggestion(suggestion: string): void {
  const context = `Пользователь нажал '+' чтобы принять подсказку предыдущей сессии: ${suggestion}. Выполни её.`;
  process.stdout.write(JSON.stringify({
    additionalContext: context,
  }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const config = loadConfig();

  if (!config.enabled) {
    log('DEBUG', 'Disabled via PROMPT_SUGGEST_ENABLED=false');
    passThrough();
    return;
  }

  // Read stdin
  const raw = await readStdin();
  if (!raw.trim()) {
    passThrough();
    return;
  }

  let input: SubmitHookInput;
  try {
    input = JSON.parse(raw) as SubmitHookInput;
  } catch {
    log('ERROR', `Failed to parse stdin: ${raw.slice(0, 200)}`);
    passThrough();
    return;
  }

  // Check if prompt is "+"
  const prompt = (input.prompt ?? '').trim();
  if (prompt !== '+') {
    passThrough();
    return;
  }

  // Read state file
  const state = readSuggestionState();
  if (!state) {
    log('DEBUG', 'No suggestion state file, passing through');
    passThrough();
    return;
  }

  // Check TTL
  if (isSuggestionExpired(state, config.ttl)) {
    log('INFO', 'Suggestion expired, clearing state');
    clearSuggestionState();
    passThrough();
    return;
  }

  // Inject suggestion
  log('INFO', `Injecting suggestion: "${state.suggestion}"`);
  injectSuggestion(state.suggestion);

  // Clear state after injection
  clearSuggestionState();
}

// Fail-open wrapper: always exit 0
main()
  .catch((err) => {
    log('ERROR', `Unhandled: ${err instanceof Error ? err.message : String(err)}`);
    passThrough();
  })
  .finally(() => {
    process.exit(0);
  });
