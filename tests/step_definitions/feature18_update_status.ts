// Step definitions for SPECGEN004_345-351 — cross-spec-resolve updateStatus (FR-18 step-7).
//
// Drives `updateStatus` from the real production module in-process. All I/O goes to
// the fresh tmpdir provided by the V4World Before hook — no mocks, no stubs. Regex
// step patterns throughout.

import fs from 'node:fs';
import path from 'node:path';
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { V4World } from '../hooks/before-after.ts';
import { updateStatus, type UpdateStatusResult } from '../../.claude/skills/cross-spec-resolve/scripts/update-status.ts';

// ── World extension ──────────────────────────────────────────────────────────────

interface UpdateStatusWorld extends V4World {
  updateStatusResult?: UpdateStatusResult;
  updateStatusError?: Error;
  updateStatusYamlPath?: string;
}

// ── SAMPLE_YAML fixture — mirrors the producer (yaml-writer.ts) shape exactly ──────

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

// ── helpers ──────────────────────────────────────────────────────────────────────

function seedYaml(root: string, slug: string, body: string): string {
  const dir = path.join(root, '.specs', slug);
  fs.mkdirSync(dir, { recursive: true });
  const yamlPath = path.join(dir, 'consistency-report.yaml');
  fs.writeFileSync(yamlPath, body);
  return yamlPath;
}

// ── Given steps ──────────────────────────────────────────────────────────────────

Given(
  /^a consistency-report\.yaml exists for slug "demo" in the update-status temp repo$/,
  function (this: UpdateStatusWorld) {
    const yamlPath = seedYaml(this.tempDir, 'demo', SAMPLE_YAML);
    this.updateStatusYamlPath = yamlPath;
  },
);

Given(
  /^no consistency-report\.yaml exists for slug "absent" in the update-status temp repo$/,
  function (this: UpdateStatusWorld) {
    // tempDir exists but .specs/absent/ does not — nothing to seed.
  },
);

// ── When steps ───────────────────────────────────────────────────────────────────

When(
  /^updateStatus is called for slug "absent" with empty decisions$/,
  function (this: UpdateStatusWorld) {
    try {
      const result = updateStatus({ repoRoot: this.tempDir, slug: 'absent', decisions: [] });
      this.updateStatusResult = result;
    } catch (err) {
      this.updateStatusError = err as Error;
    }
  },
);

When(
  /^updateStatus is called with a resolved decision for the impl-drift\/missing-file finding$/,
  function (this: UpdateStatusWorld) {
    const result = updateStatus({
      repoRoot: this.tempDir,
      slug: 'demo',
      decisions: [
        {
          findingKey: 'impl-drift/missing-file|||.specs/demo/FR.md:5',
          status: 'resolved',
          timestamp: '2026-05-30T04:00:00Z',
        },
      ],
    });
    this.updateStatusResult = result;
  },
);

