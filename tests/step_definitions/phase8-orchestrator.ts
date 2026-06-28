/**
 * Phase 8 BDD step definitions — spec-generator-orchestrator (FR-33).
 *
 * SPECGEN004_76..79 are driven against the REAL ledger + feature-map scripts
 * (appendPendingEntry / pendingReminder / applyApproved / checkFeatureMapDrift).
 * SPECGEN004_75 (delegation) is a STATIC check on the shipped SKILL.md + the
 * feature-map routing — the live agent actually invoking get_spec_status is
 * agent-flow, but "the skill delegates and does not re-implement bucketing" is
 * a verifiable property of the skill artifact.
 *
 * Regex patterns (not Cucumber Expressions) because the phrases contain `/`,
 * `(`, `)` which a Cucumber Expression treats specially.
 *
 * @see .specs/spec-generator-v4/FR.md FR-33
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import {
  appendPendingEntry,
  pendingReminder,
  applyApproved,
  ledgerPath,
  readLedger,
} from '../../.claude/skills/spec-generator-orchestrator/scripts/ledger.ts';
import {
  WORKFLOW,
  REFERENCED_CAPABILITIES,
  checkFeatureMapDrift,
  type DriftResult,
} from '../../.claude/skills/spec-generator-orchestrator/scripts/feature-map.ts';

const SLUG = 'spec-generator-v4';
const SKILL_MD = path.join(process.cwd(), '.claude/skills/spec-generator-orchestrator/SKILL.md');

interface OrchWorld extends V4World {
  reminder?: { count: number; observations: string[] };
  applyResult?: ReturnType<typeof applyApproved>;
  drift?: DriftResult;
  preSnapshot?: Record<string, string>;
  actualCaps?: string[];
  ledgerEntries?: ReturnType<typeof readLedger>;
}

function snapshotSpecDir(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isFile()) out[name] = fs.readFileSync(p, 'utf8');
  }
  return out;
}

// ── SPECGEN004_75 — delegates to a worker, no re-implementation ──────────────

Given(/the orchestrator reaches the coverage step of the workflow/, function () {
  // Static scenario — the workflow routing + skill artifact are the subject.
});

When(/it computes per-scenario coverage/, function () {
  // No-op marker — assertions are on the shipped artifacts (next steps).
});

Then(/it invokes the .get_spec_status. MCP tool/, function () {
  const coverage = WORKFLOW.filter((s) => s.step === 'coverage' || s.step === 'honesty-gate');
  assert.ok(coverage.length > 0, 'feature-map must route a coverage step');
  for (const s of coverage) {
    assert.equal(s.worker, 'get_spec_status');
    assert.equal(s.kind, 'mcp-tool'); // delegated to a tool, not skill-local logic
  }
  const skill = fs.readFileSync(SKILL_MD, 'utf8');
  assert.ok(skill.includes('get_spec_status'), 'SKILL.md must reference get_spec_status');
});

Then(/the orchestrator skill body contains no re-implementation of the bucketing logic/, function () {
  const skill = fs.readFileSync(SKILL_MD, 'utf8');
  // The bucketing implementation lives in tools/spec-graph/coverage.ts; the
  // orchestrator must not copy it. Guard against the tell-tale tokens.
  assert.ok(!skill.includes('RESULT_TO_BUCKET'), 'SKILL.md must not copy the bucket map');
  assert.ok(!/function\s+bucketScenarios/.test(skill), 'SKILL.md must not re-implement bucketScenarios');
  assert.ok(!/buckets\s*[:=]\s*\{\s*passed/.test(skill), 'SKILL.md must not build a bucket object inline');
});

// ── SPECGEN004_76 — friction → pending ledger entry, nothing else touched ────

Given(/the orchestrator detects a gap during a run/, function (this: OrchWorld) {
  const specDir = path.join(this.tempDir, '.specs', SLUG);
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'FR.md'), '## FR-1: Login\n');
  fs.writeFileSync(path.join(specDir, 'TASKS.md'), '## Tasks\n');
  this.preSnapshot = snapshotSpecDir(specDir);
});

When(/it records the observation/, function (this: OrchWorld) {
  appendPendingEntry(
    this.tempDir,
    SLUG,
    {
      trigger: 'friction',
      observation: 'coverage step re-derived buckets instead of calling get_spec_status',
      proposed_change: 'route the coverage step to the get_spec_status MCP tool',
      affected_files: ['SKILL.md'],
      confidence: 'high',
    },
    new Date('2026-06-03T00:00:00Z'),
  );
});

Then(/a dated entry with .status = "pending". is appended to .*SELF_IMPROVE\.md/, function (
  this: OrchWorld,
) {
  const file = ledgerPath(this.tempDir, SLUG);
  assert.ok(fs.existsSync(file), 'SELF_IMPROVE.md must be created');
  const entries = readLedger(this.tempDir, SLUG);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].status, 'pending');
  assert.match(entries[0].date, /^\d{4}-\d{2}-\d{2}$/);
});

Then(/no spec or code file is modified as a result of that entry/, function (this: OrchWorld) {
  const specDir = path.join(this.tempDir, '.specs', SLUG);
  const now = snapshotSpecDir(specDir);
  // Every pre-existing file is byte-identical; the only new file is the ledger.
  for (const [name, body] of Object.entries(this.preSnapshot!)) {
    assert.equal(now[name], body, `${name} must be untouched by a ledger append`);
  }
  const added = Object.keys(now).filter((n) => !(n in this.preSnapshot!));
  assert.deepEqual(added, ['SELF_IMPROVE.md']);
});

// ── SPECGEN004_77 — session-start reminder of pending entries ────────────────

Given(/.SELF_IMPROVE\.md. contains at least one entry with .status = "pending"./, function (
  this: OrchWorld,
) {
  appendPendingEntry(
    this.tempDir,
    SLUG,
    { trigger: 'gap', observation: 'no regression test for the resume path', proposed_change: 'add a test', affected_files: [] },
    new Date('2026-06-03T00:00:00Z'),
  );
});

When(/the orchestrator starts a session/, function (this: OrchWorld) {
  this.reminder = pendingReminder(this.tempDir, SLUG);
});

Then(/it surfaces a reminder containing the pending count/, function (this: OrchWorld) {
  assert.ok(this.reminder!.count >= 1, 'reminder must report ≥1 pending entry');
});

Then(/the reminder lists the top pending entries. observations/, function (this: OrchWorld) {
  assert.ok(this.reminder!.observations.length >= 1);
  assert.match(this.reminder!.observations[0], /resume path/);
});

// ── SPECGEN004_78 — approved auto-applies; pending never ─────────────────────

Given(/a ledger entry marked .status = "approved". by the human/, function (this: OrchWorld) {
  // One approved entry + one pending entry.
  appendPendingEntry(
    this.tempDir, SLUG,
    { trigger: 'idea', observation: 'add find_refs to the trace step', proposed_change: 'wire find_refs', affected_files: ['SKILL.md'] },
    new Date('2026-06-03T00:00:00Z'),
  );
  appendPendingEntry(
    this.tempDir, SLUG,
    { trigger: 'gap', observation: 'still pending observation', proposed_change: 'tbd', affected_files: [] },
    new Date('2026-06-03T01:00:00Z'),
  );
  // The human flips the FIRST entry to approved.
  const file = ledgerPath(this.tempDir, SLUG);
  const body = fs.readFileSync(file, 'utf8').replace('- status: pending', '- status: approved');
  fs.writeFileSync(file, body);
});

When(/the orchestrator processes the ledger/, function (this: OrchWorld) {
  this.applyResult = applyApproved(this.tempDir, SLUG, new Date('2026-06-03T02:00:00Z'));
});

Then(/it may auto-apply the entry and sets its .status = "applied". with an applied-at date/, function (
  this: OrchWorld,
) {
  assert.equal(this.applyResult!.applied.length, 1);
  assert.equal(this.applyResult!.applied[0].status, 'applied');
  assert.match(this.applyResult!.applied[0].applied_at ?? '', /^\d{4}-\d{2}-\d{2}$/);
});

Then(/any entry still .status = "pending". is left unapplied/, function (this: OrchWorld) {
  assert.equal(this.applyResult!.leftPending, 1);
  const statuses = readLedger(this.tempDir, SLUG).map((e) => e.status).sort();
  assert.deepEqual(statuses, ['applied', 'pending']);
});

// ── SPECGEN004_79 — drift guard names an unreferenced capability ─────────────

Given(/a new MCP tool exists that the orchestrator feature-map does not reference/, function (
  this: OrchWorld,
) {
  // The live surface plus a capability the map doesn't know about.
  this.actualCaps = [...REFERENCED_CAPABILITIES, 'brand_new_tool'];
});

When(/the drift guard runs/, function (this: OrchWorld) {
  this.drift = checkFeatureMapDrift(this.actualCaps!);
});

Then(/it fails with a non-zero status/, function (this: OrchWorld) {
  assert.equal(this.drift!.ok, false); // ok=false ⇒ the CLI exits non-zero
});

Then(/the message names the unreferenced capability/, function (this: OrchWorld) {
  assert.ok(this.drift!.unreferenced.includes('brand_new_tool'));
  assert.match(this.drift!.message, /brand_new_tool/);
});

// ── SPECGEN004_299 — insertion order + most-recent-first ordering ─────────────

Given(
  /two pending ledger entries appended in order with distinct observations affected-files and timestamps/,
  function (this: OrchWorld) {
    const specDir = path.join(this.tempDir, '.specs', SLUG);
    fs.mkdirSync(specDir, { recursive: true });
    appendPendingEntry(
      this.tempDir,
      SLUG,
      { trigger: 'friction', observation: 'older-observation', proposed_change: 'fix-old', affected_files: ['tools/old.ts'] },
      new Date('2026-06-03T08:00:00Z'),
    );
    appendPendingEntry(
      this.tempDir,
      SLUG,
      { trigger: 'gap', observation: 'newer-observation', proposed_change: 'fix-new', affected_files: ['tools/new.ts', 'tests/new.test.ts'] },
      new Date('2026-06-03T09:00:00Z'),
    );
  },
);

When(
  /readLedger and pendingReminder are called on that ledger/,
  function (this: OrchWorld) {
    this.ledgerEntries = readLedger(this.tempDir, SLUG);
    this.reminder = pendingReminder(this.tempDir, SLUG, 10);
  },
);

Then(
  /readLedger returns entries in insertion order older-first/,
  function (this: OrchWorld) {
    assert.equal(this.ledgerEntries!.length, 2, 'readLedger must return exactly 2 entries');
    assert.equal(this.ledgerEntries![0].observation, 'older-observation');
    assert.equal(this.ledgerEntries![1].observation, 'newer-observation');
    // affected_files are also round-tripped correctly
    assert.deepEqual(this.ledgerEntries![0].affected_files, ['tools/old.ts']);
    assert.deepEqual(this.ledgerEntries![1].affected_files, ['tools/new.ts', 'tests/new.test.ts']);
  },
);

Then(
  /pendingReminder returns observations newer-first/,
  function (this: OrchWorld) {
    assert.deepEqual(this.reminder!.observations, ['newer-observation', 'older-observation']);
  },
);
