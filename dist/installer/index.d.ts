import type { Platform } from '../config/schema.js';
export { listExtensions } from './extensions.js';
interface NonInteractiveOptions {
    plugins?: string[];
}
/**
 * Non-interactive installer for CI/testing
 */
export declare function runNonInteractiveInstaller(platforms: Platform[], options?: NonInteractiveOptions): Promise<void>;
/**
 * Semi-interactive installer: platform is pre-selected, but user chooses plugins
 */
export declare function runSemiInteractiveInstaller(platforms: Platform[]): Promise<void>;
export declare function runInstaller(): Promise<void>;
//# sourceMappingURL=index.d.ts.map