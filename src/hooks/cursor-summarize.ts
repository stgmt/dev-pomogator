/**
 * Cursor Summarize Hook Wrapper
 * 
 * Этот скрипт решает проблему "Missing transcriptPath" для Cursor:
 * 1. Читает conversation_id из hook input
 * 2. Извлекает последнее сообщение assistant из SQLite
 * 3. Вызывает claude-mem API напрямую с last_assistant_message
 * 
 * Cursor хранит сообщения в:
 * %APPDATA%\Cursor\User\globalStorage\state.vscdb
 * Таблица: cursorDiskKV
 * Ключ: bubbleId:<conversation_id>:<bubble_id>
 * 
 * Логи пишутся в:
 * ~/.dev-pomogator/logs/dev-pomogator-YYYY-MM-DD.log
 */

import Database from 'bun:sqlite';
import path from 'path';
import os from 'os';
import fs from 'fs';

const WORKER_PORT = 37777;

/**
 * Logger that writes to both console and file
 */
class Logger {
  private logDir: string;
  private logFile: string;

  constructor() {
    this.logDir = path.join(os.homedir(), '.dev-pomogator', 'logs');
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    this.logFile = path.join(this.logDir, `dev-pomogator-${date}.log`);
    this.ensureLogDir();
  }

  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private format(level: string, message: string): string {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 23);
    return `[${timestamp}] [${level.padEnd(5)}] [SUMMARIZE] ${message}\n`;
  }

  private write(level: string, message: string): void {
    const formatted = this.format(level, message);
    
    // Write to console
    if (level === 'ERROR') {
      process.stderr.write(formatted);
    } else {
      process.stdout.write(formatted);
    }
    
    // Append to log file
    try {
      fs.appendFileSync(this.logFile, formatted);
    } catch {
      // Ignore file write errors
    }
  }

  info(message: string): void {
    this.write('INFO', message);
  }

  error(message: string): void {
    this.write('ERROR', message);
  }
}

const log = new Logger();

interface HookInput {
  conversation_id: string;
  generation_id?: string;
  model?: string;
  status?: string;
  workspace_roots?: string[];
  [key: string]: unknown;
}

interface BubbleMessage {
  type: number; // 1 = user, 2 = assistant
  text?: string;
  createdAt?: string;
}

/**
 * Get path to Cursor's globalStorage SQLite database
 */
function getGlobalStoragePath(): string {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'Cursor', 'User', 'globalStorage', 'state.vscdb');
}

/**
 * Extract last assistant message from Cursor's SQLite database
 */
function getLastAssistantMessage(conversationId: string): string | null {
  const dbPath = getGlobalStoragePath();
  
  try {
    const db = new Database(dbPath, { readonly: true });
    
    // Get all bubbles for this conversation
    const bubbles = db.query(
      "SELECT value FROM cursorDiskKV WHERE key LIKE ? ORDER BY key DESC"
    ).all(`bubbleId:${conversationId}:%`) as { value: Buffer }[];
    
    db.close();
    
    if (bubbles.length === 0) {
      log.error(`No messages found for conversation: ${conversationId}`);
      return null;
    }
    
    // Find last assistant message (type=2) with non-empty text
    for (const row of bubbles) {
      try {
        const data: BubbleMessage = JSON.parse(row.value.toString());
        if (data.type === 2 && data.text && data.text.trim().length > 0) {
          // Limit message size to avoid memory issues
          const maxLength = 50000;
          const text = data.text.length > maxLength 
            ? data.text.slice(-maxLength) // Take last N chars
            : data.text;
          return text;
        }
      } catch {
        // Skip malformed entries
      }
    }
    
    log.error(`No assistant messages found for conversation: ${conversationId}`);
    return null;
  } catch (err) {
    log.error(`Error reading Cursor database: ${err}`);
    return null;
  }
}

/**
 * Call claude-mem summarize API directly
 */
async function callSummarizeApi(conversationId: string, lastAssistantMessage: string | null): Promise<void> {
  const url = `http://127.0.0.1:${WORKER_PORT}/api/sessions/summarize`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contentSessionId: conversationId,
        last_assistant_message: lastAssistantMessage || undefined,
      }),
    });
    
    if (!response.ok) {
      const text = await response.text();
      log.error(`API error: ${response.status} ${text}`);
      return;
    }
    
    const result = await response.json();
    log.info(`Summary queued: ${JSON.stringify(result)}`);
  } catch (err) {
    log.error(`Failed to call summarize API: ${err}`);
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Read hook input from stdin
  let inputData = '';
  
  for await (const chunk of Bun.stdin.stream()) {
    inputData += new TextDecoder().decode(chunk);
  }
  
  if (!inputData.trim()) {
    log.error('No input received');
    process.exit(1);
  }
  
  let input: HookInput;
  try {
    input = JSON.parse(inputData);
  } catch {
    log.error('Invalid JSON input');
    process.exit(1);
  }
  
  const conversationId = input.conversation_id;
  if (!conversationId) {
    log.error('Missing conversation_id in input');
    process.exit(1);
  }
  
  log.info(`Processing conversation: ${conversationId}`);
  
  // Extract last assistant message from Cursor's SQLite
  const lastMessage = getLastAssistantMessage(conversationId);
  
  if (lastMessage) {
    log.info(`Found last message (${lastMessage.length} chars)`);
  } else {
    log.info(`No last message found, will summarize without it`);
  }
  
  // Call claude-mem API
  await callSummarizeApi(conversationId, lastMessage);
}

main().catch((err) => {
  log.error(`Fatal error: ${err}`);
  process.exit(1);
});
