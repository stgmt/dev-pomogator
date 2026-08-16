#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const home = process.env.CODEX_HOME;
const json = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

if (args[0] !== 'plugin') process.exit(2);
if (args[1] === '--help') {
  process.stdout.write('Usage: codex plugin\n');
  process.exit(0);
}
if (args[1] === 'marketplace' && args[2] === 'add') {
  json({ marketplaceName: 'dev-pomogator-codex', installedRoot: home });
  process.exit(0);
}
if (args[1] === 'list' && args.includes('--available')) {
  json({ available: [{ pluginId: 'context-menu@dev-pomogator-codex', installed: false }] });
  process.exit(0);
}
if (args[1] === 'add') {
  const installedPath = path.join(home, 'plugins', 'context-menu');
  fs.mkdirSync(installedPath, { recursive: true });
  json({ pluginId: 'context-menu@dev-pomogator-codex', installedPath });
  process.exit(0);
}
if (args[1] === 'list') {
  json({ installed: [{ pluginId: 'context-menu@dev-pomogator-codex', installed: true, enabled: true }] });
  process.exit(0);
}
process.exit(2);
