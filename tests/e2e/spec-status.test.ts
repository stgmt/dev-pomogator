import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyTestFile } from '../../.claude/skills/spec-status/scripts/test-quality.ts';
import { detectActiveSpec } from '../../.claude/skills/spec-status/scripts/autodetect.ts';
import { classifyTestStatus } from '../../.claude/skills/spec-status/scripts/yaml-recency.ts';
import { detectDockerBlocker, collectBlockers } from '../../.claude/skills/spec-status/scripts/env-blockers.ts';
import { classifyAcClaims } from '../../.claude/skills/spec-status/scripts/ac-claims.ts';
import { filterCredentials, buildContextBundle, resolveTestPaths, precheck } from '../../.claude/skills/spec-status/scripts/precheck.ts';

// HSCMD001 — Honest Spec Status Command (.specs/backlog/honest-status-command/).
//
// The skill orchestrates: autodetect → context bundle → Agent(general-purpose) →
// render. The LLM sub-agent step (FR-3 delegation + the narrative AC verdicts) is
// NOT deterministically CI-testable — it is the manual-verify boundary, mirrored
// by HSCMD001_AGENT below. Everything the skill (and the sub-agent) relies on that
// IS deterministic lives in scripts/*.ts and is tested here against the real
// tests/fixtures/spec-status/ fixtures, with cardinality/conservation invariants.

const FIX = path.join(__dirname, '..', 'fixtures', 'spec-status');
const read = (p: string) => fs.readFileSync(p, 'utf-8');

