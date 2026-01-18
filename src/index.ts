import { runInstaller } from './installer/index.js';

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
  npx dev-pomogator --status Show current configuration
  npx dev-pomogator --update Check for updates

Options:
  -v, --version    Show version
  -h, --help       Show this help
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
  
  // Default: run interactive installer
  await runInstaller();
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
