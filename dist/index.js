import { runInstaller, runNonInteractiveInstaller, runSemiInteractiveInstaller } from './installer/index.js';
async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--version') || args.includes('-v')) {
        const pkg = await import('../package.json', { assert: { type: 'json' } });
        console.log(pkg.default.version);
        process.exit(0);
    }
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
dev-pomogator - Team coding standards for Claude Code

Usage:
  npx dev-pomogator                                    Interactive (choose plugins)
  npx dev-pomogator --claude                           Choose plugins interactively
  npx dev-pomogator --claude --plugins=suggest-rules   Non-interactive (specific plugins only)
  npx dev-pomogator --claude --all                     Non-interactive (all plugins)
  npx dev-pomogator --status                           Show current configuration
  npx dev-pomogator --update                           Check for updates
  npx dev-pomogator uninstall --project [--dry-run]    Per-project uninstall (personal-pomogator FR-8)

Options:
  -v, --version              Show version
  -h, --help                 Show this help
  --claude                   Install for Claude Code
  --plugins=name1,name2      Install only specified plugins (non-interactive)
  --all                      Install all plugins (non-interactive)
  --include-beta             Include beta plugins with --all
  --status                   Show configuration status
  --update                   Check for updates now

Available plugins:
  suggest-rules           Analyze session and suggest rules for IDE
  specs-workflow          Specs management with 3-phase workflow
  plan-pomogator          Plan format, template, and validator
  forbid-root-artifacts   Control files allowed in repository root
`);
        process.exit(0);
    }
    if (args.includes('--cursor')) {
        console.error('Cursor support has been removed. Use --claude.');
        process.exit(1);
    }
    if (args.includes('--status')) {
        const { showStatus } = await import('./installer/status.js');
        await showStatus();
        process.exit(0);
    }
    if (args.includes('--update')) {
        const { checkUpdate } = await import('./updater/index.js');
        await checkUpdate({ force: true });
        process.exit(0);
    }
    if (args.includes('--doctor')) {
        const { runDoctor, LockHeldError } = await import('./doctor/index.js');
        const { formatChalk, formatJson, buildHookOutput, exitCodeFor } = await import('./doctor/reporter.js');
        const { maybeOfferReinstall } = await import('./doctor/reinstall.js');
        const json = args.includes('--json');
        const quiet = args.includes('--quiet');
        const extensionArg = args.find((a) => a.startsWith('--extension='));
        const extension = extensionArg ? extensionArg.replace('--extension=', '') : undefined;
        try {
            const report = await runDoctor({
                interactive: !json && !quiet,
                json,
                quiet,
                extension,
            });
            if (quiet) {
                process.stdout.write(JSON.stringify(buildHookOutput(report)) + '\n');
                process.exit(0);
            }
            if (json) {
                process.stdout.write(formatJson(report) + '\n');
                process.exit(exitCodeFor(report));
            }
            console.log(formatChalk(report));
            if (report.reinstallableIssues.length > 0) {
                await maybeOfferReinstall(report);
            }
            process.exit(exitCodeFor(report));
        }
        catch (err) {
            if (err instanceof LockHeldError) {
                console.error(err.message);
                process.exit(2);
            }
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`doctor failed: ${msg}`);
            process.exit(2);
        }
    }
    // Personal-pomogator FR-8: per-project uninstall command
    // Usage: npx dev-pomogator uninstall --project [--dry-run]
    // Accept any arg position for `uninstall` token (less brittle than args[0] check).
    if (args.includes('uninstall') && args.includes('--project')) {
        const { uninstallFromProject } = await import('./installer/uninstall-project.js');
        const { findRepoRoot } = await import('./utils/repo.js');
        const repoRoot = findRepoRoot();
        const dryRun = args.includes('--dry-run');
        console.log(`Uninstalling dev-pomogator from project: ${repoRoot}`);
        if (dryRun)
            console.log('(dry run — no files will be deleted)');
        try {
            const report = await uninstallFromProject(repoRoot, { dryRun });
            console.log(`\n=== Uninstall Report ===`);
            console.log(`Deleted files: ${report.deletedFiles.length}`);
            if (report.skippedFiles.length > 0) {
                console.log(`Skipped files (path traversal guard): ${report.skippedFiles.length}`);
            }
            console.log(`Gitignore block removed: ${report.gitignoreBlockRemoved}`);
            console.log(`settings.local.json cleaned: ${report.settingsLocalCleaned}`);
            console.log(`Config updated: ${report.configUpdated}`);
            if (report.errors.length > 0) {
                console.error(`\n⚠  Errors (${report.errors.length}):`);
                for (const err of report.errors)
                    console.error(`  - ${err}`);
                process.exit(1);
            }
            process.exit(0);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`Uninstall failed: ${msg}`);
            process.exit(1);
        }
    }
    const hasClaude = args.includes('--claude');
    if (hasClaude) {
        const pluginsArg = args.find((a) => a.startsWith('--plugins='));
        const hasAllFlag = args.includes('--all');
        if (pluginsArg) {
            const selectedPlugins = pluginsArg.replace('--plugins=', '').split(',').filter(Boolean);
            await runNonInteractiveInstaller({ plugins: selectedPlugins });
        }
        else if (hasAllFlag) {
            const includeBeta = args.includes('--include-beta');
            await runNonInteractiveInstaller({ plugins: undefined, includeBeta });
        }
        else {
            await runSemiInteractiveInstaller();
        }
        process.exit(0);
    }
    // Default: run fully interactive installer
    await runInstaller();
}
main().catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
});
//# sourceMappingURL=index.js.map