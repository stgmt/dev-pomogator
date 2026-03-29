#!/usr/bin/env npx tsx
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corePath = path.join(__dirname, 'specs-generator-core.mjs');

try {
  execFileSync('node', [corePath, 'scaffold-spec', ...process.argv.slice(2)], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
} catch (err: any) {
  process.exit(err.status ?? 1);
}
