import fs from 'fs';
import path from 'path';
import os from 'os';

const LOG_DIR = path.join(os.homedir(), '.dev-pomogator', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'update.log');
const MAX_LOG_SIZE = 1024 * 1024; // 1MB

export function log(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    
    // Rotate if too large
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      if (stats.size > MAX_LOG_SIZE) {
        fs.renameSync(LOG_FILE, LOG_FILE + '.old');
      }
    }
    
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    // Silent fail - logging should not break the updater
  }
}

export const logger = {
  info: (msg: string) => log('INFO', msg),
  warn: (msg: string) => log('WARN', msg),
  error: (msg: string) => log('ERROR', msg),
};
