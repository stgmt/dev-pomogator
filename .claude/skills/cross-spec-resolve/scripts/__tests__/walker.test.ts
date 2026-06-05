// Tests for the cross-spec-resolve walker (SPECGEN004_44..47).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  readReport,
  groupFindings,
  buildExplanation,
  planResolution,
  promptHeader,
  exitCodeForChoice,
  type ReportFinding,
} from '../walker.ts';

function makeReport(repoRoot: string, slug: string, findings: ReportFinding[]): void {
  const dir = path.join(repoRoot, '.specs', slug);
  fs.mkdirSync(dir, { recursive: true });
  const lines: string[] = ['generated_at: t', 'mode: light', `spec_slug: ${slug}`, `total_findings: ${findings.length}`];
  if (findings.length === 0) {
    lines.push('findings: []');
  } else {
    lines.push('findings:');
    for (const f of findings) {
      lines.push(`  - code: ${f.code}`);
      lines.push(`    class: ${f.class}`);
      lines.push(`    severity: ${f.severity}`);
      if (f.referenced_in) lines.push(`    referenced_in: ${f.referenced_in}`);
      if (f.expected_path) lines.push(`    expected_path: ${f.expected_path}`);
      if (f.spec_a) lines.push(`    spec_a: ${f.spec_a}`);
      if (f.spec_b) lines.push(`    spec_b: ${f.spec_b}`);
      if (f.suggested_fix) lines.push(`    suggested_fix: ${f.suggested_fix}`);
    }
  }
  fs.writeFileSync(path.join(dir, 'consistency-report.yaml'), lines.join('\n') + '\n');
}

describe('readReport', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `walker-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('returns null when the YAML is missing', () => {
    expect(readReport(root, 'missing')).toBeNull();
  });

  it('parses a single finding round-trip', () => {
    makeReport(root, 'x', [
      {
        code: 'impl-drift/missing-file',
        class: 'uncovered',
        severity: 'WARNING',
        referenced_in: '.specs/x/FR.md:42',
        expected_path: 'src/y.ts',
        suggested_fix: 'create or remove',
      },
    ]);
    const r = readReport(root, 'x');
    expect(r?.findings).toHaveLength(1);
    expect(r?.findings[0].code).toBe('impl-drift/missing-file');
    expect(r?.findings[0].expected_path).toBe('src/y.ts');
  });
});

describe('groupFindings', () => {
  it('dedups by (code, spec_a, spec_b, referenced_in)', () => {
    const f: ReportFinding = {
      code: 'cross-spec/runtime-identifier-drift',
      class: 'runtime-identifier-drift',
      severity: 'CRITICAL',
      spec_a: '.specs/a/FR.md',
      spec_b: '.specs/b/FR.md',
    };
    expect(groupFindings([f, { ...f }])).toHaveLength(1);
  });

  it('orders CRITICAL → WARNING → INFO', () => {
    const ordered = groupFindings([
      { code: 'a', class: 'spec-only', severity: 'INFO' },
      { code: 'b', class: 'contradiction', severity: 'CRITICAL' },
      { code: 'c', class: 'uncovered', severity: 'WARNING' },
    ]);
    expect(ordered.map((f) => f.severity)).toEqual(['CRITICAL', 'WARNING', 'INFO']);
  });
});

describe('buildExplanation', () => {
  it('emits the 5 canonical fields', () => {
    const ex = buildExplanation(
      {
        code: 'cross-spec/runtime-identifier-drift',
        class: 'runtime-identifier-drift',
        severity: 'CRITICAL',
        spec_a: '.specs/auth/FR.md',
        spec_b: '.specs/billing/FR.md',
        suggested_fix: 'pick one name',
      },
      'auth',
    );
    expect(ex.header).toContain('cross-spec/runtime-identifier-drift');
    expect(ex.header).toContain('CRITICAL');
    expect(ex.files).toHaveLength(2);
    expect(ex.plain).toBe('pick one name');
    expect(ex.why).toMatch(/contract/);
    expect(ex.options.length).toBeGreaterThan(0);
  });

  it('CRITICAL findings get "Abort STOP" + "Acknowledge & override" options', () => {
    const ex = buildExplanation(
      { code: 'x', class: 'contradiction', severity: 'CRITICAL' },
      'auth',
    );
    const labels = ex.options.map((o) => o.label);
    expect(labels.some((l) => l.includes('Abort STOP'))).toBe(true);
    expect(labels.some((l) => l.includes('Acknowledge & override'))).toBe(true);
  });

  it('architectural-decision-vs-reality offers Path A/B/C', () => {
    const ex = buildExplanation(
      {
        code: 'cross-spec/decision-locked-but-reality-diverges',
        class: 'architectural-decision-vs-reality',
        severity: 'CRITICAL',
      },
      'auth',
    );
    const labels = ex.options.map((o) => o.label);
    expect(labels.some((l) => l.includes('Path A'))).toBe(true);
    expect(labels.some((l) => l.includes('Path B'))).toBe(true);
    expect(labels.some((l) => l.includes('Path C'))).toBe(true);
  });

  it('flags foreign-spec edits when spec_b is in another slug', () => {
    const ex = buildExplanation(
      {
        code: 'cross-spec/runtime-identifier-drift',
        class: 'runtime-identifier-drift',
        severity: 'CRITICAL',
        spec_a: '.specs/auth/FR.md',
        spec_b: '.specs/billing/FR.md',
      },
      'auth',
    );
    expect(ex.requiresForeignSpecConfirm).toBe(true);
  });
});

describe('planResolution', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `plan-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('returns missing-report hint when the YAML is absent (SPECGEN004_47)', () => {
    const r = planResolution({ repoRoot: root, slug: 'never-ran' });
    expect(r.missing).toBe(true);
    expect(r.hint).toBe('Run /cross-spec-reconcile first');
  });

  it('produces a plan entry per deduped finding ordered by severity', () => {
    makeReport(root, 'demo', [
      { code: 'a', class: 'spec-only', severity: 'INFO' },
      { code: 'b', class: 'contradiction', severity: 'CRITICAL' },
    ]);
    const r = planResolution({ repoRoot: root, slug: 'demo' });
    expect(r.plan).toHaveLength(2);
    expect(r.plan![0].finding.severity).toBe('CRITICAL');
    expect(r.plan![1].finding.severity).toBe('INFO');
  });
});

// SPECGEN004_40 — the CRITICAL STOP-blocking prompt seam (header + abort exit).
describe('promptHeader + exitCodeForChoice (SPECGEN004_40)', () => {
  it('promptHeader maps each severity to its prompt label', () => {
    expect(promptHeader('CRITICAL')).toBe('⚠️ CRIT');
    expect(promptHeader('WARNING')).toBe('WARN');
    expect(promptHeader('INFO')).toBe('INFO');
  });

  it('a CRITICAL hard-conflict finding surfaces an Abort STOP option', () => {
    const finding: ReportFinding = {
      code: 'cross-spec/runtime-identifier-drift',
      class: 'runtime-identifier-drift',
      severity: 'CRITICAL',
      spec_a: 'spec-a',
      spec_b: 'spec-b',
    };
    const labels = buildExplanation(finding, 'spec-a').options.map((o) => o.label);
    expect(labels).toContain('Abort STOP');
  });

  it('Abort exits non-zero (STOP stays blocked); every other choice exits 0', () => {
    expect(exitCodeForChoice('Abort STOP')).not.toBe(0);
    expect(exitCodeForChoice('Apply suggested fix')).toBe(0);
    expect(exitCodeForChoice('Acknowledge & override (log + skip)')).toBe(0);
  });
});
