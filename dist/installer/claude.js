import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { listExtensions, getExtensionFiles, getExtensionRules, getExtensionTools, getExtensionSkills, getExtensionHooks, getExtensionStatusLine, runPostInstallHook, cleanStaleNodeModulesDirs, getExtensionsDir } from './extensions.js';
import { getManagedPaths } from '../config/schema.js';
import { findRepoRoot } from '../utils/repo.js';
import { detectMangledArtifacts } from '../utils/msys.js';
import { TOOLS_DIR, SKILLS_DIR } from '../constants.js';
import { getFileHash } from '../updater/content-hash.js';
import { collectFileHashes, addProjectPaths, makePortableScriptCommand, resolveHookToolPaths, replaceNpxTsxWithPortable, ensureExecutableShellScripts, setupGlobalScripts, removeOrphanedFiles, isDevPomogatorCommand } from './shared.js';
import { writePluginJson } from './plugin-json.js';
import { writeJsonAtomic, readJsonSafe } from '../utils/atomic-json.js';
import { writeGlobalStatusLine } from '../utils/statusline.js';
import { isDevPomogatorRepo } from './self-guard.js';
import { writeManagedGitignoreBlock, collapseToDirectoryEntries } from './gitignore.js';
import { migrateLegacySettingsJson, writeHooksToSettingsLocal } from './settings-local.js';
import { detectGitTrackedCollisions } from './collisions.js';
import { checkMcpJsonForSecrets, printSecretWarnings } from './mcp-security.js';
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
    // Personal-pomogator FR-7: collision detection via git ls-files.
    // Collect all candidate paths for commands+rules+skills BEFORE copy loops,
    // then batch-query git to find any that are already tracked (user-authored).
    // Skip those: don't overwrite, don't add to gitignore block, emit WARN.
    // Tools go to `.dev-pomogator/tools/` namespace — collision-free by design.
    const candidatePaths = [];
    for (const extension of extensionsToInstall) {
        // Commands: .claude/commands/{cmd}.md
        const cmdFiles = getExtensionFiles(extension, 'claude', repoRoot);
        for (const srcFile of cmdFiles) {
            if (srcFile.endsWith('.md')) {
                candidatePaths.push(`.claude/commands/${path.basename(srcFile)}`);
            }
        }
        // Rules: .claude/rules/{subfolder}/{rule}.md
        const ruleFiles = getExtensionRules(extension, 'claude', repoRoot);
        const subfolder = extension.ruleFiles?.claude?.[0]
            ? path.basename(path.dirname(extension.ruleFiles.claude[0]))
            : extension.name;
        for (const ruleFile of ruleFiles) {
            candidatePaths.push(`.claude/rules/${subfolder}/${path.basename(ruleFile)}`);
        }
        // Skills: .claude/skills/{skill-name}/** — check the root dir (SKILL.md is the key file)
        const skills = getExtensionSkills(extension, repoRoot);
        for (const [skillName, _skillPath] of skills) {
            candidatePaths.push(`.claude/skills/${skillName}/SKILL.md`);
        }
    }
    const collisions = await detectGitTrackedCollisions(repoRoot, candidatePaths);
    if (collisions.size > 0) {
        console.log(chalk.yellow(`  ⚠  Found ${collisions.size} collision(s) with user-tracked files:`));
        for (const p of collisions) {
            console.log(chalk.yellow(`     COLLISION: ${p} — skipped (user-tracked in git)`));
        }
    }
    // 1. Install commands to .claude/commands/ (in project directory)
    const commandsDir = path.join(repoRoot, '.claude', 'commands');
    await fs.ensureDir(commandsDir);
    for (const extension of extensionsToInstall) {
        const files = getExtensionFiles(extension, 'claude', repoRoot);
        const managedCommands = [];
        for (const srcFile of files) {
            if (srcFile.endsWith('.md')) {
                const fileName = path.basename(srcFile);
                const relPath = `.claude/commands/${fileName}`;
                // FR-7: skip git-tracked user-authored files
                if (collisions.has(relPath)) {
                    continue;
                }
                const dest = path.join(commandsDir, fileName);
                if (path.resolve(srcFile) !== path.resolve(dest)) {
                    await fs.copy(srcFile, dest, { overwrite: true });
                }
                console.log(`  ✓ Installed command: ${fileName}`);
                const hash = await getFileHash(dest);
                if (hash) {
                    managedCommands.push({ path: relPath, hash });
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
    // 2. Install rules to .claude/rules/{ext-name}/ (per-extension namespace)
    for (const extension of extensionsToInstall) {
        const ruleFiles = getExtensionRules(extension, 'claude', repoRoot);
        if (ruleFiles.length === 0)
            continue;
        // Extract subfolder from ruleFiles path (e.g. .claude/rules/plan-pomogator/rule.md → plan-pomogator)
        const subfolder = extension.ruleFiles?.claude?.[0]
            ? path.basename(path.dirname(extension.ruleFiles.claude[0]))
            : extension.name;
        const rulesDir = path.join(repoRoot, '.claude', 'rules', subfolder);
        await fs.ensureDir(rulesDir);
        const managedRules = [];
        for (const ruleFile of ruleFiles) {
            if (await fs.pathExists(ruleFile)) {
                const fileName = path.basename(ruleFile);
                const relPath = `.claude/rules/${subfolder}/${fileName}`;
                // FR-7: skip git-tracked user-authored files
                if (collisions.has(relPath)) {
                    continue;
                }
                const dest = path.join(rulesDir, fileName);
                if (path.resolve(ruleFile) !== path.resolve(dest)) {
                    await fs.copy(ruleFile, dest, { overwrite: true });
                }
                console.log(`  ✓ Installed rule: ${fileName}`);
                const hash = await getFileHash(dest);
                if (hash) {
                    managedRules.push({ path: relPath, hash });
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
                if (path.resolve(toolPath) !== path.resolve(dest)) {
                    await fs.copy(toolPath, dest, { overwrite: true });
                }
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
    // 3b. Install _shared/ utilities to project/.dev-pomogator/tools/_shared/
    {
        const extensionsDir = await getExtensionsDir();
        const sharedSrc = path.join(extensionsDir, '_shared');
        if (await fs.pathExists(sharedSrc)) {
            const sharedDest = path.join(repoRoot, TOOLS_DIR, '_shared');
            if (path.resolve(sharedSrc) !== path.resolve(sharedDest)) {
                await fs.copy(sharedSrc, sharedDest, { overwrite: true });
            }
            console.log(`  ✓ Installed shared utilities: _shared/`);
        }
    }
    // 4. Install skills to project/.claude/skills/ (Claude Code only)
    for (const extension of extensionsToInstall) {
        const skills = getExtensionSkills(extension, repoRoot);
        const managedSkills = [];
        for (const [skillName, skillPath] of skills) {
            if (await fs.pathExists(skillPath)) {
                const skillMdRel = `.claude/skills/${skillName}/SKILL.md`;
                // FR-7: skip if user committed their own SKILL.md at this path
                if (collisions.has(skillMdRel)) {
                    continue;
                }
                const dest = path.join(repoRoot, SKILLS_DIR, skillName);
                if (path.resolve(skillPath) !== path.resolve(dest)) {
                    await fs.copy(skillPath, dest, { overwrite: true });
                }
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
    const pluginJsonPath = await writePluginJson({
        repoRoot,
        packageVersion,
        extensionNames: extensionsToInstall.map(e => e.name),
        skills: installedSkills,
    });
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
    // 9b. Personal-pomogator: write managed gitignore block + secret detection to target project.
    //     Skipped under self-guard (dogfooding — don't mutate dev-pomogator's own .gitignore).
    //     See .specs/personal-pomogator/ FR-1, FR-4, FR-10.
    const isDogfoodRepo = await isDevPomogatorRepo(repoRoot);
    if (!isDogfoodRepo) {
        // FR-10: scan project .mcp.json for plaintext secrets and warn user
        const secretFindings = await checkMcpJsonForSecrets(repoRoot);
        printSecretWarnings(secretFindings);
        // FR-1: write managed gitignore block
        const managedPaths = collectManagedPaths(managedByExtension);
        const collapsedPaths = collapseToDirectoryEntries(managedPaths);
        // settings.local.json is always the first entry per FR-1 AC-1
        const blockEntries = ['.claude/settings.local.json', ...collapsedPaths];
        await writeManagedGitignoreBlock(repoRoot, blockEntries);
    }
    else {
        console.log('  Detected dev-pomogator source repository — skipping personal-mode features');
    }
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
 * Install extension hooks to project settings file.
 *
 * Under self-guard false (normal target project): writes to `.claude/settings.local.json`
 * (personal-pomogator FR-2) and migrates any legacy entries from `.claude/settings.json`.
 * Team-shared hooks in `settings.json` (e.g. block-dotnet-test) are preserved.
 *
 * Under self-guard true (dev-pomogator source repo): writes to `.claude/settings.json`
 * as before (dogfooding — our own repo tracks its hooks in settings.json).
 *
 * Returns map of extension name -> { hookName: commands[] } for managed tracking.
 */
async function installExtensionHooks(repoRoot, extensions) {
    const isDogfood = await isDevPomogatorRepo(repoRoot);
    const settingsPath = path.join(repoRoot, '.claude', 'settings.json');
    const installedHooksByExtension = {};
    // Collect all hooks from extensions
    const allHooks = {};
    for (const ext of extensions) {
        const hooks = getExtensionHooks(ext, 'claude');
        for (const [hookName, rawHook] of Object.entries(hooks)) {
            // Hook can be: string, { matcher, command, timeout }, or array of { matcher?, hooks: [...] }
            const defaultTimeout = hookName === 'SessionStart' ? 120 : 60;
            // Flatten array-format hooks into individual entries
            const hookEntries = [];
            if (typeof rawHook === 'string') {
                hookEntries.push({ command: rawHook, matcher: '', timeout: defaultTimeout });
            }
            else if (Array.isArray(rawHook)) {
                // Array format: [{ matcher?, hooks: [{ type, command }] }]
                for (const group of rawHook) {
                    const groupMatcher = group.matcher ?? '';
                    const groupTimeout = group.timeout ?? defaultTimeout;
                    if (Array.isArray(group.hooks)) {
                        for (const h of group.hooks) {
                            if (h.command) {
                                hookEntries.push({ command: h.command, matcher: groupMatcher, timeout: h.timeout ?? groupTimeout });
                            }
                        }
                    }
                    else if (group.command) {
                        hookEntries.push({ command: group.command, matcher: groupMatcher, timeout: groupTimeout });
                    }
                }
            }
            else if (rawHook.command) {
                hookEntries.push({
                    command: rawHook.command,
                    matcher: Array.isArray(rawHook.matcher) ? rawHook.matcher.join('|') : (rawHook.matcher ?? ''),
                    timeout: rawHook.timeout ?? defaultTimeout,
                });
            }
            if (!allHooks[hookName]) {
                allHooks[hookName] = [];
            }
            for (const entry of hookEntries) {
                // Replace relative paths with absolute paths so hooks work from any CWD
                // Then replace npx tsx with resilient tsx-runner wrapper
                const command = replaceNpxTsxWithPortable(resolveHookToolPaths(entry.command, repoRoot));
                // Check if this hook command already exists
                const exists = allHooks[hookName].some(h => h.command === command);
                if (!exists) {
                    allHooks[hookName].push({
                        type: 'command',
                        command,
                        timeout: entry.timeout,
                        matcher: entry.matcher,
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
    }
    // No hooks to install
    if (Object.keys(allHooks).length === 0) {
        return installedHooksByExtension;
    }
    // Compute env section from extension envRequirements
    // (same logic for both dogfood and personal-mode paths)
    const envSection = {};
    const missingRequired = [];
    for (const ext of extensions) {
        if (!ext.envRequirements || !getExtensionHooks(ext, 'claude') || Object.keys(getExtensionHooks(ext, 'claude')).length === 0)
            continue;
        for (const req of ext.envRequirements) {
            if (req.default) {
                envSection[req.name] = req.default;
            }
            else if (req.required) {
                missingRequired.push({ extName: ext.name, varName: req.name, description: req.description });
            }
        }
    }
    if (!isDogfood) {
        // Personal-pomogator path (FR-2, FR-3): write hooks/env to .claude/settings.local.json
        // and migrate any legacy entries from .claude/settings.json.
        //
        // Legacy migration: remove our hooks from settings.json so team-shared file stays clean.
        // Uses authoritative ourHookCommands set (from current install) + substring fallback.
        const ourHookCommands = new Set();
        for (const hookEntries of Object.values(allHooks)) {
            for (const entry of hookEntries) {
                ourHookCommands.add(entry.command);
            }
        }
        const ourEnvKeys = new Set(Object.keys(envSection));
        const migrationResult = await migrateLegacySettingsJson(repoRoot, ourHookCommands, ourEnvKeys);
        if (migrationResult.movedHooks > 0 || migrationResult.movedEnvKeys > 0) {
            console.log(`  ✓ Migrated ${migrationResult.movedHooks} hook(s) and ${migrationResult.movedEnvKeys} env key(s) ` +
                `from .claude/settings.json → .claude/settings.local.json`);
        }
        await writeHooksToSettingsLocal(repoRoot, allHooks, envSection);
        const hookCount = Object.values(allHooks).flat().length;
        if (hookCount > 0) {
            console.log(`  ✓ Installed ${hookCount} extension hook(s) to .claude/settings.local.json`);
        }
        if (missingRequired.length > 0) {
            console.log(chalk.yellow('\n  ⚠  Настройте env переменные в .claude/settings.local.json → "env":'));
            for (const m of missingRequired) {
                console.log(chalk.yellow(`     ${m.varName}  — ${m.description} (${m.extName})`));
            }
            console.log('');
        }
        return installedHooksByExtension;
    }
    // Dogfood path: write to .claude/settings.json (dev-pomogator's own repo)
    // Load existing project settings with backup recovery
    const settings = await readJsonSafe(settingsPath, {});
    // Ensure hooks structure exists
    if (!settings.hooks) {
        settings.hooks = {};
    }
    const existingHooks = settings.hooks;
    // Clean previous managed hooks to prevent duplicates on re-install.
    // Uses shared isDevPomogatorCommand which also catches legacy tsx-runner.js
    // and current tsx-runner-bootstrap.cjs references — previously this branch
    // only matched `.dev-pomogator/tools/` and left orphaned wrapper hooks.
    for (const hookName of Object.keys(existingHooks)) {
        const arr = existingHooks[hookName];
        existingHooks[hookName] = arr.filter(entry => !entry.hooks?.some(h => h.command && isDevPomogatorCommand(h.command)));
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
    const mergedEnvSection = { ...(settings.env ?? {}), ...envSection };
    if (Object.keys(mergedEnvSection).length > 0) {
        settings.env = mergedEnvSection;
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
/**
 * Flatten `managedByExtension` map into a single list of managed file paths.
 *
 * Used by personal-pomogator FR-1 gitignore writer to generate the marker block.
 * Combines commands, rules, tools, and skills paths across all installed extensions.
 * Hooks are NOT included (they're config entries, not files — handled by FR-2 settings.local.json).
 */
function collectManagedPaths(managedByExtension) {
    const paths = new Set();
    for (const managed of managedByExtension.values()) {
        for (const p of getManagedPaths(managed.commands))
            paths.add(p);
        for (const p of getManagedPaths(managed.rules))
            paths.add(p);
        for (const p of getManagedPaths(managed.tools))
            paths.add(p);
        for (const p of getManagedPaths(managed.skills))
            paths.add(p);
    }
    return Array.from(paths);
}
//# sourceMappingURL=claude.js.map