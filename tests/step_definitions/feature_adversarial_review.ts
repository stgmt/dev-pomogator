import { After, Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { draftRevision, evaluateAdversarialReview, ADVERSARIAL_REVIEW_FILE, ADVERSARIAL_REVIEW_SCHEMA } from '../../tools/specs-generator/adversarial-review.mjs';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';

type ReviewResult = ReturnType<typeof evaluateAdversarialReview>;
type ReviewWorld = { review?: { dir: string; slug: string; results: Record<string, ReviewResult>; stop?: ReturnType<typeof spawnSync>; mcpReview?: Record<string, unknown>; initialRevision: string } };
const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const core = path.join(repoRoot, 'tools', 'specs-generator', 'specs-generator-core.mjs');
const evidence = { file: 'tools/specs-generator/adversarial-review.mjs', line: 1 };

After(function (this: ReviewWorld) {
  if (this.review?.dir) fs.rmSync(this.review.dir, { recursive: true, force: true });
});

function writeDraft(dir: string, suffix = '') {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries({
    'README.md': '# Review fixture\n\nReady for review.\n',
    'CHANGELOG.md': '# Changelog\n\nDraft created.\n',
    'FR.md': '# Requirements\n\n## FR-1\n\nPreserve the existing constructor API.\n',
    'ACCEPTANCE_CRITERIA.md': '# Acceptance\n\n## AC-1\n\nWorks.\n',
    'DESIGN.md': '# Design\n\nKeep config-seeded agents authoritative.\n',
    'TASKS.md': '# Tasks\n\n- [ ] Verify the existing test runner.\n',
    'demo.feature': 'Feature: Demo\n\n  Scenario: works\n    Given a draft\n',
  })) fs.writeFileSync(path.join(dir, name), `${body}${suffix}`);
}

function writeReview(dir: string, patch: Record<string, unknown> = {}) {
  const record = {
    schema: ADVERSARIAL_REVIEW_SCHEMA,
    reviewed_spec_sha256: draftRevision(dir).sha256,
    author_run_id: 'author-1',
    reviewer_run_id: 'reviewer-1',
    reviewer_execution: 'independent-agent',
    reviewer_capability: 'repository-code-review',
    round: 1,
    verdict: 'ACCEPTED',
    findings: [],
    residual_risks: ['Repository evolution after review requires a fresh review.'],
    ...patch,
  };
  fs.writeFileSync(path.join(dir, ADVERSARIAL_REVIEW_FILE), `<!-- adversarial-review\n${JSON.stringify(record, null, 2)}\n-->\n\n# Independent Adversarial Review\n`);
}

function finding(severity: 'P0' | 'P1' | 'P2', status: string, patch: Record<string, unknown> = {}) {
  return { severity, status, mechanism: 'contract conflict', impact: 'unsafe implementation decision', required_resolution: 'preserve the verified contract', evidence, ...patch };
}

Given('a complete draft with an adversarial-review artifact fixture', function (this: ReviewWorld) {
  const slug = `adversarial-review-${Date.now()}`;
  const dir = path.join(repoRoot, '.specs', slug);
  fs.mkdirSync(dir, { recursive: true });
  writeDraft(dir);
  this.review = { dir, slug, results: {}, initialRevision: draftRevision(dir).sha256 };
});

When('the real review gate evaluates missing, self-authored, and stale review records', function (this: ReviewWorld) {
  const state = this.review!;
  state.results.missing = evaluateAdversarialReview(state.dir);
  writeReview(state.dir, { reviewer_run_id: 'author-1' });
  state.results.self = evaluateAdversarialReview(state.dir);
  writeReview(state.dir);
  fs.appendFileSync(path.join(state.dir, 'DESIGN.md'), '\nChanged after review.\n');
  state.results.stale = evaluateAdversarialReview(state.dir);
});

Then('missing review artifact is RED with actionable debt', function (this: ReviewWorld) {
  assert.equal(this.review!.results.missing.status, 'RED');
  assert.deepEqual(this.review!.results.missing.debt, ['MISSING_ARTIFACT']);
});

Then('a self-authored review is RED with identity debt', function (this: ReviewWorld) {
  assert.equal(this.review!.results.self.status, 'RED');
  assert.ok(this.review!.results.self.debt.includes('SELF_AUTHORED_REVIEW'));
});

Then('a stale review is RED with digest debt', function (this: ReviewWorld) {
  assert.equal(this.review!.results.stale.status, 'RED');
  assert.ok(this.review!.results.stale.debt.includes('STALE_REVIEW'));
});

When('the real review gate evaluates unresolved P0 and P1 findings', function (this: ReviewWorld) {
  const state = this.review!;
  writeReview(state.dir, { findings: [finding('P0', 'OPEN')] });
  state.results.p0 = evaluateAdversarialReview(state.dir);
  writeReview(state.dir, { findings: [finding('P1', 'OPEN')] });
  state.results.p1 = evaluateAdversarialReview(state.dir);
});

Then('unresolved P0 and P1 findings are each RED and blocking', function (this: ReviewWorld) {
  assert.equal(this.review!.results.p0.status, 'RED');
  assert.ok(this.review!.results.p0.debt.includes('FINDING_1_BLOCKING_P0'));
  assert.equal(this.review!.results.p1.status, 'RED');
  assert.ok(this.review!.results.p1.debt.includes('FINDING_1_BLOCKING_P1'));
});

