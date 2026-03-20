import { confirm, checkbox } from '@inquirer/prompts';
import chalk from 'chalk';
import { installCursor } from './cursor.js';
import { installClaude } from './claude.js';
import { listExtensions } from './extensions.js';
import { ensureClaudeMem } from './memory.js';
import { generateEnvExample, getMissingRequiredEnv } from './env-setup.js';
import { saveConfig, loadConfig } from '../config/index.js';
import { findRepoRoot } from '../utils/repo.js';
import { createLogger } from '../utils/logger.js';
import { captureConsole } from '../utils/console-capture.js';
export { listExtensions } from './extensions.js';
/**
 * Non-interactive installer for CI/testing
 */
export async function runNonInteractiveInstaller(platforms, options = {}) {
    console.log(chalk.bold.cyan('\n🚀 dev-pomogator installer (non-interactive)\n'));
    // Get all extensions for selected platforms
    const allExtensions = await listExtensions();
    let availableExtensions = allExtensions.filter(ext => ext.platforms.some(p => platforms.includes(p)));
    // Filter by selected plugins if specified
    if (options.plugins !== undefined) {
        availableExtensions = availableExtensions.filter(ext => options.plugins.includes(ext.name));
        console.log(chalk.gray(`Installing plugins: ${options.plugins.join(', ')}\n`));
    }
    else {
        console.log(chalk.gray(`Installing all plugins: ${availableExtensions.map(e => e.name).join(', ')}\n`));
    }
    const extensionNames = availableExtensions.map(ext => ext.name);
    // Default settings - auto-update enabled by default
    const autoUpdate = true;
    // Save config — preserve existing installedExtensions (addProjectPaths will update them)
    const existingConfig = await loadConfig();
    const config = {
        platforms,
        autoUpdate,
        lastCheck: new Date().toISOString(),
        cooldownHours: 24,
        rememberChoice: true,
        installedExtensions: existingConfig?.installedExtensions ?? [],
    };
    await saveConfig(config);
    // Install
    await install(platforms, autoUpdate, extensionNames);
}
/**
 * Semi-interactive installer: platform is pre-selected, but user chooses plugins
 */
