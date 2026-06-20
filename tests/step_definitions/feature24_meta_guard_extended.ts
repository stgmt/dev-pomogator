/**
 * @feature24 extended step definitions — meta-guard additional coverage
 *
 * Covers SPECGEN004_312-315: cases NOT already covered by SPECGEN004_108 in
 * feature21_24_transition_contracts.ts:
 *   312 → v3 settings.json form-guard removal denied
 *   313 → .mcp.json dev-pomogator-specs entry removal denied
 *   314 → additive-only: adding an unrelated hook is allowed
 *   315 → non-guarded path: no false positives on ordinary JSON writes
 *
 * All scenarios spawn the REAL extension-json-meta-guard.ts hook via
 * process.execPath + '--import tsx' — no mocks, no inline logic copies.
 *
 * @see .specs/spec-generator-v4/FR.md FR-24
 * @see tools/specs-validator/extension-json-meta-guard.ts
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
const META_GUARD = path.join(REPO_ROOT, 'tools', 'specs-validator', 'extension-json-meta-guard.ts');

// ─── helpers ────────────────────────────────────────────────────────────────

/** Spawn the guard with a Write stdin payload; returns { status, stdout }. */
function runGuardWrite(filePath: string, newContent: string): { status: number | null; stdout: string } {
  const stdin = JSON.stringify({
    tool_name: 'Write',
    tool_input: { file_path: filePath, content: newContent },
  });
  const r = spawnSync(process.execPath, ['--import', 'tsx', META_GUARD], {
    encoding: 'utf-8',
    input: stdin,
    timeout: 60_000,
    cwd: REPO_ROOT,
  });
  return { status: r.status, stdout: r.stdout ?? '' };
}

/** Minimal settings.json body with one form-guard in hooks.PreToolUse. */
function settingsWithGuard(guardName: string): string {
  return JSON.stringify(
    {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Write|Edit',
            hooks: [{ type: 'command', command: `node bootstrap -- tools/specs-validator/${guardName}` }],
          },
        ],
      },
    },
    null,
    2,
  );
}

/** Minimal settings.json with the guard removed (empty hooks). */
function settingsWithoutGuard(): string {
  return JSON.stringify({ hooks: { PreToolUse: [] } }, null, 2);
}

/** Minimal .mcp.json with dev-pomogator-specs server. */
function mcpJsonWith(): string {
  return JSON.stringify(
    {
      mcpServers: {
        'dev-pomogator-specs': {
          command: 'node',
          args: ['tools/spec-mcp-server/server.bundle.mjs'],
        },
      },
    },
    null,
    2,
  );
}

/** .mcp.json with dev-pomogator-specs removed. */
function mcpJsonWithout(): string {
  return JSON.stringify({ mcpServers: {} }, null, 2);
}

// ─── SPECGEN004_312 — settings.json form-guard removal denied ────────────────

interface F312World extends V4World {
  settingsPath312?: string;
}

Given('a settings manifest with the task-form-guard registration present', function (this: F312World) {
  const dir = path.join(this.tempDir, '.claude');
  fs.mkdirSync(dir, { recursive: true });
  this.settingsPath312 = path.join(dir, 'settings.json');
  fs.writeFileSync(this.settingsPath312, settingsWithGuard('task-form-guard.ts'));
});

When('an agent write removes the task-form-guard entry from settings.json', function (this: F312World) {
  const r = runGuardWrite(this.settingsPath312!, settingsWithoutGuard());
  (this as unknown as { _result312: { status: number | null; stdout: string } })._result312 = r;
});

Then('the meta-guard denies the write with exit 2 naming task-form-guard', function (this: F312World) {
  const r = (this as unknown as { _result312: { status: number | null; stdout: string } })._result312;
  assert.equal(r.status, 2, `Expected exit 2 (deny); got ${r.status}`);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /task-form-guard/);
});

// ─── SPECGEN004_313 — .mcp.json MCP entry removal denied ────────────────────

interface F313World extends V4World {
  mcpJsonPath?: string;
}

Given('an .mcp.json manifest carrying the dev-pomogator-specs server entry', function (this: F313World) {
  this.mcpJsonPath = path.join(this.tempDir, '.mcp.json');
  fs.writeFileSync(this.mcpJsonPath, mcpJsonWith());
});

When('an agent write removes the dev-pomogator-specs entry from .mcp.json', function (this: F313World) {
  const r = runGuardWrite(this.mcpJsonPath!, mcpJsonWithout());
  (this as unknown as { _result313: { status: number | null; stdout: string } })._result313 = r;
});

Then('the meta-guard denies the write with exit 2 naming dev-pomogator-specs', function (this: F313World) {
  const r = (this as unknown as { _result313: { status: number | null; stdout: string } })._result313;
  assert.equal(r.status, 2, `Expected exit 2 (deny); got ${r.status}`);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /dev-pomogator-specs/);
});

// ─── SPECGEN004_314 — additive write is allowed ──────────────────────────────

When('an agent write adds an unrelated hook entry to settings.json', function (this: F312World) {
  // Keep the task-form-guard, add an unrelated entry — purely additive
  const current = fs.readFileSync(this.settingsPath312!, 'utf-8');
  const parsed = JSON.parse(current) as {
    hooks: { PreToolUse: Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }> };
  };
  parsed.hooks.PreToolUse[0].hooks.push({ type: 'command', command: 'node unrelated-hook.ts' });
  const r = runGuardWrite(this.settingsPath312!, JSON.stringify(parsed, null, 2));
  (this as unknown as { _result314: { status: number | null; stdout: string } })._result314 = r;
});

Then('the meta-guard exits 0 permitting the additive write', function (this: F312World) {
  const r = (this as unknown as { _result314: { status: number | null; stdout: string } })._result314;
  assert.equal(r.status, 0, `Expected exit 0 (allow); got ${r.status}. stdout: ${r.stdout}`);
});

// ─── SPECGEN004_315 — non-guarded path: no false positives ──────────────────

interface F315World extends V4World {
  _result315?: { status: number | null; stdout: string };
}

When('an agent write targets a non-guarded JSON file path', function (this: F315World) {
  // Use a path that looks like JSON but isn't any of the guarded patterns
  const nonGuardedPath = path.join(this.tempDir, 'some-random-config.json');
  const r = runGuardWrite(nonGuardedPath, '{"hello":"world"}');
  this._result315 = r;
});

Then('the meta-guard exits 0 with no denial output', function (this: F315World) {
  assert.equal(this._result315!.status, 0, `Expected exit 0 for non-guarded path; got ${this._result315!.status}. stdout: ${this._result315!.stdout}`);
  // stdout should be empty (guard exits early without writing any JSON)
  assert.equal(this._result315!.stdout.trim(), '', `Expected empty stdout; got: ${this._result315!.stdout}`);
});
