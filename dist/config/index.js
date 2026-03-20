import fs from 'fs-extra';
import path from 'path';
import os from 'os';
const CONFIG_DIR = path.join(os.homedir(), '.dev-pomogator');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
export async function loadConfig() {
    try {
        if (await fs.pathExists(CONFIG_FILE)) {
            const config = await fs.readJson(CONFIG_FILE);
            return normalizeConfig(config);
        }
    }
    catch {
        // Return null if config doesn't exist or is invalid
    }
    return null;
}
/**
 * Normalize a ManagedFileItem array: plain strings (old format) become
 * { path, hash: '' } so downstream code can always work with ManagedFileEntry.
 */
function normalizeManagedItems(items) {
    if (!items || items.length === 0)
        return items;
    // Already normalized if every item is an object
    if (items.every((i) => typeof i !== 'string'))
        return items;
    return items.map((item) => typeof item === 'string' ? { path: item, hash: '' } : item);
}
function normalizeManagedEntry(managed) {
    return {
        ...managed,
        commands: normalizeManagedItems(managed.commands),
        rules: normalizeManagedItems(managed.rules),
        tools: normalizeManagedItems(managed.tools),
    };
}
function normalizeConfig(config) {
    const normalized = {
        ...config,
        installedExtensions: Array.isArray(config.installedExtensions)
            ? config.installedExtensions.map((ext) => {
                const rawManaged = ext.managed ?? {};
                const normalizedManaged = {};
                for (const [projectPath, entry] of Object.entries(rawManaged)) {
                    normalizedManaged[projectPath] = normalizeManagedEntry(entry);
                }
                return {
                    ...ext,
                    projectPaths: Array.isArray(ext.projectPaths) ? ext.projectPaths : [],
                    managed: normalizedManaged,
                };
            })
            : [],
    };
    return normalized;
}
export async function saveConfig(config) {
    await fs.ensureDir(CONFIG_DIR);
    const tempFile = path.join(CONFIG_DIR, 'config.json.tmp');
    await fs.writeJson(tempFile, config, { spaces: 2 });
    // Set restrictive permissions on Unix
    if (process.platform !== 'win32') {
        await fs.chmod(tempFile, 0o600);
    }
    await fs.move(tempFile, CONFIG_FILE, { overwrite: true });
}
export async function updateLastCheck() {
    const config = await loadConfig();
    if (config) {
        config.lastCheck = new Date().toISOString();
        await saveConfig(config);
    }
}
export function getConfigPath() {
    return CONFIG_FILE;
}
export function getConfigDir() {
    return CONFIG_DIR;
}
//# sourceMappingURL=index.js.map