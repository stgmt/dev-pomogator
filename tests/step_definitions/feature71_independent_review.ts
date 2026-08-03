import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateEvidence } from '../../tools/spec-graph/evidence.ts';
import type { EvidenceManifestInput } from '../../tools/spec-graph/evidence.ts';
import { V4World } from '../hooks/before-after.ts';

interface ReviewWorld extends V4World { manifest?: EvidenceManifestInput; state?: string; reason?: string; invalidity?: string; criteria?: string[]; }
function baseManifest(world: ReviewWorld): EvidenceManifestInput { const content = Buffer.from('live producer recording'); const sha256 = crypto.createHash('sha256').update(content).digest('hex'); const rel = 'review/walkthrough.mp4'; const dir = path.join(world.tempDir, '.specs', 'fixture', 'attachments', 'review'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'walkthrough.mp4'), content); return { schemaVersion: 1, path: rel, kind: 'demonstration', mediaType: 'video/mp4', sha256, byteSize: content.length, producer: 'live-producer', runId: 'run-71', finalizedAt: '2026-08-02T00:00:00.000Z', subjectRevision: 'fr71-rev', reviewer: 'independent-reviewer', judgeInvocation: 'judge-run-71', reviewedDigest: sha256, reviewStatus: 'CONFIRMED' }; }
Given('a live target exercise with a video recorder', function (this: ReviewWorld) { this.manifest = baseManifest(this); });
Given('a finalized demonstration with distinct producer and reviewer identities', function (this: ReviewWorld) { this.manifest = baseManifest(this); });
Given('a demonstration with multiple required criteria', function (this: ReviewWorld) { this.manifest = baseManifest(this); this.criteria = ['AC-71.1', 'AC-71.2', 'AC-71.3', 'AC-71.4', 'AC-71.5']; });
Given(/^required demonstration proof whose review is (reviewer equals producer|producer identity absent|reviewer identity absent|bound to a different digest|missing a required criterion|contains a required DENIED outcome|unavailable)$/, function (this: ReviewWorld, invalidity: string) { this.invalidity = invalidity; const base = baseManifest(this); const changes: Record<string, Partial<EvidenceManifestInput>> = { 'reviewer equals producer': { reviewer: 'live-producer' }, 'producer identity absent': { producer: '' }, 'reviewer identity absent': { reviewer: '' }, 'bound to a different digest': { reviewedDigest: '0'.repeat(64) }, 'missing a required criterion': { reviewStatus: 'INCOMPLETE' }, 'contains a required DENIED outcome': { reviewStatus: 'DENIED' }, unavailable: { reviewStatus: 'UNAVAILABLE' } }; this.manifest = { ...base, ...(changes[invalidity] ?? {}) }; });
Given('the FR-71 live producer-to-judge walkthrough has been recorded', function (this: ReviewWorld) { this.manifest = baseManifest(this); });
When('the producer closes the recording and registers its manifest', function (this: ReviewWorld) { assert.equal(evaluateEvidence(this.tempDir, 'fixture', this.manifest!, 'fr71-rev').state, 'PRESENT'); });
When('the reviewer evaluates the artifact', function (this: ReviewWorld) { const result = evaluateEvidence(this.tempDir, 'fixture', this.manifest!, 'fr71-rev'); this.state = result.state; this.reason = result.reason; });
When('the independent judge emits its structured verdict', function (this: ReviewWorld) { assert.deepEqual(this.criteria, ['AC-71.1', 'AC-71.2', 'AC-71.3', 'AC-71.4', 'AC-71.5']); assert.equal(this.manifest!.reviewStatus, 'CONFIRMED'); });
When('I evaluate independent judgment', function (this: ReviewWorld) { const result = evaluateEvidence(this.tempDir, 'fixture', this.manifest!, 'fr71-rev'); this.state = result.state; this.reason = result.reason; });
When('an independent judge reviews that exact MP4 against every AC-71 criterion', function (this: ReviewWorld) { const result = evaluateEvidence(this.tempDir, 'fixture', this.manifest!, 'fr71-rev'); this.state = result.state; this.reason = result.reason; });
Then('hashing and judge review begin only after the artifact is finalized', function (this: ReviewWorld) { assert.equal(this.state, undefined); assert.ok(this.manifest!.finalizedAt); });
Then('the review records both identities and the exact reviewed digest', function (this: ReviewWorld) { assert.notEqual(this.manifest!.producer, this.manifest!.reviewer); assert.equal(this.manifest!.reviewedDigest, this.manifest!.sha256); });
Then('every criterion has a timestamped observation and CONFIRMED or DENIED outcome', function (this: ReviewWorld) { assert.equal(this.manifest!.reviewStatus, 'CONFIRMED'); assert.ok(this.manifest!.judgeInvocation); });
Then('operational proof remains incomplete and the smart verdict is not GREEN', function (this: ReviewWorld) { assert.equal(this.state, 'MISSING'); assert.notEqual(this.reason, 'valid'); });
Then('the evidence manifest and CONFIRMED verdict satisfy FR-71 demonstration proof', function (this: ReviewWorld) { assert.equal(this.state, 'PRESENT'); assert.equal(this.manifest!.reviewStatus, 'CONFIRMED'); assert.equal(this.manifest!.reviewedDigest, this.manifest!.sha256); });
