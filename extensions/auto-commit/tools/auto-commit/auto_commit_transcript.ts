#!/usr/bin/env node
/// <reference types="node" />
/**
 * Auto-Commit Hook — transcript parser module
 *
 * Responsibilities:
 *  - Locate transcript file by conversation_id
 *  - Parse transcript: extract last N messages (user queries + assistant responses)
 *  - Filter out noise: [Thinking] blocks, [Tool call], [Tool result]
 *
 * Notes:
 *  - Fail-fast: throw exceptions if transcript not found
 *  - conversation_id from hook input === transcript filename (without .txt)
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

import { safeJsonParse } from "./auto_commit_core";

// ============================================================================
// Types
// ============================================================================

export type Message = {
  role: "user" | "assistant";
  content: string;
};

export type SessionContext = {
  messages: Message[];
  conversationId: string;
};

export type TranscriptFileInfo = {
  path: string;
  conversationId: string;
  mtimeMs: number;
};

export type TranscriptSummary = {
  conversationId: string;
  mtimeMs: number;
  messageCount: number;
};

export type AggregatedSessionContext = {
  messages: Message[];
  transcripts: TranscriptSummary[];
  transcriptsDir: string;
  selectionReason:
    | "conversationId"
    | "workspaceMatch"
    | "singleWindowDir"
    | "repoMatch"
    | "composerGlobal";
  totalTranscriptsScanned: number;
  totalTranscriptsInWindow: number;
};

// ============================================================================
// Path resolution
// ============================================================================

/**
 * Get the transcript directory path based on workspace roots.
 * Cursor stores transcripts in ~/.cursor/projects/{project-id}/agent-transcripts/
 * where project-id is derived from the workspace path.
 */
