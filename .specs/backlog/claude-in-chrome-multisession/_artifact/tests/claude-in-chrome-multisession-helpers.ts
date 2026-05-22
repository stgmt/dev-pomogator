import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appPath } from './helpers';

export const HOOK_SCRIPT = appPath(
  'extensions/claude-in-chrome-multisession/tools/claude-in-chrome-multisession/cims-guard.ts',
);
export const CLAIM_TAB_SCRIPT = appPath(
  'extensions/claude-in-chrome-multisession/tools/claude-in-chrome-multisession/claim-tab.mjs',
);

export interface OwnedTabs {
  sessionId: string;
  tabIds: number[];
  createdAt: string;
  lastUsedAt: string;
}

export interface HookInputPayload {
  sessionId: string;
  eventName: 'PreToolUse' | 'PostToolUse';
  toolName: string;
  toolInput?: Record<string, unknown>;
  toolResponse?: unknown;
  cwd?: string;
}

export interface HookResult {
  status: number;
  stdout: string;
  stderr: string;
  parsedDeny: { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } } | null;
}

export interface ClaimResult {
  status: number;
  stdout: string;
  stderr: string;
  parsed: any | null;
}

export function makeFakeHome(prefix = 'cims-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `dev-pomogator-${prefix}`));
}

export function cleanupFakeHome(fakeHome: string): void {
  try {
    fs.rmSync(fakeHome, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

export function sanitizeSessionId(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function ownedTabsPath(fakeHome: string, sessionId: string): string {
  return path.join(
    fakeHome,
    '.dev-pomogator',
    'cdmm-sessions',
    sanitizeSessionId(sessionId),
    'owned-tabs.json',
  );
}

export function logPath(fakeHome: string): string {
  return path.join(fakeHome, '.dev-pomogator', 'logs', 'cims-guard.log');
}

export function writeOwned(
  fakeHome: string,
  sessionId: string,
  tabIds: number[],
  overrides: Partial<OwnedTabs> = {},
): void {
  const file = ownedTabsPath(fakeHome, sessionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const data: OwnedTabs = {
    sessionId,
    tabIds,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    ...overrides,
  };
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

export function readOwned(fakeHome: string, sessionId: string): OwnedTabs | null {
  try {
    return JSON.parse(fs.readFileSync(ownedTabsPath(fakeHome, sessionId), 'utf-8'));
  } catch {
    return null;
  }
}

export function readLogLines(fakeHome: string): Array<Record<string, unknown>> {
  try {
    const content = fs.readFileSync(logPath(fakeHome), 'utf-8');
    return content
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

export function makeHookStdin(payload: HookInputPayload): string {
  const obj: Record<string, unknown> = {
    session_id: payload.sessionId,
    transcript_path: '/fake/transcript.jsonl',
    cwd: payload.cwd ?? process.cwd(),
    permission_mode: 'auto',
    hook_event_name: payload.eventName,
    tool_name: payload.toolName,
    tool_input: payload.toolInput ?? {},
    tool_use_id: 'toolu_test',
  };
  if (payload.toolResponse !== undefined) {
    obj.tool_response = payload.toolResponse;
  }
  return JSON.stringify(obj);
}

export function runHookSync(stdinPayload: HookInputPayload | string, fakeHome: string): HookResult {
  const input = typeof stdinPayload === 'string' ? stdinPayload : makeHookStdin(stdinPayload);
  const result: SpawnSyncReturns<string> = spawnSync('npx', ['tsx', HOOK_SCRIPT], {
    input,
    encoding: 'utf-8',
    timeout: 15_000,
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
      FORCE_COLOR: '0',
    },
  });
  const stdout = result.stdout || '';
  let parsedDeny: HookResult['parsedDeny'] = null;
  try {
    if (stdout.trim().length > 0) {
      const obj = JSON.parse(stdout.trim());
      if (obj?.hookSpecificOutput) parsedDeny = obj;
    }
  } catch {
    /* not JSON — leave null */
  }
  return {
    status: result.status ?? -1,
    stdout,
    stderr: result.stderr || '',
    parsedDeny,
  };
}

export function runClaimTabSync(args: string[], fakeHome: string, extraEnv: Record<string, string> = {}): ClaimResult {
  const result = spawnSync('node', [CLAIM_TAB_SCRIPT, ...args], {
    encoding: 'utf-8',
    timeout: 10_000,
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
      FORCE_COLOR: '0',
      ...extraEnv,
    },
  });
  let parsed: any = null;
  try {
    parsed = JSON.parse((result.stdout || '').trim());
  } catch {
    /* not JSON */
  }
  return {
    status: result.status ?? -1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    parsed,
  };
}

/**
 * Set lastUsedAt of a session's owned-tabs.json to N hours in the past.
 * Used in `clean` test to avoid waiting 25 real hours.
 */
export function ageSession(fakeHome: string, sessionId: string, hoursAgo: number): void {
  const file = ownedTabsPath(fakeHome, sessionId);
  const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as OwnedTabs;
  data.lastUsedAt = new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}
