#!/usr/bin/env node
/**
 * Doctor fix-action: apply the NATIVE statusLine (ccstatusline) to
 * ~/.claude/settings.json IMMEDIATELY in the current session (FR-7, US3).
 *
 * Unlike the SessionStart hook, this is an EXPLICIT user action (invoked from
 * /pomogator-doctor on confirmation), so it ignores the DEV_POMOGATOR_STATUSLINE
 * opt-out gate — the user is choosing to apply now. Still idempotent and never
 * overwrites a user's custom statusLine (reconciler keep-user).
 *
 * Prints the WriteResult as JSON. Exit 0 always (fail-open).
 */

import { writeCcstatuslineWidgets } from './ccstatusline-widgets.ts';
import { writeNativeStatusLine } from './reconcile-statusline.ts';

function main(): void {
  try {
    const result = writeNativeStatusLine();
    // Repair path (FR-11): explicit user action — also enrich a stock-shaped
    // ccstatusline widget config that lacks repo/cwd. Custom layouts untouched.
    const widgets = writeCcstatuslineWidgets({ enrichExisting: true });
    process.stdout.write(`${JSON.stringify({ ...result, widgets })}\n`);
  } catch (err) {
    process.stderr.write(`[native-statusline] apply error: ${err}\n`);
    process.stdout.write(`${JSON.stringify({ changed: false, action: 'keep-user' })}\n`);
  }
}

const isDirectRun =
  process.argv[1]?.endsWith('apply-statusline.ts') ||
  process.argv[1]?.endsWith('apply-statusline.js');
if (isDirectRun) {
  main();
}

export { main };
