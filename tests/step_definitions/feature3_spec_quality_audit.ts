/**
 * @feature3 step definitions — Spec Quality Audit (spec-phase-gate FR-8..FR-11).
 *
 * Migrated from tests/e2e/audit-checks.test.ts (PLUGIN008_23..34). Drives the REAL
 * `tools/specs-validator/audit-checks.ts` functions in-process (checkPartialImpl,
 * checkTaskAtomicity, checkFrSplitConsistency, checkBddScenarioScope, runAllChecks)
 * and the REAL `tools/specs-generator/audit-spec.ts` CLI via spawn for the integration
 * scenarios. Per-scenario isolation: V4World tempDir.
 *
 * @see .specs/spec-phase-gate/FR.md FR-8 (partial impl) / FR-9 (task atomicity) /
 *      FR-10 (FR split consistency) / FR-11 (BDD scenario scope gap)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  checkPartialImpl,
  checkTaskAtomicity,
  checkFrSplitConsistency,
  checkBddScenarioScope,
  runAllChecks,
} from '../../tools/specs-validator/audit-checks.ts';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');

interface AuditWorld extends V4World {
  auditFindings?: Array<{ severity: string; check: string; message: string }>;
  auditCli?: { status: number | null; stdout: string };
}

function write(this: AuditWorld, name: string, content: string): void {
  fs.writeFileSync(path.join(this.tempDir, name), content, 'utf-8');
}

// ── checkPartialImpl ────────────────────────────────────────────────────────

Given(
  /^a spec where a done task's FR carries the not-implemented marker `([^`]+)`$/,
  function (this: AuditWorld, marker: string) {
    write.call(this, 'FR.md', `## FR-5: Something\n\n${marker} right now.\n`);
    write.call(this, 'TASKS.md', '- [x] implement FR-5 stuff\n');
  },
);

Given(
  /^a spec where an OPEN task's FR carries a not-implemented marker$/,
  function (this: AuditWorld) {
    write.call(this, 'FR.md', '## FR-5: Something\n\n**НЕ РЕАЛИЗОВАНО**\n');
    write.call(this, 'TASKS.md', '- [ ] implement FR-5 stuff\n');
  },
);

Given(
  /^a spec where a done task's FR is fully implemented$/,
  function (this: AuditWorld) {
    write.call(this, 'FR.md', '## FR-5: Something\n\nFully implemented.\n');
    write.call(this, 'TASKS.md', '- [x] implement FR-5 stuff\n');
  },
);

Given(/^a spec with a TASKS\.md but no FR\.md$/, function (this: AuditWorld) {
  write.call(this, 'TASKS.md', '- [x] do FR-3\n');
});

Given(
  /^a spec where a done task's FR mentions the audit marker `([^`]+)` only as a (larger word|fenced code block|inline code span)$/,
  function (this: AuditWorld, marker: string, mode: string) {
    let body: string;
    if (mode === 'larger word') body = `This is ${marker}LY done and complete.`;
    else if (mode === 'fenced code block') body = `Fully done. Example:\n\`\`\`\nconst X = "${marker}";\n\`\`\``;
    else body = `Returns the \`${marker}\` sentinel string. Done.`;
    write.call(this, 'FR.md', `## FR-7: Thing\n\n${body}\n`);
    write.call(this, 'TASKS.md', '- [x] do FR-7\n');
  },
);

When(/^the partial-implementation audit runs$/, function (this: AuditWorld) {
  this.auditFindings = checkPartialImpl(this.tempDir);
});

Then(
  /^the partial-implementation audit reports exactly one ERROR mentioning the FR$/,
  function (this: AuditWorld) {
    assert.equal(this.auditFindings!.length, 1, `expected 1 finding, got ${JSON.stringify(this.auditFindings)}`);
    assert.equal(this.auditFindings![0].severity, 'ERROR');
    assert.equal(this.auditFindings![0].check, 'PARTIAL_IMPL_DETECTION');
  },
);

Then(/^the partial-implementation audit reports nothing$/, function (this: AuditWorld) {
  assert.equal(this.auditFindings!.length, 0, `expected 0 findings, got ${JSON.stringify(this.auditFindings)}`);
});

// INVARIANT outline — word-bounded fires; substring-of-larger-word / code-fenced do NOT.
When(
  /^the partial-implementation audit runs over marker `([^`]+)` placed as `(standalone|larger-word|code-fenced)`$/,
  function (this: AuditWorld, marker: string, placement: string) {
    write.call(this, 'TASKS.md', '- [x] do FR-5 stuff\n');
    let body: string;
    if (placement === 'standalone') body = `Status: ${marker} right now.`;
    else if (placement === 'larger-word') body = `This is ${marker}LY done and complete.`;
    else body = `Fully done. Example:\n\`\`\`\nconst X = "${marker}";\n\`\`\``;
    write.call(this, 'FR.md', `## FR-5: T\n\n${body}\n`);
    this.auditFindings = checkPartialImpl(this.tempDir);
  },
);

Then(
  /^the partial-implementation audit finds exactly (\d+)$/,
  function (this: AuditWorld, n: string) {
    assert.equal(this.auditFindings!.length, Number(n), `marker placement contract broke: ${JSON.stringify(this.auditFindings)}`);
  },
);

// ── checkTaskAtomicity ──────────────────────────────────────────────────────

Given(
  /^a spec where a task references (multiple FRs|a single FR|no FR|an FR and its sub-variant)$/,
  function (this: AuditWorld, kind: string) {
    const line =
      kind === 'multiple FRs' ? '- [x] implement FR-4 and FR-5 together\n'
      : kind === 'a single FR' ? '- [x] implement FR-4 only\n'
      : kind === 'no FR' ? '- [x] setup environment\n'
      : '- [x] implement FR-4 and FR-4a\n';
    write.call(this, 'TASKS.md', line);
  },
);

When(/^the task-atomicity audit runs$/, function (this: AuditWorld) {
  this.auditFindings = checkTaskAtomicity(this.tempDir);
});

Then(
  /^the task-atomicity audit reports one WARNING naming the extra FR `([^`]+)`$/,
  function (this: AuditWorld, fr: string) {
    assert.equal(this.auditFindings!.length, 1, JSON.stringify(this.auditFindings));
    assert.equal(this.auditFindings![0].severity, 'WARNING');
    assert.ok(this.auditFindings![0].message.includes(fr), `message must name ${fr}: ${this.auditFindings![0].message}`);
  },
);

Then(/^the task-atomicity audit reports nothing$/, function (this: AuditWorld) {
  assert.equal(this.auditFindings!.length, 0, JSON.stringify(this.auditFindings));
});

// ── checkFrSplitConsistency ─────────────────────────────────────────────────

Given(
  /^a spec where one FR has a sub-variant but an adjacent FR does not$/,
  function (this: AuditWorld) {
    write.call(this, 'FR.md', ['## FR-4: Batch\n\nBatch impl\n', '## FR-4a: Serial\n\nSerial impl\n', '## FR-5: Another\n\nNo split\n'].join('\n'));
  },
);

Given(/^a spec where no FR has sub-variants$/, function (this: AuditWorld) {
  write.call(this, 'FR.md', '## FR-1: One\n\n## FR-2: Two\n');
});

Given(/^a spec where both adjacent FRs have sub-variants$/, function (this: AuditWorld) {
  write.call(this, 'FR.md', ['## FR-4: Base\n', '## FR-4a: Variant\n', '## FR-5: Base\n', '## FR-5a: Variant\n'].join('\n'));
});

When(/^the FR-split-consistency audit runs$/, function (this: AuditWorld) {
  this.auditFindings = checkFrSplitConsistency(this.tempDir);
});

Then(
  /^the FR-split-consistency audit reports an INFO naming the un-split FR `([^`]+)`$/,
  function (this: AuditWorld, fr: string) {
    assert.ok(this.auditFindings!.length > 0, 'expected at least one finding');
    assert.equal(this.auditFindings![0].severity, 'INFO');
    assert.ok(this.auditFindings![0].message.includes(fr), this.auditFindings![0].message);
  },
);

Then(/^the FR-split-consistency audit reports nothing$/, function (this: AuditWorld) {
  assert.equal(this.auditFindings!.length, 0, JSON.stringify(this.auditFindings));
});

// ── checkBddScenarioScope ───────────────────────────────────────────────────

Given(
  /^a spec whose FR mentions serial but whose only scenario covers batch$/,
  function (this: AuditWorld) {
    write.call(this, 'FR.md', '## FR-5: Adjustment @feature5\n\nHandles batch and serial items\n');
    write.call(this, 'test.feature', ['Feature: Test', '', '# @feature5', 'Scenario: Batch adjustment', '  Given a batch item', '  When adjusted', '  Then batch storages updated'].join('\n'));
  },
);

Given(/^a spec whose scenario covers every term its FR mentions$/, function (this: AuditWorld) {
  write.call(this, 'FR.md', '## FR-5: Adjustment @feature5\n\nHandles batch items\n');
  write.call(this, 'test.feature', ['Feature: Test', '', '# @feature5', 'Scenario: Batch adjustment', '  Given a batch item', '  When adjusted', '  Then batch storages updated'].join('\n'));
});

Given(/^a spec with an FR but no \.feature file$/, function (this: AuditWorld) {
  write.call(this, 'FR.md', '## FR-5: Something @feature5\n\nBatch and serial\n');
});

When(/^the BDD-scenario-scope audit runs$/, function (this: AuditWorld) {
  this.auditFindings = checkBddScenarioScope(this.tempDir);
});

Then(
  /^the BDD-scenario-scope audit reports a gap mentioning the uncovered term$/,
  function (this: AuditWorld) {
    assert.ok(this.auditFindings!.length > 0, 'expected a scope gap');
    assert.ok(this.auditFindings![0].message.includes('serial'), this.auditFindings![0].message);
  },
);

Then(/^the BDD-scenario-scope audit reports nothing$/, function (this: AuditWorld) {
  assert.equal(this.auditFindings!.length, 0, JSON.stringify(this.auditFindings));
});

// ── runAllChecks ────────────────────────────────────────────────────────────

Given(
  /^a spec with both a partial-impl marker and a multi-FR task$/,
  function (this: AuditWorld) {
    write.call(this, 'FR.md', '## FR-5: Thing\n\n**НЕ РЕАЛИЗОВАНО**\n');
    write.call(this, 'TASKS.md', '- [x] do FR-5 and FR-6\n');
  },
);

Given(/^a clean spec with a done task and an implemented FR$/, function (this: AuditWorld) {
  write.call(this, 'FR.md', '## FR-1: Clean\n\nImplemented.\n');
  write.call(this, 'TASKS.md', '- [x] do FR-1\n');
});

When(/^the combined audit runs all checks$/, function (this: AuditWorld) {
  this.auditFindings = runAllChecks(this.tempDir);
});

Then(/^the combined audit returns at least two findings$/, function (this: AuditWorld) {
  assert.ok(this.auditFindings!.length >= 2, `expected >=2 combined findings, got ${JSON.stringify(this.auditFindings)}`);
});

Then(/^the combined audit returns nothing$/, function (this: AuditWorld) {
  assert.equal(this.auditFindings!.length, 0, JSON.stringify(this.auditFindings));
});

// ── Integration: audit-spec.ts CLI (real spawn) ─────────────────────────────

Given(
  /^a real temp spec dir under \.specs with an FR but an empty ACCEPTANCE_CRITERIA$/,
  function (this: AuditWorld) {
    const dir = path.join(REPO_ROOT, '.specs', 'audit-cli-demo');
    fs.mkdirSync(dir, { recursive: true });
    const files: Record<string, string> = {
      'FR.md': '## FR-1: Test Feature @feature1\n\nDescription.\n',
      'ACCEPTANCE_CRITERIA.md': '# Acceptance Criteria\n\nEmpty.\n',
      'USER_STORIES.md': '# User Stories\n', 'USE_CASES.md': '# Use Cases\n', 'RESEARCH.md': '# Research\n',
      'REQUIREMENTS.md': '# Requirements\n', 'NFR.md': '# NFR\n', 'DESIGN.md': '# Design\n', 'TASKS.md': '# Tasks\n',
      'FILE_CHANGES.md': '# File Changes\n', 'CHANGELOG.md': '# Changelog\n', 'README.md': '# README\n', 'test.feature': 'Feature: Test\n',
    };
    for (const [n, c] of Object.entries(files)) fs.writeFileSync(path.join(dir, n), c, 'utf-8');
  },
);

Given(
  /^a real temp spec dir under \.specs with a clean FR and matching AC$/,
  function (this: AuditWorld) {
    const dir = path.join(REPO_ROOT, '.specs', 'audit-cli-clean');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'FR.md'), '## FR-1: Clean @feature1\n\n', 'utf-8');
    fs.writeFileSync(path.join(dir, 'ACCEPTANCE_CRITERIA.md'), '## AC-1 (FR-1): Clean @feature1\n\nWHEN x THEN y SHALL z\n', 'utf-8');
  },
);

When(
  /^the real audit-spec CLI runs over the `([^`]+)` spec in (json|text) format$/,
  function (this: AuditWorld, slug: string, format: string) {
    const script = path.join(REPO_ROOT, 'tools', 'specs-generator', 'audit-spec.ts');
    const r = spawnSync(process.execPath, ['--import', 'tsx', script, '-Path', `.specs/${slug}`, '-Format', format], {
      encoding: 'utf-8',
      cwd: REPO_ROOT,
      timeout: 60_000,
    });
    fs.rmSync(path.join(REPO_ROOT, '.specs', slug), { recursive: true, force: true });
    this.auditCli = { status: r.status, stdout: (r.stdout ?? '') || (r.stderr ?? '') };
  },
);

Then(/^the audit-spec CLI exits 0 and emits output$/, function (this: AuditWorld) {
  assert.equal(this.auditCli!.status, 0, `audit-spec must exit 0; stdout=${this.auditCli!.stdout}`);
  assert.ok(this.auditCli!.stdout.length > 0, 'audit-spec must emit output');
});

Then(/^the audit-spec CLI exits 0 without crashing$/, function (this: AuditWorld) {
  assert.equal(this.auditCli!.status, 0, `audit-spec must exit 0; stdout=${this.auditCli!.stdout}`);
});
