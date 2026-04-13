/**
 * Bundled update check script for dev-pomogator.
 * Called from ~/.dev-pomogator/scripts/check-update.js (bundled from dist/check-update.bundle.cjs)
 * This file is bundled with esbuild to include all dependencies.
 *
 * Usage:
 *   node check-update.js --claude --check-only  # SessionStart: warn if update available
 *   node check-update.js --claude               # Legacy: auto-update (kept for manual use)
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
import { logger, getErrorMessage } from '../utils/logger.js';
import { updateSharedFiles, hasMissingSharedDir } from './shared-sync.js';
const CONFIG_DIR = path.join(os.homedir(), '.dev-pomogator');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
// Parse command line arguments
const args = process.argv.slice(2);
const isCheckOnly = args.includes('--check-only');
const platform = 'claude';
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
 * Forced recovery probe: if any tracked project has `installedShared[projectPath]`
 * non-empty AND `.dev-pomogator/tools/_shared/` is physically missing, trigger an
 * unconditional `updateSharedFiles` for that project. Bypasses cooldown by design —
 * legacy installs (pre-commit 6b475e4) and accidental deletions need recovery on
 * the very next SessionStart, not after 24h.
 *
 * Cheap path (fs.existsSync only) when nothing is missing — typical case.
 * Slow path (network fetch) only when recovery is needed — once per legacy install.
 *
 * Incident reference: dkidyaev (`c:\msmaster`).
 */
async function recoverMissingShared(config) {
    if (!config.installedShared)
        return;
    for (const [projectPath, entries] of Object.entries(config.installedShared)) {
        if (!entries || entries.length === 0)
            continue;
        let missing = false;
        try {
            missing = hasMissingSharedDir(projectPath);
        }
        catch {
            // Permission denied / broken symlink — silently skip this project
            continue;
        }
        if (!missing)
            continue;
        process.stderr.write(`⚠ _shared/ missing for ${projectPath} — forcing recovery sync\n`);
        try {
            const result = await updateSharedFiles(projectPath, entries);
            if (result.written.length > 0) {
                process.stderr.write(`  ✓ Recovered ${result.written.length} _shared file(s) for ${projectPath}\n`);
                // Persist updated hashes so future runs see the recovery as complete
                config.installedShared[projectPath] = result.written;
                try {
                    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
                }
                catch (writeErr) {
                    process.stderr.write(`  ⚠ Failed to persist installedShared after recovery: ${getErrorMessage(writeErr)}\n`);
                }
            }
            else if (result.hadFailures) {
                process.stderr.write(`  ⚠ _shared/ recovery for ${projectPath} had failures (manifest unreachable?)\n`);
            }
        }
        catch (syncErr) {
            process.stderr.write(`  ⚠ _shared/ recovery failed for ${projectPath}: ${getErrorMessage(syncErr)}\n`);
        }
    }
}
/**
 * Check-only mode: fetch manifests, compare versions, print warning to stderr.
 * No lock, no cooldown, no file modifications.
 * Silent on errors — user should not see network failures.
 *
 * Side effect: if any tracked project is missing `_shared/`, trigger forced recovery
 * before the version-check loop. This is the only place that runs on SessionStart
 * for the typical user, so legacy install recovery must hook in here.
 */
async function checkOnly() {
    const config = loadConfig();
    if (!config)
        return;
    // Forced recovery (cheap probe, no-op for healthy installs)
    await recoverMissingShared(config);
    if (!config.installedExtensions?.length)
        return;
    const outdated = [];
    // Deduplicate extensions by name
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
        const cmd = 'npx github:stgmt/dev-pomogator --claude --all';
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
    await migrateOldProjectHooks(platform).catch((err) => {
        logger.warn(`Hook migration failed: ${getErrorMessage(err)}`);
    });
    const config = loadConfig();
    // Forced recovery probe — runs BEFORE cooldown gate so legacy installs (or
    // accidental _shared/ deletions) recover on the next update invocation
    // regardless of `lastCheck` recency. No-op for healthy installs.
    if (config)
        await recoverMissingShared(config);
    if (!shouldUpdate(config)) {
        logger.info('Skipped: cooldown not expired or autoUpdate disabled');
        return;
    }
    logger.info('Cooldown expired, checking for updates...');
    try {
        const updated = await checkUpdate({ platform });
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
        process.stdout.write(JSON.stringify({ continue: true }));
    }
});
//# sourceMappingURL=standalone.js.map