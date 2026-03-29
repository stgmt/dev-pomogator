import fs from 'fs';
import path from 'path';
import os from 'os';
const LOG_DIR = path.join(os.homedir(), '.dev-pomogator', 'logs');
const MAX_LOG_SIZE = 1024 * 1024; // 1MB
export function createLogger(filename) {
    const logFile = path.join(LOG_DIR, filename);
    function log(level, message) {
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
        }
        catch {
            // Silent fail - logging should not break the app
        }
    }
    return {
        info: (msg) => log('INFO', msg),
        warn: (msg) => log('WARN', msg),
        error: (msg) => log('ERROR', msg),
    };
}
/**
 * Extract the top-level error message (one-liner for user-facing output).
 */
export function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
/**
 * Serialize an error (including cause chain) into a loggable string.
 */
export function formatErrorChain(error) {
    if (!(error instanceof Error))
        return String(error);
    const parts = [];
    let current = error;
    let depth = 0;
    while (current && depth < 10) {
        const prefix = depth === 0 ? '' : 'Caused by: ';
        parts.push(`${prefix}${current.message}`);
        if (current.stack) {
            // Skip the first line of stack (it's the message repeated)
            const stackLines = current.stack.split('\n').slice(1).join('\n');
            if (stackLines.trim())
                parts.push(stackLines);
        }
        current = current.cause instanceof Error ? current.cause : undefined;
        depth++;
    }
    return parts.join('\n');
}
/** Default logger for updater (backward-compatible) */
export const logger = createLogger('update.log');
//# sourceMappingURL=logger.js.map