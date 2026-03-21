import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { listExtensions, getExtensionFiles, getExtensionRules, getExtensionTools, getExtensionSkills, getExtensionHooks, getExtensionStatusLine, runPostInstallHook, cleanStaleNodeModulesDirs } from './extensions.js';
import { findRepoRoot } from '../utils/repo.js';
import { detectMangledArtifacts } from '../utils/msys.js';
import { RULES_SUBFOLDER, TOOLS_DIR, SKILLS_DIR } from '../constants.js';
import { getFileHash } from '../updater/content-hash.js';
import { collectFileHashes, addProjectPaths, makePortableScriptCommand, resolveHookToolPaths, replaceNpxTsxWithPortable, ensureExecutableShellScripts, setupGlobalScripts, removeOrphanedFiles } from './shared.js';
import { writeJsonAtomic, readJsonSafe } from '../utils/atomic-json.js';
import { writeGlobalStatusLine } from '../utils/statusline.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export async function installClaude(options = {}) {
    const repoRoot = findRepoRoot();
    // Validate project directory
    if (!await fs.pathExists(repoRoot)) {
        throw new Error(`Project directory not found: ${repoRoot}`);
    }
    // Get all extensions that support claude
    const allExtensions = await listExtensions();
    if (allExtensions.length === 0) {
        throw new Error('No extensions found. Check your dev-pomogator installation.');
    }
    const claudeExtensions = allExtensions.filter((ext) => ext.platforms.includes('claude'));
    if (claudeExtensions.length === 0) {
        throw new Error('No extensions support Claude Code platform.');
    }
    // Filter by requested extensions if specified
    const extensionsToInstall = options.extensions?.length
        ? claudeExtensions.filter((ext) => options.extensions.includes(ext.name))
        : claudeExtensions;
    if (options.extensions?.length && extensionsToInstall.length === 0) {
        const available = claudeExtensions.map(e => e.name).join(', ');
        throw new Error(`None of the requested plugins found: ${options.extensions.join(', ')}. ` +
            `Available plugins: ${available}`);
    }
    // Track managed files per extension for config
    const managedByExtension = new Map();
    // 1. Install commands to .claude/commands/ (in project directory)
    const commandsDir = path.join(repoRoot, '.claude', 'commands');
    await fs.ensureDir(commandsDir);
    for (const extension of extensionsToInstall) {
        const files = await getExtensionFiles(extension, 'claude');
        const managedCommands = [];
        for (const srcFile of files) {
            if (srcFile.endsWith('.md')) {
                const fileName = path.basename(srcFile);
                const dest = path.join(commandsDir, fileName);
                await fs.copy(srcFile, dest, { overwrite: true });
                console.log(`  ✓ Installed command: ${fileName}`);
                const hash = await getFileHash(dest);
                if (hash) {
                    managedCommands.push({ path: `.claude/commands/${fileName}`, hash });
                }
            }
        }
        if (!managedByExtension.has(extension.name)) {
            managedByExtension.set(extension.name, {});
        }
        if (managedCommands.length > 0) {
            managedByExtension.get(extension.name).commands = managedCommands;
        }
    }
    // 2. Install rules to .claude/rules/ (in project directory)
    const rulesDir = path.join(repoRoot, '.claude', 'rules', RULES_SUBFOLDER);
    await fs.ensureDir(rulesDir);
    for (const extension of extensionsToInstall) {
        const ruleFiles = await getExtensionRules(extension, 'claude');
        const managedRules = [];
        for (const ruleFile of ruleFiles) {
            if (await fs.pathExists(ruleFile)) {
                const fileName = path.basename(ruleFile);
                const dest = path.join(rulesDir, fileName);
                await fs.copy(ruleFile, dest, { overwrite: true });
                console.log(`  ✓ Installed rule: ${fileName}`);
                const hash = await getFileHash(dest);
                if (hash) {
                    managedRules.push({ path: `.claude/rules/${RULES_SUBFOLDER}/${fileName}`, hash });
                }
            }
        }
        if (!managedByExtension.has(extension.name)) {
            managedByExtension.set(extension.name, {});
        }
        if (managedRules.length > 0) {
            managedByExtension.get(extension.name).rules = managedRules;
        }
    }
    // 3. Install tools to project/.dev-pomogator/tools/
    for (const extension of extensionsToInstall) {
        const tools = await getExtensionTools(extension);
        const managedTools = [];
        for (const [toolName, toolPath] of tools) {
            if (await fs.pathExists(toolPath)) {
                const dest = path.join(repoRoot, TOOLS_DIR, toolName);
                await fs.copy(toolPath, dest, { overwrite: true });
                await ensureExecutableShellScripts(dest);
                // Remove files in dest that don't exist in source (stale/legacy cleanup)
                await removeOrphanedFiles(toolPath, dest);
                console.log(`  ✓ Installed tool: ${toolName}/`);
                // Hash all files in the tool directory
                const toolFiles = await collectFileHashes(dest, path.join(TOOLS_DIR, toolName));
                managedTools.push(...toolFiles);
            }
        }
        if (!managedByExtension.has(extension.name)) {
            managedByExtension.set(extension.name, {});
        }
        if (managedTools.length > 0) {
            managedByExtension.get(extension.name).tools = managedTools;
        }
    }
    // 4. Install skills to project/.claude/skills/ (Claude Code only)
    for (const extension of extensionsToInstall) {
        const skills = await getExtensionSkills(extension);
        const managedSkills = [];
        for (const [skillName, skillPath] of skills) {
            if (await fs.pathExists(skillPath)) {
                const dest = path.join(repoRoot, SKILLS_DIR, skillName);
                await fs.copy(skillPath, dest, { overwrite: true });
                console.log(`  ✓ Installed skill: ${skillName}/`);
                const skillFiles = await collectFileHashes(dest, path.join(SKILLS_DIR, skillName));
                managedSkills.push(...skillFiles);
            }
        }
        if (!managedByExtension.has(extension.name)) {
            managedByExtension.set(extension.name, {});
        }
        if (managedSkills.length > 0) {
            managedByExtension.get(extension.name).skills = managedSkills;
        }
    }
    // 5. Install extension hooks to project .claude/settings.json
    const installedHooks = await installExtensionHooks(repoRoot, extensionsToInstall);
    // Store hook info in managed data
    for (const [extName, hookData] of Object.entries(installedHooks)) {
        if (!managedByExtension.has(extName)) {
            managedByExtension.set(extName, {});
        }
        managedByExtension.get(extName).hooks = hookData;
    }
    // 6. Generate .dev-pomogator/.claude-plugin/plugin.json (Claude Code plugin metadata)
    const pluginDir = path.join(repoRoot, '.dev-pomogator', '.claude-plugin');
    await fs.ensureDir(pluginDir);
    const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
    let packageVersion = '0.0.0';
    try {
        const pkg = await fs.readJson(packageJsonPath);
        packageVersion = pkg.version || '0.0.0';
    }
    catch {
        // fallback version if package.json not found
    }
    // Collect installed skills for plugin metadata
    const installedSkills = [];
    for (const ext of extensionsToInstall) {
        if (ext.skills) {
            for (const skillName of Object.keys(ext.skills)) {
                installedSkills.push({ name: skillName, path: `${SKILLS_DIR}/${skillName}` });
            }
        }
    }
    const pluginJsonContent = {
        name: 'dev-pomogator',
        version: packageVersion,
        description: `Installed extensions: ${extensionsToInstall.map(e => e.name).join(', ')}`,
    };
    if (installedSkills.length > 0) {
        pluginJsonContent.skills = installedSkills;
    }
    const pluginJsonPath = path.join(pluginDir, 'plugin.json');
    await fs.writeJson(pluginJsonPath, pluginJsonContent, { spaces: 2 });
    console.log('  ✓ Generated .dev-pomogator/.claude-plugin/plugin.json');
    // Track plugin.json in managed files (first extension's tools)
    const pluginJsonHash = await getFileHash(pluginJsonPath);
    if (pluginJsonHash && extensionsToInstall.length > 0) {
        const firstExtName = extensionsToInstall[0].name;
        if (!managedByExtension.has(firstExtName)) {
            managedByExtension.set(firstExtName, {});
        }
        const firstExtManaged = managedByExtension.get(firstExtName);
        if (!firstExtManaged.tools)
            firstExtManaged.tools = [];
        firstExtManaged.tools.push({ path: '.dev-pomogator/.claude-plugin/plugin.json', hash: pluginJsonHash });
    }
    // 7. Setup global scripts (before post-install hooks — context-menu needs launch-claude-tui.ps1)
    const distDir = path.resolve(__dirname, '..');
    await setupGlobalScripts(distDir);
    // 8. Run post-install hooks for extensions that have them
    // Proactively clean stale npm temp dirs BEFORE hooks run to prevent ENOTEMPTY errors
    cleanStaleNodeModulesDirs(repoRoot);
    for (const extension of extensionsToInstall) {
        if (extension.postInstall) {
            await runPostInstallHook(extension, repoRoot, 'claude', options.executedSharedHooks);
        }
    }
    // 9. Always persist managed data for tracking
    await addProjectPaths(repoRoot, extensionsToInstall, 'claude', managedByExtension);
    // 10. Setup auto-update hooks and statusLine if enabled
    if (options.autoUpdate !== false) {
        await setupClaudeHooks();
        await setupClaudeStatusLine(extensionsToInstall);
    }
    // 11. Check for MSYS path mangling artifacts
    const mangledArtifacts = detectMangledArtifacts(repoRoot);
    if (mangledArtifacts.length > 0) {
        console.log(chalk.yellow('\n  ⚠  MSYS path mangling detected in project root!'));
        console.log(chalk.yellow('  Found directories that look like MSYS-mangled Unix paths:'));
        for (const artifact of mangledArtifacts) {
            console.log(chalk.yellow(`     ${artifact}/Program Files/Git/...`));
        }
        console.log(chalk.yellow('  This happens when Unix paths (e.g. /home/user) are passed through Git Bash on Windows.'));
        console.log(chalk.yellow('  Fix: add MSYS_NO_PATHCONV=1 to your environment or devcontainer config.'));
        console.log(chalk.yellow('  These directories can be safely deleted.\n'));
    }
}
/**
 * Setup Claude Code hooks for update version check
 * Hooks are stored in ~/.claude/settings.json
 *
 * SessionStart --check-only: warns if update available (no auto-apply)
 */
