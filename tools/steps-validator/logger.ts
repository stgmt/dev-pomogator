/**
 * Logger for Steps Validator
 *
 * Logs errors to file without blocking user workflow.
 * All errors are written to ~/.dev-pomogator/logs/steps-validator.log
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const LOG_DIR = path.join(os.homedir(), ".dev-pomogator", "logs");
const LOG_FILE = path.join(LOG_DIR, "steps-validator.log");

/**
 * Ensure log directory exists
 */
async function ensureLogDir(): Promise<void> {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch {
    // Ignore errors
  }
}

/**
 * Log an error to file
 */
export async function logError(error: Error | unknown): Promise<void> {
  try {
    await ensureLogDir();

    const timestamp = new Date().toISOString();
    const errorMessage =
      error instanceof Error
        ? `${error.message}\n${error.stack}`
        : String(error);

    const logEntry = `[${timestamp}] ERROR: ${errorMessage}\n\n`;

    await fs.appendFile(LOG_FILE, logEntry);
  } catch {
    // Silently ignore logging errors
  }
}

/**
 * Log a warning to file
 */
export async function logWarning(message: string): Promise<void> {
  try {
    await ensureLogDir();

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] WARNING: ${message}\n`;

    await fs.appendFile(LOG_FILE, logEntry);
  } catch {
    // Silently ignore logging errors
  }
}

/**
 * Log info to file (for debugging)
 */
export async function logInfo(message: string): Promise<void> {
  try {
    await ensureLogDir();

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] INFO: ${message}\n`;

    await fs.appendFile(LOG_FILE, logEntry);
  } catch {
    // Silently ignore logging errors
  }
}

/**
 * Clear log file
 */
export async function clearLog(): Promise<void> {
  try {
    await ensureLogDir();
    await fs.writeFile(LOG_FILE, "");
  } catch {
    // Silently ignore
  }
}

/**
 * Get log file path
 */
export function getLogPath(): string {
  return LOG_FILE;
}

export default { logError, logWarning, logInfo, clearLog, getLogPath };
