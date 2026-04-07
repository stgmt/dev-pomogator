#!/usr/bin/env node
/**
 * PreToolUse Hook — Build Guard
 * FR-1: Blocks test commands when build is stale
 * FR-6: Deny message with fix command
 * FR-7: SKIP_BUILD_CHECK bypass
 *
 * Exit codes:
 *   0 — allow (pass-through)
 *   2 — deny (blocked, build stale)
 *
 * Fail-open: any error → exit(0)
 */

import { checkStaleness } from './build-staleness.ts';

interface PreToolUseInput {
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: {
    command?: string;
    [key: string]: unknown;
  };
}

/** Patterns that indicate a test command we should check */
const TEST_PATTERNS = [
  /test_runner_wrapper/,
  /docker-test\.sh/,
];

/** Extract --framework value from command string */
function extractFramework(command: string): string {
  const match = command.match(/--framework\s+(\w+)/);
  return match ? match[1] : 'vitest'; // default to vitest for this project
}

/** Detect if command is Docker test (docker-test.sh) */
function isDockerCommand(command: string): boolean {
  return /docker-test\.sh/.test(command);
}

function buildDenyMessage(reason: string, fixCommand?: string): string {
  const lines = [
    `🔨 Build Guard: ${reason}`,
    '',
  ];
  if (fixCommand) {
    lines.push(`Fix: ${fixCommand}`);
    lines.push('');
  }
  lines.push('Bypass: set SKIP_BUILD_CHECK=1 to skip this check');
  return lines.join('\n');
}

async function main(): Promise<void> {
  // TTY = interactive terminal, not a hook invocation
  if (process.stdin.isTTY) {
    process.exit(0);
  }

  let inputData = '';
  for await (const chunk of process.stdin) {
    inputData += chunk.toString();
  }

  if (!inputData.trim()) {
    process.exit(0);
  }

  const data: PreToolUseInput = JSON.parse(inputData);

  // Only guard Bash tool
  if (data.tool_name !== 'Bash') {
    process.exit(0);
  }

  const command = data.tool_input?.command;
  if (!command) {
    process.exit(0);
  }

  // Check if this is a test command we care about
  const isTestCommand = TEST_PATTERNS.some(p => p.test(command));
  if (!isTestCommand) {
    process.exit(0);
  }

  // FR-7: SKIP_BUILD_CHECK bypass
  if (process.env.SKIP_BUILD_CHECK === '1') {
    process.stderr.write('[build-guard] Build check skipped — results may be unreliable\n');
    process.exit(0);
  }

  // Determine framework
  const framework = isDockerCommand(command) ? 'docker' : extractFramework(command);
  const cwd = data.cwd || process.cwd();

  // Check staleness
  const result = checkStaleness(framework, command, cwd);

  if (result.stale) {
    const denyMessage = buildDenyMessage(result.reason!, result.fixCommand);
    const output = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `[build-guard] ${denyMessage}`,
      },
    };
    process.stdout.write(JSON.stringify(output));
    process.exit(2);
  }

  // Build is fresh — allow
  process.exit(0);
}

// Fail-open wrapper
main().catch(() => {
  process.exit(0);
});
