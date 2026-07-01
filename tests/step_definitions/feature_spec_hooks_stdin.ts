/**
 * Step definitions — real-stdin e2e for the spec hooks + MCP bundle.
 * Migrated from tests/e2e/hooks-stdin-e2e.test.ts. Pipes a real JSON envelope into the
 * REAL hook scripts / the REAL server.bundle.mjs via stdin (exactly how Claude Code +
 * `.mcp.json` launch them) and asserts the stdout/exit shape. Per-scenario isolation
 * via the V4World tempDir.
 *
 *   @feature5  spec-conformance-guard ALLOW/DENY (FR-5)
 *   @feature22 ALLOW_AFTER_MIGRATION gate when .progress.json version < 4 (FR-22)
 *   @feature28 spec-conformance-push appends the JSONL finding even when throttled (FR-28)
 *   @feature4  MCP server bundle serves initialize + tools/list + get_trace (FR-4)
 *   @feature48 set_entity_status refuses a derived FR + confirms a phase STOP (FR-48)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
const BUNDLE = path.join(REPO_ROOT, 'tools', 'spec-mcp-server', 'server.bundle.mjs');

interface HookStdinWorld extends V4World {
  guard?: { status: number | null; out: any };
  push?: { status: number | null; stdout: string };
  mcpById?: Record<number, any>;
  mcpLines?: string[];
}

function runHook(scriptRel: string, input: unknown, env: Record<string, string>) {
  return spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO_ROOT, scriptRel)], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 30_000,
  });
}

function specEnv(w: HookStdinWorld) {
  return { DEV_POMOGATOR_REPO_ROOT: w.tempDir, CLAUDE_PLUGIN_ROOT: w.tempDir };
}

function writeProgress(w: HookStdinWorld, version: number) {
  fs.mkdirSync(path.join(w.tempDir, '.specs'), { recursive: true });
  fs.writeFileSync(path.join(w.tempDir, '.specs', '.progress.json'), JSON.stringify({ version }));
}

// ── spec-conformance-guard (FR-5 / FR-22) ───────────────────────────────────
Given(/^a v4 spec workspace where the conformance guard is active$/, function (this: HookStdinWorld) {
  writeProgress(this, 4);
});
Given(/^a v3 spec workspace where the conformance guard is gated out by migration$/, function (this: HookStdinWorld) {
  writeProgress(this, 3);
});

When(/^the conformance guard receives a Write of (clean FR content|duplicate FR content)$/, function (this: HookStdinWorld, kind: string) {
  const content = kind === 'clean FR content' ? '## FR-1: Login\n' : '## FR-1: First\n\n## FR-1: Second\n';
  const r = runHook('tools/spec-conformance-guard/spec-conformance-guard.ts', {
    tool_name: 'Write',
    tool_input: { file_path: path.join(this.tempDir, '.specs/auth/FR.md'), content },
  }, specEnv(this));
  this.guard = { status: r.status, out: JSON.parse(r.stdout || '{}') };
});

Then(/^the conformance guard exits 0 and returns permissionDecision "(allow|deny)"$/, function (this: HookStdinWorld, decision: string) {
  assert.equal(this.guard!.status, 0);
  assert.equal(this.guard!.out.hookSpecificOutput?.permissionDecision, decision, JSON.stringify(this.guard!.out));
});
Then(/^the deny reason mentions DUPLICATE_DEFINITION$/, function (this: HookStdinWorld) {
  assert.match(String(this.guard!.out.hookSpecificOutput?.permissionDecisionReason), /DUPLICATE_DEFINITION/);
});
Then(/^the reason is ALLOW_AFTER_MIGRATION$/, function (this: HookStdinWorld) {
  assert.equal(this.guard!.out.hookSpecificOutput?.permissionDecisionReason, 'ALLOW_AFTER_MIGRATION', JSON.stringify(this.guard!.out));
});

// ── spec-conformance-push (FR-28) ───────────────────────────────────────────
When(/^the conformance push runs on a Write to a spec whose FR has no AC$/, function (this: HookStdinWorld) {
  fs.mkdirSync(path.join(this.tempDir, '.specs', 'x'), { recursive: true });
  fs.writeFileSync(path.join(this.tempDir, '.specs', 'x', 'FR.md'), '## FR-1: Uncovered\n');
  const r = runHook('tools/spec-conformance-push/spec-conformance-push.ts', {
    tool_name: 'Write',
    tool_input: { file_path: path.join(this.tempDir, '.specs/x/FR.md') },
    session_id: 'sess-e2e-test',
  }, specEnv(this));
  this.push = { status: r.status, stdout: r.stdout ?? '' };
});
Then(/^the push exits 0 with no agent-facing stdout$/, function (this: HookStdinWorld) {
  assert.equal(this.push!.status, 0);
  assert.equal(this.push!.stdout, '');
});
Then(/^the spec-check-log records an UNCOVERED_FR finding from spec-conformance-push with the session id$/, function (this: HookStdinWorld) {
  const logDir = path.join(this.tempDir, '.dev-pomogator', '.spec-check-log');
  assert.ok(fs.existsSync(logDir), 'spec-check-log dir must exist');
  const shards = fs.readdirSync(logDir).filter((n) => n.endsWith('.jsonl'));
  assert.ok(shards.length > 0, 'at least one shard');
  const lines = fs.readFileSync(path.join(logDir, shards[0]), 'utf8').split('\n').filter(Boolean);
  const obj = JSON.parse(lines[0]);
  assert.equal(obj.finding_code, 'UNCOVERED_FR');
  assert.equal(obj.source, 'spec-conformance-push');
  assert.equal(obj.session_id, 'sess-e2e-test');
});

// ── MCP server bundle over raw stdin (FR-4 / FR-48) ──────────────────────────
const EXPECTED_TOOLS = [
  'apply_spec_change', 'archive_spec', 'conformance_check', 'create_spec', 'delete_spec_doc',
  'find_by_tags', 'find_orphans', 'find_refs', 'get_archival_proof',
  'get_node', 'get_spec_status', 'get_test_result',
  'get_trace', 'list_phase_tasks', 'list_spec_docs', 'list_specs',
  'propose_spec_change', 'read_attachment', 'read_spec_doc', 'rename_spec_doc',
  'search', 'set_entity_status', 'set_spec_status', 'validate_anchor',
].sort();

function runBundle(w: HookStdinWorld, input: string, cwd?: string) {
  const r = spawnSync(process.execPath, [BUNDLE], {
    input, encoding: 'utf8', cwd: cwd ?? w.tempDir,
    env: { ...process.env, DEV_POMOGATOR_REPO_ROOT: w.tempDir }, timeout: 25_000,
  });
  w.mcpById = {};
  w.mcpLines = [];
  for (const l of r.stdout.split('\n')) {
    const t = l.trim();
    if (!t.startsWith('{')) continue;
    w.mcpLines.push(t);
    try { const o = JSON.parse(t); if (o.id != null) w.mcpById![o.id] = o; } catch { /* noise */ }
  }
}

