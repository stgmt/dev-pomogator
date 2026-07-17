import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildRegistry } from './registry.mjs';

const pluginRoot = process.argv[2] || process.cwd();
const output = resolve(pluginRoot, 'tools', 'hook-service', 'registry.json');
const registry = await buildRegistry(pluginRoot);
await mkdir(dirname(output), {recursive:true});
await writeFile(output, `${JSON.stringify(registry, null, 2)}\n`);
