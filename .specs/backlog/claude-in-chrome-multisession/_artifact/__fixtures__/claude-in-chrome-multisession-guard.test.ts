import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupFakeHome,
  makeFakeHome,
  ownedTabsPath,
  readLogLines,
  readOwned,
  runHookSync,
  writeOwned,
} from './claude-in-chrome-multisession-helpers';

describe('PLUGIN018: claude-in-chrome-multisession — cims-guard hook (FR-2 + FR-3 + FR-6 + FR-7 + FR-8)', () => {
  let fakeHome: string;

  beforeEach(() => {
    fakeHome = makeFakeHome();
  });

  afterEach(() => {
    cleanupFakeHome(fakeHome);
  });

  it('PLUGIN018_01: hook denies navigate when tabId owned by another session', () => {
    writeOwned(fakeHome, 'session-A', [100]);
    const result = runHookSync(
      {
        sessionId: 'session-B',
        eventName: 'PreToolUse',
        toolName: 'mcp__claude-in-chrome__navigate',
        toolInput: { tabId: 100, url: 'https://pikabu.ru' },
      },
      fakeHome,
    );
    expect(result.status, `stderr: ${result.stderr}`).toBe(2);
    expect(result.parsedDeny?.hookSpecificOutput?.permissionDecision).toBe('deny');
    const reason = result.parsedDeny?.hookSpecificOutput?.permissionDecisionReason ?? '';
    expect(reason).toContain('session-A');
    expect(reason).toContain('tabs_create_mcp');
    expect(reason).toContain('claim-tab.mjs add 100');
  });

  it('PLUGIN018_02: hook allows navigate when tabId is owned by current session', () => {
    writeOwned(fakeHome, 'session-A', [100], {
      lastUsedAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const before = readOwned(fakeHome, 'session-A')!.lastUsedAt;
    const result = runHookSync(
      {
        sessionId: 'session-A',
        eventName: 'PreToolUse',
        toolName: 'mcp__claude-in-chrome__navigate',
        toolInput: { tabId: 100, url: 'https://habr.com' },
      },
      fakeHome,
    );
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(result.stdout).toBe('');
    const after = readOwned(fakeHome, 'session-A')!.lastUsedAt;
    expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
  });

  it('PLUGIN018_03: hook records new tabId from tabs_create_mcp PostToolUse', () => {
    const result = runHookSync(
      {
        sessionId: 'session-A',
        eventName: 'PostToolUse',
        toolName: 'mcp__claude-in-chrome__tabs_create_mcp',
        toolInput: {},
        toolResponse: [{ type: 'text', text: 'Created new tab. Tab ID: 200\n\nTab Context: ...' }],
      },
      fakeHome,
    );
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(readOwned(fakeHome, 'session-A')!.tabIds).toContain(200);
    expect(readLogLines(fakeHome).map((e) => e.event)).toContain('recorded_tab');
  });

  it('PLUGIN018_04: hook auto-claims orphan tab on first touch', () => {
    const result = runHookSync(
      {
        sessionId: 'session-A',
        eventName: 'PreToolUse',
        toolName: 'mcp__claude-in-chrome__navigate',
        toolInput: { tabId: 999, url: 'https://example.com' },
      },
      fakeHome,
    );
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(readOwned(fakeHome, 'session-A')!.tabIds).toContain(999);
    expect(
      readLogLines(fakeHome).some((e) => e.event === 'allow_adopted_orphan' && e.tabId === 999),
    ).toBe(true);
  });

  it('PLUGIN018_05: hook exits 0 with malformed stdin JSON', () => {
    const result = runHookSync('this is not JSON {{{', fakeHome);
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(readLogLines(fakeHome).some((e) => e.event === 'parse_error')).toBe(true);
  });

  it('PLUGIN018_06: hook writes JSONL events with required fields', () => {
    runHookSync(
      {
        sessionId: 'session-A',
        eventName: 'PreToolUse',
        toolName: 'mcp__claude-in-chrome__tabs_context_mcp',
        toolInput: {},
      },
      fakeHome,
    );
    runHookSync(
      {
        sessionId: 'session-A',
        eventName: 'PreToolUse',
        toolName: 'mcp__claude-in-chrome__navigate',
        toolInput: { tabId: 555, url: 'x' },
      },
      fakeHome,
    );
    writeOwned(fakeHome, 'session-X', [777]);
    runHookSync(
      {
        sessionId: 'session-A',
        eventName: 'PreToolUse',
        toolName: 'mcp__claude-in-chrome__navigate',
        toolInput: { tabId: 777, url: 'x' },
      },
      fakeHome,
    );
    const events = readLogLines(fakeHome);
    expect(events.length).toBeGreaterThanOrEqual(3);
    for (const e of events) {
      expect(e.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(typeof e.event).toBe('string');
    }
    const eventNames = events.map((e) => e.event);
    expect(eventNames).toContain('allow_no_tabid');
    expect(eventNames).toContain('allow_adopted_orphan');
    expect(eventNames).toContain('deny_other_session');
  });

  it('PLUGIN018: hook allows tools without tabId without state mutation', () => {
    const result = runHookSync(
      {
        sessionId: 'session-A',
        eventName: 'PreToolUse',
        toolName: 'mcp__claude-in-chrome__tabs_create_mcp',
        toolInput: {},
      },
      fakeHome,
    );
    expect(result.status).toBe(0);
    expect(readOwned(fakeHome, 'session-A')).toBeNull();
  });

  it('PLUGIN018: hook is no-op for non-claude-in-chrome tools', () => {
    const result = runHookSync(
      {
        sessionId: 'session-A',
        eventName: 'PreToolUse',
        toolName: 'mcp__some-other-server__do_thing',
        toolInput: { tabId: 100 },
      },
      fakeHome,
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('PLUGIN018: hook fails open when session_id is missing', () => {
    const stdin = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'mcp__claude-in-chrome__navigate',
      tool_input: { tabId: 100 },
    });
    const result = runHookSync(stdin, fakeHome);
    expect(result.status).toBe(0);
    expect(readLogLines(fakeHome).some((e) => e.event === 'skip')).toBe(true);
  });

  it('PLUGIN018: orphan claim makes other session DENY on same tabId', () => {
    runHookSync(
      {
        sessionId: 'session-A',
        eventName: 'PreToolUse',
        toolName: 'mcp__claude-in-chrome__navigate',
        toolInput: { tabId: 1234, url: 'x' },
      },
      fakeHome,
    );
    const second = runHookSync(
      {
        sessionId: 'session-B',
        eventName: 'PreToolUse',
        toolName: 'mcp__claude-in-chrome__navigate',
        toolInput: { tabId: 1234, url: 'y' },
      },
      fakeHome,
    );
    expect(second.status).toBe(2);
    expect(second.parsedDeny?.hookSpecificOutput?.permissionDecisionReason).toContain('session-A');
  });

  it('PLUGIN018: hook creates log directory if missing', () => {
    runHookSync(
      {
        sessionId: 'session-A',
        eventName: 'PreToolUse',
        toolName: 'mcp__claude-in-chrome__tabs_context_mcp',
        toolInput: {},
      },
      fakeHome,
    );
    expect(fs.existsSync(`${fakeHome}/.dev-pomogator/logs/cims-guard.log`)).toBe(true);
  });

  it('PLUGIN018: corrupt own allowlist treated as empty (orphan path triggers)', () => {
    fs.mkdirSync(`${fakeHome}/.dev-pomogator/cdmm-sessions/session-A`, { recursive: true });
    fs.writeFileSync(ownedTabsPath(fakeHome, 'session-A'), 'not valid json {{{', 'utf-8');
    const result = runHookSync(
      {
        sessionId: 'session-A',
        eventName: 'PreToolUse',
        toolName: 'mcp__claude-in-chrome__navigate',
        toolInput: { tabId: 100, url: 'x' },
      },
      fakeHome,
    );
    expect(result.status).toBe(0);
  });
});
