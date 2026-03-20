/**
 * Intercepts console.log/warn/error and duplicates output to a callback.
 * ANSI escape codes are stripped before passing to the callback.
 */
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;
function stripAnsi(str) {
    return str.replace(ANSI_RE, '');
}
function formatArgs(args) {
    return args.map(a => (typeof a === 'string' ? a : String(a))).join(' ');
}
export function captureConsole(logFn) {
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;
    console.log = (...args) => {
        origLog.apply(console, args);
        logFn('INFO', stripAnsi(formatArgs(args)));
    };
    console.warn = (...args) => {
        origWarn.apply(console, args);
        logFn('WARN', stripAnsi(formatArgs(args)));
    };
    console.error = (...args) => {
        origError.apply(console, args);
        logFn('ERROR', stripAnsi(formatArgs(args)));
    };
    return () => {
        console.log = origLog;
        console.warn = origWarn;
        console.error = origError;
    };
}
//# sourceMappingURL=console-capture.js.map