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
  npx dev-pomogator          Interactive installation
  npx dev-pomogator --cursor Non-interactive Cursor installation
  npx dev-pomogator --claude Non-interactive Claude Code installation
  npx dev-pomogator --status Show current configuration
  npx dev-pomogator --update Check for updates

Options:
  -v, --version    Show version
  -h, --help       Show this help
  --cursor         Install for Cursor (non-interactive)
  --claude         Install for Claude Code (non-interactive)
  --status         Show configuration status
  --update         Check for updates now
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
    await runNonInteractiveInstaller(platforms);
    process.exit(0);
  }
  
  // Default: run interactive installer
  await runInstaller();
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
