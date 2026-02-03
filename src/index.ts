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
dev-pomogator - Team coding standards for Cursor and Claude Code

Usage:
  npx dev-pomogator                                    Interactive (choose platform + plugins)
  npx dev-pomogator --cursor                           Cursor + choose plugins interactively
  npx dev-pomogator --claude                           Claude Code + choose plugins interactively
  npx dev-pomogator --cursor --plugins=suggest-rules   Non-interactive (specific plugins only)
  npx dev-pomogator --cursor --all                     Non-interactive (all plugins)
  npx dev-pomogator --status                           Show current configuration
  npx dev-pomogator --update                           Check for updates

Options:
  -v, --version              Show version
  -h, --help                 Show this help
  --cursor                   Install for Cursor
  --claude                   Install for Claude Code
  --plugins=name1,name2      Install only specified plugins (non-interactive)
  --all                      Install all plugins (non-interactive)
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
  
  // Parse platform flags
  const hasCursor = args.includes('--cursor');
  const hasClaude = args.includes('--claude');
  
  if (hasCursor || hasClaude) {
    const platforms: ('cursor' | 'claude')[] = [];
    if (hasCursor) platforms.push('cursor');
    if (hasClaude) platforms.push('claude');
    
    // Parse --plugins flag
    const pluginsArg = args.find((a) => a.startsWith('--plugins='));
    const hasAllFlag = args.includes('--all');
    
    if (pluginsArg) {
      // Fully non-interactive: specific plugins
      const selectedPlugins = pluginsArg.replace('--plugins=', '').split(',').filter(Boolean);
      await runNonInteractiveInstaller(platforms, { plugins: selectedPlugins });
    } else if (hasAllFlag) {
      // Fully non-interactive: all plugins
      await runNonInteractiveInstaller(platforms, { plugins: undefined });
    } else {
      // Semi-interactive: platform is set, but choose plugins
      await runSemiInteractiveInstaller(platforms);
    }
    process.exit(0);
  }
  
  // Default: run fully interactive installer (choose platform + plugins)
  await runInstaller();
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
