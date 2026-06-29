import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ageSession,
  cleanupFakeHome,
  makeFakeHome,
  ownedTabsPath,
  readOwned,
  runClaimTabSync,
  writeOwned,
} from './claude-in-chrome-multisession-helpers';

describe('PLUGIN018: claude-in-chrome-multisession — claim-tab.mjs CLI (FR-5)', () => {
  let fakeHome: string;

  beforeEach(() => {
    fakeHome = makeFakeHome('claim-');
  });

  afterEach(() => {
    cleanupFakeHome(fakeHome);
  });

  // @feature5 — FR-5: add
  it('PLUGIN018_07: claim-tab adds tabId to current session', () => {
    const result = runClaimTabSync(['add', '500', '--session', 'S1'], fakeHome);
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(result.parsed?.ok).toBe(true);
    expect(result.parsed?.sessionId).toBe('S1');
    expect(result.parsed?.tabIds).toEqual([500]);
    const owned = readOwned(fakeHome, 'S1');
    expect(owned?.tabIds).toEqual([500]);
  });

  // @feature5 — FR-5: release
  it('PLUGIN018_08: claim-tab release removes tabId from current session', () => {
    writeOwned(fakeHome, 'S1', [500, 600]);

    const result = runClaimTabSync(['release', '500', '--session', 'S1'], fakeHome);
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(result.parsed?.removed).toBe(true);
    expect(result.parsed?.tabIds).toEqual([600]);
    const owned = readOwned(fakeHome, 'S1');
    expect(owned?.tabIds).toEqual([600]);
  });

  // @feature6 — FR-5: clean
  it('PLUGIN018_09: claim-tab clean removes stale sessions older than 24h', () => {
    writeOwned(fakeHome, 'S1', [100]);
    writeOwned(fakeHome, 'S2', [200]);
    ageSession(fakeHome, 'S1', 25); // 25h ago — stale
    ageSession(fakeHome, 'S2', 1); // 1h ago — fresh

    const result = runClaimTabSync(['clean'], fakeHome);
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(result.parsed?.count).toBe(1);
    expect(result.parsed?.removed?.[0]?.sessionId).toBe('S1');

    expect(fs.existsSync(`${fakeHome}/.dev-pomogator/cdmm-sessions/S1`)).toBe(false);
    expect(fs.existsSync(`${fakeHome}/.dev-pomogator/cdmm-sessions/S2`)).toBe(true);
  });

  // FR-5: list
  it('PLUGIN018: claim-tab list outputs ownership table for all sessions', () => {
    writeOwned(fakeHome, 'S1', [100, 200]);
    writeOwned(fakeHome, 'S2', [300]);

    const result = runClaimTabSync(['list'], fakeHome);
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(result.parsed?.totalSessions).toBe(2);
    const sessionIds = result.parsed?.sessions?.map((s: any) => s.sessionId).sort();
    expect(sessionIds).toEqual(['S1', 'S2']);
    const s1 = result.parsed?.sessions?.find((s: any) => s.sessionId === 'S1');
    expect(s1?.tabCount).toBe(2);
    expect(s1?.tabIds).toEqual([100, 200]);
  });

  // FR-5: reset
  it('PLUGIN018: claim-tab reset wipes all session state', () => {
    writeOwned(fakeHome, 'S1', [100]);
    writeOwned(fakeHome, 'S2', [200]);

    const result = runClaimTabSync(['reset'], fakeHome);
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(result.parsed?.ok).toBe(true);
    expect(fs.existsSync(`${fakeHome}/.dev-pomogator/cdmm-sessions`)).toBe(false);
  });

  // FR-5: add without tabId
  it('PLUGIN018: claim-tab add rejects missing tabId', () => {
    const result = runClaimTabSync(['add', '--session', 'S1'], fakeHome);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('requires numeric <tabId>');
  });

  // FR-5: add without session id
  it('PLUGIN018: claim-tab add rejects missing CLAUDE_SESSION_ID', () => {
    const result = runClaimTabSync(['add', '500'], fakeHome, { CLAUDE_SESSION_ID: '' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('CLAUDE_SESSION_ID env var not set');
  });

  // FR-5: add reads CLAUDE_SESSION_ID env
  it('PLUGIN018: claim-tab add picks up CLAUDE_SESSION_ID from env', () => {
    const result = runClaimTabSync(['add', '777'], fakeHome, { CLAUDE_SESSION_ID: 'env-session' });
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(result.parsed?.sessionId).toBe('env-session');
  });

  // FR-5: invalid choice
  it('PLUGIN018: claim-tab rejects unknown command', () => {
    const result = runClaimTabSync(['frobnicate'], fakeHome);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unknown command');
  });

  // FR-5: list when STATE_ROOT empty
  it('PLUGIN018: claim-tab list returns empty array when no state', () => {
    const result = runClaimTabSync(['list'], fakeHome);
    expect(result.status).toBe(0);
    expect(result.parsed?.totalSessions).toBe(0);
    expect(result.parsed?.sessions).toEqual([]);
  });

  // FR-5: release no-op when not present
  it('PLUGIN018: claim-tab release no-op when tabId not in allowlist', () => {
    writeOwned(fakeHome, 'S1', [100]);
    const result = runClaimTabSync(['release', '999', '--session', 'S1'], fakeHome);
    expect(result.status).toBe(0);
    expect(result.parsed?.removed).toBe(false);
    expect(result.parsed?.tabIds).toEqual([100]);
  });
});
