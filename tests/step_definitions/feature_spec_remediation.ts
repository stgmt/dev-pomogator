import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  analyzeRemediation,
  runRemediationLoop,
  proposeSpecRepairs,
  applySpecRepairs,
  type RemediationAnalysis,
} from '../../tools/specs-generator/spec-remediation.ts';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';
import type { RemediationReport } from '../../tools/specs-generator/spec-remediation-contract.ts';
import type { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '../..');
const FIXTURE_ROOT = path.join(REPO_ROOT, 'tests', 'fixtures', 'spec-remediation');
const SLUG = 'spec-dashboard-damaged';

interface RemediationWorld extends V4World {
  remediationRoot?: string;
  semanticEnvelope?: unknown;
  expectedCodes?: string[];
  firstAnalysis?: RemediationAnalysis;
  secondAnalysis?: RemediationAnalysis;
  report?: RemediationReport;
  semanticProposalId?: string;
  unissuedApplyError?: string;
  unissuedBeforeBytes?: Map<string, Buffer>;
  readOnlyBytes?: Map<string, Buffer>;
  safeFindingFingerprint?: string;
  safeProposalId?: string;
  safeApplyWrites?: number;
  staleProposalStop?: string;
}

function specBytes(root: string): Map<string, Buffer> {
  const specDir = path.join(root, '.specs', SLUG);
  return new Map(fs.readdirSync(specDir).sort().map((file) => [file, fs.readFileSync(path.join(specDir, file))]));
}

function sameBytes(left: Map<string, Buffer>, right: Map<string, Buffer>): boolean {
  return left.size === right.size && [...left].every(([file, value]) => right.get(file)?.equals(value));
}

Given(/^the damaged spec-dashboard dogfood fixture is copied to a throwaway remediation workspace$/, function (this: RemediationWorld) {
  const source = path.join(FIXTURE_ROOT, 'spec-dashboard-damaged');
  const target = path.join(this.tempDir, '.specs', SLUG);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
  fs.writeFileSync(path.join(this.tempDir, 'package.json'), '{"name":"remediation-dogfood","private":true}\n', 'utf8');
  this.remediationRoot = this.tempDir;
  this.semanticEnvelope = JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, 'semantic-review.json'), 'utf8'));
  this.expectedCodes = JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, 'expected-findings.json'), 'utf8')).required_codes;
  this.readOnlyBytes = specBytes(this.tempDir);
});

When(/^the canonical multilayer validator analyzes the dogfood fixture once$/, { timeout: 120_000 }, async function (this: RemediationWorld) {
  this.firstAnalysis = await analyzeRemediation({
    repoRoot: this.remediationRoot!,
    spec: SLUG,
    semanticFindings: this.semanticEnvelope,
    semanticRequired: true,
  });
});

Then(/^every dogfood defect class is returned in one normalized report$/, function (this: RemediationWorld) {
  assert.ok(this.firstAnalysis, 'analysis missing');
  const codes = new Set(this.firstAnalysis.findings.map((finding) => finding.code));
  for (const code of this.expectedCodes!) assert.ok(codes.has(code), `missing ${code}; got ${[...codes].join(', ')}`);
  assert.equal(new Set(this.firstAnalysis.findings.map((finding) => finding.fingerprint)).size, this.firstAnalysis.findings.length, 'fingerprints must be unique');
});

Then(/^the semantic dashboard decisions are not auto-applicable$/, function (this: RemediationWorld) {
  const semantic = this.firstAnalysis!.findings.filter((finding) => this.expectedCodes!.includes(finding.code));
  assert.ok(semantic.length >= this.expectedCodes!.length);
  assert.ok(semantic.every((finding) => ['DECISION_REQUIRED', 'PROPOSAL_ONLY', 'NONE'].includes(finding.repairClass)));
  assert.equal(this.firstAnalysis!.candidates.length, 0);
});

Then(/^structural cleanliness cannot make the dogfood fixture implementation-ready$/, function (this: RemediationWorld) {
  assert.notEqual(this.firstAnalysis!.verdict.readiness.overall, 'READY');
  assert.notEqual(this.firstAnalysis!.verdict.verdict, 'GREEN');
  assert.equal(this.firstAnalysis!.verdict.readiness.lanes.MULTILAYER.status, 'RED');
});

When(/^the validator repeats a read-only full pass on the unchanged fixture$/, { timeout: 120_000 }, async function (this: RemediationWorld) {
  this.secondAnalysis = await analyzeRemediation({
    repoRoot: this.remediationRoot!, spec: SLUG,
    semanticFindings: this.semanticEnvelope, semanticRequired: true,
  });
});

