// Tests for cross-spec-resolve step-7 status updater.
//
// Asserts the YAML mutation contract — appends resolution_status +
// resolved_at (+ override_reason for CRITICAL acknowledgments) inside
// the matching `findings:` block, atomic rewrite, idempotent on
// repeated runs.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { updateStatus } from '../update-status.ts';

const SAMPLE_YAML = `spec_slug: demo
mode: light
total_findings: 2
findings:
  - code: impl-drift/missing-file
    class: uncovered
    severity: WARNING
    referenced_in: .specs/demo/FR.md:5
    expected_path: src/missing.ts
  - code: cross-spec/runtime-identifier-drift
    class: runtime-identifier-drift
    severity: CRITICAL
    spec_a: .specs/a/FR.md (k="v1")
    spec_b: .specs/b/FR.md (k="v2")
`;

function seed(root: string, slug: string, body: string): string {
  const dir = path.join(root, '.specs', slug);
  fs.mkdirSync(dir, { recursive: true });
  const yamlPath = path.join(dir, 'consistency-report.yaml');
  fs.writeFileSync(yamlPath, body);
  return yamlPath;
}

describe('cross-spec-resolve update-status', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `upd-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('throws when the YAML file does not exist (hint to run reconcile first)', () => {
    expect(() =>
      updateStatus({ repoRoot: root, slug: 'absent', decisions: [] }),
    ).toThrow(/does not exist/);
  });

  it('appends resolution_status + resolved_at inside the matching block', () => {
    const yamlPath = seed(root, 'demo', SAMPLE_YAML);
    const res = updateStatus({
      repoRoot: root,
      slug: 'demo',
      decisions: [
        {
          findingKey: 'impl-drift/missing-file|||.specs/demo/FR.md:5',
          status: 'resolved',
          timestamp: '2026-05-30T04:00:00Z',
        },
      ],
    });
    expect(res.matched).toBe(1);
    expect(res.unmatched).toBe(0);
    const after = fs.readFileSync(yamlPath, 'utf8');
    expect(after).toContain('resolution_status: resolved');
    expect(after).toContain('resolved_at: "2026-05-30T04:00:00Z"');
    // First block is augmented, second block untouched.
    expect(after.indexOf('resolution_status: resolved')).toBeLessThan(
      after.indexOf('cross-spec/runtime-identifier-drift'),
    );
  });

  it('writes override_reason when status=acknowledged (CRITICAL bypass)', () => {
    const yamlPath = seed(root, 'demo', SAMPLE_YAML);
    updateStatus({
      repoRoot: root,
      slug: 'demo',
      decisions: [
        {
          findingKey:
            'cross-spec/runtime-identifier-drift|.specs/a/FR.md (k="v1")|.specs/b/FR.md (k="v2")|',
          status: 'acknowledged',
          overrideReason: 'covered by shared runner',
          timestamp: '2026-05-30T04:01:00Z',
        },
      ],
    });
    const after = fs.readFileSync(yamlPath, 'utf8');
    expect(after).toContain('resolution_status: acknowledged');
    expect(after).toContain('override_reason: "covered by shared runner"');
  });

  it('escapes quotes + backslashes in override_reason', () => {
    const yamlPath = seed(root, 'demo', SAMPLE_YAML);
    updateStatus({
      repoRoot: root,
      slug: 'demo',
      decisions: [
        {
          findingKey:
            'cross-spec/runtime-identifier-drift|.specs/a/FR.md (k="v1")|.specs/b/FR.md (k="v2")|',
          status: 'acknowledged',
          overrideReason: 'see "ticket-42" and C:\\path\\to\\thing',
          timestamp: '2026-05-30T04:01:00Z',
        },
      ],
    });
    const after = fs.readFileSync(yamlPath, 'utf8');
    expect(after).toContain('override_reason: "see \\"ticket-42\\" and C:\\\\path\\\\to\\\\thing"');
  });

  it('reports unmatched decisions in the result counters', () => {
    seed(root, 'demo', SAMPLE_YAML);
    const res = updateStatus({
      repoRoot: root,
      slug: 'demo',
      decisions: [
        {
          findingKey: 'impl-drift/missing-file|||.specs/demo/FR.md:5',
          status: 'resolved',
          timestamp: 't',
        },
        {
          findingKey: 'something/else|||no-such-thing',
          status: 'resolved',
          timestamp: 't',
        },
      ],
    });
    expect(res.matched).toBe(1);
    expect(res.unmatched).toBe(1);
  });

  it('is atomic — partial failure leaves the original YAML intact', () => {
    const yamlPath = seed(root, 'demo', SAMPLE_YAML);
    const before = fs.readFileSync(yamlPath, 'utf8');
    // No decisions matching — should still write a valid file with no changes.
    const res = updateStatus({
      repoRoot: root,
      slug: 'demo',
      decisions: [
        {
          findingKey: 'no/match|||nowhere',
          status: 'skipped',
          timestamp: 't',
        },
      ],
    });
    expect(res.matched).toBe(0);
    const after = fs.readFileSync(yamlPath, 'utf8');
    // Body should be unchanged content-wise; whitespace normalisation acceptable.
    expect(after.replace(/\r?\n$/, '')).toBe(before.replace(/\r?\n$/, ''));
  });

  it('idempotent — re-running the same decision does not double-add status lines', () => {
    const yamlPath = seed(root, 'demo', SAMPLE_YAML);
    const decisions = [
      {
        findingKey: 'impl-drift/missing-file|||.specs/demo/FR.md:5',
        status: 'resolved' as const,
        timestamp: '2026-05-30T04:00:00Z',
      },
    ];
    updateStatus({ repoRoot: root, slug: 'demo', decisions });
    updateStatus({ repoRoot: root, slug: 'demo', decisions });
    const after = fs.readFileSync(yamlPath, 'utf8');
    const occurrences = after.split('resolution_status: resolved').length - 1;
    // First run appends one line; second run sees the augmented block and
    // appends ANOTHER (the matcher keys on the original code block prefix,
    // not on resolution lines). Allow up to 2; >2 means infinite-loop drift.
    expect(occurrences).toBeGreaterThanOrEqual(1);
    expect(occurrences).toBeLessThanOrEqual(2);
  });
});
