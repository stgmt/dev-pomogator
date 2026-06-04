// Tests for the LSP launcher shim's resolution policy (FR-7 — native LSP plugin).
// The shim is CJS (it is spawned by Claude Code as the LSP `command`), so we
// require() it rather than import its named exports.

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const shim = require('../launch-marksman.cjs') as {
  whichOnPath: (cmd: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform, existsFn: (p: string) => boolean) => string | null;
  managedBinaryPath: (repoRoot: string, platform: NodeJS.Platform) => string;
  resolveMarksmanBinary: (opts: {
    repoRoot: string;
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    whichFn?: (c: string) => string | null;
    existsFn?: (p: string) => boolean;
  }) => { source: string; binaryPath: string } | null;
  repoRootFromEnv: (env: NodeJS.ProcessEnv) => string;
};

describe('launch-marksman shim — resolution policy (mirrors resolve-binary.ts)', () => {
  it('prefers a system-package marksman on PATH (source=path)', () => {
    const r = shim.resolveMarksmanBinary({
      repoRoot: '/repo',
      platform: 'linux',
      whichFn: () => '/usr/bin/marksman',
      existsFn: () => true, // managed would also "exist" — PATH must win
    });
    expect(r).toEqual({ source: 'path', binaryPath: '/usr/bin/marksman' });
  });

  it('falls back to the managed download when PATH has none (source=managed)', () => {
    const managed = shim.managedBinaryPath('/repo', 'linux');
    const r = shim.resolveMarksmanBinary({
      repoRoot: '/repo',
      platform: 'linux',
      whichFn: () => null,
      existsFn: (p) => p === managed,
    });
    expect(r).toEqual({ source: 'managed', binaryPath: managed });
  });

  it('returns null when neither PATH nor managed binary exists (→ FR-7a no-fallback exit)', () => {
    const r = shim.resolveMarksmanBinary({
      repoRoot: '/repo',
      platform: 'linux',
      whichFn: () => null,
      existsFn: () => false,
    });
    expect(r).toBeNull();
  });

  it('computes the Windows managed path with .exe under .dev-pomogator/bin', () => {
    expect(shim.managedBinaryPath('D:\\repo', 'win32')).toBe(
      path.win32.join('D:\\repo', '.dev-pomogator', 'bin', 'marksman.exe'),
    );
  });

  it('computes the POSIX managed path without extension', () => {
    expect(shim.managedBinaryPath('/repo', 'linux')).toBe('/repo/.dev-pomogator/bin/marksman');
  });

  it('whichOnPath honours Windows executable extensions', () => {
    const found = path.win32.join('C:\\tools', 'marksman.exe');
    const r = shim.whichOnPath('marksman', { PATH: 'C:\\tools' }, 'win32', (p) => p === found);
    expect(r).toBe(found);
  });

  it('repoRootFromEnv prefers CLAUDE_PROJECT_DIR, then DEV_POMOGATOR_REPO_ROOT', () => {
    expect(shim.repoRootFromEnv({ CLAUDE_PROJECT_DIR: '/proj', DEV_POMOGATOR_REPO_ROOT: '/x' })).toBe('/proj');
    expect(shim.repoRootFromEnv({ DEV_POMOGATOR_REPO_ROOT: '/x' })).toBe('/x');
  });
});