async function setupClaudeHooks() {
    const homeDir = os.homedir();
    const settingsPath = path.join(homeDir, '.claude', 'settings.json');
    // Load existing settings with backup recovery
    const settings = await readJsonSafe(settingsPath, {});
    // Ensure hooks structure exists
    if (!settings.hooks) {
        settings.hooks = {};
    }
    const hooksObj = settings.hooks;
    // --- Cleanup: remove old Stop auto-update hooks (migration) ---
    if (hooksObj.Stop) {
        const stopHooks = hooksObj.Stop;
        hooksObj.Stop = stopHooks.filter((h) => !h.hooks?.some((hook) => hook.command?.includes('check-update.js')));
        // Remove empty Stop array
        if (hooksObj.Stop.length === 0) {
            delete hooksObj.Stop;
        }
    }
    // --- SessionStart: check-only version warning ---
    const checkOnlyCommand = makePortableScriptCommand('check-update.js', '--claude --check-only');
    if (!hooksObj.SessionStart) {
        hooksObj.SessionStart = [];
    }
    // Remove old check-update hooks from SessionStart (idempotent reinstall)
    const sessionStartHooks = hooksObj.SessionStart;
    hooksObj.SessionStart = sessionStartHooks.filter((h) => !h.hooks?.some((hook) => hook.command?.includes('check-update.js')));
    // Add check-only hook
    hooksObj.SessionStart.push({
        hooks: [{
                type: 'command',
                command: checkOnlyCommand,
                timeout: 15000,
            }],
    });
    // Write settings atomically (backup + temp + move)
    await writeJsonAtomic(settingsPath, settings);
    console.log('  ✓ Installed SessionStart version check hook');
}
/**
 * Setup statusLine in global ~/.claude/settings.json
 * Auto-installs ccstatusline wrapped with managed test-statusline render.
 * Preserves existing user statusLine (wraps it) or updates existing wrapper.
 */
