import { runInstaller, runNonInteractiveInstaller } from './installer/index.js';

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
  npx dev-pomogator                                    Interactive installation
  npx dev-pomogator --cursor                           Install for Cursor (all plugins)
  npx dev-pomogator --claude                           Install for Claude Code (all plugins)
  npx dev-pomogator --cursor --plugins=suggest-rules   Install specific plugins only
  npx dev-pomogator --status                           Show current configuration
  npx dev-pomogator --update                           Check for updates

Options:
  -v, --version              Show version
  -h, --help                 Show this help
  --cursor                   Install for Cursor (non-interactive)
  --claude                   Install for Claude Code (non-interactive)
  --plugins=name1,name2      Install only specified plugins (comma-separated)
  --status                   Show configuration status
  --update                   Check for updates now

Available plugins:
  suggest-rules    Analyze session and suggest rules for IDE
  specs-workflow   Specs management with 3-phase workflow
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
  
  // Non-interactive mode
  const hasCursor = args.includes('--cursor');
  const hasClaude = args.includes('--claude');
  
  if (hasCursor || hasClaude) {
    const platforms: ('cursor' | 'claude')[] = [];
    if (hasCursor) platforms.push('cursor');
    if (hasClaude) platforms.push('claude');
    
    // Parse --plugins flag
    const pluginsArg = args.find((a) => a.startsWith('--plugins='));
    const selectedPlugins = pluginsArg
      ? pluginsArg.replace('--plugins=', '').split(',').filter(Boolean)
      : undefined; // undefined = all plugins
    
    await runNonInteractiveInstaller(platforms, { plugins: selectedPlugins });
    process.exit(0);
  }
  
  // Default: run interactive installer
  await runInstaller();
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
