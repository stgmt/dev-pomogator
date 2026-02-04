#!/usr/bin/env node
/// <reference types="node" />
/**
 * Auto-Commit Hook — core module
 *
 * Responsibilities:
 *  - State management (last commit timestamp in ~/.cursor/auto-commit-state.json)
 *  - Git operations: getGitDiff(), getChangedFiles(), gitCommit()
 *  - Config loading from ~/.cursor/auto-commit.json or .cursor/auto-commit.json
 *  - Commit message template formatting
 *
 * Notes:
 *  - Fail-fast: throw exceptions on errors
 *  - No secrets in state files
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execSync } from "node:child_process";

// ============================================================================
// Types
// ============================================================================

export type AutoCommitConfig = {
  enabled: boolean;
  intervalMinutes: number;
  jiraKeyPattern: string;
  jiraBaseUrl: string;
  maxDiffTokens: number;
  maxDialogs: number;
  maxMessages: number;
  smartCommit: {
    enabled: boolean;
    command: string; // e.g., "comment"
  };
  llm: {
    baseUrl: string;
    model: string;
    apiKey: string;
  };
};

export type AutoCommitState = {
  lastCommitTimestampMs?: number;
};

// ============================================================================
// Path normalization (fix /d:/repos/project → D:\repos\project on Windows)
// ============================================================================

export function normalizePath(p: string): string {
  if (!p) return p;
  
  // Convert /d:/path → D:\path (Cursor sends Unix-style paths on Windows)
  if (process.platform === "win32" && p.match(/^\/[a-zA-Z]:\//)) {
    const drive = p[1].toUpperCase();
    return `${drive}:${p.slice(3).replace(/\//g, "\\")}`;
  }
  
  return p;
}

// ============================================================================
// Paths
// ============================================================================

export function userCursorDirAbs(): string {
  return path.join(os.homedir(), ".cursor");
}

export function userAutoCommitConfigAbs(): string {
  return path.join(userCursorDirAbs(), "auto-commit.json");
}

export function projectAutoCommitConfigAbs(repoRootAbs: string): string {
  return path.join(repoRootAbs, ".cursor", "auto-commit.json");
}

export function autoCommitStateFileAbs(): string {
  return path.join(userCursorDirAbs(), "auto-commit-state.json");
}

// ============================================================================
// File utilities
// ============================================================================

export function ensureDirExists(dirAbs: string): void {
  fs.mkdirSync(dirAbs, { recursive: true });
}

export function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function readJsonIfExists<T>(fileAbs: string): T | null {
  try {
    if (!fs.existsSync(fileAbs)) return null;
    const raw = fs.readFileSync(fileAbs, "utf8");
    return safeJsonParse<T>(raw);
  } catch {
    return null;
  }
}

export function writeJsonAtomic(fileAbs: string, obj: unknown): void {
  ensureDirExists(path.dirname(fileAbs));
  const tmp = `${fileAbs}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, fileAbs);
}

// ============================================================================
// Config
// ============================================================================

export function defaultAutoCommitConfig(): AutoCommitConfig {
  return {
    enabled: true,
    intervalMinutes: 15,
    jiraKeyPattern: "[A-Z]+-\\d+",  // Generic Jira pattern (e.g., PROJ-123)
    jiraBaseUrl: "",  // Empty by default, set in project config
    maxDiffTokens: 4000,
    maxDialogs: 3,
    maxMessages: 12,
    smartCommit: {
      enabled: false,
      command: "comment",
    },
    llm: {
      baseUrl: process.env["AUTO_COMMIT_LLM_URL"] ?? "https://aipomogator.ru/go/v1",
      model: process.env["AUTO_COMMIT_LLM_MODEL"] ?? "openrouter/deepseek/deepseek-v3.2",
      apiKey: process.env["AUTO_COMMIT_API_KEY"] ?? "",
    },
  };
}

export function loadAutoCommitConfig(repoRootAbs: string): AutoCommitConfig {
  const defaults = defaultAutoCommitConfig();

  // User-level config
  const userCfg = readJsonIfExists<Partial<AutoCommitConfig>>(userAutoCommitConfigAbs()) ?? {};

  // Project-level config (overrides user)
  const projCfg = readJsonIfExists<Partial<AutoCommitConfig>>(projectAutoCommitConfigAbs(repoRootAbs)) ?? {};

  const merged: AutoCommitConfig = {
    enabled: projCfg.enabled ?? userCfg.enabled ?? defaults.enabled,
    intervalMinutes: projCfg.intervalMinutes ?? userCfg.intervalMinutes ?? defaults.intervalMinutes,
    jiraKeyPattern: projCfg.jiraKeyPattern ?? userCfg.jiraKeyPattern ?? defaults.jiraKeyPattern,
    jiraBaseUrl: projCfg.jiraBaseUrl ?? userCfg.jiraBaseUrl ?? defaults.jiraBaseUrl,
    maxDiffTokens: projCfg.maxDiffTokens ?? userCfg.maxDiffTokens ?? defaults.maxDiffTokens,
    maxDialogs: projCfg.maxDialogs ?? userCfg.maxDialogs ?? defaults.maxDialogs,
    maxMessages: projCfg.maxMessages ?? userCfg.maxMessages ?? defaults.maxMessages,
    smartCommit: {
      enabled: projCfg.smartCommit?.enabled ?? userCfg.smartCommit?.enabled ?? defaults.smartCommit.enabled,
      command: projCfg.smartCommit?.command ?? userCfg.smartCommit?.command ?? defaults.smartCommit.command,
    },
    llm: {
      baseUrl: projCfg.llm?.baseUrl ?? userCfg.llm?.baseUrl ?? defaults.llm.baseUrl,
      model: projCfg.llm?.model ?? userCfg.llm?.model ?? defaults.llm.model,
      apiKey: projCfg.llm?.apiKey ?? userCfg.llm?.apiKey ?? defaults.llm.apiKey,
    },
  };

  // Env override for disabling
  const envDisable = (process.env["AUTO_COMMIT_DISABLED"] ?? "").trim().toLowerCase();
  if (envDisable === "1" || envDisable === "true" || envDisable === "yes") {
    merged.enabled = false;
  }

  return merged;
}

// ============================================================================
// State
// ============================================================================

export function readAutoCommitState(): AutoCommitState {
  const raw = readJsonIfExists<AutoCommitState>(autoCommitStateFileAbs());
  return raw && typeof raw === "object" ? raw : {};
}

export function writeAutoCommitState(state: AutoCommitState): void {
  writeJsonAtomic(autoCommitStateFileAbs(), state);
}

export function shouldCommit(state: AutoCommitState, config: AutoCommitConfig, nowMs: number): boolean {
  const lastMs = state.lastCommitTimestampMs ?? 0;
  const intervalMs = config.intervalMinutes * 60 * 1000;
  return nowMs - lastMs >= intervalMs;
}

export function updateLastCommitTimestamp(nowMs: number): void {
  const state = readAutoCommitState();
  state.lastCommitTimestampMs = nowMs;
  writeAutoCommitState(state);
}

// ============================================================================
// Git operations
// ============================================================================

export function getGitDiff(cwd: string, maxTokens: number): string {
  try {
    const diff = execSync("git diff HEAD", {
      cwd,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024, // 10MB
      timeout: 10000, // 10s
    });

    if (!diff.trim()) {
      return "";
    }

    // Truncate if too long (rough token estimate: 4 chars per token)
    const lines = diff.split("\n");
    let result = "";
    let tokens = 0;

    for (const line of lines) {
      const lineTokens = Math.ceil(line.length / 4);
      if (tokens + lineTokens > maxTokens) {
        result += "\n... [truncated due to token limit] ...";
        break;
      }
      result += line + "\n";
      tokens += lineTokens;
    }

    return result.trim();
  } catch (e) {
    throw new Error(`Failed to get git diff: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function getChangedFiles(cwd: string): string[] {
  try {
    const output = execSync("git diff --name-only HEAD", {
      cwd,
      encoding: "utf-8",
      timeout: 5000,
    });
    return output
      .trim()
      .split("\n")
      .filter((f) => f.trim());
  } catch (e) {
    throw new Error(`Failed to get changed files: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function hasUncommittedChanges(cwd: string): boolean {
  try {
    const status = execSync("git status --porcelain", {
      cwd,
      encoding: "utf-8",
      timeout: 5000,
    });
    return status.trim().length > 0;
  } catch {
    return false;
  }
}

export function gitCommit(cwd: string, message: string): void {
  try {
    // Stage all changes
    execSync("git add -A", {
      cwd,
      encoding: "utf-8",
      timeout: 10000,
    });

    // Commit with message via stdin (-F -) to preserve newlines on all platforms
    execSync("git commit -F -", {
      cwd,
      encoding: "utf-8",
      timeout: 10000,
      input: message,
    });
  } catch (e) {
    throw new Error(`Failed to commit: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ============================================================================
// Git branch
// ============================================================================

export function getCurrentBranch(cwd: string): string | null {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf-8",
      timeout: 5000,
    });
    return branch.trim() || null;
  } catch {
    return null;
  }
}

// ============================================================================
// Jira key extraction
// ============================================================================

export function extractJiraKeyFromBranch(cwd: string, pattern: string): string | null {
  const branch = getCurrentBranch(cwd);
  if (!branch) return null;

  try {
    const regex = new RegExp(pattern, "i");
    const match = branch.match(regex);
    return match ? match[0].toUpperCase() : null;
  } catch {
    return null;
  }
}

export function extractJiraKey(text: string, pattern: string): string | null {
  try {
    const regex = new RegExp(pattern, "i");
    const match = text.match(regex);
    return match ? match[0].toUpperCase() : null;
  } catch {
    return null;
  }
}

// ============================================================================
// Commit message formatting
// ============================================================================

export function formatCommitMessage(args: {
  jiraKey: string | null;
  summary: string;
  description: string;
  changes: Array<{ file: string; description: string }>;
}): string {
  const prefix = args.jiraKey ? `[${args.jiraKey}] ` : "";
  const header = `${prefix}Auto-commit: ${args.summary}`;

  let body = `\n\n## Summary\n${args.description}`;

  if (args.changes.length > 0) {
    body += "\n\n## Changes";
    for (const change of args.changes) {
      body += `\n- ${change.file}: ${change.description}`;
    }
  }

  return header + body;
}
