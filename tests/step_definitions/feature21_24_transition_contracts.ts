/**
 * @feature21 / @feature24 step definitions — v3-transition contract scenarios
 * (T-Trans.3 / T-Trans.6), bound to the REAL CLI + REAL hook subprocesses:
 *   107 → FR-21  task-table CLI byte-matches the frozen committed baseline
 *   108 → FR-24  meta-guard denies protected-registration removal (v4 scope)
 *
 * Both spawn the production artifacts — no mocks, no re-implementation
 * (the vitest twins live in tools/specs-generator/__tests__/ and
 * tools/specs-validator/__tests__/; these scenarios pin the same contracts
 * into the spec graph so the FR-32 honesty gate sees them).
 *
 * @see .specs/spec-generator-v4/FR.md FR-21, FR-24
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
const CORE = path.join(REPO_ROOT, 'tools', 'specs-generator', 'specs-generator-core.mjs');
const BASELINE = path.join(REPO_ROOT, 'tools', 'specs-generator', '__fixtures__', 'task-table.baseline.md');
const FIXTURE_INPUT = path.join(REPO_ROOT, 'tools', 'specs-generator', '__fixtures__', 'task-table-input', 'TASKS.md');
const META_GUARD = path.join(REPO_ROOT, 'tools', 'specs-validator', 'extension-json-meta-guard.ts');

// ── SPECGEN004_107 — FR-21: task-table byte contract ───────────────────────

interface F21World extends V4World {
  corpusRoot?: string;
  tableOut?: string;
  tableOut2?: string;
}

function runTaskTable(corpusRoot: string): { stdout: string; status: number | null; stderr: string } {
  const r = spawnSync(
    process.execPath,
    [CORE, 'spec-status', '-Path', '.specs/task-table-fixture', '-Format', 'task-table'],
    { encoding: 'utf-8', env: { ...process.env, SPECS_GENERATOR_ROOT: corpusRoot }, timeout: 60_000 },
  );
  return { stdout: r.stdout ?? '', status: r.status, stderr: r.stderr ?? '' };
}

Given('the frozen task-table input spec fixture', function (this: F21World) {
  const specDir = path.join(this.tempDir, '.specs', 'task-table-fixture');
  fs.mkdirSync(specDir, { recursive: true });
  fs.copyFileSync(FIXTURE_INPUT, path.join(specDir, 'TASKS.md'));
  this.corpusRoot = this.tempDir;
});

When('spec-status runs with the task-table format on it', function (this: F21World) {
  const r = runTaskTable(this.corpusRoot!);
  assert.equal(r.status, 0, `CLI must exit 0; stderr: ${r.stderr}`);
  this.tableOut = r.stdout;
});

Then('the output byte-matches the committed task-table baseline', function (this: F21World) {
  const baseline = fs.readFileSync(BASELINE, 'utf-8').replace(/\r\n/g, '\n').trimEnd();
  assert.equal(
    this.tableOut!.replace(/\r\n/g, '\n').trimEnd(),
    baseline,
    'FR-21: the task-table shape is a stable public contract — regen the baseline only on a deliberate change',
  );
});

Then('a second run produces identical bytes without any MCP server', function (this: F21World) {
  // No MCP server is spawned anywhere in this scenario — direct-MD-parse
  // degraded mode (NFR-Reliability-7 pattern) plus determinism.
  const r2 = runTaskTable(this.corpusRoot!);
  assert.equal(r2.status, 0);
  assert.equal(r2.stdout, this.tableOut, 'task-table output must be idempotent');
});

// ── SPECGEN004_108 — FR-24: meta-guard removal-denied (v4 manifests) ────────

interface F24World extends V4World {
  manifestPath?: string;
  manifestText?: string;
  denyResult?: { status: number | null; stdout: string };
}

function hooksManifest(entries: string[]): string {
  return JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: 'Write|Edit', hooks: entries.map((command) => ({ type: 'command', command })) },
      ],
    },
  }, null, 2);
}

function runMetaGuard(filePath: string, newContent: string): { status: number | null; stdout: string } {
  const stdin = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: filePath, content: newContent } });
  const r = spawnSync(process.execPath, ['--import', 'tsx', META_GUARD], {
    encoding: 'utf-8',
    input: stdin,
    timeout: 60_000,
  });
  return { status: r.status, stdout: r.stdout ?? '' };
}

Given('a canonical hooks manifest carrying the spec-conformance-guard registration', function (this: F24World) {
  const dir = path.join(this.tempDir, '.claude-plugin');
  fs.mkdirSync(dir, { recursive: true });
  this.manifestPath = path.join(dir, 'hooks.json');
  this.manifestText = hooksManifest([
    'node spawn spec-conformance-guard.bundle.mjs',
    'node bootstrap -- tools/specs-validator/extension-json-meta-guard.ts',
  ]);
  fs.writeFileSync(this.manifestPath, this.manifestText);
});

When('an agent write removes that registration', function (this: F24World) {
  const without = hooksManifest(['node bootstrap -- tools/specs-validator/extension-json-meta-guard.ts']);
  this.denyResult = runMetaGuard(this.manifestPath!, without);
});

Then('the meta-guard denies the write naming spec-conformance-guard', function (this: F24World) {
  assert.equal(this.denyResult!.status, 2, 'protected-registration removal must deny (exit 2)');
  const out = JSON.parse(this.denyResult!.stdout);
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /spec-conformance-guard/);
});

Then('removing the meta-guard own registration is denied too', function (this: F24World) {
  // Self-protection invariant (FR-24): the guard may not be disarmed by
  // removing its own registration.
  const without = hooksManifest(['node spawn spec-conformance-guard.bundle.mjs']);
  const r = runMetaGuard(this.manifestPath!, without);
  assert.equal(r.status, 2, 'self-removal must deny (exit 2)');
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /extension-json-meta-guard/);
});
