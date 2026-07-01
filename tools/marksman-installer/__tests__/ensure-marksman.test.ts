// Tests for the SessionStart Marksman trigger (FR-7 / Option D).

import { describe, it, expect, vi } from 'vitest';
import { shouldAttemptInstall, ensureMarksman } from '../ensure-marksman.ts';
import type { InstallLog } from '../install-log.ts';

const log = (over: Partial<InstallLog['marksman']>): InstallLog => ({
  marksman: { available: false, installed_at: new Date().toISOString(), ...over },
});

describe('shouldAttemptInstall', () => {
  const now = Date.parse('2026-06-04T12:00:00Z');

  it('installs when there is no log at all', () => {
    expect(shouldAttemptInstall(null, now)).toBe(true);
  });

  it('backs off after a recent FAILED attempt (reason set, fresh timestamp)', () => {
    const recentFail = log({ reason: 'offline', installed_at: new Date(now - 60_000).toISOString() });
    expect(shouldAttemptInstall(recentFail, now)).toBe(false);
  });

  it('retries once an old failed attempt ages past the back-off window', () => {
    const oldFail = log({ reason: 'offline', installed_at: new Date(now - 7 * 3600_000).toISOString() });
    expect(shouldAttemptInstall(oldFail, now)).toBe(true);
  });

  it('re-installs when a previously-successful binary is now gone (no reason)', () => {
    const wasOk = log({ available: true, installed_at: new Date(now - 60_000).toISOString() });
    expect(shouldAttemptInstall(wasOk, now)).toBe(true);
  });
});

describe('ensureMarksman', () => {
  it('uses a resolved binary and does NOT trigger a download', () => {
    const trigger = vi.fn();
    const out = ensureMarksman({
      repoRoot: '/repo',
      resolve: () => ({ source: 'path', binaryPath: '/usr/bin/marksman' }),
      trigger,
    });
    expect(out).toEqual({ action: 'use-resolved', source: 'path' });
    expect(trigger).not.toHaveBeenCalled();
  });

  it('triggers a background download when nothing is resolved + no backoff', () => {
    const trigger = vi.fn();
    const out = ensureMarksman({
      repoRoot: '/repo',
      resolve: () => null,
      read: () => null,
      trigger,
    });
    expect(out).toEqual({ action: 'install-triggered' });
    expect(trigger).toHaveBeenCalledWith('/repo');
  });

  it('backs off (no trigger) after a recent failed attempt', () => {
    const trigger = vi.fn();
    const out = ensureMarksman({
      repoRoot: '/repo',
      now: Date.parse('2026-06-04T12:00:00Z'),
      resolve: () => null,
      read: () => log({ reason: 'download_failed', installed_at: '2026-06-04T11:59:00Z' }),
      trigger,
    });
    expect(out).toEqual({ action: 'backoff' });
    expect(trigger).not.toHaveBeenCalled();
  });
});
