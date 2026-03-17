import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import { appPath, runInstaller, setupCleanState } from './helpers';

const GUARD_SCRIPT = 'extensions/tui-test-runner/tools/tui-test-runner/test_guard.ts';

/**
 * Simulate PreToolUse hook input for test_guard.
 * Sends JSON to stdin, returns exit code and stdout.
 */
function runTestGuard(
  command: string,
  env: Record<string, string> = {},
): { status: number; stdout: string } {
  const input = JSON.stringify({
    session_id: 'test-session',
    cwd: appPath(),
    tool_name: 'Bash',
    tool_input: { command },
  });

  const guardPath = appPath(GUARD_SCRIPT);
  const result = spawnSync('npx', ['tsx', guardPath], {
    input,
    encoding: 'utf-8',
    cwd: appPath(),
    timeout: 10000,
    env: { ...process.env, ...env },
  });

  return {
    status: result.status ?? 1,
    stdout: (result.stdout || '').trim(),
  };
}

describe('GUARD001: Test Guard Hook', () => {
  // =========================================================================
  // Block direct test commands (@feature1)
  // =========================================================================

  const BLOCKED_COMMANDS = [
    { name: 'pytest', cmd: 'python -m pytest', id: '01' },
    { name: 'vitest', cmd: 'npx vitest run', id: '02' },
    { name: 'jest', cmd: 'npx jest', id: '03' },
    { name: 'dotnet', cmd: 'dotnet test', id: '04' },
    { name: 'cargo', cmd: 'cargo test', id: '05' },
    { name: 'go', cmd: 'go test ./...', id: '06' },
    { name: 'npm test', cmd: 'npm test', id: '07' },
  ];

  for (const { name, cmd, id } of BLOCKED_COMMANDS) {
    // @feature1
    it(`GUARD001_${id}: blocks direct ${name}`, () => {
      const result = runTestGuard(cmd);
      expect(result.status).toBe(2);
      // Deny message should contain /run-tests instructions
      const output = JSON.parse(result.stdout);
      expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain('/run-tests');
    });
  }

  // =========================================================================
  // Allow wrapper and bypass (@feature2)
  // =========================================================================

  // @feature2
  it('GUARD001_08: allows wrapper command', () => {
    const result = runTestGuard('bash test_runner_wrapper.sh python -m pytest');
    expect(result.status).toBe(0);
  });

  // @feature2
  it('GUARD001_09: allows with TEST_GUARD_BYPASS=1', () => {
    const result = runTestGuard('python -m pytest', { TEST_GUARD_BYPASS: '1' });
    expect(result.status).toBe(0);
  });

  // @feature2
  it('GUARD001_10: allows non-test commands', () => {
    const result = runTestGuard('ls -la');
    expect(result.status).toBe(0);
  });

  // =========================================================================
  // Deny message quality (@feature1)
  // =========================================================================

  // @feature1
  it('GUARD001_11: deny message contains supported frameworks', () => {
    const result = runTestGuard('python -m pytest tests/');
    const output = JSON.parse(result.stdout);
    const reason = output.hookSpecificOutput.permissionDecisionReason;
    expect(reason).toContain('vitest');
    expect(reason).toContain('pytest');
    expect(reason).toContain('dotnet');
  });

  // =========================================================================
  // Installer installs hooks (@feature3)
  // =========================================================================

  // @feature3
  it('GUARD001_12: extension.json has hooks in correct object format', async () => {
    const manifest = await fs.readJson(
      appPath('extensions/tui-test-runner/extension.json'),
    );
    // Must be object format { claude: { EventName: ... } }, not array
    expect(manifest.hooks).not.toBeInstanceOf(Array);
    expect(manifest.hooks.claude).toBeDefined();
    expect(manifest.hooks.claude.SessionStart).toBeDefined();
    expect(manifest.hooks.claude.PreToolUse).toBeDefined();
    // PreToolUse must have matcher
    expect(manifest.hooks.claude.PreToolUse.matcher).toBe('Bash');
  });
});
