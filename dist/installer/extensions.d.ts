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
    platforms: ('claude')[];
    category: string;
    ruleFiles?: {
        claude?: string[];
    };
    commandFiles?: {
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
        claude?: PostInstallHook;
    };
    postUpdate?: PostInstallHook | {
        claude?: PostInstallHook;
    };
    envRequirements?: EnvRequirement[];
    requiresClaudeMem?: boolean;
    stability?: 'stable' | 'beta';
    path: string;
}
/** Check if extension is marked as beta (undefined = stable) */
export declare function isBeta(ext: Extension): boolean;
export interface ExtensionChoice {
    name: string;
    value: string;
    checked: boolean;
}
/**
 * Build choices array for the inquirer checkbox prompt.
 * Beta extensions get a "(BETA)" label in the name and are unchecked by default.
 * Single source of truth for FR-2 (label) and FR-3 (default) — both interactive
 * installer paths use this helper, so behavior can be verified by importing it.
 */
export declare function buildExtensionChoices(extensions: Extension[]): ExtensionChoice[];
export interface PostHookOwner {
    name: string;
    postUpdate?: PostInstallHook | {
        claude?: PostInstallHook;
    };
}
export declare class PostUpdateHookError extends Error {
    constructor(extensionName: string, message: string);
}
export declare function getExtensionsDir(): Promise<string>;
export declare function listExtensions(): Promise<Extension[]>;
export declare function getExtension(name: string): Promise<Extension | null>;
export declare function getExtensionFiles(extension: Extension, platform: 'claude', repoRoot: string): string[];
/**
 * Get absolute paths to rule SOURCE files for an extension.
 *
 * Rule paths in extension.json (e.g. ".claude/rules/scope-gate/rule.md") are
 * resolved against the dev-pomogator **package root** (source), not the target
 * project's repoRoot. The installer then copies them into the target project's
 * .claude/rules/{subfolder}/.
 *
 * Previous bug: `path.join(repoRoot, r)` resolved to `target/.claude/rules/...`
 * which doesn't exist when installing cross-repo → silent skip.
 *
 * @param _repoRoot ignored (retained for backward compatibility of signature)
 */
export declare function getExtensionRules(extension: Extension, platform: 'claude', _repoRoot: string): string[];
/**
 * Get map of tool_name -> absolute_path for extension tools
 */
export declare function getExtensionTools(extension: Extension): Promise<Map<string, string>>;
/**
 * Get map of skill_name -> absolute SOURCE path for extension skills (Claude Code).
 *
 * Skill paths in extension.json (e.g. ".claude/skills/my-skill") are resolved
 * against the dev-pomogator **package root** (source), not the target project's
 * repoRoot. Installer copies them into target's .claude/skills/{name}/.
 *
 * Previous bug: `path.join(repoRoot, relativePath)` resolved to target path →
 * skill silently not copied during cross-repo install.
 *
 * @param _repoRoot ignored (retained for backward compatibility of signature)
 */
export declare function getExtensionSkills(extension: Extension, _repoRoot: string): Map<string, string>;
/**
 * Get hooks defined in extension for a specific platform
 */
export declare function getExtensionHooks(extension: Extension, platform: 'claude'): Record<string, HookValue>;
/**
 * Get statusLine config from extension for a specific platform
 */
export declare function getExtensionStatusLine(extension: Extension, platform: 'claude'): {
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
export declare function runPostInstallHook(extension: Extension, repoRoot: string, platform?: 'claude', executedSharedHooks?: Set<string>): Promise<void>;
/**
 * Run post-update hook for an extension
 */
export declare function runPostUpdateHook(extension: PostHookOwner, repoRoot: string, platform?: 'claude', failFast?: boolean): Promise<void>;
//# sourceMappingURL=extensions.d.ts.map