import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import { appPath, runInstaller, setupCleanState, runTsx } from './helpers';

const GUARD_SCRIPT = 'extensions/tui-test-runner/tools/tui-test-runner/build_guard.ts';

function runBuildGuard(
  command: string,
  env: Record<string, string> = {},
): { status: number; stdout: string; stderr: string } {
  const result = runTsx(GUARD_SCRIPT, {
    input: {
      session_id: 'test-session',
      cwd: appPath(),
      tool_name: 'Bash',
      tool_input: { command },
    },
    env,
    timeout: 10000,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function runBuildGuardRaw(
  rawInput: string,
  env: Record<string, string> = {},
): { status: number; stdout: string; stderr: string } {
  // For invalid JSON tests — bypass runTsx input serialization
  const crossSpawn = require('cross-spawn');
  const result = crossSpawn.sync('npx', ['tsx', appPath(GUARD_SCRIPT)], {
    input: rawInput,
    encoding: 'utf-8',
    cwd: appPath(),
    env: { ...process.env, FORCE_COLOR: '0', ...env },
    timeout: 10000,
  });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

describe('GUARD002: Build Guard Hook', () => {
  // =========================================================================
  // TypeScript staleness (@feature1)
  // =========================================================================

  // @feature1
  it('GUARD002_01: deny when TypeScript src newer than dist', () => {
    // Setup: touch a src file to be newer than dist
    const srcFile = appPath('src/index.ts');
    const distFile = appPath('dist/index.js');

    if (fs.existsSync(srcFile) && fs.existsSync(distFile)) {
      // Touch src to ensure it's newer
      const now = new Date();
      fs.utimesSync(srcFile, now, now);
      // Set dist to past
      const past = new Date(now.getTime() - 60000);
      fs.utimesSync(distFile, past, past);
    }

    const result = runBuildGuard(
      'node .dev-pomogator/tools/test-statusline/test_runner_wrapper.cjs --framework vitest -- npx vitest run',
    );
    expect(result.status).toBe(2);
    const output = JSON.parse(result.stdout);
    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain('npm run build');
  });

  // @feature1
  it('GUARD002_02: deny when dist directory missing', () => {
    // This test needs dist/ to not exist — skip if we can't safely remove it
    // Instead test via a cwd that has no dist/
    const tmpDir = appPath('.dev-pomogator/.test-tmp-no-dist');
    fs.ensureDirSync(path.join(tmpDir, 'src'));
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), '// test');

    const result = runTsx(GUARD_SCRIPT, {
      input: {
        session_id: 'test-session',
        cwd: tmpDir,
        tool_name: 'Bash',
        tool_input: {
          command: 'node test_runner_wrapper.cjs --framework vitest -- npx vitest run',
        },
      },
      timeout: 10000,
    });

    expect(result.status).toBe(2);
    const output = JSON.parse(result.stdout.trim());
    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain('npm run build');

    // Cleanup
    fs.removeSync(tmpDir);
  });

  // @feature1
  it('GUARD002_03: allow when build is fresh', () => {
    // Ensure dist is newer than src
    const srcFile = appPath('src/index.ts');
    const distFile = appPath('dist/index.js');

    if (fs.existsSync(srcFile) && fs.existsSync(distFile)) {
      const now = new Date();
      // Set src to past
      const past = new Date(now.getTime() - 60000);
      fs.utimesSync(srcFile, past, past);
      // Touch dist to be newer
      fs.utimesSync(distFile, now, now);
    }

    const result = runBuildGuard(
      'node .dev-pomogator/tools/test-statusline/test_runner_wrapper.cjs --framework vitest -- npx vitest run',
    );
    expect(result.status).toBe(0);
  });

  // =========================================================================
  // Docker SKIP_BUILD (@feature3)
  // =========================================================================

  // @feature3
  it('GUARD002_04: deny when Docker SKIP_BUILD is set', () => {
    const result = runBuildGuard(
      'bash scripts/docker-test.sh npx vitest run',
      { SKIP_BUILD: '1' },
    );
    expect(result.status).toBe(2);
    const output = JSON.parse(result.stdout);
    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain('Docker build must not be skipped');
  });

  // =========================================================================
  // dotnet --no-build (@feature3)
  // =========================================================================

  // @feature3
  it('GUARD002_05: deny when dotnet --no-build flag present', () => {
    const result = runBuildGuard(
      'node test_runner_wrapper.cjs --framework dotnet -- dotnet test --no-build',
    );
    expect(result.status).toBe(2);
    const output = JSON.parse(result.stdout);
    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain('--no-build');
  });

  // =========================================================================
  // Passthrough frameworks (@feature3)
  // =========================================================================

  // @feature3
  it('GUARD002_06: allow for pytest without staleness check', () => {
    const result = runBuildGuard(
      'node test_runner_wrapper.cjs --framework pytest -- python -m pytest',
    );
    expect(result.status).toBe(0);
  });

  // @feature3
  it('GUARD002_07: allow for go without staleness check', () => {
    const result = runBuildGuard(
      'node test_runner_wrapper.cjs --framework go -- go test ./...',
    );
    expect(result.status).toBe(0);
  });

  // @feature3
  it('GUARD002_08: allow for rust without staleness check', () => {
    const result = runBuildGuard(
      'node test_runner_wrapper.cjs --framework rust -- cargo test',
    );
    expect(result.status).toBe(0);
  });

  // =========================================================================
  // SKIP_BUILD_CHECK bypass (@feature5)
  // =========================================================================

  // @feature5
  it('GUARD002_09: allow with SKIP_BUILD_CHECK bypass', () => {
    // Even with stale build, SKIP_BUILD_CHECK=1 should allow
    const result = runBuildGuard(
      'node test_runner_wrapper.cjs --framework vitest -- npx vitest run',
      { SKIP_BUILD_CHECK: '1' },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('Build check skipped');
  });

  // =========================================================================
  // Passthrough and fail-open (@feature1)
  // =========================================================================

  // @feature1
  it('GUARD002_10: allow for non-test commands (passthrough)', () => {
    const result = runBuildGuard('ls -la');
    expect(result.status).toBe(0);
  });

  // @feature1
  it('GUARD002_11: fail-open on invalid JSON input', () => {
    const result = runBuildGuardRaw('not valid json {{{');
    expect(result.status).toBe(0);
  });

  // @feature1
  it('GUARD002_12: fail-open on stat error', () => {
    // Use a cwd with no src/ directory at all
    const tmpDir = appPath('.dev-pomogator/.test-tmp-no-src');
    fs.ensureDirSync(tmpDir);

    const result = runTsx(GUARD_SCRIPT, {
      input: {
        session_id: 'test-session',
        cwd: tmpDir,
        tool_name: 'Bash',
        tool_input: {
          command: 'node test_runner_wrapper.cjs --framework vitest -- npx vitest run',
        },
      },
      timeout: 10000,
    });

    // Should fail-open (allow)
    expect(result.status).toBe(0);

    // Cleanup
    fs.removeSync(tmpDir);
  });

  // =========================================================================
  // Installer wires hook into settings.json (@feature1)
  // =========================================================================

  // @feature1
  it('GUARD002_13: extension.json manifest has build_guard in PreToolUse hooks', async () => {
    const manifestPath = appPath('extensions', 'tui-test-runner', 'extension.json');
    const manifest = await fs.readJson(manifestPath);
    const preToolUse = manifest.hooks?.claude?.PreToolUse;

    expect(preToolUse).toBeDefined();
    expect(Array.isArray(preToolUse)).toBe(true);

    // Find build_guard entry
    const buildGuardEntry = preToolUse.find((entry: any) =>
      entry.hooks?.some((h: any) => h.command?.includes('build_guard'))
    );
    expect(buildGuardEntry).toBeDefined();
    expect(buildGuardEntry.matcher).toBe('Bash');
    expect(buildGuardEntry.hooks[0].command).toContain('build_guard');
  });

  // @feature1
  it('GUARD002_14: build_guard is before test_guard in manifest PreToolUse order', async () => {
    const manifestPath = appPath('extensions', 'tui-test-runner', 'extension.json');
    const manifest = await fs.readJson(manifestPath);
    const preToolUse = manifest.hooks?.claude?.PreToolUse;

    let buildGuardIdx = -1;
    let testGuardIdx = -1;

    preToolUse.forEach((entry: any, idx: number) => {
      const cmds = (entry.hooks || []).map((h: any) => h.command || '');
      if (cmds.some((c: string) => c.includes('build_guard'))) buildGuardIdx = idx;
      if (cmds.some((c: string) => c.includes('test_guard'))) testGuardIdx = idx;
    });

    expect(buildGuardIdx).toBeGreaterThanOrEqual(0);
    expect(testGuardIdx).toBeGreaterThanOrEqual(0);
    expect(buildGuardIdx).toBeLessThan(testGuardIdx);
  });
});
