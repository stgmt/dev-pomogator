import { open, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { renderHttpManifest } from './registry.mjs';

const pluginRoot = process.argv[2] || process.cwd();
const rendered = await renderHttpManifest(pluginRoot);
const legacy = JSON.parse(await readFile(join(pluginRoot, '.claude-plugin', 'hooks.legacy.json'), 'utf8'));
const hooks = {
  SessionStart: [{hooks:[{
    type:'command',
    command:'node "${CLAUDE_PLUGIN_ROOT:-${CLAUDE_PROJECT_DIR:-.}}/tools/hook-service/session-bootstrap.mjs"',
    timeout:120,
  }]}],
  ...Object.fromEntries(Object.entries(rendered.hooks).filter(([event]) => event !== 'SessionStart')),
};

async function atomicWrite(path, content) {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

// Keep the read as an explicit assertion that the parity oracle is valid JSON and present.
if (!legacy.hooks?.SessionStart) throw new Error('legacy SessionStart hooks are missing');
const content = `${JSON.stringify({hooks}, null, 2)}\n`;
await Promise.all([
  atomicWrite(join(pluginRoot, '.claude-plugin', 'hooks.json'), content),
  atomicWrite(join(pluginRoot, '.claude', 'settings.json'), content),
]);