Given(/^an auth spec with two FRs in the MCP workspace$/, function (this: HookStdinWorld) {
  fs.mkdirSync(path.join(this.tempDir, '.specs', 'auth'), { recursive: true });
  fs.writeFileSync(path.join(this.tempDir, '.specs', 'auth', 'FR.md'), '## FR-1: Login\n## FR-2: Logout\n');
});

When(/^the MCP bundle serves initialize then tools\/list then get_trace in one stdio session$/, function (this: HookStdinWorld) {
  const init = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'e2e', version: '0' } } });
  const list = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const call = JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_trace', arguments: { node_id: 'auth:FR-1' } } });
  runBundle(this, `${init}\n${list}\n${call}\n`);
});

Then(/^the bundle identifies as dev-pomogator-specs and advertises exactly the canonical tool set$/, function (this: HookStdinWorld) {
  const initResp = JSON.parse(this.mcpLines![0]);
  assert.equal(initResp.result?.serverInfo?.name, 'dev-pomogator-specs');
  const names = (this.mcpById![2].result?.tools ?? []).map((t: any) => t.name).sort();
  assert.deepEqual(names, EXPECTED_TOOLS, `tool-set drift: ${names.join(',')}`);
});
Then(/^get_trace over the bundle returns ok for `([^`]+)`$/, function (this: HookStdinWorld, nodeId: string) {
  const payload = JSON.parse(this.mcpById![3].result?.content?.[0]?.text ?? '{}');
  assert.equal(payload.ok, true);
  assert.equal(payload.node?.id, nodeId);
});

Given(/^an auth spec with a v4 progress file and a Discovery user story in the MCP workspace$/, function (this: HookStdinWorld) {
  const dir = path.join(this.tempDir, '.specs', 'auth');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'FR.md'), '## FR-1: Login\n');
  fs.writeFileSync(path.join(dir, 'USER_STORIES.md'), '## User Story 1: As a user\n');
  const mk = () => ({ completedAt: null, stopConfirmed: false, stopConfirmedAt: null });
  fs.writeFileSync(path.join(dir, '.progress.json'), JSON.stringify({
    version: 4, featureSlug: 'auth', createdAt: '2026-01-01T00:00:00.000Z', currentPhase: 'Discovery',
    phases: { Discovery: mk(), Context: mk(), Requirements: mk(), Finalization: mk() },
  }));
});

When(/^the MCP bundle handles set_entity_status on a derived FR then confirms the Discovery phase STOP$/, function (this: HookStdinWorld) {
  const init = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'e2e', version: '0' } } });
  const call = (id: number, name: string, args: Record<string, unknown>) => JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
  runBundle(this, [
    init,
    call(2, 'set_entity_status', { id: 'auth:FR-1', to: 'in-progress' }),
    call(3, 'set_entity_status', { id: 'auth:phase:Discovery', to: 'done' }),
    call(4, 'get_spec_status', { spec: 'auth' }),
  ].join('\n') + '\n');
});

Then(/^the derived FR is refused with a computed verdict, the phase STOP is confirmed, and get_spec_status shows it$/, function (this: HookStdinWorld) {
  const body = (id: number) => JSON.parse(this.mcpById![id]?.result?.content?.[0]?.text ?? '{}');
  const d2 = body(2);
  assert.equal(d2.error, 'STATUS_DERIVED');
  assert.equal(d2.entity_type, 'FR');
  assert.equal(typeof d2.verdict, 'string');
  assert.equal(body(3).ok, true);
  const prog = JSON.parse(fs.readFileSync(path.join(this.tempDir, '.specs/auth/.progress.json'), 'utf8'));
  assert.equal(prog.phases.Discovery.stopConfirmed, true);
  const d4 = body(4);
  const disc = (d4.phases ?? []).find((p: any) => p.id === 'auth:phase:Discovery');
  assert.equal(disc?.stop_confirmed, true);
});
