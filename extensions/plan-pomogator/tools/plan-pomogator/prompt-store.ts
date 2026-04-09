/**
 * Shared prompt storage module for plan-pomogator.
 *
 * Used by prompt-capture.ts (writer) and plan-gate.ts (reader).
 * Centralizes file paths, interfaces, session ID sanitization,
 * and read/write operations to prevent drift between writer and reader.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

export const PROMPT_FILE_PREFIX = '.plan-prompts-';
export const MAX_PROMPTS = 10;
export const GC_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Detects system-injected pseudo-prompts (`<task-notification>...</task-notification>`)
 * that Claude Code emits as user messages when a background task completes.
 * These are NOT real user input and must be filtered on capture and on read.
 */
export function isTaskNotification(text: string): boolean {
  return /^<task-notification\b/i.test(text);
}

export interface PromptEntry {
  ts: number;
  text: string;
}

export interface PromptFile {
  sessionId: string;
  prompts: PromptEntry[];
}

export function getPromptsDir(): string {
  return path.join(os.homedir(), '.dev-pomogator');
}

export function sanitizeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function getPromptFilePath(sessionId: string): string {
  return path.join(getPromptsDir(), `${PROMPT_FILE_PREFIX}${sanitizeSessionId(sessionId)}.json`);
}

export function readPromptFile(filePath: string): PromptFile | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as PromptFile;
  } catch {
    return null;
  }
}

export function writePromptFile(filePath: string, data: PromptFile): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpFile = filePath + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpFile, filePath);
}
