#!/usr/bin/env npx tsx
/**
 * CLI wrapper для variant-matrix audit — выдаёт JSON findings на stdout.
 * Used by specs-generator-core.mjs (которая запускается через node)
 * чтобы обойти .ts import limit в .mjs runtime.
 */

import { checkVariantCoverage } from './audit.ts';

const specPath = process.argv[2];
if (!specPath) {
  console.error('Usage: variant-matrix-cli.ts <spec-path>');
  process.exit(2);
}

try {
  const findings = checkVariantCoverage(specPath);
  process.stdout.write(JSON.stringify({ findings }));
  process.exit(0);
} catch (err) {
  process.stderr.write(`variant-matrix-cli error: ${(err as Error).message}\n`);
  process.exit(1);
}
