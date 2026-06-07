/**
 * FR-24 / T-Trans.6 — meta-guard preservation + v4 extension.
 *
 * Spawns the REAL hook (`extension-json-meta-guard.ts`) as a subprocess with
 * PreToolUse stdin JSON — no mocks (integration-tests-first). Covers the 4
 * FR-24 removal-denied invariants + the additive-allow path + the tamper log:
 *   1. v3 form-guard removed from `.claude/settings.json`        → DENY
 *   2. `spec-conformance-guard` removed from `.claude-plugin/hooks.json` → DENY
 *   3. `dev-pomogator-specs` MCP entry removed from `.mcp.json`  → DENY
 *   4. the meta-guard's own registration removed (self-protection) → DENY
 * Tamper attempts land as DENY lines in ~/.dev-pomogator/logs/form-guards.log
 * (the unified v3/v4 sink — FR-24's `meta-guard.log` resolved to it, FR-23).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const GUARD = path.resolve(__dirname, '..', 'extension-json-meta-guard.ts');
const AUDIT_LOG = path.join(os.homedir(), '.dev-pomogator', 'logs', 'form-guards.log');

let root: string;

function writeFixture(rel: string, content: string): string {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return abs;
}

/** Run the real hook with a PreToolUse Write payload. */
function runGuard(filePath: string, newContent: string) {
  const stdin = JSON.stringify({
    tool_name: 'Write',
    tool_input: { file_path: filePath, content: newContent },
  });
  const r = spawnSync(process.execPath, ['--import', 'tsx', GUARD], {
    encoding: 'utf-8',
    input: stdin,
    timeout: 60_000,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function expectDeny(r: ReturnType<typeof runGuard>, removedToken: string) {
  expect(r.status, `expected deny exit 2; stderr: ${r.stderr}`).toBe(2);
  const out = JSON.parse(r.stdout);
  expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
  expect(out.hookSpecificOutput.permissionDecisionReason).toContain(removedToken);
}

const HOOKS_JSON = (extra = '') => JSON.stringify({
  hooks: {
    PreToolUse: [
      {
        matcher: 'Write|Edit',
        hooks: [
          { type: 'command', command: 'node bootstrap -- tools/specs-validator/phase-gate.ts' },
          { type: 'command', command: 'node bootstrap -- tools/specs-validator/extension-json-meta-guard.ts' },
          { type: 'command', command: 'node spawn spec-conformance-guard.bundle.mjs' },
          ...(extra ? [{ type: 'command', command: extra }] : []),
        ],
      },
    ],
    PostToolUse: [
      { matcher: 'Write|Edit', hooks: [{ type: 'command', command: 'node spawn spec-conformance-push.bundle.mjs' }] },
    ],
  },
}, null, 2);

const MCP_JSON = JSON.stringify({
  mcpServers: {
    'dev-pomogator-specs': { command: 'node', args: ['-e', 'spawn server.bundle.mjs'] },
  },
}, null, 2);

const SETTINGS_JSON = JSON.stringify({
  hooks: {
    PreToolUse: [
      {
        matcher: 'Write|Edit',
        hooks: [
          { type: 'command', command: 'npx tsx tools/specs-validator/task-form-guard.ts' },
          { type: 'command', command: 'npx tsx tools/specs-validator/extension-json-meta-guard.ts' },
        ],
      },
    ],
  },
}, null, 2);

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-guard-'));
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('FR-24 meta-guard: removal denied across v3 + v4 manifests (T-Trans.6)', () => {
  it('denies removing a v3 form-guard from .claude/settings.json + logs the tamper', () => {
    const file = writeFixture('p1/.claude/settings.json', SETTINGS_JSON);
    const parsed = JSON.parse(SETTINGS_JSON);
    parsed.hooks.PreToolUse[0].hooks = parsed.hooks.PreToolUse[0].hooks.filter(
      (h: { command: string }) => !h.command.includes('task-form-guard'),
    );
    const r = runGuard(file, JSON.stringify(parsed, null, 2));
    expectDeny(r, 'task-form-guard.ts');

    // Tamper log: a DENY line for THIS unique file path exists in the audit sink.
    const log = fs.readFileSync(AUDIT_LOG, 'utf-8');
    const mine = log.split('\n').filter((l) => l.includes('DENY') && l.includes('extension-json-meta-guard') && l.includes(path.basename(root)));
    expect(mine.length, 'tamper attempt must be logged (FR-24 / NFR-Security-2)').toBeGreaterThan(0);
  });

  it('denies removing spec-conformance-guard from .claude-plugin/hooks.json', () => {
    const file = writeFixture('p2/.claude-plugin/hooks.json', HOOKS_JSON());
    const parsed = JSON.parse(HOOKS_JSON());
    parsed.hooks.PreToolUse[0].hooks = parsed.hooks.PreToolUse[0].hooks.filter(
      (h: { command: string }) => !h.command.includes('spec-conformance-guard'),
    );
    expectDeny(runGuard(file, JSON.stringify(parsed, null, 2)), 'spec-conformance-guard');
  });

  it('denies removing the dev-pomogator-specs MCP server entry from .mcp.json', () => {
    const file = writeFixture('p3/.mcp.json', MCP_JSON);
    expectDeny(runGuard(file, JSON.stringify({ mcpServers: {} }, null, 2)), 'dev-pomogator-specs');
  });

  it('denies removing the meta-guard own registration (self-protection invariant)', () => {
    const file = writeFixture('p4/.claude-plugin/hooks.json', HOOKS_JSON());
    const parsed = JSON.parse(HOOKS_JSON());
    parsed.hooks.PreToolUse[0].hooks = parsed.hooks.PreToolUse[0].hooks.filter(
      (h: { command: string }) => !h.command.includes('extension-json-meta-guard'),
    );
    expectDeny(runGuard(file, JSON.stringify(parsed, null, 2)), 'extension-json-meta-guard');
  });

  it('allows ADDING an unrelated hook (additive-only policy, not a freeze)', () => {
    const file = writeFixture('p5/.claude-plugin/hooks.json', HOOKS_JSON());
    const r = runGuard(file, HOOKS_JSON('node bootstrap -- tools/new-feature/new_hook.ts'));
    expect(r.status, `stderr: ${r.stderr}`).toBe(0);
  });

  it('ignores non-guarded paths (no false positives on ordinary JSON writes)', () => {
    const file = writeFixture('p6/config/random.json', '{"a":1}');
    const r = runGuard(file, '{}');
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });
});