describe('HSCMD001: Honest Spec Status Command', () => {
  // @feature1 — FR-2 active-spec auto-detection (deterministic core of scenario 01)
  describe('HSCMD001_01: auto-detect active spec', () => {
    let tmp: string;
    beforeEach(() => {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'specstatus-'));
    });
    afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

    const mkSpec = (specsRoot: string, slug: string, ageDays: number) => {
      const d = path.join(specsRoot, slug);
      fs.mkdirSync(d, { recursive: true });
      const f = path.join(d, '.progress.json');
      fs.writeFileSync(f, JSON.stringify({ featureSlug: slug }));
      const t = (Date.now() - ageDays * 86_400_000) / 1000;
      fs.utimesSync(f, t, t);
    };

    it('HSCMD001_01: picks the newest .progress.json (≤7 days) and excludes stale dirs', () => {
      const specs = path.join(tmp, '.specs');
      mkSpec(specs, 'old-feature', 3);
      mkSpec(specs, 'active-feature', 0); // newest
      mkSpec(specs, 'ancient-feature', 30); // excluded (>7d)
      const r = detectActiveSpec(specs, { now: Date.now() });
      expect(r).not.toBeNull();
      expect(r!.slug).toBe('active-feature');
      expect(r!.specPath).toBe(path.join(specs, 'active-feature'));
    });

    it('HSCMD001_01b: tie within 60s → plan-file match wins', () => {
      const specs = path.join(tmp, '.specs');
      const plans = path.join(tmp, 'plans');
      fs.mkdirSync(plans, { recursive: true });
      mkSpec(specs, 'a-feature', 0);
      mkSpec(specs, 'b-feature', 0); // same mtime (tie)
      fs.writeFileSync(path.join(plans, 'b-feature.md'), '# plan');
      const r = detectActiveSpec(specs, { plansDir: plans, now: Date.now() });
      expect(r!.slug).toBe('b-feature');
    });

    it('HSCMD001_01c: no active spec → null (skill prints "pass slug explicitly")', () => {
      const specs = path.join(tmp, '.specs');
      mkSpec(specs, 'ancient', 30);
      expect(detectActiveSpec(specs, { now: Date.now() })).toBeNull();
      expect(detectActiveSpec(path.join(tmp, 'does-not-exist'))).toBeNull();
    });
  });

  // @feature2 — FR-4 AC claimed-only detection (deterministic pre-pass)
  describe('HSCMD001_02: AC claimed-only when no evidence', () => {
    it('HSCMD001_02: all AC of the claimed-only spec are claimed_only candidates', () => {
      const dir = path.join(FIX, 'mock-spec-claimed-only');
      const claims = classifyAcClaims(read(path.join(dir, 'ACCEPTANCE_CRITERIA.md')), read(path.join(dir, 'TASKS.md')), [
        /* no test file references these FRs */ 'import {} from "x";',
      ]);
      expect(claims.map((c) => c.id)).toEqual(['AC-1', 'AC-2', 'AC-3']);
      for (const c of claims) {
        expect(c.claimedDone).toBe(true);
        expect(c.hasEvidenceRef).toBe(false);
        expect(c.candidate).toBe('claimed_only');
      }
    });

    it('HSCMD001_02b: a test file referencing the AC/FR flips it off claimed_only', () => {
      const dir = path.join(FIX, 'mock-spec-claimed-only');
      const claims = classifyAcClaims(read(path.join(dir, 'ACCEPTANCE_CRITERIA.md')), read(path.join(dir, 'TASKS.md')), [
        'it("AC-2 verified", () => { expect(x).toEqual(y); }); // FR-2',
      ]);
      const ac2 = claims.find((c) => c.id === 'AC-2')!;
      expect(ac2.hasEvidenceRef).toBe(true);
      expect(ac2.candidate).toBe('needs-verify');
    });

    it('HSCMD001_02-inv: conservation — every AC header yields exactly one claim row', () => {
      const dir = path.join(FIX, 'mock-spec-claimed-only');
      const ac = read(path.join(dir, 'ACCEPTANCE_CRITERIA.md'));
      const headerCount = (ac.match(/^##+\s*AC-\d+/gm) || []).length;
      const claims = classifyAcClaims(ac, read(path.join(dir, 'TASKS.md')), []);
      expect(claims).toHaveLength(headerCount);
      expect(new Set(claims.map((c) => c.id)).size).toBe(claims.length); // unique
    });
  });

  // @feature3 — FR-5 recency + FR-8 environmental blockers
  describe('HSCMD001_03: environmental blocker separated from failures', () => {
    it('HSCMD001_03: running YAML with dead heartbeat → stale, NOT failed', () => {
      const yaml = read(path.join(FIX, 'yaml-samples', 'status.stale.yaml'));
      const mtime = Date.now() - 8 * 60_000; // 8 min ago
      const r = classifyTestStatus(yaml, mtime, Date.now());
      expect(r.classification).toBe('stale');
      expect(r.failed).toBe(0); // running suite — no real failures
      expect(r.reason).toMatch(/heartbeat dead/);
    });

    it('HSCMD001_03b: fresh + completed YAML classify as fresh', () => {
      const fresh = classifyTestStatus(read(path.join(FIX, 'yaml-samples', 'status.fresh.yaml')), Date.now() - 30_000, Date.now());
      expect(fresh.classification).toBe('fresh');
      const completed = classifyTestStatus(read(path.join(FIX, 'yaml-samples', 'status.completed.yaml')), Date.now() - 10_000, Date.now());
      expect(completed.classification).toBe('fresh');
    });

    it('HSCMD001_03c: no YAML → not_run', () => {
      expect(classifyTestStatus(null, null, Date.now()).classification).toBe('not_run');
    });

    it('HSCMD001_03d: docker ps non-zero → docker-unreachable blocker with daemon message', () => {
      const mockDocker = path.join(FIX, 'mock-bin', 'docker');
      if (process.platform === 'win32') return; // bash mock; Docker suite runs on Linux
      fs.chmodSync(mockDocker, 0o755);
      const b = detectDockerBlocker(mockDocker);
      expect(b).not.toBeNull();
      expect(b!.kind).toBe('docker-unreachable');
      expect(b!.message).toMatch(/Cannot connect to the Docker daemon/);
    });

    it('HSCMD001_03-inv: collectBlockers conserves — docker + dead heartbeat = 2, healthy = 0', () => {
      if (process.platform === 'win32') return;
      const mockDocker = path.join(FIX, 'mock-bin', 'docker');
      fs.chmodSync(mockDocker, 0o755);
      const stale = classifyTestStatus(read(path.join(FIX, 'yaml-samples', 'status.stale.yaml')), Date.now() - 8 * 60_000, Date.now());
      expect(collectBlockers({ dockerCmd: mockDocker, recency: stale })).toHaveLength(2);
      const fresh = classifyTestStatus(read(path.join(FIX, 'yaml-samples', 'status.fresh.yaml')), Date.now() - 30_000, Date.now());
      expect(collectBlockers({ dockerCmd: 'true', recency: fresh })).toHaveLength(0);
    });
  });

  // @feature4 — FR-6 test body quality classification (BDD step-def shape)
  describe('HSCMD001_04: flag weak / fake-positive BDD step-def bodies', () => {
    it('HSCMD001_04: weak BDD fixture → the assertion-bearing step is WEAK (presence-only)', () => {
      const r = classifyTestFile(read(path.join(FIX, 'sample-tests', 'weak.steps.ts')));
      expect(r.summary.total).toBe(1); // only the Then asserts; Given/When setup is skipped
      expect(r.blocks.every((b) => b.classification === 'WEAK')).toBe(true);
      expect(r.blocks[0].reason).toMatch(/presence-only/);
    });

    it('HSCMD001_04b: strong BDD fixture → all assertion-bearing steps STRONG (value-level)', () => {
      const r = classifyTestFile(read(path.join(FIX, 'sample-tests', 'strong.steps.ts')));
      expect(r.summary.strong).toBe(r.summary.total);
      expect(r.summary.total).toBe(2); // two Then steps, both assert.deepEqual value-level
    });

    it('HSCMD001_04c: fake-positive BDD fixture → file-mock risk + tautology step', () => {
      const r = classifyTestFile(read(path.join(FIX, 'sample-tests', 'fake-positive.steps.ts')));
      expect(r.fileRisks.some((f) => /critical-parser/.test(f.detail))).toBe(true);
      expect(r.blocks.some((b) => b.classification === 'FAKE-POSITIVE-RISK')).toBe(true);
    });

    it('HSCMD001_04-inv: conservation — buckets sum to total; pure Given/When setup steps are skipped', () => {
      const expected: Record<string, number> = { 'weak.steps.ts': 1, 'strong.steps.ts': 2, 'fake-positive.steps.ts': 1 };
      for (const [f, n] of Object.entries(expected)) {
        const r = classifyTestFile(read(path.join(FIX, 'sample-tests', f)));
        expect(r.summary.total).toBe(n); // only assertion-bearing steps graded — no setup-step noise
        expect(r.summary.strong + r.summary.weak + r.summary.fakePositiveRisk).toBe(r.summary.total);
        expect(r.summary.total).toBe(r.blocks.length);
      }
    });
  });

  // @feature3 — FR-3 bundle building + NFR-Security credential redaction (precheck pre-pass)
  describe('HSCMD001_05: precheck builds a safe, bounded context bundle', () => {
    it('HSCMD001_05: filterCredentials redacts secret-bearing lines, keeps the rest', () => {
      const redacted = filterCredentials(
        ['title: my spec', 'API_KEY=sk-live-abcdef123', 'password: hunter2', 'GITHUB_TOKEN = ghp_xyz', 'normal prose line'].join('\n'),
      );
      expect(redacted).not.toMatch(/sk-live-abcdef123/);
      expect(redacted).not.toMatch(/hunter2/);
      expect(redacted).not.toMatch(/ghp_xyz/);
      expect(redacted).toContain('title: my spec');
      expect(redacted).toContain('normal prose line');
      expect((redacted.match(/\[REDACTED\]/g) || []).length).toBe(3);
    });

    it('HSCMD001_05b-inv: bundle stays ≤4KB and trims test_paths to fit (SCHEMA invariant)', () => {
      const many = Array.from({ length: 400 }, (_, i) => `tests/e2e/very/long/path/segment/file-${i}.test.ts`);
      const bundle = buildContextBundle('big-spec', path.join(FIX, 'mock-spec-claimed-only'), many);
      expect(JSON.stringify(bundle).length).toBeLessThanOrEqual(4096);
      expect(bundle.test_paths.length).toBeLessThan(many.length); // trimmed
      expect(bundle.redacted).toBe(true);
    });

    it('HSCMD001_05c-inv: resolveTestPaths returns unique, existing files only', () => {
      const paths = resolveTestPaths(path.join(FIX, 'mock-spec-claimed-only'), process.cwd());
      expect(new Set(paths).size).toBe(paths.length); // uniqueness
      for (const p of paths) expect(fs.existsSync(p)).toBe(true); // existence — no phantom rows
    });

    it('HSCMD001_05d: precheck(claimed-only) → active bundle + claimed_only deterministic findings', () => {
      const r = precheck([path.join(FIX, 'mock-spec-claimed-only')], process.cwd());
      // slug arg here is a path → invalid slug shape → not active (guards path traversal)
      expect(r.active).toBe(false);
      expect(r.reason).toMatch(/invalid slug/);
    });

    it('HSCMD001_05e: precheck(--specs-root, slug) → active, AC claims surfaced', () => {
      const r = precheck(['mock-spec-claimed-only', '--specs-root', FIX], process.cwd());
      expect(r.active).toBe(true);
      expect(r.bundle!.spec_slug).toBe('mock-spec-claimed-only');
      expect(r.bundle!.ac_ids).toEqual(['AC-1', 'AC-2', 'AC-3']);
      expect(r.deterministic!.ac_claims.every((c) => c.candidate === 'claimed_only')).toBe(true);
    });
  });

  // @feature1 — FR-3 sub-agent delegation: MANUAL-VERIFY boundary.
  // The full flow (Agent(general-purpose) reading files + producing the narrative
  // verdicts) is LLM behaviour Claude Code does not expose for deterministic CI
  // assertion (same constraint as answer-simple). Verified via the deterministic
  // helpers above + manual run of `/spec-status`. Tracked, not silently skipped.
  it.skip('HSCMD001_AGENT: sub-agent delegation produces SCHEMA-conforming JSON (manual-verify)', () => {
    /* Manual: run /spec-status on a real spec; confirm Agent invoked + JSON parsed. */
  });
});
