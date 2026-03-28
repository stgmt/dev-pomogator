import { runInstaller, runNonInteractiveInstaller, runSemiInteractiveInstaller } from './installer/index.js';

async function main(): Promise<void> {
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

  const hasClaude = args.includes('--claude');

  if (hasClaude) {
    const pluginsArg = args.find((a) => a.startsWith('--plugins='));
    const hasAllFlag = args.includes('--all');

    if (pluginsArg) {
      const selectedPlugins = pluginsArg.replace('--plugins=', '').split(',').filter(Boolean);
      await runNonInteractiveInstaller({ plugins: selectedPlugins });
    } else if (hasAllFlag) {
      const includeBeta = args.includes('--include-beta');
      await runNonInteractiveInstaller({ plugins: undefined, includeBeta });
    } else {
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
