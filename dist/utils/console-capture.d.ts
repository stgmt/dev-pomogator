/**
 * Intercepts console.log/warn/error and duplicates output to a callback.
 * ANSI escape codes are stripped before passing to the callback.
 */
export declare function captureConsole(logFn: (level: 'INFO' | 'WARN' | 'ERROR', msg: string) => void): () => void;
//# sourceMappingURL=console-capture.d.ts.map