export async function runSemiInteractiveInstaller(platforms) {
    console.log(chalk.bold.cyan('\n🚀 dev-pomogator installer\n'));
    console.log(chalk.gray(`Platform: ${platforms.join(', ')}\n`));
    if (!process.stdin.isTTY) {
        console.log(chalk.gray('Non-interactive mode detected. Installing all plugins...\n'));
        return await runNonInteractiveInstaller(platforms, { plugins: undefined });
    }
    // Get extensions for selected platforms
    const allExtensions = await listExtensions();
    const availableExtensions = allExtensions.filter(ext => ext.platforms.some(p => platforms.includes(p)));
    if (availableExtensions.length === 0) {
        console.log(chalk.yellow('No plugins available for selected platform(s). Exiting.'));
        process.exit(0);
    }
    // Let user choose plugins
    const selectedExtensions = await checkbox({
        message: 'Select plugins to install:',
        choices: availableExtensions.map(ext => ({
            name: `${ext.name} — ${ext.description}`,
            value: ext.name,
            checked: false, // Not checked by default - user must choose
        })),
    });
    if (selectedExtensions.length === 0) {
        console.log(chalk.yellow('No plugins selected. Exiting.'));
        process.exit(0);
    }
    // Auto-update option
    const autoUpdate = await confirm({
        message: 'Enable auto-updates? (checks every 24 hours)',
        default: true,
    });
    // Save config — preserve existing installedExtensions (addProjectPaths will update them)
    const existingConfig = await loadConfig();
    const config = {
        platforms,
        autoUpdate,
        lastCheck: new Date().toISOString(),
        cooldownHours: 24,
        rememberChoice: true,
        installedExtensions: existingConfig?.installedExtensions ?? [],
    };
    await saveConfig(config);
    // Install
    await install(platforms, autoUpdate, selectedExtensions);
}
export async function runInstaller() {
    console.log(chalk.bold.cyan('\n🚀 dev-pomogator installer\n'));
    const existingConfig = await loadConfig();
    if (existingConfig?.rememberChoice) {
        console.log(chalk.yellow('Found existing configuration.'));
        const useExisting = await confirm({
            message: 'Use existing settings?',
            default: true,
        });
        if (useExisting) {
            const extNames = existingConfig.installedExtensions?.map(e => e.name) || [];
            await install(existingConfig.platforms, existingConfig.autoUpdate, extNames);
            return;
        }
    }
    // 1. Platform selection
    const platforms = await checkbox({
        message: 'Select platform(s) to install:',
        choices: [
            { name: 'Cursor', value: 'cursor' },
            { name: 'Claude Code', value: 'claude' },
        ],
        required: true,
    });
    if (platforms.length === 0) {
        console.log(chalk.yellow('No platforms selected. Exiting.'));
        process.exit(0);
    }
    // 2. Extension selection
    const allExtensions = await listExtensions();
    const availableExtensions = allExtensions.filter(ext => ext.platforms.some(p => platforms.includes(p)));
    let selectedExtensions = [];
    if (availableExtensions.length > 0) {
        selectedExtensions = await checkbox({
            message: 'Select extensions to install:',
            choices: availableExtensions.map(ext => ({
                name: `${ext.name} — ${ext.description}`,
                value: ext.name,
                checked: true,
            })),
        });
        if (selectedExtensions.length === 0) {
            console.log(chalk.yellow('No extensions selected. Exiting.'));
            process.exit(0);
        }
    }
    // 3. Auto-update option
    const autoUpdate = await confirm({
        message: 'Enable auto-updates? (checks every 24 hours)',
        default: true,
    });
    // 4. Remember choice
    const rememberChoice = await confirm({
        message: 'Remember these choices for next time?',
        default: true,
    });
    // 5. Save config — preserve existing installedExtensions (addProjectPaths will update them)
    const config = {
        platforms,
        autoUpdate,
        lastCheck: new Date().toISOString(),
        cooldownHours: 24,
        rememberChoice,
        installedExtensions: existingConfig?.installedExtensions ?? [],
    };
    await saveConfig(config);
    // 6. Install
    await install(platforms, autoUpdate, selectedExtensions);
}
async function install(platforms, autoUpdate, extensions) {
    const installLog = createLogger('install.log');
    installLog.info(`=== Installation started: platforms=${platforms.join(',')}, extensions=${extensions.join(',')} ===`);
    const restoreConsole = captureConsole((level, msg) => installLog[level.toLowerCase()](msg));
    try {
        console.log(chalk.cyan('\nInstalling...\n'));
        // Get full extension objects to check requiresClaudeMem
        const allExtensions = await listExtensions();
        const selectedExtensions = allExtensions.filter(e => extensions.includes(e.name));
        // Check if any selected extension requires claude-mem
        const needsClaudeMem = selectedExtensions.some(e => e.requiresClaudeMem === true);
        // Track shared post-install hooks to avoid running them twice for TARGET=all
        const executedSharedHooks = new Set();
        for (const platform of platforms) {
            if (platform === 'cursor') {
                try {
                    await installCursor({ autoUpdate, extensions, executedSharedHooks });
                    console.log(chalk.green('✓ Cursor commands installed'));
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    throw new Error(`Failed to install for Cursor: ${message}`);
                }
                // Install claude-mem for Cursor only if required by selected extensions
                if (needsClaudeMem) {
                    try {
                        await ensureClaudeMem('cursor');
                    }
                    catch (error) {
                        console.log(chalk.yellow('⚠ Could not setup claude-mem (optional feature)'));
                    }
                }
            }
            if (platform === 'claude') {
                try {
                    await installClaude({ extensions, executedSharedHooks });
                    console.log(chalk.green('✓ Claude Code plugin installed'));
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    throw new Error(`Failed to install for Claude Code: ${message}`);
                }
                // Install claude-mem plugin for Claude Code only if required by selected extensions
                if (needsClaudeMem) {
                    try {
                        await ensureClaudeMem('claude');
                    }
                    catch (error) {
                        console.log(chalk.yellow('⚠ Could not setup claude-mem (optional feature)'));
                    }
                }
            }
        }
        console.log(chalk.bold.green('\n✨ Installation complete!\n'));
        // Generate .env.example and warn about missing required env vars
        const repoRoot = findRepoRoot();
        const missingEnvVars = await generateEnvExample(repoRoot, selectedExtensions);
        if (missingEnvVars.length > 0) {
            const missing = getMissingRequiredEnv(selectedExtensions);
            // Group by extension
            const byExtension = new Map();
            for (const m of missing) {
                if (!byExtension.has(m.extensionName)) {
                    byExtension.set(m.extensionName, []);
                }
                byExtension.get(m.extensionName).push({
                    name: m.requirement.name,
                    description: m.requirement.description,
                });
            }
            console.log(chalk.yellow('⚠  Environment variables required:\n'));
            for (const [extName, vars] of byExtension) {
                console.log(chalk.yellow(`   ${extName}:`));
                for (const v of vars) {
                    console.log(chalk.yellow(`     ${v.name}  — ${v.description}`));
                }
            }
            const platformHint = platforms.includes('claude')
                ? '.claude/settings.json → "env"'
                : '.env or shell profile';
            console.log(chalk.gray(`\n   Add to ${platformHint}\n`));
            console.log(chalk.cyan('   📄 .env.example generated with defaults\n'));
        }
        if (platforms.includes('cursor')) {
            console.log(chalk.cyan('Cursor: Installed plugins: ' + extensions.join(', ')));
            if (autoUpdate) {
                console.log(chalk.gray('         Auto-update enabled (checks every 24 hours)'));
            }
            if (needsClaudeMem) {
                console.log(chalk.gray('         Persistent memory enabled (claude-mem)'));
            }
        }
        if (platforms.includes('claude')) {
            console.log(chalk.cyan('Claude Code: Installed plugins: ' + extensions.join(', ')));
            if (needsClaudeMem) {
                console.log(chalk.gray('             Persistent memory enabled (claude-mem plugin)'));
            }
        }
    }
    finally {
        restoreConsole();
        installLog.info('=== Installation finished ===');
    }
}
//# sourceMappingURL=index.js.map