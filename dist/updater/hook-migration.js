/**
 * Automatic migration of old-format hooks to portable tsx-runner format.
 *
 * Old hooks use `npx tsx .dev-pomogator/tools/...` (relative path, no tsx-runner).
 * New format uses `node -e "require(...tsx-runner-bootstrap.cjs)" -- "ABSOLUTE/path"`.
 *
 * Called from standalone.ts on every Stop event (before cooldown check)
 * so that even projects that never update still get migrated hooks.
 *
 * Note: migrated hooks still target `.claude/settings.json` here (existing target).
 * Personal-pomogator FR-2/FR-3 migration from settings.json → settings.local.json
 * runs only during full `installClaude` (not in this standalone updater path),
 * so dev pomogator should re-run `dev-pomogator install` to move hooks to local.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { resolveHookToolPaths, replaceNpxTsxWithPortable } from '../installer/shared.js';
import { logger } from '../utils/logger.js';
import { writeJsonAtomicSync } from '../utils/atomic-json.js';
const CONFIG_DIR = path.join(os.homedir(), '.dev-pomogator');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
/** Matches old-style `npx tsx .dev-pomogator/tools/...` without tsx-runner wrapper. */
const OLD_HOOK_RE = /\bnpx\s+tsx\s+[."']?\.?dev-pomogator\/tools\//;
function isOldFormat(command) {
    return OLD_HOOK_RE.test(command);
}
/**
 * Scan all Claude project settings and migrate old-format hooks.
 * Returns total number of migrated hook commands.
 */
export async function migrateOldProjectHooks(platform) {
    if (platform !== 'claude')
        return 0;
    if (!fs.existsSync(CONFIG_FILE))
        return 0;
    let config;
    try {
        config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
    catch {
        return 0;
    }
    const extensions = config.installedExtensions ?? [];
    const projectPaths = new Set();
    for (const ext of extensions) {
        if (ext.platform !== 'claude')
            continue;
        for (const p of ext.projectPaths ?? [])
            projectPaths.add(p);
    }
    let total = 0;
    for (const projectPath of projectPaths) {
        total += migrateProjectSettings(projectPath);
    }
    return total;
}
/**
 * Migrate old-format hooks in a single project's .claude/settings.json.
 * Uses sync I/O (consistent with standalone.ts bundle context).
 */
function migrateProjectSettings(projectPath) {
    const settingsPath = path.join(projectPath, '.claude', 'settings.json');
    if (!fs.existsSync(settingsPath))
        return 0;
    let settings;
    try {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }
    catch {
        return 0;
    }
    if (!settings.hooks)
        return 0;
    let migrated = 0;
    for (const hookEntries of Object.values(settings.hooks)) {
        if (!Array.isArray(hookEntries))
            continue;
        for (const entry of hookEntries) {
            for (const hook of entry.hooks ?? []) {
                if (hook.command && isOldFormat(hook.command)) {
                    hook.command = replaceNpxTsxWithPortable(resolveHookToolPaths(hook.command, projectPath));
                    migrated++;
                }
            }
        }
    }
    if (migrated > 0) {
        writeJsonAtomicSync(settingsPath, settings);
        logger.info(`Migrated ${migrated} old-format hook(s) in ${projectPath}`);
    }
    return migrated;
}
//# sourceMappingURL=hook-migration.js.map