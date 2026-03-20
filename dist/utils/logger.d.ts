export interface Logger {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
}
export declare function createLogger(filename: string): Logger;
/** Default logger for updater (backward-compatible) */
export declare const logger: Logger;
//# sourceMappingURL=logger.d.ts.map