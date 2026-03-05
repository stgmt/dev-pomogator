#!/usr/bin/env npx tsx
/**
 * Audit Runner — CLI entry point for TypeScript audit checks.
 *
 * Usage: npx tsx audit-runner.ts <spec-path>
 * Output: JSON with findings array
 */

import path from 'path';
import { runAllChecks } from './audit-checks';

function main(): void {
  const specPath = process.argv[2];
  if (!specPath) {
    console.error('Usage: npx tsx audit-runner.ts <spec-path>');
    process.exit(1);
  }

  const resolved = path.resolve(specPath);

  try {
    const findings = runAllChecks(resolved);

    const summary: Record<string, number> = {
      ERROR: 0,
      WARNING: 0,
      INFO: 0,
    };
    for (const f of findings) {
      summary[f.severity] = (summary[f.severity] || 0) + 1;
    }

    const output = {
      path: specPath,
      timestamp: new Date().toISOString(),
      summary,
      total: findings.length,
      findings,
    };

    console.log(JSON.stringify(output, null, 2));
  } catch (e) {
    console.error(`[audit-runner] Error: ${e}`);
    process.exit(1);
  }
}

main();
