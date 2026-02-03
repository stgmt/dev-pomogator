#!/usr/bin/env node
/// <reference types="node" />
/**
 * Auto-Commit Stop Hook
 *
 * Triggers on agent stop event (Cursor: stop, Claude Code: Stop).
 * Creates automatic commits with AI-generated messages every N minutes.
 *
 * Flow:
 * 1. Check if enabled and interval passed
 * 2. Check if uncommitted changes exist
 * 3. Read transcript for session context
 * 4. Get git diff
 * 5. Generate commit message via LLM
 * 6. Commit changes
 *
 * Fail-fast: throw exceptions on errors (no silent failures)
 */

import {
  loadAutoCommitConfig,
  readAutoCommitState,
  shouldCommit,
  hasUncommittedChanges,
  getGitDiff,
  getChangedFiles,
  gitCommit,
  extractJiraKeyFromBranch,
  updateLastCommitTimestamp,
  normalizePath,
} from "./auto_commit_core";

import {
  getAggregatedSessionContextFromCursorComposer,
  formatMessagesForContext,
  parseTranscript,
  type Message,
} from "./auto_commit_transcript";
import * as fs from "node:fs";

import { generateCommitMessage, generateSmartCommitSummary } from "./auto_commit_llm";

// ============================================================================
// Types (Cursor stop hook)
// ============================================================================

type StopHookInput = {
  conversation_id?: string;
  generation_id?: string;
  model?: string;
  hook_event_name?: string;
  cursor_version?: string;
  workspace_roots?: string[];
  user_email?: string | null;
  transcript_path?: string | null;
  status?: string;
};

type StopHookOutput = {
  followup_message?: string;
};

// ============================================================================
// Logging
// ============================================================================

