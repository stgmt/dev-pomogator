#!/usr/bin/env node
/**
 * PreToolUse Hook — Test Guard
 * FR-12: Blocks direct test commands, requires /run-tests skill
 *
 * Exit codes:
 *   0 — allow (pass-through)
 *   2 — deny (blocked, use /run-tests instead)
 *
 * Fail-open: any error → exit(0)
 */

interface PreToolUseInput {
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: {
    command?: string;
    [key: string]: unknown;
  };
}

/** Patterns that indicate direct test commands */
const BLOCKED_PATTERNS = [
  /\bnpm\s+test\b/,
  /\bnpm\s+run\s+test\b/,
  /\bnpx\s+vitest\b/,
  /\bnpx\s+jest\b/,
  /\bpytest\b/,
  /\bpython\s+-m\s+pytest\b/,
  /\bdotnet\s+test\b/,
  /\bcargo\s+test\b/,
  /\bgo\s+test\b/,
];

/** Patterns that indicate the command is already wrapped (allow) */
const ALLOWED_PATTERNS = [
  /test_runner_wrapper/,
  /test:e2e:docker/,       // internal Docker test command
  /vitest.*--reporter/,    // vitest inside Docker (npm run test:e2e:docker)
];

function buildDenyMessage(blockedCommand: string): string {
  // Extract the matched test command for display
  let matched = blockedCommand.trim();
  if (matched.length > 80) matched = matched.substring(0, 80) + '...';

  return [
    `🚫 Direct test command blocked: "${matched}"`,
    '',
    'Use /run-tests instead — centralized test runner with statusline & TUI monitoring.',
    '',
    'Usage:',
    '  /run-tests              — auto-detect framework, run all tests',
    '  /run-tests auth         — run tests matching "auth" filter',
    '  /run-tests --framework vitest -- --watch  — explicit framework + extra args',
    '  /run-tests --docker     — run through Docker Compose',
    '',
    'Supported frameworks: vitest, jest, pytest, dotnet, rust (cargo), go',
    'Auto-detected from: vitest.config.ts, jest.config.js, pytest.ini, Cargo.toml, go.mod, *.csproj',
    '',
    'To bypass (not recommended): set TEST_GUARD_BYPASS=1',
  ].join('\n');
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

  // Bypass env var
  if (process.env.TEST_GUARD_BYPASS === '1') {
    process.exit(0);
  }

  // Check if already wrapped (allow)
  for (const pattern of ALLOWED_PATTERNS) {
    if (pattern.test(command)) {
      process.exit(0);
    }
  }

  // Check if direct test command (block)
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      const denyMessage = buildDenyMessage(command);

      const output = {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `[test-guard] ${denyMessage}`,
        },
      };

      process.stdout.write(JSON.stringify(output));
      process.exit(2);
    }
  }

  // Not a test command — allow
  process.exit(0);
}

// Fail-open wrapper
main().catch(() => {
  process.exit(0);
});
