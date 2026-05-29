// E2E hook tests — pipe a real JSON envelope into the hook scripts via stdin
// (exactly how Claude Code invokes them) and assert on the stdout/exit code.
//
// This covers a layer the unit tests can't: the `if (isMain) { ... }`
// guard, the JSON parse path, the stdout shape Claude Code consumes. The
// main-module URL check bug fixed in commit 28fd705 silently broke every
// hook in this repo for weeks — these tests bind that surface so a
// future refactor can't reintroduce the regression.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const REPO_ROOT = process.env.DEV_POMOGATOR_REPO_ROOT ?? path.resolve(__dirname, '..', '..');

function runHookViaStdin(
  scriptRelPath: string,
  input: unknown,
  envOverride: Record<string, string> = {},
): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', path.join(REPO_ROOT, scriptRelPath)],
    {
      input: JSON.stringify(input),
      encoding: 'utf8',
      env: { ...process.env, ...envOverride },
    },
  );
  return {
    stdout: result.stdout?.toString() ?? '',
    stderr: result.stderr?.toString() ?? '',
    status: result.status,
  };
}

describe('spec-conformance-guard (PreToolUse) via real stdin pipe', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = path.join(os.tmpdir(), `guard-e2e-${randomUUID()}`);
    fs.mkdirSync(path.join(tmp, '.specs'), { recursive: true });
    // version 4 — hard hook is active.
    fs.writeFileSync(path.join(tmp, '.specs/.progress.json'), JSON.stringify({ version: 4 }));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('returns ALLOW JSON on a clean Write', () => {
    const result = runHookViaStdin(
      'tools/spec-conformance-guard/spec-conformance-guard.ts',
      {
        tool_name: 'Write',
        tool_input: {
          file_path: path.join(tmp, '.specs/auth/FR.md'),
          content: '## FR-1: Login\n',
        },
      },
      { DEV_POMOGATOR_REPO_ROOT: tmp, CLAUDE_PLUGIN_ROOT: tmp },
    );
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout) as { hookSpecificOutput?: { permissionDecision?: string } };
    expect(out.hookSpecificOutput?.permissionDecision).toBe('allow');
  });

  it('returns DENY JSON with DUPLICATE_DEFINITION when Write would create a duplicate', () => {
    const result = runHookViaStdin(
      'tools/spec-conformance-guard/spec-conformance-guard.ts',
      {
        tool_name: 'Write',
        tool_input: {
          file_path: path.join(tmp, '.specs/auth/FR.md'),
          content: '## FR-1: First\n\n## FR-1: Second\n',
        },
      },
      { DEV_POMOGATOR_REPO_ROOT: tmp, CLAUDE_PLUGIN_ROOT: tmp },
    );
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout) as {
      hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string };
    };
    expect(out.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(out.hookSpecificOutput?.permissionDecisionReason).toMatch(/DUPLICATE_DEFINITION/);
  });

  it('returns ALLOW_AFTER_MIGRATION when .progress.json version < 4 (FR-22 gate)', () => {
    fs.writeFileSync(path.join(tmp, '.specs/.progress.json'), JSON.stringify({ version: 3 }));
    const result = runHookViaStdin(
      'tools/spec-conformance-guard/spec-conformance-guard.ts',
      {
        tool_name: 'Write',
        tool_input: {
          file_path: path.join(tmp, '.specs/auth/FR.md'),
          content: '## FR-1: First\n\n## FR-1: Second\n', // duplicate but gated out
        },
      },
      { DEV_POMOGATOR_REPO_ROOT: tmp, CLAUDE_PLUGIN_ROOT: tmp },
    );
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout) as { hookSpecificOutput?: { permissionDecisionReason?: string } };
    expect(out.hookSpecificOutput?.permissionDecisionReason).toBe('ALLOW_AFTER_MIGRATION');
  });
});

describe('spec-conformance-push (PostToolUse) via real stdin pipe', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = path.join(os.tmpdir(), `push-e2e-${randomUUID()}`);
    fs.mkdirSync(path.join(tmp, '.specs', 'x'), { recursive: true });
    // FR-1 with no AC → guaranteed UNCOVERED_FR finding.
    fs.writeFileSync(path.join(tmp, '.specs/x/FR.md'), '## FR-1: Uncovered\n');
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('appends a JSONL entry to spec-check-log even when the agent-facing emit is throttled', () => {
    const result = runHookViaStdin(
      'tools/spec-conformance-push/spec-conformance-push.ts',
      {
        tool_name: 'Write',
        tool_input: { file_path: path.join(tmp, '.specs/x/FR.md') },
        session_id: 'sess-e2e-test',
      },
      { DEV_POMOGATOR_REPO_ROOT: tmp, CLAUDE_PLUGIN_ROOT: tmp },
    );
    expect(result.status).toBe(0);
    // First call within the 3s window stays silent on stdout per FR-28.
    expect(result.stdout).toBe('');
    // But the durable log received the finding(s).
    const logDir = path.join(tmp, '.dev-pomogator', '.spec-check-log');
    expect(fs.existsSync(logDir)).toBe(true);
    const shards = fs.readdirSync(logDir).filter((n) => n.endsWith('.jsonl'));
    expect(shards.length).toBeGreaterThan(0);
    const raw = fs.readFileSync(path.join(logDir, shards[0]), 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    const obj = JSON.parse(lines[0]) as {
      finding_code: string;
      source: string;
      session_id?: string;
    };
    expect(obj.finding_code).toBe('UNCOVERED_FR');
    expect(obj.source).toBe('spec-conformance-push');
    expect(obj.session_id).toBe('sess-e2e-test');
  });
});

describe('spec-mcp-server initialize + tools/list + get_trace via real stdin', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = path.join(os.tmpdir(), `mcp-e2e-${randomUUID()}`);
    fs.mkdirSync(path.join(tmp, '.specs', 'auth'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.specs/auth/FR.md'), '## FR-1: Login\n## FR-2: Logout\n');
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('serves three JSON-RPC requests in one stdio session', () => {
    const init = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'e2e', version: '0' } },
    });
    const list = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const call = JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'get_trace', arguments: { node_id: 'FR-1' } },
    });
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', path.join(REPO_ROOT, 'tools/spec-mcp-server/server.ts')],
      {
        input: `${init}\n${list}\n${call}\n`,
        encoding: 'utf8',
        env: { ...process.env, DEV_POMOGATOR_REPO_ROOT: tmp },
        timeout: 15_000,
      },
    );
    // Stop the lock heartbeat by SIGTERM if the server lingers — but stdin
    // EOF should resolve `server.connect()` cleanly already.
    const lines = result.stdout.split('\n').filter((l) => l.trim().startsWith('{'));
    expect(lines.length).toBeGreaterThanOrEqual(3);
    const initResp = JSON.parse(lines[0]) as {
      result?: { serverInfo?: { name: string } };
    };
    expect(initResp.result?.serverInfo?.name).toBe('dev-pomogator-specs');
    const listResp = JSON.parse(lines[1]) as { result?: { tools?: Array<{ name: string }> } };
    const names = (listResp.result?.tools ?? []).map((t) => t.name);
    expect(names).toContain('get_trace');
    expect(names.length).toBe(11);
    const callResp = JSON.parse(lines[2]) as {
      result?: { content?: Array<{ text: string }> };
    };
    const payload = JSON.parse(callResp.result?.content?.[0]?.text ?? '{}') as {
      ok?: boolean;
      node?: { id: string };
    };
    expect(payload.ok).toBe(true);
    expect(payload.node?.id).toBe('FR-1');
  });
});
