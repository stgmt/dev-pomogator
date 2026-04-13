#!/usr/bin/env node
/**
 * tsx-runner-bootstrap.cjs — Fail-soft wrapper for dev-pomogator hook commands.
 *
 * Hook commands load this file via `node -e "require('<path>/tsx-runner-bootstrap.cjs')"`.
 * This wrapper exists to gracefully handle the case where `tsx-runner.js` has been
 * deleted after install (antivirus, Claude Code v2.1.83 updater incident 2026-03-25,
 * Windows Storage Sense, or manual cleanup).
 *
 * Behavior:
 *   - If `~/.dev-pomogator/scripts/tsx-runner.js` exists → require it (same as before)
 *   - If missing → write ONE-LINE diagnostic to stderr, exit 0 (silent no-op)
 *   - If runner exists but child script fails → propagate non-zero exit code
 *   - If runner has syntax error → re-throw (bubbles up)
 *
 * This prevents every Claude Code hook event from producing a MODULE_NOT_FOUND
 * error that blocks the entire session. Hooks become best-effort.
 *
 * See .specs/personal-pomogator/ FR-6.
 */

'use strict';

const path = require('path');
const os = require('os');

const runnerPath = path.join(os.homedir(), '.dev-pomogator', 'scripts', 'tsx-runner.js');

try {
  require(runnerPath);
} catch (e) {
  // Distinguish "runner file missing" from "runner loaded but child dep missing".
  // Use requireStack (structured) when available — empty stack means the failure
  // happened on THIS require call, not a transitive dep deeper in the chain.
  // Fall back to message check with normalized paths (Windows backslash safety).
  const code = e && e.code;
  const stack = e && e.requireStack;
  const stackEmpty = Array.isArray(stack) && stack.length === 0;
  const stackPointsToBootstrap = Array.isArray(stack) && stack.length > 0 &&
    path.normalize(stack[0]) === path.normalize(__filename);
  const message = (e && e.message) || '';
  const messageNamesRunner =
    message.indexOf(runnerPath) !== -1 ||
    message.indexOf(runnerPath.replace(/\\/g, '/')) !== -1;

  const runnerMissingFromThisFile =
    code === 'MODULE_NOT_FOUND' &&
    (stackEmpty || stackPointsToBootstrap || messageNamesRunner);

  if (runnerMissingFromThisFile) {
    // Fail-soft: runner is gone. Hooks become no-ops to avoid blocking the session.
    process.stderr.write(
      `[dev-pomogator] tsx-runner.js missing (${runnerPath}) — hook no-op. ` +
      `Run 'npx dev-pomogator install --claude' to restore.\n`
    );
    process.exit(0);
  }

  // Runner exists but failed to load, or child script errored — propagate.
  throw e;
}
