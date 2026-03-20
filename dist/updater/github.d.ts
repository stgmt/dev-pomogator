export interface ExtensionManifest {
    name: string;
    version: string;
    description: string;
    platforms: string[];
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
    toolFiles?: {
        [toolName: string]: string[];
    };
    skillFiles?: {
        [skillName: string]: string[];
    };
    hooks?: {
        cursor?: Record<string, string>;
        claude?: Record<string, string>;
    };
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
        cursor?: {
            command: string;
            interactive?: boolean;
            skipInCI?: boolean;
        };
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