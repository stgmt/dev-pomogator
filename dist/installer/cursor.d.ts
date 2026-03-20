interface CursorOptions {
    autoUpdate: boolean;
    extensions?: string[];
    executedSharedHooks?: Set<string>;
}
export declare function installCursor(options: CursorOptions): Promise<void>;
export {};
//# sourceMappingURL=cursor.d.ts.map