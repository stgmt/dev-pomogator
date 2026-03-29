export interface Logger {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
}
export declare function createLogger(filename: string): Logger;
/**
 * Extract the top-level error message (one-liner for user-facing output).
 */
export declare function getErrorMessage(error: unknown): string;
/**
 * Serialize an error (including cause chain) into a loggable string.
 */
export declare function formatErrorChain(error: unknown): string;
/** Default logger for updater (backward-compatible) */
export declare const logger: Logger;
//# sourceMappingURL=logger.d.ts.map