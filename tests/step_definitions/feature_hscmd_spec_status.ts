/**
 * HSCMD001 step definitions — the spec-status skill's deterministic scripts.
 *
 * Migrated from tests/e2e/spec-status.test.ts. Drives the REAL pure functions in
 * .claude/skills/spec-status/scripts/*.ts in-process against the REAL tests/fixtures/spec-status/
 * fixtures (no mocks) — autodetect, ac-claims, yaml-recency, env-blockers, test-quality (BDD step grading),
 * precheck (context bundle + credential redaction). Homed as a standalone feature: the spec lives in
 * .specs/backlog/honest-status-command/ which is NOT in the spec graph, so @featureN tags here don't build
 * tested-by edges — the value is the retired vitest + the real-code-driven green scenarios.
 *
 * @see tests/features/plugins/spec-status/HSCMD001_spec-status.feature
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { detectActiveSpec } from '../../.claude/skills/spec-status/scripts/autodetect.ts';
import { classifyAcClaims } from '../../.claude/skills/spec-status/scripts/ac-claims.ts';
import { classifyTestStatus } from '../../.claude/skills/spec-status/scripts/yaml-recency.ts';
import { detectDockerBlocker, collectBlockers } from '../../.claude/skills/spec-status/scripts/env-blockers.ts';
import { classifyTestFile } from '../../.claude/skills/spec-status/scripts/test-quality.ts';
import { filterCredentials, buildContextBundle, resolveTestPaths, precheck } from '../../.claude/skills/spec-status/scripts/precheck.ts';

const HSCMD_REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
const FIX = path.join(HSCMD_REPO_ROOT, 'tests', 'fixtures', 'spec-status');
const hread = (p: string): string => fs.readFileSync(p, 'utf-8');

interface SsWorld extends V4World { _ss?: unknown }
function mkSpec(specsRoot: string, slug: string, ageDays: number): void {
  const d = path.join(specsRoot, slug);
  fs.mkdirSync(d, { recursive: true });
  const f = path.join(d, '.progress.json');
  fs.writeFileSync(f, JSON.stringify({ featureSlug: slug }));
  const t = (Date.now() - ageDays * 86_400_000) / 1000;
  fs.utimesSync(f, t, t);
}

// ── @feature1 autodetect ────────────────────────────────────────────────────
Then('detectActiveSpec picks the newest .progress.json within 7 days and excludes stale dirs', function (this: SsWorld) {
  const specs = path.join(this.tempDir, '.specs');
  mkSpec(specs, 'old-feature', 3); mkSpec(specs, 'active-feature', 0); mkSpec(specs, 'ancient-feature', 30);
  const r = detectActiveSpec(specs, { now: Date.now() });
  assert.ok(r, 'an active spec is detected');
  assert.equal(r!.slug, 'active-feature');
  assert.equal(r!.specPath, path.join(specs, 'active-feature'));
});
Then('detectActiveSpec breaks a 60s tie in favour of the plan-file match', function (this: SsWorld) {
  const specs = path.join(this.tempDir, '.specs');
  const plans = path.join(this.tempDir, 'plans'); fs.mkdirSync(plans, { recursive: true });
  mkSpec(specs, 'a-feature', 0); mkSpec(specs, 'b-feature', 0);
  fs.writeFileSync(path.join(plans, 'b-feature.md'), '# plan');
  assert.equal(detectActiveSpec(specs, { plansDir: plans, now: Date.now() })!.slug, 'b-feature');
});
Then('detectActiveSpec returns null when nothing is fresh or the dir is missing', function (this: SsWorld) {
  const specs = path.join(this.tempDir, '.specs'); mkSpec(specs, 'ancient', 30);
  assert.equal(detectActiveSpec(specs, { now: Date.now() }), null);
  assert.equal(detectActiveSpec(path.join(this.tempDir, 'nope')), null);
});

// ── @feature2 ac-claims ──────────────────────────────────────────────────────
Then('classifyAcClaims marks every AC of an evidence-less spec claimed_only, one row per AC', function () {
  const dir = path.join(FIX, 'mock-spec-claimed-only');
  const ac = hread(path.join(dir, 'ACCEPTANCE_CRITERIA.md'));
  const claims = classifyAcClaims(ac, hread(path.join(dir, 'TASKS.md')), ['import {} from "x";']);
  assert.deepEqual(claims.map((c) => c.id), ['AC-1', 'AC-2', 'AC-3']);
  assert.ok(claims.every((c) => c.claimedDone && !c.hasEvidenceRef && c.candidate === 'claimed_only'));
  const headerCount = (ac.match(/^##+\s*AC-\d+/gm) || []).length;
  assert.equal(claims.length, headerCount, 'conservation: one row per AC header');
  assert.equal(new Set(claims.map((c) => c.id)).size, claims.length, 'unique ids');
});
Then('classifyAcClaims flips an AC off claimed_only when a test references it', function () {
  const dir = path.join(FIX, 'mock-spec-claimed-only');
  const claims = classifyAcClaims(hread(path.join(dir, 'ACCEPTANCE_CRITERIA.md')), hread(path.join(dir, 'TASKS.md')),
    ['it("AC-2 verified", () => { expect(x).toEqual(y); }); // FR-2']);
  const ac2 = claims.find((c) => c.id === 'AC-2')!;
  assert.equal(ac2.hasEvidenceRef, true);
  assert.equal(ac2.candidate, 'needs-verify');
});

// ── @feature3 yaml-recency + env-blockers ────────────────────────────────────
Then('classifyTestStatus calls a running suite with a dead heartbeat stale, not failed', function () {
  const r = classifyTestStatus(hread(path.join(FIX, 'yaml-samples', 'status.stale.yaml')), Date.now() - 8 * 60_000, Date.now());
  assert.equal(r.classification, 'stale');
  assert.equal(r.failed, 0);
  assert.match(r.reason, /heartbeat dead/);
});
Then('classifyTestStatus calls fresh and completed YAML fresh, and a missing YAML not_run', function () {
  assert.equal(classifyTestStatus(hread(path.join(FIX, 'yaml-samples', 'status.fresh.yaml')), Date.now() - 30_000, Date.now()).classification, 'fresh');
  assert.equal(classifyTestStatus(hread(path.join(FIX, 'yaml-samples', 'status.completed.yaml')), Date.now() - 10_000, Date.now()).classification, 'fresh');
  assert.equal(classifyTestStatus(null, null, Date.now()).classification, 'not_run');
});
Then('the docker blocker and collectBlockers conserve: unreachable docker plus dead heartbeat is two, healthy is zero', function () {
  const mockDocker = path.join(FIX, 'mock-bin', 'docker');
  fs.chmodSync(mockDocker, 0o755);
  const b = detectDockerBlocker(mockDocker);
  assert.ok(b);
  assert.equal(b!.kind, 'docker-unreachable');
  assert.match(b!.message, /Cannot connect to the Docker daemon/);
  const stale = classifyTestStatus(hread(path.join(FIX, 'yaml-samples', 'status.stale.yaml')), Date.now() - 8 * 60_000, Date.now());
  assert.equal(collectBlockers({ dockerCmd: mockDocker, recency: stale }).length, 2);
  const fresh = classifyTestStatus(hread(path.join(FIX, 'yaml-samples', 'status.fresh.yaml')), Date.now() - 30_000, Date.now());
  assert.equal(collectBlockers({ dockerCmd: 'true', recency: fresh }).length, 0);
});

// ── @feature4 test-quality (BDD step grading) ────────────────────────────────
Then('classifyTestFile grades the weak, strong and fake-positive BDD fixtures and conserves buckets', function () {
  const weak = classifyTestFile(hread(path.join(FIX, 'sample-tests', 'weak.steps.ts')));
  assert.equal(weak.summary.total, 1);
  assert.ok(weak.blocks.every((b) => b.classification === 'WEAK'));
  assert.match(weak.blocks[0].reason, /presence-only/);
  const strong = classifyTestFile(hread(path.join(FIX, 'sample-tests', 'strong.steps.ts')));
  assert.equal(strong.summary.strong, strong.summary.total);
  assert.equal(strong.summary.total, 2);
  const fake = classifyTestFile(hread(path.join(FIX, 'sample-tests', 'fake-positive.steps.ts')));
  assert.ok(fake.fileRisks.some((f) => /critical-parser/.test(f.detail)));
  assert.ok(fake.blocks.some((b) => b.classification === 'FAKE-POSITIVE-RISK'));
  for (const [f, n] of Object.entries({ 'weak.steps.ts': 1, 'strong.steps.ts': 2, 'fake-positive.steps.ts': 1 })) {
    const r = classifyTestFile(hread(path.join(FIX, 'sample-tests', f)));
    assert.equal(r.summary.total, n);
    assert.equal(r.summary.strong + r.summary.weak + r.summary.fakePositiveRisk, r.summary.total);
    assert.equal(r.summary.total, r.blocks.length);
  }
});

// ── @feature5 precheck ───────────────────────────────────────────────────────
Then('filterCredentials redacts exactly the secret-bearing lines and keeps the prose', function () {
  const redacted = filterCredentials('title: my spec\napi_key: sk-live-abcdef123\npassword: hunter2\ntoken: ghp_xyz\nnormal prose line\n');
  assert.doesNotMatch(redacted, /sk-live-abcdef123|hunter2|ghp_xyz/);
  assert.ok(redacted.includes('title: my spec') && redacted.includes('normal prose line'));
  assert.equal((redacted.match(/\[REDACTED\]/g) || []).length, 3);
});
Then('the context bundle stays within 4KB with trimmed unique existing test paths', function () {
  const many = Array.from({ length: 200 }, (_v, i) => `tests/e2e/file-${i}.test.ts`);
  const bundle = buildContextBundle('big-spec', path.join(FIX, 'mock-spec-claimed-only'), many);
  assert.ok(JSON.stringify(bundle).length <= 4096);
  assert.ok(bundle.test_paths.length < many.length);
  assert.equal(bundle.redacted, true);
  const paths = resolveTestPaths(path.join(FIX, 'mock-spec-claimed-only'), HSCMD_REPO_ROOT);
  assert.equal(new Set(paths).size, paths.length);
  for (const p of paths) assert.ok(fs.existsSync(p));
});
Then('precheck with a spec slug and specs-root surfaces an active claimed_only bundle', function () {
  const r = precheck(['mock-spec-claimed-only', '--specs-root', FIX], HSCMD_REPO_ROOT);
  assert.equal(r.active, true);
  assert.equal(r.bundle!.spec_slug, 'mock-spec-claimed-only');
  assert.deepEqual(r.bundle!.ac_ids, ['AC-1', 'AC-2', 'AC-3']);
  assert.ok(r.deterministic!.ac_claims.every((c) => c.candidate === 'claimed_only'));
});
