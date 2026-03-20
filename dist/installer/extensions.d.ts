export interface EnvRequirement {
    name: string;
    required: boolean;
    description: string;
    default?: string;
    example?: string;
}
export type HookValue = string | {
    matcher?: string;
    command: string;
    timeout?: number;
};
export interface ExtensionHooks {
    claude?: {
        [hookName: string]: HookValue;
    };
    cursor?: {
        [hookName: string]: HookValue;
    };
}
export interface PostInstallHook {
    command: string;
    interactive?: boolean;
    skipInCI?: boolean;
}
export interface Extension {
    name: string;
    version: string;
    description: string;
    platforms: ('cursor' | 'claude')[];
    category: string;
    files: {
        cursor?: string[];
        claude?: string[];
    };
    rules?: {
        cursor?: string[];
        claude?: string[];
    };
    tools?: {
        [toolName: string]: string;
    };
    skills?: {
        [skillName: string]: string;
    };
    hooks?: ExtensionHooks;
    statusLine?: {
        claude?: {
            type: string;
            command: string;
        };
    };
    postInstall?: PostInstallHook | {
        cursor?: PostInstallHook;
        claude?: PostInstallHook;
    };
    postUpdate?: PostInstallHook | {
        cursor?: PostInstallHook;
        claude?: PostInstallHook;
    };
    envRequirements?: EnvRequirement[];
    requiresClaudeMem?: boolean;
    path: string;
}
export interface PostHookOwner {
    name: string;
    postUpdate?: PostInstallHook | {
        cursor?: PostInstallHook;
        claude?: PostInstallHook;
    };
}
export declare class PostUpdateHookError extends Error {
    constructor(extensionName: string, message: string);
}
export declare function getExtensionsDir(): Promise<string>;
export declare function listExtensions(): Promise<Extension[]>;
export declare function getExtension(name: string): Promise<Extension | null>;
export declare function getExtensionFiles(extension: Extension, platform: 'cursor' | 'claude'): Promise<string[]>;
/**
 * Get absolute paths to rule files for an extension
 */
export declare function getExtensionRules(extension: Extension, platform: 'cursor' | 'claude'): Promise<string[]>;
/**
 * Get map of tool_name -> absolute_path for extension tools
 */
export declare function getExtensionTools(extension: Extension): Promise<Map<string, string>>;
/**
 * Get map of skill_name -> absolute_path for extension skills (Claude Code only)
 */
export declare function getExtensionSkills(extension: Extension): Promise<Map<string, string>>;
/**
 * Get hooks defined in extension for a specific platform
 */
export declare function getExtensionHooks(extension: Extension, platform: 'cursor' | 'claude'): Record<string, HookValue>;
/**
 * Get statusLine config from extension for a specific platform
 */
export declare function getExtensionStatusLine(extension: Extension, platform: 'cursor' | 'claude'): {
    type: string;
    command: string;
} | null;
/**
 * Check if an extension has a shared (non-platform-specific) post-install hook
 */
export declare function isSharedPostInstallHook(extension: Extension): boolean;
export declare function cleanStaleNodeModulesDirs(cwd: string): void;
/**
 * Run post-install hook for an extension
 */
export declare function runPostInstallHook(extension: Extension, repoRoot: string, platform?: 'cursor' | 'claude', executedSharedHooks?: Set<string>): Promise<void>;
/**
 * Run post-update hook for an extension
 */
export declare function runPostUpdateHook(extension: PostHookOwner, repoRoot: string, platform?: 'cursor' | 'claude', failFast?: boolean): Promise<void>;
//# sourceMappingURL=extensions.d.ts.map