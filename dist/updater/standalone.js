/**
 * Bundled update check script for dev-pomogator.
 * Called from ~/.dev-pomogator/scripts/check-update.js (bundled from dist/check-update.bundle.cjs)
 * This file is bundled with esbuild to include all dependencies.
 *
 * Usage:
 *   node check-update.js --claude --check-only  # SessionStart: warn if update available
 *   node check-update.js --claude               # Legacy: auto-update (kept for manual use)
 *   node check-update.js                        # Default (Cursor)
 *
 * Note: Shebang is added by esbuild via banner option.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import semver from 'semver';
import { checkUpdate } from './index.js';
import { fetchExtensionManifest } from './github.js';
import { migrateOldProjectHooks } from './hook-migration.js';
import { logger } from '../utils/logger.js';
const CONFIG_DIR = path.join(os.homedir(), '.dev-pomogator');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
// Parse command line arguments
const args = process.argv.slice(2);
const isClaudeCode = args.includes('--claude');
const isCheckOnly = args.includes('--check-only');
const platform = isClaudeCode ? 'claude' : 'cursor';
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        }
    }
    catch {
        logger.error('Failed to load config');
    }
    return null;
}
function shouldUpdate(config) {
    if (!config || !config.autoUpdate)
        return false;
    if (!config.lastCheck)
        return true;
    const lastCheck = new Date(config.lastCheck);
    const now = new Date();
    const hours = (now.getTime() - lastCheck.getTime()) / (1000 * 60 * 60);
    const cooldown = config.cooldownHours || 24;
    return hours >= cooldown;
}
/**
 * Check-only mode: fetch manifests, compare versions, print warning to stderr.
 * No lock, no cooldown, no file modifications.
 * Silent on errors — user should not see network failures.
 */
async function checkOnly() {
    const config = loadConfig();
    if (!config?.installedExtensions?.length)
        return;
    const outdated = [];
    // Deduplicate extensions by name (may be installed for both cursor and claude)
    const seen = new Set();
    const toCheck = [];
    for (const ext of config.installedExtensions) {
        if (seen.has(ext.name))
            continue;
        if (ext.platform !== platform)
            continue;
        seen.add(ext.name);
        toCheck.push(ext);
    }
    // Fetch all manifests in parallel for speed
    const results = await Promise.all(toCheck.map(async (ext) => {
        try {
            const remote = await fetchExtensionManifest(ext.name);
            if (remote && semver.gt(remote.version, ext.version)) {
                return { name: ext.name, current: ext.version, latest: remote.version };
            }
        }
        catch {
            // Silent — network errors should not bother the user
        }
        return null;
    }));
    for (const result of results) {
        if (result)
            outdated.push(result);
    }
    if (outdated.length > 0) {
        const details = outdated.map(e => `${e.name}: ${e.current} → ${e.latest}`).join(', ');
        const cmd = platform === 'claude'
            ? 'npx github:stgmt/dev-pomogator --claude --all'
            : 'npx github:stgmt/dev-pomogator --cursor --all';
        process.stderr.write(`\n⚠️  dev-pomogator update available (${details})\n   Run: ${cmd}\n\n`);
    }
}
async function main() {
    if (isCheckOnly) {
        await checkOnly();
        return;
    }
    // Legacy auto-update path (kept for manual use)
    logger.info(`=== Update check started (${platform}) ===`);
    // Always migrate old hooks (fast local check, no network)
    await migrateOldProjectHooks(platform).catch(() => { });
    const config = loadConfig();
    if (!shouldUpdate(config)) {
        logger.info('Skipped: cooldown not expired or autoUpdate disabled');
        return;
    }
    logger.info('Cooldown expired, checking for updates...');
    try {
        const updated = await checkUpdate({ silent: true, platform });
        if (updated) {
            logger.info(`Extensions updated successfully (${platform})`);
        }
        else {
            logger.info('No updates available');
        }
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logger.error(`Update failed: ${message}`);
    }
}
main()
    .catch((e) => {
    const message = e instanceof Error ? e.message : String(e);
    if (!isCheckOnly)
        logger.error(`Fatal: ${message}`);
})
    .finally(() => {
    if (!isCheckOnly) {
        logger.info('Update check completed');
        // Signal Cursor to continue
        process.stdout.write(JSON.stringify({ continue: true }));
    }
});
//# sourceMappingURL=standalone.js.map