export function getTranscriptDir(workspaceRoots: string[]): string | null {
  const cursorDir = path.join(os.homedir(), ".cursor", "projects");

  if (!fs.existsSync(cursorDir)) {
    return null;
  }

  // Try to find matching project directory
  try {
    const projectDirs = fs.readdirSync(cursorDir);

    for (const projectDir of projectDirs) {
      const transcriptsPath = path.join(cursorDir, projectDir, "agent-transcripts");
      const transcriptsExist = fs.existsSync(transcriptsPath);

      if (transcriptsExist) {
        // Check if this project matches any workspace root
        // Project dirs are named like "d-repos-project" for "D:\repos\project"
        for (const wsRoot of workspaceRoots) {
          // Fix: Remove leading / from Unix-style paths like /d:/repos/project
          // Then normalize: D:\repos\project -> d-repos-project (single dashes)
          let cleanPath = wsRoot;
          // Handle /d:/path format (Unix-style on Windows from Cursor)
          const unixWinMatch = cleanPath.match(/^\/([a-zA-Z]):\/(.*)$/);
          if (unixWinMatch) {
            cleanPath = `${unixWinMatch[1]}:\\${unixWinMatch[2]}`;
          }
          const normalized = cleanPath.toLowerCase().replace(/[:\\\/]/g, "-").replace(/^-+/, "").replace(/-+/g, "-");

          if (projectDir.toLowerCase() === normalized) {
            return transcriptsPath;
          }
        }
      }
    }

    // Fallback: return first project with transcripts
    for (const projectDir of projectDirs) {
      const transcriptsPath = path.join(cursorDir, projectDir, "agent-transcripts");
      if (fs.existsSync(transcriptsPath)) {
        return transcriptsPath;
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Get full path to transcript file by conversation_id.
 * Returns null if transcript not found (optional - Cursor creates transcripts async).
 */
export function getTranscriptPath(conversationId: string, workspaceRoots: string[]): string | null {
  const transcriptsDir = getTranscriptDir(workspaceRoots);

  if (!transcriptsDir) {
    return null;
  }

  const transcriptPath = path.join(transcriptsDir, `${conversationId}.txt`);

  if (!fs.existsSync(transcriptPath)) {
    // Cursor creates transcripts asynchronously - file may not exist yet
    return null;
  }

  return transcriptPath;
}

// ============================================================================
// Transcript parsing
// ============================================================================

/**
 * Parse transcript content and extract messages.
 * Filters out:
 *  - [Thinking] blocks
 *  - [Tool call] / [Tool result] blocks
 *
 * Returns last maxMessages messages (user + assistant interleaved).
 */
export function parseTranscript(content: string, maxMessages: number = 12): Message[] {
  const messages: Message[] = [];
  const lines = content.split("\n");

  let currentRole: "user" | "assistant" | null = null;
  let currentContent: string[] = [];
  let inUserQuery = false;
  let inThinking = false;
  let inToolBlock = false;

  const flushMessage = () => {
    if (currentRole && currentContent.length > 0) {
      const text = currentContent
        .join("\n")
        .trim()
        // Remove any remaining [Thinking] blocks that might have been captured
        .replace(/\[Thinking\][\s\S]*?(?=\n\n|\n\[|$)/g, "")
        // Remove [Tool call] blocks
        .replace(/\[Tool call\][\s\S]*?(?=\n\n|\n\[|$)/g, "")
        // Remove [Tool result] blocks
        .replace(/\[Tool result\][\s\S]*?(?=\n\n|\n\[|$)/g, "")
        .trim();

      if (text) {
        messages.push({ role: currentRole, content: text });
      }
    }
    currentContent = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect role switches
    if (line === "user:") {
      flushMessage();
      currentRole = "user";
      inThinking = false;
      inToolBlock = false;
      continue;
    }

    if (line === "assistant:") {
      flushMessage();
      currentRole = "assistant";
      inThinking = false;
      inToolBlock = false;
      continue;
    }

    // Handle <user_query> tags
    if (line.includes("<user_query>")) {
      inUserQuery = true;
      // Extract content after tag on same line if any
      const afterTag = line.split("<user_query>")[1];
      if (afterTag && afterTag.trim()) {
        currentContent.push(afterTag);
      }
      continue;
    }

    if (line.includes("</user_query>")) {
      inUserQuery = false;
      // Extract content before tag on same line if any
      const beforeTag = line.split("</user_query>")[0];
      if (beforeTag && beforeTag.trim()) {
        currentContent.push(beforeTag);
      }
      continue;
    }

    // Skip [Thinking] blocks
    if (line.startsWith("[Thinking]")) {
      inThinking = true;
      continue;
    }

    // Skip [Tool call] and [Tool result] blocks
    if (line.startsWith("[Tool call]") || line.startsWith("[Tool result]")) {
      inToolBlock = true;
      continue;
    }

    // End of special blocks when we hit empty line or new block
    if ((inThinking || inToolBlock) && (line.trim() === "" || line.match(/^\[/))) {
      if (line.trim() === "") {
        inThinking = false;
        inToolBlock = false;
      }
      continue;
    }

    // Skip content inside thinking or tool blocks
    if (inThinking || inToolBlock) {
      continue;
    }

    // Add content
    if (currentRole) {
      if (currentRole === "user" && !inUserQuery) {
        // Skip non-query user content
        continue;
      }
      currentContent.push(line);
    }
  }

  // Flush last message
  flushMessage();

  // Return last maxMessages
  return messages.slice(-maxMessages);
}

/**
 * Format messages for LLM context.
 */
export function formatMessagesForContext(messages: Message[]): string {
  return messages
    .map((m) => {
      const role = m.role === "user" ? "User" : "Assistant";
      return `${role}: ${m.content}`;
    })
    .join("\n\n");
}

// ============================================================================
// Transcript selection and aggregation
// ============================================================================

function listTranscriptFiles(transcriptsDir: string): TranscriptFileInfo[] {
  const entries = fs.readdirSync(transcriptsDir, { withFileTypes: true });
  const result: TranscriptFileInfo[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".txt")) continue;

    const fullPath = path.join(transcriptsDir, entry.name);
    const stat = fs.statSync(fullPath);
    const conversationId = path.basename(entry.name, ".txt");

    result.push({
      path: fullPath,
      conversationId,
      mtimeMs: stat.mtimeMs,
    });
  }

  return result;
}

function getAllTranscriptDirs(): string[] {
  const cursorProjectsDir = path.join(os.homedir(), ".cursor", "projects");
  if (!fs.existsSync(cursorProjectsDir)) return [];

  const projectDirs = fs.readdirSync(cursorProjectsDir);
  const result: string[] = [];

  for (const projectDir of projectDirs) {
    const transcriptsPath = path.join(cursorProjectsDir, projectDir, "agent-transcripts");
    if (fs.existsSync(transcriptsPath)) {
      result.push(transcriptsPath);
    }
  }

  return result;
}

function findTranscriptDirByConversationId(conversationId: string): string | null {
  const allDirs = getAllTranscriptDirs();
  for (const dir of allDirs) {
    const candidate = path.join(dir, `${conversationId}.txt`);
    if (fs.existsSync(candidate)) return dir;
  }
  return null;
}

function transcriptMentionsRepo(filePath: string, repoRootAbs: string): boolean {
  const repoRootUnix = repoRootAbs.replace(/\\/g, "/");
  const haystack = fs.readFileSync(filePath, "utf-8").slice(0, 200_000).toLowerCase();
  return haystack.includes(repoRootAbs.toLowerCase()) || haystack.includes(repoRootUnix.toLowerCase());
}

function latestMtimeMs(files: TranscriptFileInfo[]): number | null {
  if (files.length === 0) return null;
  return files.reduce((max, f) => (f.mtimeMs > max ? f.mtimeMs : max), files[0].mtimeMs);
}

function projectDirName(transcriptsDir: string): string {
  return path.basename(path.dirname(transcriptsDir));
}

function getCursorUserDirs(): string[] {
  const dirs: string[] = [];
  const home = os.homedir();

  if (process.platform === "win32") {
    if (process.env.APPDATA) {
      dirs.push(path.join(process.env.APPDATA, "Cursor", "User"));
    }
    if (process.env.LOCALAPPDATA) {
      dirs.push(path.join(process.env.LOCALAPPDATA, "Cursor", "User"));
    }
  } else if (process.platform === "darwin") {
    dirs.push(path.join(home, "Library", "Application Support", "Cursor", "User"));
  } else {
    dirs.push(path.join(home, ".config", "Cursor", "User"));
    dirs.push(path.join(home, ".config", "cursor", "User"));
  }

  return dirs.filter((dir) => fs.existsSync(dir));
}

function getCursorUserDir(): string {
  const dirs = getCursorUserDirs();
  if (dirs.length === 0) {
    throw new Error("Cursor user directory not found");
  }
  return dirs[0];
}

function getGlobalStateDbPath(userDir: string): string {
  return path.join(userDir, "globalStorage", "state.vscdb");
}

function getWorkspaceStateDbPath(userDir: string, workspaceId: string): string {
  return path.join(userDir, "workspaceStorage", workspaceId, "state.vscdb");
}

function normalizePathForCompare(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

function findWorkspaceStorageIdFromAssets(projectDir: string): string | null {
  const assetsDir = path.join(projectDir, "assets");
  if (!fs.existsSync(assetsDir)) return null;

  const files = fs.readdirSync(assetsDir);
  const counts = new Map<string, number>();

  for (const file of files) {
    const match = file.match(/workspaceStorage_([a-f0-9]{8,})/i);
    if (match) {
      const id = match[1];
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [id, count] of counts.entries()) {
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  }

  return best;
}

function findWorkspaceIdFromCheckpointDir(checkpointsDir: string, repoRootAbs: string): string | null {
  if (!fs.existsSync(checkpointsDir)) return null;
  const repoNorm = normalizePathForCompare(repoRootAbs);
  const dirs = fs.readdirSync(checkpointsDir);

  let bestId: string | null = null;
  let bestTs = 0;

  for (const dir of dirs) {
    const metadataPath = path.join(checkpointsDir, dir, "metadata.json");
    if (!fs.existsSync(metadataPath)) continue;
    const raw = fs.readFileSync(metadataPath, "utf-8");
    const meta = safeJsonParse<{ workspaceId?: string; startTrackingDateUnixMilliseconds?: number; requestFiles?: Array<{ gitInfo?: { gitInfo?: { gitRoot?: string } } }> }>(raw);
    const gitRoot = meta?.requestFiles?.[0]?.gitInfo?.gitInfo?.gitRoot;
    if (!gitRoot) continue;

    if (normalizePathForCompare(gitRoot) !== repoNorm) continue;

    const ts = meta?.startTrackingDateUnixMilliseconds ?? 0;
    if (ts > bestTs && meta?.workspaceId) {
      bestTs = ts;
      bestId = meta.workspaceId;
    }
  }

  return bestId;
}

function findWorkspaceStorageId(repoRootAbs: string, workspaceRoots: string[]): string {
  const transcriptsDir = getTranscriptDir(workspaceRoots);
  if (transcriptsDir) {
    const projectDir = path.dirname(transcriptsDir);
    const fromAssets = findWorkspaceStorageIdFromAssets(projectDir);
    if (fromAssets) return fromAssets;
  }

  const userDir = getCursorUserDir();
  const retrievalDir = path.join(userDir, "globalStorage", "anysphere.cursor-retrieval", "checkpoints");
  const commitsDir = path.join(userDir, "globalStorage", "anysphere.cursor-commits", "checkpoints");

  const fromRetrieval = findWorkspaceIdFromCheckpointDir(retrievalDir, repoRootAbs);
  if (fromRetrieval) return fromRetrieval;

  const fromCommits = findWorkspaceIdFromCheckpointDir(commitsDir, repoRootAbs);
  if (fromCommits) return fromCommits;

  throw new Error("Workspace storage id not found for repo");
}

function runSqliteQuery(dbPath: string, sql: string): string {
  try {
    return execFileSync("sqlite3", [dbPath, sql], { encoding: "utf-8" });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      throw new Error("sqlite3 executable not found in PATH");
    }
    throw new Error(`Failed to read sqlite db: ${err.message ?? String(error)}`);
  }
}

function readItemTableJson(dbPath: string, key: string): unknown | null {
  const escapedKey = key.replace(/'/g, "''");
  const sql = `select value from ItemTable where key='${escapedKey}';`;
  const raw = runSqliteQuery(dbPath, sql);
  if (!raw.trim()) return null;
  const normalized = raw.replace(/^\uFEFF/, "");
  return safeJsonParse(normalized);
}

function readCursorDiskKVJson(dbPath: string, key: string): unknown | null {
  const escapedKey = key.replace(/'/g, "''");
  const sql = `select value from cursorDiskKV where key='${escapedKey}';`;
  const raw = runSqliteQuery(dbPath, sql);
  if (!raw.trim()) return null;
  const normalized = raw.replace(/^\uFEFF/, "");
  return safeJsonParse(normalized);
}

function findComposerIdByRequestId(globalDbPath: string, requestId: string): string | null {
  const escaped = requestId.replace(/'/g, "''");
  const sql = `select key from cursorDiskKV where instr(value, '${escaped}') > 0 limit 1;`;
  const raw = runSqliteQuery(globalDbPath, sql).trim();
  if (!raw) return null;
  const key = raw.split(/\r?\n/)[0];
  if (key.startsWith("composerData:")) {
    const parts = key.split(":");
    return parts.length >= 2 ? parts[1] : null;
  }
  if (!key.startsWith("bubbleId:")) return null;
  const parts = key.split(":");
  return parts.length >= 2 ? parts[1] : null;
}

function readBubbleKeys(globalDbPath: string, composerId: string): string[] {
  const pattern = `bubbleId:${composerId}:%`;
  const sql = `select key from cursorDiskKV where key like '${pattern}';`;
  const raw = runSqliteQuery(globalDbPath, sql);
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseCreatedAtMs(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

function readBubbleMessage(globalDbPath: string, key: string): { role: "user" | "assistant"; content: string; createdAtMs: number | null } | null {
  const data = readCursorDiskKVJson(globalDbPath, key) as { type?: number | string; text?: string; rawText?: string; createdAt?: string | number } | null;
  if (!data) return null;
  const content = (data.text ?? data.rawText ?? "").toString();
  if (!content.trim()) return null;
  const type = data.type;
  const role = type === 1 || type === "user" ? "user" : "assistant";
  return {
    role,
    content,
    createdAtMs: parseCreatedAtMs(data.createdAt),
  };
}

export function getAggregatedSessionContextFromCursorComposer(args: {
  workspaceRoots: string[];
  repoRootAbs: string;
  lastCommitTimestampMs?: number;
  nowMs: number;
  maxDialogs: number;
  maxMessages: number;
}): AggregatedSessionContext {
  const startMs = Math.max(0, args.lastCommitTimestampMs ?? 0);
  const endMs = args.nowMs;

  const userDir = getCursorUserDir();
  const globalDbPath = getGlobalStateDbPath(userDir);
  if (!fs.existsSync(globalDbPath)) {
    throw new Error("Global Cursor state.vscdb not found");
  }

  const workspaceId = findWorkspaceStorageId(args.repoRootAbs, args.workspaceRoots);
  const workspaceDbPath = getWorkspaceStateDbPath(userDir, workspaceId);
  if (!fs.existsSync(workspaceDbPath)) {
    throw new Error("Workspace state.vscdb not found");
  }

  const generationsRaw = readItemTableJson(workspaceDbPath, "aiService.generations");
  const generations = Array.isArray(generationsRaw) ? generationsRaw : [];

  const recentGenerations = generations
    .map((g) => g as { generationUUID?: string; unixMs?: number })
    .filter((g) => typeof g.generationUUID === "string" && typeof g.unixMs === "number")
    .filter((g) => (g.unixMs ?? 0) > startMs && (g.unixMs ?? 0) <= endMs)
    .sort((a, b) => (b.unixMs ?? 0) - (a.unixMs ?? 0));

  if (recentGenerations.length === 0) {
    throw new Error("No composer generations found in time window");
  }

  const composerIds: string[] = [];
  const tryResolveComposerIds = (gens: Array<{ generationUUID?: string }>): void => {
    for (const gen of gens) {
      const uuid = gen.generationUUID;
      if (!uuid) continue;
      const composerId = findComposerIdByRequestId(globalDbPath, uuid);
      if (composerId && !composerIds.includes(composerId)) {
        composerIds.push(composerId);
      }
      if (composerIds.length >= args.maxDialogs) break;
    }
  };

  tryResolveComposerIds(recentGenerations);

  if (composerIds.length === 0) {
    const fallbackGenerations = generations
      .map((g) => g as { generationUUID?: string; unixMs?: number })
      .filter((g) => typeof g.generationUUID === "string" && typeof g.unixMs === "number")
      .sort((a, b) => (b.unixMs ?? 0) - (a.unixMs ?? 0))
      .slice(0, 200);
    tryResolveComposerIds(fallbackGenerations);
  }

  if (composerIds.length === 0) {
    throw new Error("No composer sessions matched by generation UUIDs");
  }

  const transcripts: TranscriptSummary[] = [];
  const aggregatedMessages: Message[] = [];

  for (const composerId of composerIds) {
    const keys = readBubbleKeys(globalDbPath, composerId);
    const bubbleMessages = keys
      .map((key) => readBubbleMessage(globalDbPath, key))
      .filter((msg): msg is { role: "user" | "assistant"; content: string; createdAtMs: number | null } => Boolean(msg))
      .filter((msg) => msg.createdAtMs !== null && msg.createdAtMs > startMs && msg.createdAtMs <= endMs)
      .sort((a, b) => (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0));

    if (bubbleMessages.length === 0) continue;

    const trimmed = bubbleMessages
      .slice(-args.maxMessages)
      .map((msg) => ({ role: msg.role, content: msg.content }));
    aggregatedMessages.push(...trimmed);

    const lastUpdatedAtMs = Math.max(
      startMs,
      ...bubbleMessages.map((msg) => msg.createdAtMs as number)
    );

    transcripts.push({
      conversationId: composerId,
      mtimeMs: lastUpdatedAtMs,
      messageCount: trimmed.length,
    });
  }

  if (aggregatedMessages.length === 0) {
    throw new Error("No composer messages found in time window");
  }

  return {
    messages: aggregatedMessages,
    transcripts,
    transcriptsDir: globalDbPath,
    selectionReason: "composerGlobal",
    totalTranscriptsScanned: composerIds.length,
    totalTranscriptsInWindow: transcripts.length,
  };
}

// ============================================================================
// Main function
// ============================================================================

/**
 * Get session context by conversation_id.
 * Returns null if transcript not found (Cursor creates transcripts async).
 */
export function getSessionContext(conversationId: string, workspaceRoots: string[], maxMessages: number = 12): SessionContext | null {
  const transcriptPath = getTranscriptPath(conversationId, workspaceRoots);
  
  if (!transcriptPath) {
    return null;
  }
  
  const content = fs.readFileSync(transcriptPath, "utf-8");
  const messages = parseTranscript(content, maxMessages);

  return {
    messages,
    conversationId,
  };
}
