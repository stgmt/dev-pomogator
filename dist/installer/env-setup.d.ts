import type { Extension, EnvRequirement } from './extensions.js';
interface EnvGroup {
    extensionName: string;
    requirements: EnvRequirement[];
}
/**
 * Collect all envRequirements from installed extensions, grouped by extension.
 */
export declare function collectEnvRequirements(extensions: Extension[]): EnvGroup[];
/**
 * Get list of missing required env variables (not set in process.env).
 * Returns array of { extensionName, requirement } for each missing required var.
 */
export declare function getMissingRequiredEnv(extensions: Extension[]): Array<{
    extensionName: string;
    requirement: EnvRequirement;
}>;
/**
 * Generate .env.example file in projectPath with env requirements from all extensions.
 * Required vars are uncommented, optional vars are commented out.
 * Returns list of missing required env variable names.
 */
export declare function generateEnvExample(projectPath: string, extensions: Extension[]): Promise<string[]>;
export {};
//# sourceMappingURL=env-setup.d.ts.map