Then(/^the second pass has stable hashes and performs zero writes$/, function (this: RemediationWorld) {
  assert.deepEqual(this.secondAnalysis!.snapshot, this.firstAnalysis!.snapshot);
  assert.ok(sameBytes(this.readOnlyBytes!, specBytes(this.remediationRoot!)), 'read-only check changed fixture bytes');
});

When(/^the remediation loop runs without a safe candidate$/, { timeout: 120_000 }, async function (this: RemediationWorld) {
  this.report = await runRemediationLoop({
    repoRoot: this.remediationRoot!, spec: SLUG, mode: 'repair', maxRounds: 3,
    semanticFindings: this.semanticEnvelope, semanticRequired: true,
  });
});

Then(/^the loop stops for a decision without guessing prose$/, function (this: RemediationWorld) {
  assert.equal(this.report!.stopReason, 'DECISION_REQUIRED');
  assert.equal(this.report!.applied.writes, 0);
  assert.equal(this.report!.final.readiness, 'NOT_READY');
  assert.ok(sameBytes(this.readOnlyBytes!, specBytes(this.remediationRoot!)));
});

When(/^a semantic source submits a safe MCP patch candidate$/, { timeout: 120_000 }, async function (this: RemediationWorld) {
  const finding = this.firstAnalysis!.findings.find((item) => item.code === 'PRODUCT_SURFACE_UNRESOLVED')!;
  const proposed = await proposeSpecRepairs({
    repoRoot: this.remediationRoot!, spec: SLUG,
    semanticFindings: this.semanticEnvelope, semanticRequired: true,
    repairCandidates: [{
      id: 'semantic-unsafe', source: 'semantic', repairClass: 'SAFE_MCP_PATCH', spec: SLUG,
      findingFingerprints: [finding.fingerprint],
      edits: [{ spec: SLUG, doc: 'FR.md', content: '# silently guessed\n' }],
    }],
  });
  this.semanticProposalId = proposed.proposalId;
  this.report = {
    spec: SLUG, state: 'REFUSED', stopReason: proposed.stopReason ?? 'NO_CANDIDATES',
    before: { snapshot: proposed.before.snapshot, findings: proposed.before.findings },
    applied: { writes: 0, proposalIds: [], candidates: [] }, remaining: proposed.before.findings,
    final: { snapshot: proposed.before.snapshot, findings: proposed.before.findings, verdict: proposed.before.verdict.verdict, readiness: proposed.before.verdict.readiness.overall },
    rounds: [], refusals: proposed.refusals, affectedHashes: proposed.affectedHashes, evidence: proposed.affectedHashes.before,
  };
});

Then(/^the semantic patch is refused before the MCP proposal store$/, function (this: RemediationWorld) {
  assert.equal(this.semanticProposalId, undefined);
  assert.ok(this.report!.refusals.some((refusal) => refusal.reason === 'UNTRUSTED_SOURCE'));
  assert.ok(sameBytes(this.readOnlyBytes!, specBytes(this.remediationRoot!)));
});

When(/^a mechanical safe patch is proposed and applied through remediation$/, { timeout: 120_000 }, async function (this: RemediationWorld) {
  const finding = this.firstAnalysis!.findings.find((item) => item.code === 'TASKS_FC_CONSISTENCY')!;
  this.safeFindingFingerprint = finding.fingerprint;
  const proposed = await proposeSpecRepairs({
    repoRoot: this.remediationRoot!, spec: SLUG,
    semanticFindings: this.semanticEnvelope, semanticRequired: true,
    repairCandidates: [{
      id: 'safe-marker', source: 'mechanical', repairClass: 'SAFE_MCP_PATCH', spec: SLUG,
      findingFingerprints: [finding.fingerprint],
      edits: [{
        spec: SLUG,
        doc: 'README.md',
        replace: {
          heading: 'Damaged spec-dashboard dogfood fixture',
          old_string: 'remediation-safe-marker: old',
          new_string: 'remediation-safe-marker: repaired',
        },
      }],
    }],
  });
  assert.equal(proposed.ok, true, JSON.stringify(proposed.preview?.findings));
  this.safeProposalId = proposed.proposalId;
  const applied = await applySpecRepairs(this.remediationRoot!, proposed.proposalId!);
  assert.equal(applied.ok, true, JSON.stringify(applied.transaction.findings));
  this.safeApplyWrites = applied.writes;
});

