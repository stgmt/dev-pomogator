import fs from 'fs';
import path from 'path';
import os from 'os';

const LOG_DIR = path.join(os.homedir(), '.dev-pomogator', 'logs');
const MAX_LOG_SIZE = 1024 * 1024; // 1MB

export interface Logger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

export function createLogger(filename: string): Logger {
  const logFile = path.join(LOG_DIR, filename);

  function log(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true });

      // Rotate if too large
      if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);
        if (stats.size > MAX_LOG_SIZE) {
          fs.renameSync(logFile, logFile + '.old');
        }
      }

      const timestamp = new Date().toISOString();
      const line = `[${timestamp}] [${level}] ${message}\n`;
      fs.appendFileSync(logFile, line);
    } catch {
      // Silent fail - logging should not break the app
    }
  }

  return {
    info: (msg: string) => log('INFO', msg),
    warn: (msg: string) => log('WARN', msg),
    error: (msg: string) => log('ERROR', msg),
  };
}

/**
 * Extract the top-level error message (one-liner for user-facing output).
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Serialize an error (including cause chain) into a loggable string.
 */
export function formatErrorChain(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const parts: string[] = [];
  let current: Error | undefined = error;
  let depth = 0;

  while (current && depth < 10) {
    const prefix = depth === 0 ? '' : 'Caused by: ';
    parts.push(`${prefix}${current.message}`);
    if (current.stack) {
      // Skip the first line of stack (it's the message repeated)
      const stackLines = current.stack.split('\n').slice(1).join('\n');
      if (stackLines.trim()) parts.push(stackLines);
    }
    current = current.cause instanceof Error ? current.cause : undefined;
    depth++;
  }

  return parts.join('\n');
}

/** Default logger for updater (backward-compatible) */
export const logger = createLogger('update.log');
