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

/** Patterns that indicate direct test commands, paired with target framework name.
 *  Used by smart converter (FR-12, v0.3.0) to build a ready-to-paste wrapper invocation. */
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; framework: string }> = [
  { pattern: /\bnpm\s+test\b/, framework: 'vitest' },
  { pattern: /\bnpm\s+run\s+test\b/, framework: 'vitest' },
  { pattern: /\bnpx\s+vitest\b/, framework: 'vitest' },
  { pattern: /\bnpx\s+jest\b/, framework: 'jest' },
  { pattern: /\bpytest\b/, framework: 'pytest' },
  { pattern: /\bpython\s+-m\s+pytest\b/, framework: 'pytest' },
  { pattern: /\bdotnet\s+test\b/, framework: 'dotnet' },
  { pattern: /\bcargo\s+test\b/, framework: 'rust' },
  { pattern: /\bgo\s+test\b/, framework: 'go' },
];

/** Patterns that indicate the command is already wrapped (allow) */
const ALLOWED_PATTERNS = [
  /test_runner_wrapper/,
  /docker-test\.sh/,       // project Docker test script (used by /run-tests --docker)
  /docker compose.*test/,  // direct docker compose test invocation
  /test:e2e:docker/,       // internal Docker test command
  /vitest.*--reporter/,    // vitest inside Docker (npm run test:e2e:docker)
];

/** Build a ready-to-paste wrapper invocation from raw test command.
 *  Returns string suitable for direct copy into Bash tool. */
function buildConvertedCommand(originalCommand: string, framework: string): string {
  const wrapperPath = 'tools/test-statusline/test_runner_wrapper.cjs';
  // Pass framework explicitly + original command as separate argument list after --
  return `node ${wrapperPath} --framework ${framework} -- ${originalCommand.trim()}`;
}

function buildDenyMessage(blockedCommand: string, framework: string): string {
  // Extract the matched test command for display
  let matched = blockedCommand.trim();
  if (matched.length > 80) matched = matched.substring(0, 80) + '...';

  const converted = buildConvertedCommand(blockedCommand, framework);

  return [
    `🚫 Direct test command blocked: "${matched}"`,
    '',
    '✅ Copy this exact wrapper invocation (smart-converter v0.3.0):',
    '',
    `  ${converted}`,
    '',
    'OR use /run-tests skill (recommended — handles dispatch, filters, Docker mode):',
    '',
    '  /run-tests              — auto-detect framework, run all tests',
    '  /run-tests auth         — run tests matching "auth" filter',
    '  /run-tests --framework vitest -- --watch  — explicit framework + extra args',
    '  /run-tests --docker     — run through Docker Compose',
    '  /run-tests --framework generic -- npm run build  — wrap non-test long bg command',
    '',
    'Supported frameworks: vitest, jest, pytest, dotnet, rust (cargo), go, generic',
    'Auto-detected from: vitest.config.ts, jest.config.js, pytest.ini, Cargo.toml, go.mod, *.csproj',
    '',
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

  // Check if already wrapped (allow)
  for (const pattern of ALLOWED_PATTERNS) {
    if (pattern.test(command)) {
      process.exit(0);
    }
  }

  // Check if direct test command (block + smart converter)
  for (const entry of BLOCKED_PATTERNS) {
    if (entry.pattern.test(command)) {
      const denyMessage = buildDenyMessage(command, entry.framework);

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