function log(level: "INFO" | "ERROR" | "DEBUG", message: string): void {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [AUTO-COMMIT] [${level}] ${message}`);
}

function redactSecrets(text: string): string {
  return text
    .replace(/authorization:\s*bearer\s+[a-z0-9._-]+/gi, "Authorization: Bearer [REDACTED]")
    .replace(/sk-[a-z0-9]{10,}/gi, "sk-[REDACTED]")
    .replace(/api[_-]?key\s*[:=]\s*['"]?[^'"\s]+/gi, "apiKey: [REDACTED]")
    .replace(/token\s*[:=]\s*['"]?[^'"\s]+/gi, "token: [REDACTED]");
}

function buildSmartCommitMessage(jiraKey: string, command: string, summary: string): string {
  const cleanCommand = command.trim().replace(/^#/, "") || "comment";
  const cleanSummary = summary.replace(/\s+/g, " ").trim();
  if (!cleanSummary) {
    throw new Error("Smart commit summary is empty after normalization");
  }
  return `${jiraKey} #${cleanCommand} ${cleanSummary}`.trim();
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  // Read input from stdin
  let inputRaw = "";
  for await (const chunk of process.stdin) {
    inputRaw += chunk;
  }

  let input: StopHookInput;
  try {
    input = JSON.parse(inputRaw) as StopHookInput;
  } catch {
    log("ERROR", `Failed to parse input: ${inputRaw}`);
    writeOutput({});
    return;
  }

  const conversationId = input.conversation_id ?? "unknown";
  const hasConversationId = Boolean(input.conversation_id);
  const workspaceRoots = input.workspace_roots ?? [];

  if (!hasConversationId) {
    log("DEBUG", "No conversation_id in input; selecting transcripts by time window");
  }

  if (workspaceRoots.length === 0) {
    log("ERROR", "No workspace_roots in input");
    writeOutput({});
    return;
  }

  // Normalize path: /d:/repos/project → D:\repos\project on Windows
  const repoRoot = normalizePath(workspaceRoots[0]);
  log("INFO", `Processing stop hook for ${conversationId} in ${repoRoot}`);

  try {
    // Load config
    const config = loadAutoCommitConfig(repoRoot);

    if (!config.enabled) {
      log("INFO", "Auto-commit disabled in config");
      writeOutput({});
      return;
    }

    // Check if API key is configured
    if (!config.llm.apiKey) {
      log("INFO", "Auto-commit skipped: LLM API key not configured (set AUTO_COMMIT_API_KEY env or llm.apiKey in config)");
      writeOutput({});
      return;
    }

    // Check interval
    const state = readAutoCommitState();
    const nowMs = Date.now();

    if (!shouldCommit(state, config, nowMs)) {
      const lastMs = state.lastCommitTimestampMs ?? 0;
      const elapsedMin = Math.floor((nowMs - lastMs) / 60000);
      log("INFO", `Interval not passed: ${elapsedMin}min < ${config.intervalMinutes}min`);
      writeOutput({});
      return;
    }

    // Check for changes
    if (!hasUncommittedChanges(repoRoot)) {
      log("INFO", "No uncommitted changes");
      writeOutput({});
      return;
    }

    // Get session context - FAST PATH via transcript_path, FALLBACK to sqlite
    let messages: Message[] = [];
    let contextSource = "unknown";
    const transcriptPath = input.transcript_path;

    if (transcriptPath && fs.existsSync(transcriptPath)) {
      // FAST PATH: Read transcript file directly (~0.1 sec vs ~33 sec)
      const startFast = Date.now();
      try {
        const content = fs.readFileSync(transcriptPath, "utf-8");
        messages = parseTranscript(content, config.maxMessages);
        contextSource = `transcript_path (${Date.now() - startFast}ms)`;
        log("INFO", `FAST PATH: Read ${messages.length} messages from ${transcriptPath}`);
      } catch (err) {
        log("ERROR", `FAST PATH failed: ${err instanceof Error ? err.message : String(err)}, falling back to sqlite`);
        messages = [];
      }
    }

    if (messages.length === 0) {
      // FALLBACK: Slow sqlite path (~33 sec)
      log("INFO", "FALLBACK: Using sqlite composer bubbles (slow path)");
      const startSlow = Date.now();
      try {
        const contextAgg = getAggregatedSessionContextFromCursorComposer({
          workspaceRoots,
          repoRootAbs: repoRoot,
          lastCommitTimestampMs: state.lastCommitTimestampMs ?? 0,
          nowMs,
          maxDialogs: config.maxDialogs,
          maxMessages: config.maxMessages,
        });
        messages = contextAgg.messages;
        contextSource = `sqlite (${Date.now() - startSlow}ms, ${contextAgg.transcripts.length} transcripts)`;
        log("INFO", `FALLBACK: Selected ${contextAgg.transcripts.length} transcripts in ${Date.now() - startSlow}ms`);
      } catch (err) {
        log("ERROR", `FALLBACK failed: ${err instanceof Error ? err.message : String(err)}`);
        // Use git diff as minimal context
        const gitDiff = getGitDiff(repoRoot, config.maxDiffTokens);
        messages = [{ role: "assistant" as const, content: `Git changes:\n${gitDiff.slice(0, 2000)}` }];
        contextSource = "git-diff-only";
      }
    }

    const contextText = formatMessagesForContext(messages);
    const safeContextText = redactSecrets(contextText);
    if (!safeContextText.trim()) {
      throw new Error("Session context is empty");
    }

    log("INFO", `Context source: ${contextSource}, ${messages.length} messages`);
    log("DEBUG", `Conversation context (full):\n${safeContextText}`);

    // Get git diff
    const gitDiff = getGitDiff(repoRoot, config.maxDiffTokens);
    const changedFiles = getChangedFiles(repoRoot);
    log("INFO", `Got diff (${gitDiff.length} chars) and ${changedFiles.length} files`);

    // Extract Jira key from branch name
    const jiraKey = extractJiraKeyFromBranch(repoRoot, config.jiraKeyPattern);
    if (jiraKey) {
      log("INFO", `Found Jira key from branch: ${jiraKey}`);
    }
    if (config.smartCommit.enabled && !jiraKey) {
      throw new Error("Smart Commit enabled but Jira key not found in branch name");
    }

    // Generate commit message via LLM (REQUIRED - throws on error)
    let commitMessage = "";
    if (config.smartCommit.enabled) {
      log("INFO", "Generating Smart Commit summary via LLM...");
      const result = await generateSmartCommitSummary(config, {
        gitDiff,
        sessionContext: safeContextText,
        changedFiles,
        jiraKey,
      });
      const tokensInfo = result.usage ? ` (tokens: ${result.usage.total_tokens})` : "";
      commitMessage = buildSmartCommitMessage(jiraKey!, config.smartCommit.command, result.summary);
      log("INFO", `Generated Smart Commit (${commitMessage.length} chars)${tokensInfo}`);
    } else {
      log("INFO", "Generating commit message via LLM...");
      const result = await generateCommitMessage(config, {
        gitDiff,
        sessionContext: safeContextText,
        changedFiles,
        jiraKey,
      });
      const tokensInfo = result.usage ? ` (tokens: ${result.usage.total_tokens})` : "";
      commitMessage = result.message;
      log("INFO", `Generated commit message (${commitMessage.length} chars)${tokensInfo}`);
    }

    // Commit
    gitCommit(repoRoot, commitMessage);
    log("INFO", "Commit created successfully");

    // Update state
    updateLastCommitTimestamp(nowMs);

    // Do not inject followup prompts into chat
    writeOutput({});
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log("ERROR", `Auto-commit failed: ${errorMessage}`);

    // Fail-fast: re-throw to signal error
    throw error;
  }
}

function writeOutput(output: StopHookOutput): void {
  console.log(JSON.stringify(output));
}

// Run
main().catch((error) => {
  console.error(`[AUTO-COMMIT] Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
