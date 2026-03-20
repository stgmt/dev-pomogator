/** Extract plain paths from a mixed ManagedFileItem array. */
export function getManagedPaths(items) {
    if (!items)
        return [];
    return items.map((item) => (typeof item === 'string' ? item : item.path));
}
/** Find the stored hash for a given relative path, or undefined if not tracked. */
export function getManagedHash(items, relativePath) {
    if (!items)
        return undefined;
    for (const item of items) {
        if (typeof item === 'string')
            continue;
        if (item.path === relativePath)
            return item.hash;
    }
    return undefined;
}
export const DEFAULT_CONFIG = {
    platforms: [],
    autoUpdate: true,
    enableMemory: true,
    lastCheck: new Date().toISOString(),
    cooldownHours: 24,
    rememberChoice: true,
    installedExtensions: [],
};
//# sourceMappingURL=schema.js.map