When('the real review gate evaluates incomplete and approved P2 waivers', function (this: ReviewWorld) {
  const state = this.review!;
  writeReview(state.dir, { findings: [finding('P2', 'WAIVED', { waiver: { approved_by: 'product-owner', rationale: '' } })] });
  state.results.incompleteWaiver = evaluateAdversarialReview(state.dir);
  writeReview(state.dir, { findings: [finding('P2', 'WAIVED', { waiver: { approved_by: 'product-owner', rationale: 'Deferred with documented dashboard migration.' } })] });
  state.results.approvedWaiver = evaluateAdversarialReview(state.dir);
});

Then('incomplete P2 waivers are RED and the approved waiver is GREEN', function (this: ReviewWorld) {
  assert.equal(this.review!.results.incompleteWaiver.status, 'RED');
  assert.ok(this.review!.results.incompleteWaiver.debt.includes('FINDING_1_P2_REQUIRES_FIX_OR_WAIVER'));
  assert.equal(this.review!.results.approvedWaiver.status, 'GREEN');
});

When('the real review gate evaluates missing outside and unverified repository evidence', function (this: ReviewWorld) {
  const state = this.review!;
  writeReview(state.dir, { findings: [finding('P1', 'OPEN', { evidence: { file: 'missing.ts', line: 1 } })] });
  state.results.missingEvidence = evaluateAdversarialReview(state.dir, { repoRoot });
  writeReview(state.dir, { findings: [finding('P1', 'OPEN', { evidence: { file: '../outside.ts', line: 1 } })] });
  state.results.outsideEvidence = evaluateAdversarialReview(state.dir, { repoRoot });
  writeReview(state.dir, { findings: [finding('P1', 'OPEN', { unverified_blocker: true })] });
  state.results.unverifiedEvidence = evaluateAdversarialReview(state.dir, { repoRoot });
});

Then('every invalid or unavailable repository evidence reference is RED', function (this: ReviewWorld) {
  for (const key of ['missingEvidence', 'outsideEvidence', 'unverifiedEvidence']) assert.equal(this.review!.results[key].status, 'RED', `${key} must fail closed`);
  assert.ok(this.review!.results.missingEvidence.debt.includes('FINDING_1_MISSING_EVIDENCE'));
  assert.ok(this.review!.results.outsideEvidence.debt.includes('FINDING_1_MISSING_EVIDENCE'));
  assert.ok(this.review!.results.unverifiedEvidence.debt.includes('FINDING_1_REPOSITORY_EVIDENCE_UNAVAILABLE'));
});

When('the review digest sees CRLF-only and nested authored-document changes', function (this: ReviewWorld) {
  const state = this.review!;
  writeReview(state.dir);
  const beforeCrlf = draftRevision(state.dir).sha256;
  for (const file of draftRevision(state.dir).files) {
    const full = path.join(state.dir, file);
    fs.writeFileSync(full, fs.readFileSync(full, 'utf8').replace(/\n/g, '\r\n'));
  }
  state.results.crlf = { status: draftRevision(state.dir).sha256 === beforeCrlf ? 'GREEN' : 'RED', debt: [] } as ReviewResult;
  fs.mkdirSync(path.join(state.dir, '.architecture-research'), { recursive: true });
  fs.writeFileSync(path.join(state.dir, '.architecture-research', 'decision.md'), '# New authored decision\n');
  state.results.nestedChange = evaluateAdversarialReview(state.dir);
});

Then('CRLF-only changes preserve the digest and nested authored changes invalidate review freshness', function (this: ReviewWorld) {
  assert.equal(this.review!.results.crlf.status, 'GREEN');
  assert.equal(this.review!.results.nestedChange.status, 'RED');
  assert.ok(this.review!.results.nestedChange.debt.includes('STALE_REVIEW'));
});

When('get_spec_status reads a fresh independent review artifact', async function (this: ReviewWorld) {
  const state = this.review!;
  writeReview(state.dir);
  const graph = buildGraph({ repoRoot, skipNdjson: true });
  const tool = buildToolRegistry(() => graph, { repoRoot }).find((entry) => entry.name === 'get_spec_status')!;
  const response = await tool.handler({ spec: state.slug }) as { content: Array<{ text: string }> };
  state.mcpReview = JSON.parse(response.content[0].text).independent_adversarial_review;
});

Then('MCP serializes review status reviewer identity execution and revision digest', function (this: ReviewWorld) {
  const status = this.review!.mcpReview!;
  assert.equal(status.status, 'GREEN');
  assert.equal(status.reviewer_run_id, 'reviewer-1');
  assert.equal(status.reviewer_execution, 'independent-agent');
  assert.equal(status.current_spec_sha256, draftRevision(this.review!.dir).sha256);
});

When('Finalization STOP runs without an accepted independent review', function (this: ReviewWorld) {
  const state = this.review!;
  fs.writeFileSync(path.join(state.dir, '.progress.json'), JSON.stringify({ phases: { Finalization: { stopConfirmed: false } } }));
  state.stop = spawnSync(process.execPath, [core, 'spec-status', '-Path', `.specs/${state.slug}`, '-ConfirmStop', 'Finalization'], { encoding: 'utf8', cwd: repoRoot });
});

Then('Finalization STOP is refused and progress remains unconfirmed', function (this: ReviewWorld) {
  const result = this.review!.stop!;
  assert.notEqual(result.status, 0, `Finalization STOP unexpectedly passed: ${result.stdout}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /Independent Adversarial Review/i);
  const progress = JSON.parse(fs.readFileSync(path.join(this.review!.dir, '.progress.json'), 'utf8'));
  assert.equal(progress.phases.Finalization.stopConfirmed, false, 'red review must not persist the Finalization transition');
});
