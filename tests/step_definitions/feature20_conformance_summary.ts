/**
 * @feature20 step definitions — FR-20 threshold-only conformance summary
 * (T-Trans.2), bound to the REAL modules: `buildConformanceSummary` renders the
 * prompt-time line over injected isolated paths; the ack step spawns the real
 * `ack-summary.ts` CLI — the exact invocation the /spec-status skill makes.
 *
 * @see .specs/spec-generator-v4/FR.md FR-20
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { V4World } from '../hooks/before-after.ts';
import { buildConformanceSummary } from '../../tools/specs-validator/conformance-summary.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
const ACK_CLI = path.join(REPO_ROOT, 'tools', 'specs-validator', 'ack-summary.ts');

interface F20World extends V4World {
  ackFile?: string;
  fr20RepoRoot?: string;
}

function summary(w: F20World): string | null {
  return buildConformanceSummary({ ackFile: w.ackFile!, repoRoot: w.fr20RepoRoot! });
}

function seedDeny(w: F20World, n: number): void {
  const dir = path.join(w.fr20RepoRoot!, '.dev-pomogator', '.spec-check-log');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().slice(0, 10)}.jsonl`);
  const lines = Array.from({ length: n }, (_, i) =>
    JSON.stringify({
      timestamp: new Date(Date.now() + i).toISOString(),
      code: 'DUPLICATE_DEFINITION',
      severity: 'deny',
      message: `bdd seed ${i}`,
    }),
  );
  fs.appendFileSync(file, lines.join('\n') + '\n');
}

Given('an isolated conformance state with zero unresolved events', function (this: F20World) {
  this.ackFile = path.join(this.tempDir, 'state', 'last-summary-ack.json');
  this.fr20RepoRoot = path.join(this.tempDir, 'repo');
  fs.mkdirSync(this.fr20RepoRoot, { recursive: true });
  // Stamp an ack NOW so any machine-local soft-tier entries are excluded —
  // the scenario then exercises pure threshold behaviour on the hard tier.
  fs.mkdirSync(path.dirname(this.ackFile), { recursive: true });
  fs.writeFileSync(
    this.ackFile,
    JSON.stringify({ ack_timestamp: new Date().toISOString(), ack_event_count: 0 }),
  );
});

Then('the prompt-time summary emits nothing', function (this: F20World) {
  assert.equal(summary(this), null, 'zero unresolved events must render SILENCE (zero-noise default)');
});

When('two deny findings land in the hard-tier log', function (this: F20World) {
  seedDeny(this, 2);
});

Then('the prompt-time summary is a single unresolved-DENY line', function (this: F20World) {
  const line = summary(this);
  assert.ok(line, 'unresolved DENY ≥ 1 must emit the line');
  assert.match(line!, /^📊 Spec conformance: 2 unresolved DENY since /);
  assert.equal(line!.split('\n').length, 1, 'one line, not an aggregate dump');
});

When('the spec-status ack stamps the state file', function (this: F20World) {
  const r = spawnSync(
    process.execPath,
    ['--import', 'tsx', ACK_CLI, '--ack-file', this.ackFile!, '--repo-root', this.fr20RepoRoot!],
    { encoding: 'utf-8', timeout: 60_000 },
  );
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /acknowledged at/);
});

Then('the prompt-time summary is silent until a newer deny arrives', function (this: F20World) {
  assert.equal(summary(this), null, 'acknowledged backlog must be silent');
  seedDeny(this, 1); // strictly newer than the ack stamp
  const line = summary(this);
  assert.ok(line, 'a NEW deny after the ack must re-trigger');
  assert.match(line!, /1 unresolved DENY/);
});
