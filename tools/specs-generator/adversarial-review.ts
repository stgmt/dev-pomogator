#!/usr/bin/env npx tsx
/**
 * Thin CLI wrapper for the Independent Adversarial Review gate (GitHub #153).
 * Delegates to `specs-generator-core.mjs adversarial-review`, mirroring the
 * spec-status.ts shim so the engine stays the single writer/evaluator.
 *
 * Usage:
 *   adversarial-review.ts evaluate -Path ".specs/<slug>" [-Format json|human]
 *   adversarial-review.ts require  -Path ".specs/<slug>"
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corePath = path.join(__dirname, 'specs-generator-core.mjs');

try {
  execFileSync(process.execPath, [corePath, 'adversarial-review', ...process.argv.slice(2)], {
    stdio: ['ignore', 'inherit', 'inherit'],
    cwd: process.cwd(),
  });
} catch (err: unknown) {
  const status = (err as { status?: number }).status;
  process.exit(typeof status === 'number' ? status : 1);
}