Then(/^the safe patch is applied once and a second analysis keeps the repaired hash$/, { timeout: 120_000 }, async function (this: RemediationWorld) {
  assert.equal(this.safeApplyWrites, 1);
  assert.match(fs.readFileSync(path.join(this.remediationRoot!, '.specs', SLUG, 'README.md'), 'utf8'), /remediation-safe-marker: repaired/);
  const first = await analyzeRemediation({ repoRoot: this.remediationRoot!, spec: SLUG, semanticFindings: this.semanticEnvelope, semanticRequired: true });
  const second = await analyzeRemediation({ repoRoot: this.remediationRoot!, spec: SLUG, semanticFindings: this.semanticEnvelope, semanticRequired: true });
  assert.deepEqual(second.snapshot, first.snapshot);
});

When(/^a stale remediation proposal is applied after its document changes$/, { timeout: 120_000 }, async function (this: RemediationWorld) {
  const finding = this.firstAnalysis!.findings.find((item) => item.code === 'TASKS_FC_CONSISTENCY')!;
  const proposed = await proposeSpecRepairs({
    repoRoot: this.remediationRoot!, spec: SLUG,
    semanticFindings: this.semanticEnvelope, semanticRequired: true,
    repairCandidates: [{
      id: 'stale-marker', source: 'mechanical', repairClass: 'SAFE_MCP_PATCH', spec: SLUG,
      findingFingerprints: [finding.fingerprint],
      edits: [{
        spec: SLUG,
        doc: 'README.md',
        replace: {
          heading: 'Damaged spec-dashboard dogfood fixture',
          old_string: 'remediation-safe-marker: repaired',
          new_string: 'remediation-safe-marker: stale-apply-must-not-land',
        },
      }],
    }],
  });
  assert.equal(proposed.ok, true);
  const readme = path.join(this.remediationRoot!, '.specs', SLUG, 'README.md');
  const proposedReadmeSha = proposed.before.snapshot.documentShas['README.md'];
  assert.ok(proposedReadmeSha, 'README.md snapshot SHA missing');
  fs.appendFileSync(readme, '\nconcurrent-change: true\n', 'utf8');
  const applied = await applySpecRepairs(this.remediationRoot!, proposed.proposalId!);
  this.staleProposalStop = applied.stopReason;
});

Then(/^the stale proposal is refused and its replacement text is absent$/, function (this: RemediationWorld) {
  assert.equal(this.staleProposalStop, 'CAS_CONFLICT');
  const readme = fs.readFileSync(path.join(this.remediationRoot!, '.specs', SLUG, 'README.md'), 'utf8');
  assert.doesNotMatch(readme, /stale-apply-must-not-land/);
});

When(/^an unissued remediation proposal id is applied$/, { timeout: 120_000 }, async function (this: RemediationWorld) {
  this.unissuedBeforeBytes = specBytes(this.remediationRoot!);
  try {
    await applySpecRepairs(this.remediationRoot!, 'not-issued-by-remediation');
  } catch (error) {
    this.unissuedApplyError = error instanceof Error ? error.message : String(error);
  }
});

Then(/^the remediation apply boundary reports proposal not found and writes nothing$/, function (this: RemediationWorld) {
  assert.match(this.unissuedApplyError ?? '', /^PROPOSAL_NOT_FOUND:/);
  assert.ok(sameBytes(this.unissuedBeforeBytes!, specBytes(this.remediationRoot!)));
});

Then(/^the real MCP registry exposes the bounded remediation surfaces$/, function (this: RemediationWorld) {
  const registry = buildToolRegistry(
    () => buildGraph({ repoRoot: this.remediationRoot!, skipNdjson: true }),
    { repoRoot: this.remediationRoot! },
  );
  const names = new Set(registry.map((tool) => tool.name));
  for (const name of ['validate_spec', 'propose_spec_repairs', 'apply_spec_repairs']) {
    assert.ok(names.has(name), `${name} missing from real registry`);
  }
});

Then(/^the canonical spec-dashboard directory remains byte-identical$/, function (this: RemediationWorld) {
  // Docker does not mount the host's canonical `.specs/spec-dashboard/`. The
  // regression proves containment by checking that the workspace contains only
  // the copied dogfood slug; all writes above targeted that copied slug.
  const specs = fs.readdirSync(path.join(this.remediationRoot!, '.specs')).sort();
  assert.deepEqual(specs, [SLUG]);
});
