#!/usr/bin/env node
/**
 * PreToolUse Hook — BDD-only Test-File Guard (staged).
 *
 * The repo is migrating to BDD-only (goal: zero `*.test.ts`). This guard blocks CREATING a NEW
 * non-BDD test file at the file level, forcing all new test work to cucumber BDD. It is STAGED:
 *   - Write of a NEW non-BDD test file (does not exist yet) → DENY.
 *   - Edit / MultiEdit of an EXISTING non-BDD test file → ALLOW (the ~120-file tail is migrated &
 *     deleted over time; editing existing ones during the transition is permitted).
 *   - `.feature` files, `tests/step_definitions/` files, and fixture trees (`tests/fixtures/` and any
 *     `__fixtures__` directory) → always ALLOW.
 * Once the tail is fully migrated (no `*.test.ts` left) the staged guard is effectively total.
 *
 * Escape (logged, anti-gaming): set env `BDD_ONLY_SKIP=1` → the write is allowed and recorded in
 * `<cwd>/.claude/logs/bdd-only-escapes.jsonl`.
 *
 * builtins-only (node:fs / node:path) — NO node_modules import, so it runs for plugin users who have
 * no installed deps (rule: dead-integration-guard). Fail-open: any error → exit(0).
 *
 * Exit codes: 0 = allow (pass-through), 2 = deny.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

interface PreToolUseInput {
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: { file_path?: string; [k: string]: unknown };
}

/** Non-BDD test-file patterns (vitest/jest/pytest/go/xunit-nunit). Reqnroll `*Steps.cs` is BDD → NOT matched. */
const NON_BDD_TEST_PATTERNS: RegExp[] = [
  /\.(test|spec)\.[cm]?[jt]sx?$/i, // foo.test.ts/.tsx/.js, foo.spec.ts, foo.test.mjs
  /(?:^|\/)test_[^/]+\.py$/i, // test_foo.py
  /_test\.py$/i, // foo_test.py
  /_test\.go$/i, // foo_test.go
  /(?<!Steps)Tests?\.cs$/i, // FooTests.cs / FooTest.cs — but NOT FooSteps.cs (BDD)
];

/** Paths that are ALWAYS allowed — BDD step-defs, feature files, and fixture DATA (which legitimately
 *  contains files literally named `*.test.ts`, e.g. a deliberate fake-positive fixture). */
const ALLOWED_PATTERNS: RegExp[] = [
  /\.feature$/i,
  /(?:^|\/)tests\/step_definitions\//,
  /(?:^|\/)tests\/hooks\//,
  /(?:^|\/)tests\/fixtures\//,
  /(?:^|\/)__fixtures__\//,
];

/** Decide allow vs deny for a (tool, file_path, exists) tuple. Pure + exported for the BDD scenario.
 *  Returns null = allow, or a deny reason string. STAGED: only a NEW (non-existent) non-BDD test
 *  created via Write is denied; editing an existing one is allowed. */
export function bddOnlyDecision(
  toolName: string | undefined,
  filePath: string | undefined,
  exists: boolean,
): string | null {
  if (toolName !== 'Write' && toolName !== 'Edit' && toolName !== 'MultiEdit') return null;
  if (!filePath) return null;
  const posix = filePath.replace(/\\/g, '/');
  if (ALLOWED_PATTERNS.some((re) => re.test(posix))) return null;
  if (!NON_BDD_TEST_PATTERNS.some((re) => re.test(posix))) return null;
  // It IS a non-BDD test path. Staged: deny only a NEW file (Write + not yet on disk).
  if (toolName === 'Write' && !exists) {
    return (
      `[bdd-only-test-guard] BDD-only policy: creating a new non-BDD test file is blocked.\n` +
      `  File: ${posix}\n` +
      `  Write the behaviour as a cucumber scenario instead:\n` +
      `   • add a Scenario (with a real @featureN tag) to .specs/<slug>/<slug>.feature\n` +
      `   • implement the step-def under tests/step_definitions/ (drive the REAL code; real fixtures, not mocks)\n` +
      `  Editing an EXISTING non-BDD test is still allowed during the migration; only NEW ones are blocked.\n` +
      `  Override (logged): set BDD_ONLY_SKIP=1.`
    );
  }
  return null;
}

function logEscape(cwd: string, entry: Record<string, unknown>): void {
  try {
    const dir = path.join(cwd, '.claude', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'bdd-only-escapes.jsonl'), JSON.stringify(entry) + '\n');
  } catch {
    /* best-effort audit; never block on log failure */
  }
}

async function main(): Promise<void> {
  if (process.stdin.isTTY) process.exit(0);
  let inputData = '';
  for await (const chunk of process.stdin) inputData += chunk.toString();
  if (!inputData.trim()) process.exit(0);

  const data: PreToolUseInput = JSON.parse(inputData);
  const filePath = data.tool_input?.file_path;
  const cwd = data.cwd || process.cwd();

  const reason = bddOnlyDecision(data.tool_name, filePath, resolveExists(filePath, cwd));
  if (!reason) process.exit(0);

  // Escape hatch (logged) — allow but record.
  if (process.env.BDD_ONLY_SKIP === '1') {
    logEscape(cwd, {
      ts: new Date().toISOString(),
      file: (filePath || '').replace(/\\/g, '/'),
      tool: data.tool_name,
      reason: 'BDD_ONLY_SKIP',
      session_id: data.session_id ?? null,
      cwd,
    });
    process.exit(0);
  }

  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
  process.stdout.write(JSON.stringify(output));
  process.exit(2);
}

/** Resolve whether file_path already exists on disk (absolute or cwd-relative). */
function resolveExists(filePath: string | undefined, cwd: string): boolean {
  if (!filePath) return false;
  const abs = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  try {
    return fs.existsSync(abs);
  } catch {
    return false;
  }
}

const isDirectRun =
  process.argv[1]?.endsWith('guard.ts') || process.argv[1]?.endsWith('guard.js');
if (isDirectRun) {
  main().catch(() => process.exit(0));
}
