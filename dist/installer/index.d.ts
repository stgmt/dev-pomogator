export { listExtensions } from './extensions.js';
interface NonInteractiveOptions {
    plugins?: string[];
    includeBeta?: boolean;
}
/**
 * Non-interactive installer for CI/testing
 */
export declare function runNonInteractiveInstaller(options?: NonInteractiveOptions): Promise<void>;
/**
 * Semi-interactive installer: user chooses plugins
 */
export declare function runSemiInteractiveInstaller(): Promise<void>;
export declare function runInstaller(): Promise<void>;
//# sourceMappingURL=index.d.ts.map