When(
  /^updateStatus is called with an acknowledged decision with overrideReason "covered by shared runner"$/,
  function (this: UpdateStatusWorld) {
    const result = updateStatus({
      repoRoot: this.tempDir,
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
    this.updateStatusResult = result;
  },
);

When(
  /^updateStatus is called with an acknowledged decision with overrideReason containing quotes and backslashes$/,
  function (this: UpdateStatusWorld) {
    const result = updateStatus({
      repoRoot: this.tempDir,
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
    this.updateStatusResult = result;
  },
);

When(
  /^updateStatus is called with one matching and one non-matching decision$/,
  function (this: UpdateStatusWorld) {
    const result = updateStatus({
      repoRoot: this.tempDir,
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
    this.updateStatusResult = result;
  },
);

When(
  /^updateStatus is called with a decision that has no matching finding$/,
  function (this: UpdateStatusWorld) {
    const result = updateStatus({
      repoRoot: this.tempDir,
      slug: 'demo',
      decisions: [
        {
          findingKey: 'no/match|||nowhere',
          status: 'skipped',
          timestamp: 't',
        },
      ],
    });
    this.updateStatusResult = result;
  },
);

When(
  /^updateStatus is called twice with the same resolved decision for the impl-drift finding$/,
  function (this: UpdateStatusWorld) {
    const decisions = [
      {
        findingKey: 'impl-drift/missing-file|||.specs/demo/FR.md:5',
        status: 'resolved' as const,
        timestamp: '2026-05-30T04:00:00Z',
      },
    ];
    updateStatus({ repoRoot: this.tempDir, slug: 'demo', decisions });
    updateStatus({ repoRoot: this.tempDir, slug: 'demo', decisions });
  },
);

// ── Then steps ────────────────────────────────────────────────────────────────────

Then(
  /^updateStatus throws an error matching "does not exist"$/,
  function (this: UpdateStatusWorld) {
    assert.ok(this.updateStatusError, 'Expected an error to be thrown');
    assert.match(this.updateStatusError!.message, /does not exist/);
  },
);

Then(
  /^the YAML file contains resolution_status: resolved and resolved_at inside the impl-drift block before the second finding$/,
  function (this: UpdateStatusWorld) {
    const result = this.updateStatusResult!;
    const yamlPath = this.updateStatusYamlPath!;
    assert.equal(result.matched, 1);
    assert.equal(result.unmatched, 0);
    const after = fs.readFileSync(yamlPath, 'utf8');
    assert.ok(after.includes('resolution_status: resolved'), 'YAML should contain resolution_status: resolved');
    assert.ok(after.includes('resolved_at: "2026-05-30T04:00:00Z"'), 'YAML should contain resolved_at timestamp');
    // First block augmented before the second finding appears.
    assert.ok(
      after.indexOf('resolution_status: resolved') < after.indexOf('cross-spec/runtime-identifier-drift'),
      'resolution_status should appear before the second finding block',
    );
  },
);

Then(
  /^the YAML file contains resolution_status: acknowledged and override_reason: "covered by shared runner"$/,
  function (this: UpdateStatusWorld) {
    const after = fs.readFileSync(this.updateStatusYamlPath!, 'utf8');
    assert.ok(after.includes('resolution_status: acknowledged'), 'YAML should contain resolution_status: acknowledged');
    assert.ok(after.includes('override_reason: "covered by shared runner"'), 'YAML should contain override_reason');
  },
);

Then(
  /^the YAML file contains override_reason with escaped quotes and backslashes$/,
  function (this: UpdateStatusWorld) {
    const after = fs.readFileSync(this.updateStatusYamlPath!, 'utf8');
    assert.ok(
      after.includes('override_reason: "see \\"ticket-42\\" and C:\\\\path\\\\to\\\\thing"'),
      `YAML should contain escaped override_reason. Got: ${after}`,
    );
  },
);

Then(
  /^updateStatus returns matched=1 and unmatched=1$/,
  function (this: UpdateStatusWorld) {
    assert.equal(this.updateStatusResult!.matched, 1);
    assert.equal(this.updateStatusResult!.unmatched, 1);
  },
);

Then(
  /^the YAML file content is unchanged after the no-match updateStatus call$/,
  function (this: UpdateStatusWorld) {
    assert.equal(this.updateStatusResult!.matched, 0);
    const after = fs.readFileSync(this.updateStatusYamlPath!, 'utf8');
    assert.equal(after.replace(/\r?\n$/, ''), SAMPLE_YAML.replace(/\r?\n$/, ''));
  },
);

Then(
  /^the YAML file contains at most 2 occurrences of resolution_status: resolved after two identical updateStatus calls$/,
  function (this: UpdateStatusWorld) {
    const after = fs.readFileSync(this.updateStatusYamlPath!, 'utf8');
    const occurrences = after.split('resolution_status: resolved').length - 1;
    assert.ok(occurrences >= 1, `Expected at least 1 occurrence, got ${occurrences}`);
    assert.ok(occurrences <= 2, `Expected at most 2 occurrences, got ${occurrences}`);
  },
);