async function setupClaudeStatusLine(extensions) {
    for (const ext of extensions) {
        const statusLineConfig = getExtensionStatusLine(ext, 'claude');
        if (!statusLineConfig)
            continue;
        await writeGlobalStatusLine(statusLineConfig);
        console.log(`  ✓ Installed statusLine to global settings (${ext.name})`);
        break; // Only one statusLine allowed
    }
}
/**
 * Install extension hooks to project .claude/settings.json
 * Returns map of extension name -> { hookName: commands[] } for managed tracking
 */
async function installExtensionHooks(repoRoot, extensions) {
    const settingsPath = path.join(repoRoot, '.claude', 'settings.json');
    const installedHooksByExtension = {};
    // Collect all hooks from extensions
    const allHooks = {};
    for (const ext of extensions) {
        const hooks = getExtensionHooks(ext, 'claude');
        for (const [hookName, rawHook] of Object.entries(hooks)) {
            // Hook can be a string or { matcher, command, timeout } object
            const rawCommand = typeof rawHook === 'string' ? rawHook : rawHook.command;
            const matcher = typeof rawHook === 'string' ? '' : (rawHook.matcher ?? '');
            const defaultTimeout = hookName === 'SessionStart' ? 120 : 60;
            const timeout = typeof rawHook === 'string' ? defaultTimeout : (rawHook.timeout ?? defaultTimeout);
            // Replace relative paths with absolute paths so hooks work from any CWD
            // Then replace npx tsx with resilient tsx-runner wrapper
            const command = replaceNpxTsxWithPortable(resolveHookToolPaths(rawCommand, repoRoot));
            if (!allHooks[hookName]) {
                allHooks[hookName] = [];
            }
            // Check if this hook command already exists
            const exists = allHooks[hookName].some(h => h.command === command);
            if (!exists) {
                allHooks[hookName].push({
                    type: 'command',
                    command,
                    timeout,
                    matcher,
                });
            }
            // Track per-extension hooks for managed data
            if (!installedHooksByExtension[ext.name]) {
                installedHooksByExtension[ext.name] = {};
            }
            if (!installedHooksByExtension[ext.name][hookName]) {
                installedHooksByExtension[ext.name][hookName] = [];
            }
            installedHooksByExtension[ext.name][hookName].push(command);
        }
    }
    // No hooks to install
    if (Object.keys(allHooks).length === 0) {
        return installedHooksByExtension;
    }
    // Load existing project settings with backup recovery
    const settings = await readJsonSafe(settingsPath, {});
    // Ensure hooks structure exists
    if (!settings.hooks) {
        settings.hooks = {};
    }
    const existingHooks = settings.hooks;
    // Clean previous managed hooks to prevent duplicates on re-install
    // Our hooks always contain '.dev-pomogator/tools/' — user hooks never do
    for (const hookName of Object.keys(existingHooks)) {
        const arr = existingHooks[hookName];
        existingHooks[hookName] = arr.filter(entry => !entry.hooks?.some(h => h.command.includes('.dev-pomogator/tools/')));
    }
    // Merge new hooks
    for (const [hookName, hookEntries] of Object.entries(allHooks)) {
        if (!existingHooks[hookName]) {
            existingHooks[hookName] = [];
        }
        const hookArray = existingHooks[hookName];
        for (const hookEntry of hookEntries) {
            // Check if hook command already exists
            const commandExists = hookArray.some(h => h.hooks?.some(hook => hook.command === hookEntry.command));
            if (!commandExists) {
                hookArray.push({
                    matcher: hookEntry.matcher,
                    hooks: [{
                            type: hookEntry.type,
                            command: hookEntry.command,
                            timeout: hookEntry.timeout,
                        }],
                });
            }
        }
    }
    // Inject envRequirements defaults into settings.env
    // Extensions with hooks may need env vars to function (e.g. AUTO_COMMIT_API_KEY)
    const envSection = (settings.env ?? {});
    const missingRequired = [];
    for (const ext of extensions) {
        if (!ext.envRequirements || !getExtensionHooks(ext, 'claude') || Object.keys(getExtensionHooks(ext, 'claude')).length === 0)
            continue;
        for (const req of ext.envRequirements) {
            if (envSection[req.name] !== undefined)
                continue; // already set, don't touch
            if (req.default) {
                // Optional var with default — inject it
                envSection[req.name] = req.default;
            }
            else if (req.required) {
                // Required var without value — warn user
                missingRequired.push({ extName: ext.name, varName: req.name, description: req.description });
            }
        }
    }
    if (Object.keys(envSection).length > 0) {
        settings.env = envSection;
    }
    // Migrate: remove project-level statusLine (now installed globally via setupClaudeStatusLine)
    if (settings.statusLine) {
        delete settings.statusLine;
    }
    // Write settings atomically (backup + temp + move)
    await writeJsonAtomic(settingsPath, settings);
    const hookCount = Object.values(allHooks).flat().length;
    if (hookCount > 0) {
        console.log(`  ✓ Installed ${hookCount} extension hook(s)`);
    }
    // Warn about missing required env vars
    if (missingRequired.length > 0) {
        console.log(chalk.yellow('\n  ⚠  Настройте env переменные в .claude/settings.json → "env":'));
        for (const m of missingRequired) {
            console.log(chalk.yellow(`     ${m.varName}  — ${m.description} (${m.extName})`));
        }
        console.log('');
    }
    return installedHooksByExtension;
}
//# sourceMappingURL=claude.js.map