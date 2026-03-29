import { confirm, checkbox } from '@inquirer/prompts';
import chalk from 'chalk';
import { installClaude } from './claude.js';
import { listExtensions, isBeta } from './extensions.js';
import { ensureClaudeMem } from './memory.js';
import { generateEnvExample, getMissingRequiredEnv } from './env-setup.js';
import { saveConfig, loadConfig } from '../config/index.js';
import { findRepoRoot } from '../utils/repo.js';
import { createLogger, formatErrorChain, getErrorMessage } from '../utils/logger.js';
import { captureConsole } from '../utils/console-capture.js';
import { InstallReport } from './report.js';
export { listExtensions } from './extensions.js';
/**
 * Non-interactive installer for CI/testing
 */
export async function runNonInteractiveInstaller(options = {}) {
    console.log(chalk.bold.cyan('\n🚀 dev-pomogator installer (non-interactive)\n'));
    const allExtensions = await listExtensions();
    let availableExtensions = allExtensions.filter(ext => ext.platforms.includes('claude'));
    if (options.plugins !== undefined) {
        availableExtensions = availableExtensions.filter(ext => options.plugins.includes(ext.name));
        console.log(chalk.gray(`Installing plugins: ${options.plugins.join(', ')}\n`));
    }
    else {
        // --all without --include-beta: exclude beta plugins
        if (!options.includeBeta) {
            const betaSkipped = availableExtensions.filter(ext => isBeta(ext)).map(e => e.name);
            availableExtensions = availableExtensions.filter(ext => !isBeta(ext));
            if (betaSkipped.length > 0) {
                console.log(chalk.gray(`Skipping beta plugins: ${betaSkipped.join(', ')} (use --include-beta to install)\n`));
            }
        }
        console.log(chalk.gray(`Installing all plugins: ${availableExtensions.map(e => e.name).join(', ')}\n`));
    }
    const extensionNames = availableExtensions.map(ext => ext.name);
    const autoUpdate = true;
    const existingConfig = await loadConfig();
    const config = {
        platforms: ['claude'],
        autoUpdate,
        lastCheck: new Date().toISOString(),
        cooldownHours: 24,
        rememberChoice: true,
        installedExtensions: existingConfig?.installedExtensions ?? [],
    };
    await saveConfig(config);
    await install(autoUpdate, extensionNames);
}
/**
 * Semi-interactive installer: user chooses plugins
 */
