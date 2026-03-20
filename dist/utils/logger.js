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
/** Default logger for updater (backward-compatible) */
export const logger = createLogger('update.log');
//# sourceMappingURL=logger.js.map