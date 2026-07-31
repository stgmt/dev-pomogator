/**
 * Step definitions for ADVREV001: Independent Adversarial Review gate
 * (GitHub #153). Feature: tests/features/plugins/adversarial-review-gate/
 *
 * Classification: runtime — every step drives the REAL engine:
 *   - `specs-generator-core.mjs adversarial-review require` (gate activation,
 *     engine-owned .progress.json flag + spec revision),
 *   - `specs-generator-core.mjs spec-status -ConfirmStop Finalization` (the
 *     same engine the MCP door spawns — DOOR_REFUSED path),
 *   - plain `spec-status` (snapshot persistence + stale-STOP revocation).
 * No mocks; fixtures copy the real valid-spec corpus; the artifact revision is
 * stamped from the engine's own `require` output, then validated independently
 * by the engine on the ConfirmStop path.
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { V4World } from '../hooks/before-after.ts';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

interface AdvReviewWorld extends V4World {
  advSlug?: string;
  advRevision?: string;
  advExit?: number;
  advStderr?: string;
  advStdout?: string;
  advMeta?: {
    reviewer: string;
    author: string;
    round: number;
    verdict: string;
    residual: boolean;
    noFindings: boolean;
  };
}

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
const CORE = path.join(REPO_ROOT, 'tools', 'specs-generator', 'specs-generator-core.mjs');
const VALID_SPEC_FIXTURE = path.join(REPO_ROOT, 'tests', 'fixtures', 'specs-generator', 'valid-spec');

function runCore(tempDir: string, args: string[]): { status: number; stderr: string; stdout: string } {
  const r = spawnSync(process.execPath, [CORE, ...args], {
    cwd: tempDir,
    env: { ...process.env, SPECS_GENERATOR_ROOT: tempDir },
    encoding: 'utf-8',
    timeout: 120_000,
  });
  return { status: r.status ?? -1, stderr: r.stderr ?? '', stdout: r.stdout ?? '' };
}

function specDir(w: AdvReviewWorld): string {
  assert.ok(w.tempDir && w.advSlug, 'spec dir not prepared');
  return path.join(w.tempDir, '.specs', w.advSlug);
}

interface FindingRow {
  severity?: string;
  id?: string;
  status?: string;
  evidence?: string;
  resolutionEvidence?: string;
  waiverRationale?: string;
  waiverApprover?: string;
}

function buildArtifact(w: AdvReviewWorld, findings: FindingRow[]): string {
  const meta = w.advMeta;
  assert.ok(meta && w.advRevision, 'review metadata/revision not prepared');
  const lines: string[] = [
    `# Adversarial Review — ${w.advSlug}`,
    '',
    `**Reviewed revision:** ${w.advRevision}`,
    `**Reviewer run:** ${meta.reviewer}`,
    `**Author run:** ${meta.author}`,
    `**Round:** ${meta.round}`,
    `**Verdict:** ${meta.verdict}`,
    '',
    '## Findings',
    '',
  ];
  if (findings.length === 0) {
    if (meta.noFindings) {
      lines.push('### No findings', '', 'Draft challenged against the repository; no P0-P3 findings.', '');
    }
  } else {
    for (const f of findings) {
      lines.push(`### ${f.id}: ${f.severity} finding`);
      lines.push(`- Mechanism: planted ${f.severity} mechanism for ${f.id}`);
      lines.push(`- Impact: would break the feature contract (${f.id})`);
      lines.push(`- Evidence: ${f.evidence ?? ''}`);
      lines.push(`- Resolution: fix before handoff (${f.id})`);
      lines.push(`- Status: ${f.status ?? 'OPEN'}`);
      if (f.resolutionEvidence) {
        lines.push(`- Resolution evidence: ${f.resolutionEvidence}`);
      }
      if (f.waiverRationale) {
        lines.push(`- Waiver rationale: ${f.waiverRationale}`);
      }
      if (f.waiverApprover) {
        lines.push(`- Waiver approver: ${f.waiverApprover}`);
      }
      lines.push('');
    }
  }
  lines.push('## Residual Risks', '');
  if (meta.residual) {
    lines.push('- Runtime behavior only fully provable after implementation.');
  }
  lines.push('');
  return lines.join('\n');
}

Given(/^a valid fixture spec "([^"]+)" with the adversarial review gate required$/, function (this: AdvReviewWorld, slug: string) {
  this.advSlug = slug;
  fs.mkdirSync(path.join(this.tempDir, '.specs'), { recursive: true });
  fs.writeFileSync(path.join(this.tempDir, 'package.json'), '{"name":"adv-gate-test","version":"1.0.0"}\n');
  // Scaffold first (engine-owned .progress.json), then overlay the completed
  // valid-spec fixture docs so phase validation passes on the exit-0 paths.
  const scaffold = runCore(this.tempDir, ['scaffold-spec', '-Name', slug]);
  assert.equal(scaffold.status, 0, `scaffold-spec failed: ${scaffold.stderr}`);
  fs.cpSync(VALID_SPEC_FIXTURE, path.join(this.tempDir, '.specs', slug), { recursive: true });
  const requireResult = runCore(this.tempDir, ['adversarial-review', 'require', '-Path', `.specs/${slug}`]);
  assert.equal(requireResult.status, 0, `adversarial-review require failed: ${requireResult.stderr}`);
  const parsed = JSON.parse(requireResult.stdout) as { ok?: boolean; required?: boolean; specRevision?: string };
  assert.equal(parsed.required, true, 'gate flag not activated');
  assert.ok(parsed.specRevision && /^[0-9a-f]{64}$/.test(parsed.specRevision), 'no spec revision stamped');
  this.advRevision = parsed.specRevision;
});

Given(
  /^the review metadata of "([^"]+)" is: reviewer "([^"]+)" author "([^"]+)" round (\d+) verdict "([^"]+)" residual "(yes|no)" noFindings "(yes|no)"$/,
  function (this: AdvReviewWorld, slug: string, reviewer: string, author: string, round: string, verdict: string, residual: string, noFindings: string) {
    assert.equal(slug, this.advSlug, 'scenario slug mismatch');
    this.advMeta = {
      reviewer,
      author,
      round: Number(round),
      verdict,
      residual: residual === 'yes',
      noFindings: noFindings === 'yes',
    };
    // No findings + no table step: write the artifact immediately.
    if (this.advMeta.noFindings) {
      fs.writeFileSync(path.join(specDir(this), 'ADVERSARIAL_REVIEW.md'), buildArtifact(this, []));
    }
  },
);

Given(/^the review of "([^"]+)" has findings:$/, function (this: AdvReviewWorld, slug: string, table: { hashes: () => FindingRow[] }) {
  assert.equal(slug, this.advSlug, 'scenario slug mismatch');
  const rows = table.hashes().map((row) => ({
    severity: row.severity ?? '',
    id: row.id ?? '',
    status: row.status ?? '',
    evidence: row.evidence ?? '',
    resolutionEvidence: row.resolutionEvidence ?? '',
    waiverRationale: row.waiverRationale ?? '',
    waiverApprover: row.waiverApprover ?? '',
  }));
  fs.writeFileSync(path.join(specDir(this), 'ADVERSARIAL_REVIEW.md'), buildArtifact(this, rows));
});

Given(/^"([^"]+)" previously confirmed the Finalization STOP$/, function (this: AdvReviewWorld, slug: string) {
  assert.equal(slug, this.advSlug, 'scenario slug mismatch');
  const progressPath = path.join(specDir(this), '.progress.json');
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf-8')) as {
    phases: { Finalization: { stopConfirmed: boolean; stopConfirmedAt: string | null } };
  };
  progress.phases.Finalization.stopConfirmed = true;
  progress.phases.Finalization.stopConfirmedAt = '2026-01-01T00:00:00.000Z';
  fs.writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
});

When(/^the spec "([^"]+)" changes after the review$/, function (this: AdvReviewWorld, slug: string) {
  assert.equal(slug, this.advSlug, 'scenario slug mismatch');
  fs.appendFileSync(path.join(specDir(this), 'FR.md'), '\n## Post-review change\n\nThe draft mutated after the review ran.\n');
});

When(/^the review artifact of "([^"]+)" is deleted$/, function (this: AdvReviewWorld, slug: string) {
  assert.equal(slug, this.advSlug, 'scenario slug mismatch');
  fs.rmSync(path.join(specDir(this), 'ADVERSARIAL_REVIEW.md'), { force: true });
});

When(/^ConfirmStop Finalization runs for "([^"]+)"$/, function (this: AdvReviewWorld, slug: string) {
  assert.equal(slug, this.advSlug, 'scenario slug mismatch');
  const r = runCore(this.tempDir, ['spec-status', '-Path', `.specs/${slug}`, '-ConfirmStop', 'Finalization', '-Format', 'json']);
  this.advExit = r.status;
  this.advStderr = r.stderr;
  this.advStdout = r.stdout;
});

When(/^plain spec-status runs for "([^"]+)"$/, function (this: AdvReviewWorld, slug: string) {
  assert.equal(slug, this.advSlug, 'scenario slug mismatch');
  const r = runCore(this.tempDir, ['spec-status', '-Path', `.specs/${slug}`, '-Format', 'json']);
  this.advExit = r.status;
  this.advStderr = r.stderr;
  this.advStdout = r.stdout;
});

Then(/^the gate exit code should be (\d+)$/, function (this: AdvReviewWorld, expected: string) {
  assert.equal(this.advExit, Number(expected), `unexpected exit code; stderr: ${this.advStderr}`);
});

Then(/^the gate stderr should mention "([^"]+)"$/, function (this: AdvReviewWorld, needle: string) {
  assert.ok(
    (this.advStderr ?? '').includes(needle),
    `expected stderr to mention "${needle}"; got: ${this.advStderr}`,
  );
});

Then(/^the gate stderr should not mention "([^"]+)"$/, function (this: AdvReviewWorld, needle: string) {
  assert.ok(
    !(this.advStderr ?? '').includes(needle),
    `expected stderr NOT to mention "${needle}"; got: ${this.advStderr}`,
  );
});

Then(/^the progress of "([^"]+)" should show Finalization stopConfirmed (true|false)$/, function (this: AdvReviewWorld, slug: string, expected: string) {
  assert.equal(slug, this.advSlug, 'scenario slug mismatch');
  const progress = JSON.parse(fs.readFileSync(path.join(specDir(this), '.progress.json'), 'utf-8')) as {
    phases: { Finalization: { stopConfirmed: boolean } };
    adversarialReview?: unknown;
  };
  assert.equal(
    progress.phases.Finalization.stopConfirmed,
    expected === 'true',
    `stopConfirmed mismatch; last exit=${this.advExit}; stderr=${this.advStderr}; `
    + `Finalization=${JSON.stringify(progress.phases.Finalization)}; `
    + `adversarialReview=${JSON.stringify(progress.adversarialReview)}`,
  );
});