export async function runSemiInteractiveInstaller() {
    console.log(chalk.bold.cyan('\n🚀 dev-pomogator installer\n'));
    console.log(chalk.gray('Platform: Claude Code\n'));
    if (!process.stdin.isTTY) {
        console.log(chalk.gray('Non-interactive mode detected. Installing all plugins...\n'));
        return await runNonInteractiveInstaller({ plugins: undefined });
    }
    const allExtensions = await listExtensions();
    const availableExtensions = allExtensions.filter(ext => ext.platforms.includes('claude'));
    if (availableExtensions.length === 0) {
        console.log(chalk.yellow('No plugins available. Exiting.'));
        process.exit(0);
    }
    const selectedExtensions = await checkbox({
        message: 'Select plugins to install:',
        choices: availableExtensions.map(ext => ({
            name: `${ext.name}${isBeta(ext) ? ' (BETA)' : ''} — ${ext.description}`,
            value: ext.name,
            checked: !isBeta(ext),
        })),
    });
    if (selectedExtensions.length === 0) {
        console.log(chalk.yellow('No plugins selected. Exiting.'));
        process.exit(0);
    }
    const autoUpdate = await confirm({
        message: 'Enable auto-updates? (checks every 24 hours)',
        default: true,
    });
    const existingConfig = await loadConfig();
    const config = {
        platforms: ['claude'],
        autoUpdate,
        lastCheck: new Date().toISOString(),
        cooldownHours: 24,
        rememberChoice: true,
        installedExtensions: existingConfig?.installedExtensions ?? [],
    };
    await saveConfig(config);
    await install(autoUpdate, selectedExtensions);
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
            await install(existingConfig.autoUpdate, extNames);
            return;
        }
    }
    const allExtensions = await listExtensions();
    const availableExtensions = allExtensions.filter(ext => ext.platforms.includes('claude'));
    let selectedExtensions = [];
    if (availableExtensions.length > 0) {
        selectedExtensions = await checkbox({
            message: 'Select extensions to install:',
            choices: availableExtensions.map(ext => ({
                name: `${ext.name}${isBeta(ext) ? ' (BETA)' : ''} — ${ext.description}`,
                value: ext.name,
                checked: !isBeta(ext),
            })),
        });
        if (selectedExtensions.length === 0) {
            console.log(chalk.yellow('No extensions selected. Exiting.'));
            process.exit(0);
        }
    }
    const autoUpdate = await confirm({
        message: 'Enable auto-updates? (checks every 24 hours)',
        default: true,
    });
    const rememberChoice = await confirm({
        message: 'Remember these choices for next time?',
        default: true,
    });
    const existingInstalled = existingConfig?.installedExtensions ?? [];
    const config = {
        platforms: ['claude'],
        autoUpdate,
        lastCheck: new Date().toISOString(),
        cooldownHours: 24,
        rememberChoice,
        installedExtensions: existingInstalled,
    };
    await saveConfig(config);
    await install(autoUpdate, selectedExtensions);
}
async function install(autoUpdate, extensions) {
    const installLog = createLogger('install.log');
    installLog.info(`=== Installation started: platform=claude, extensions=${extensions.join(',')} ===`);
    const restoreConsole = captureConsole((level, msg) => installLog[level.toLowerCase()](msg));
    const report = new InstallReport();
    try {
        console.log(chalk.cyan('\nInstalling...\n'));
        const allExtensions = await listExtensions();
        const selectedExtensions = allExtensions.filter(e => extensions.includes(e.name));
        const needsClaudeMem = selectedExtensions.some(e => e.requiresClaudeMem === true);
        const executedSharedHooks = new Set();
        try {
            await installClaude({ extensions, executedSharedHooks });
            console.log(chalk.green('✓ Claude Code plugin installed'));
            report.add({ component: 'claude-code', status: 'ok' });
        }
        catch (error) {
            const msg = getErrorMessage(error);
            report.add({ component: 'claude-code', status: 'fail', message: msg });
            throw new Error(`Failed to install for Claude Code: ${msg}`);
        }
        if (needsClaudeMem) {
            try {
                const validation = await ensureClaudeMem('claude', installLog);
                report.add({ component: 'claude-mem', status: validation.worker ? 'ok' : 'fail' });
                report.add({ component: 'claude-mem/worker', status: validation.worker ? 'ok' : 'fail' });
                report.add({ component: 'claude-mem/chroma', status: validation.chroma ? 'ok' : 'warn', message: validation.chroma ? '' : 'degraded mode — basic memory works, semantic search unavailable' });
                report.add({ component: 'claude-mem/mcp', status: validation.mcpBinary ? 'ok' : 'fail' });
                // Auto-install claude-mem-health extension (SessionStart hook for chroma auto-restart)
                let healthHooksOk = false;
                if (!extensions.includes('claude-mem-health')) {
                    try {
                        await installClaude({ extensions: ['claude-mem-health'], executedSharedHooks });
                        console.log(chalk.green('  ✓ claude-mem-health hooks installed'));
                        healthHooksOk = true;
                    }
                    catch (err) {
                        installLog.warn(`claude-mem-health install failed: ${getErrorMessage(err)}`);
                        console.log(chalk.yellow('  ⚠ Could not install claude-mem-health hooks'));
                    }
                }
                else {
                    healthHooksOk = true;
                }
                report.add({ component: 'claude-mem/hooks', status: healthHooksOk ? 'ok' : 'fail' });
            }
            catch (error) {
                const msg = getErrorMessage(error);
                installLog.error(`claude-mem setup failed: ${formatErrorChain(error)}`);
                console.log(chalk.yellow('⚠ Could not setup claude-mem (optional feature)'));
                console.log(chalk.gray(`  Reason: ${msg}`));
                console.log(chalk.gray('  Details: ~/.dev-pomogator/logs/install.log'));
                report.add({ component: 'claude-mem', status: 'fail', message: msg });
                report.add({ component: 'claude-mem/worker', status: 'fail', message: msg });
                report.add({ component: 'claude-mem/chroma', status: 'fail', message: msg });
                report.add({ component: 'claude-mem/mcp', status: 'fail', message: msg });
                report.add({ component: 'claude-mem/hooks', status: 'fail', message: msg });
            }
        }
        console.log(chalk.bold.green('\n✨ Installation complete!\n'));
        const repoRoot = findRepoRoot();
        const missingEnvVars = await generateEnvExample(repoRoot, selectedExtensions);
        if (missingEnvVars.length > 0) {
            const missing = getMissingRequiredEnv(selectedExtensions);
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
            console.log(chalk.gray('\n   Add to .claude/settings.json → "env"\n'));
            console.log(chalk.cyan('   📄 .env.example generated with defaults\n'));
        }
        console.log(chalk.cyan('Claude Code: Installed plugins: ' + extensions.join(', ')));
        if (needsClaudeMem) {
            console.log(chalk.gray('             Persistent memory enabled (claude-mem plugin)'));
        }
    }
    finally {
        await report.write().catch(() => { });
        restoreConsole();
        installLog.info('=== Installation finished ===');
    }
}
//# sourceMappingURL=index.js.map