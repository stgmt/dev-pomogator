export interface ExtensionManifest {
    name: string;
    version: string;
    description: string;
    platforms: string[];
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
    toolFiles?: {
        [toolName: string]: string[];
    };
    skillFiles?: {
        [skillName: string]: string[];
    };
    hooks?: {
        claude?: Record<string, string>;
    };
    /**
     * MCP server entries to register in target project's `.mcp.json`.
     * Updater observes this field to detect drift between declared pinned
     * version and last-installed configHash; mismatch → re-write entry.
     */
    mcpServers?: Record<string, {
        command: string;
        args?: string[];
        env?: Record<string, string>;
    }>;
    statusLine?: {
        claude?: {
            type: string;
            command: string;
        };
    };
    postUpdate?: {
        command: string;
        interactive?: boolean;
        skipInCI?: boolean;
    } | {
        claude?: {
            command: string;
            interactive?: boolean;
            skipInCI?: boolean;
        };
    };
}
export declare function fetchExtensionManifest(name: string): Promise<ExtensionManifest | null>;
export declare function downloadExtensionFile(extensionName: string, relativePath: string): Promise<string | null>;
//# sourceMappingURL=github.d.ts.map