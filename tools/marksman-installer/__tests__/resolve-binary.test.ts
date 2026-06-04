// Tests for the package-first Marksman resolver (FR-7 / Option D).

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  resolveMarksmanBinary,
  whichOnPath,
  managedBinaryPath,
} from '../resolve-binary.ts';

describe('resolveMarksmanBinary — package-first order', () => {
  // env: {} isolates from the real process env — the Docker test image sets
  // DEV_POMOGATOR_MARKSMAN_BIN, which would otherwise win as the override.
  it('honours DEV_POMOGATOR_MARKSMAN_BIN override first (source=env)', () => {
    const r = resolveMarksmanBinary({
      repoRoot: '/repo',
      platform: 'linux',
      env: { DEV_POMOGATOR_MARKSMAN_BIN: '/custom/marksman' },
      whichFn: () => '/usr/bin/marksman', // PATH would also resolve, but override wins
      existsFn: () => true,
    });
    expect(r).toEqual({ source: 'env', binaryPath: '/custom/marksman' });
  });

  it('ignores the override when the pointed-at file does not exist', () => {
    const r = resolveMarksmanBinary({
      repoRoot: '/repo',
      platform: 'linux',
      env: { DEV_POMOGATOR_MARKSMAN_BIN: '/gone/marksman' },
      whichFn: () => '/usr/bin/marksman',
      existsFn: (p) => p === '/usr/bin/marksman', // override path absent
    });
    expect(r).toEqual({ source: 'path', binaryPath: '/usr/bin/marksman' });
  });

  it('prefers a system-package marksman on PATH (source=path)', () => {
    const r = resolveMarksmanBinary({
      repoRoot: '/repo',
      platform: 'linux',
      env: {},
      whichFn: () => '/usr/bin/marksman',
      existsFn: () => true, // managed would also "exist", but PATH wins
    });
    expect(r).toEqual({ source: 'path', binaryPath: '/usr/bin/marksman' });
  });

  it('falls back to the managed download when PATH has none (source=managed)', () => {
    const managed = managedBinaryPath('/repo', 'linux');
    const r = resolveMarksmanBinary({
      repoRoot: '/repo',
      platform: 'linux',
      env: {},
      whichFn: () => null,
      existsFn: (p) => p === managed,
    });
    expect(r).toEqual({ source: 'managed', binaryPath: managed });
  });

  it('returns null when neither PATH nor managed binary exists (→ unavailable)', () => {
    const r = resolveMarksmanBinary({
      repoRoot: '/repo',
      platform: 'linux',
      env: {},
      whichFn: () => null,
      existsFn: () => false,
    });
    expect(r).toBeNull();
  });

  it('uses marksman.exe for the managed path on Windows', () => {
    // Platform-matched joins so the assertion holds regardless of the host OS.
    expect(managedBinaryPath('C:/repo', 'win32')).toBe(
      path.win32.join('C:/repo', '.dev-pomogator', 'bin', 'marksman.exe'),
    );
    expect(managedBinaryPath('/repo', 'linux')).toBe(
      path.posix.join('/repo', '.dev-pomogator', 'bin', 'marksman'),
    );
  });
});

describe('whichOnPath — pure PATH scan', () => {
  it('finds the executable across PATH dirs (POSIX)', () => {
    const found = '/opt/bin/marksman';
    const env = { PATH: ['/usr/bin', '/opt/bin'].join(path.posix.delimiter) };
    expect(whichOnPath('marksman', env, 'linux', (p) => p === found)).toBe(found);
  });

  it('honours .exe on Windows', () => {
    const env = { Path: 'C:\\tools' };
    const exe = path.win32.join('C:\\tools', 'marksman.exe');
    expect(whichOnPath('marksman', env, 'win32', (p) => p === exe)).toBe(exe);
  });

  it('returns null when not on PATH', () => {
    expect(whichOnPath('marksman', { PATH: '/usr/bin' }, 'linux', () => false)).toBeNull();
  });
});
