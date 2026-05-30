// Tests for cross-spec-reconcile light-mode (FR-17 mechanical subset).
//
// Pin the four shipping finding codes against synthetic fixtures rooted
// in a fresh tmpdir, plus the YAML emitter shape + SARIF round-trip +
// overrides-log JSONL semantics.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { reconcileLight, type Finding } from '../reconcile.ts';
import { emitYaml, writeReport } from '../yaml-writer.ts';
import { buildSarif, writeSarif } from '../sarif.ts';
import { appendOverride, readOverrides } from '../overrides-log.ts';

function seedSpec(root: string, slug: string, files: Record<string, string>): void {
  const dir = path.join(root, '.specs', slug);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), body);
  }
}

describe('reconcileLight — finding-code coverage', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `reconcile-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('impl-drift/missing-file fires when an FR references a path that does not exist', () => {
    seedSpec(root, 'spec-c', {
      'FR.md':
        '## FR-1: Validate user\n\nThe code lives at `src/mcp/validate_user.ts`.\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['spec-c'] });
    const missing = report.findings.filter((f) => f.code === 'impl-drift/missing-file');
    expect(missing).toHaveLength(1);
    expect(missing[0].severity).toBe('WARNING');
    expect(missing[0].expected_path).toBe('src/mcp/validate_user.ts');
    expect(missing[0].referenced_in).toMatch(/spec-c\/FR\.md:\d+/);
  });

  it('does NOT fire missing-file when a glob-ish path matches at least one file', () => {
    fs.mkdirSync(path.join(root, 'src/mcp'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/mcp/validate_user.ts'), '// real');
    seedSpec(root, 'spec-c', {
      'FR.md': '## FR-1: Validate user — see `src/mcp/validate_user*.ts`.\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['spec-c'] });
    expect(report.findings.filter((f) => f.code === 'impl-drift/missing-file')).toEqual([]);
  });

  it('cross-spec/runtime-identifier-drift fires when two specs name the same concept differently', () => {
    seedSpec(root, 'spec-a', { 'FR.md': '## FR-1\n\nfeedback_key = "session_token"\n' });
    seedSpec(root, 'spec-b', { 'FR.md': '## FR-2\n\nfeedback_key = "sessionToken"\n' });
    const reports = reconcileLight({ repoRoot: root });
    const drift = reports
      .flatMap((r) => r.findings)
      .find((f) => f.code === 'cross-spec/runtime-identifier-drift');
    expect(drift).toBeDefined();
    expect(drift!.severity).toBe('CRITICAL');
    expect(drift!.spec_a).toContain('session_token');
    expect(drift!.spec_b).toContain('sessionToken');
  });

  it('cross-spec/concept-overlap fires when two specs share ≥3 capitalised concept-nouns', () => {
    seedSpec(root, 'spec-x', {
      'FR.md': '## FR-1\n\nAuthService LoginController SessionManager TokenCache UserStore\n',
    });
    seedSpec(root, 'spec-y', {
      'FR.md': '## FR-2\n\nAuthService LoginController SessionManager OrderQueue Inventory\n',
    });
    const reports = reconcileLight({ repoRoot: root });
    const overlap = reports
      .flatMap((r) => r.findings)
      .find((f) => f.code === 'cross-spec/concept-overlap');
    expect(overlap).toBeDefined();
    expect(overlap!.severity).toBe('INFO');
  });

  it('empty .specs/ folder produces no findings + no error', () => {
    expect(reconcileLight({ repoRoot: root })).toEqual([]);
  });

  it('spec-only/orphan-FR fires when an FR is defined but never referenced again', () => {
    seedSpec(root, 'spec-orph', {
      'FR.md': '## FR-1: Login\n\n## FR-2: Logout\nDescribed at length here.\nFR-2 also used here.\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['spec-orph'] });
    const orphans = report.findings.filter((f) => f.code === 'spec-only/orphan-FR');
    // FR-1 is the orphan (one heading, zero refs, no @feature tag).
    expect(orphans).toHaveLength(1);
    expect(orphans[0].severity).toBe('WARNING');
    expect(orphans[0].referenced_in).toMatch(/spec-orph\/FR\.md$/);
  });

  it('spec-only/orphan-FR does NOT fire when an @featureN tag covers the FR', () => {
    seedSpec(root, 'spec-cov', {
      'FR.md': '## FR-7: Test me\n',
      'spec-cov.feature': '\n@feature7\nScenario: covered\n  Given step\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['spec-cov'] });
    expect(report.findings.find((f) => f.code === 'spec-only/orphan-FR')).toBeUndefined();
  });

  it('spec-only/uncovered-AC fires when AC headings exist but the spec has zero .feature files', () => {
    seedSpec(root, 'spec-ac', {
      'AC.md': '### AC-1: first\n\n### AC-2: second\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['spec-ac'] });
    const uncovered = report.findings.filter((f) => f.code === 'spec-only/uncovered-AC');
    expect(uncovered).toHaveLength(1);
    expect(uncovered[0].suggested_fix).toContain('2 AC heading');
  });

  it('cross-spec/duplicate-fr-id fires when two specs both define the same FR-N', () => {
    seedSpec(root, 'spec-x', { 'FR.md': '## FR-1: Login\n' });
    seedSpec(root, 'spec-y', { 'FR.md': '## FR-1: Different thing\n' });
    const reports = reconcileLight({ repoRoot: root });
    const dup = reports
      .flatMap((r) => r.findings)
      .find((f) => f.code === 'cross-spec/duplicate-fr-id');
    expect(dup).toBeDefined();
    expect(dup!.severity).toBe('CRITICAL');
    expect(dup!.spec_a).toContain('FR-1');
    expect(dup!.spec_b).toContain('FR-1');
  });

  it('cross-spec/contradictory-fr fires when the same FR id has substantially different bodies', () => {
    seedSpec(root, 'spec-p', {
      'FR.md': '## FR-1: Auth\n\nUsers log in with email + password, redirect to dashboard.\n',
    });
    seedSpec(root, 'spec-q', {
      'FR.md': '## FR-1: Inventory\n\nWarehouse manages SKUs across multiple bins.\n',
    });
    const reports = reconcileLight({ repoRoot: root });
    const contradictory = reports
      .flatMap((r) => r.findings)
      .find((f) => f.code === 'cross-spec/contradictory-fr');
    expect(contradictory).toBeDefined();
    expect(contradictory!.severity).toBe('CRITICAL');
  });

  it('impl-drift/test-without-fr fires when a @featureN tag has no matching FR in any spec', () => {
    seedSpec(root, 'spec-orph2', {
      'spec-orph2.feature': '\n@feature99\nScenario: orphan tag\n  Given step\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['spec-orph2'] });
    const orphans = report.findings.filter((f) => f.code === 'impl-drift/test-without-fr');
    expect(orphans).toHaveLength(1);
    expect(orphans[0].severity).toBe('WARNING');
    expect(orphans[0].referenced_in).toContain('@fr99');
  });
});

describe('emitYaml + writeReport', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `yaml-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function fakeReport(findings: Finding[]) {
    return {
      generatedAt: '2026-05-30T03:00:00.000Z',
      mode: 'light' as const,
      specSlug: 'demo',
      findings,
    };
  }

  it('emits an empty findings list as `findings: []`', () => {
    const out = emitYaml(fakeReport([]));
    expect(out).toContain('total_findings: 0');
    expect(out).toContain('findings: []');
  });

  it('emits one block per finding with the canonical keys', () => {
    const out = emitYaml(
      fakeReport([
        {
          code: 'impl-drift/missing-file',
          class: 'uncovered',
          severity: 'WARNING',
          referenced_in: '.specs/demo/FR.md:1',
          expected_path: 'src/x.ts',
          suggested_fix: 'create or remove',
        },
      ]),
    );
    expect(out).toContain('code: impl-drift/missing-file');
    expect(out).toContain('class: uncovered');
    expect(out).toContain('severity: WARNING');
    expect(out).toContain('expected_path: src/x.ts');
  });

  it('writeReport writes atomically to the canonical location', () => {
    const target = writeReport(root, fakeReport([]));
    expect(target).toBe(path.join(root, '.specs/demo/consistency-report.yaml'));
    expect(fs.existsSync(target)).toBe(true);
  });
});

describe('SARIF emitter', () => {
  it('rounds-trips one finding into a valid SARIF result with correct level mapping', () => {
    const doc = buildSarif({
      generatedAt: 't',
      mode: 'light',
      specSlug: 'x',
      findings: [
        {
          code: 'cross-spec/runtime-identifier-drift',
          class: 'runtime-identifier-drift',
          severity: 'CRITICAL',
          spec_a: '.specs/spec-a/FR.md:12',
          spec_b: '.specs/spec-b/FR.md:8',
          suggested_fix: 'pick one',
        },
      ],
    });
    expect(doc.version).toBe('2.1.0');
    expect(doc.runs[0].results[0].level).toBe('error');
    expect(doc.runs[0].results[0].ruleId).toBe('cross-spec/runtime-identifier-drift');
    expect(doc.runs[0].results[0].locations).toHaveLength(2);
  });

  it('writes SARIF to the canonical sibling file', () => {
    const tmp = path.join(os.tmpdir(), `sarif-${randomUUID()}`);
    fs.mkdirSync(tmp, { recursive: true });
    try {
      const target = writeSarif(tmp, {
        generatedAt: 't',
        mode: 'light',
        specSlug: 'x',
        findings: [],
      });
      expect(target).toBe(path.join(tmp, '.specs/x/consistency-report.sarif'));
      const body = JSON.parse(fs.readFileSync(target, 'utf8')) as { version: string };
      expect(body.version).toBe('2.1.0');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('overrides-log JSONL writer (FR-17 SPECGEN004_41)', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `overrides-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('appends one JSON line per override', () => {
    appendOverride(root, {
      timestamp: '2026-05-30T03:00:00Z',
      session_id: 'sess-1',
      finding_code: 'cross-spec/runtime-identifier-drift',
      spec_slug: 'spec-a',
      reason: 'covered by parametrized test runner',
    });
    appendOverride(root, {
      timestamp: '2026-05-30T03:01:00Z',
      session_id: 'sess-1',
      finding_code: 'impl-drift/missing-file',
      spec_slug: 'spec-c',
      reason: 'deferred per JIRA-42',
    });
    const all = readOverrides(root);
    expect(all).toHaveLength(2);
    expect(all[0].reason).toBe('covered by parametrized test runner');
    expect(all[1].reason).toBe('deferred per JIRA-42');
  });

  it('tolerates a malformed line + skips it', () => {
    appendOverride(root, {
      timestamp: 't',
      finding_code: 'x',
      spec_slug: 's',
      reason: 'r',
    });
    const file = path.join(root, '.claude/logs/cross-spec-overrides.jsonl');
    fs.appendFileSync(file, 'this-is-not-json\n');
    appendOverride(root, {
      timestamp: 't2',
      finding_code: 'y',
      spec_slug: 's',
      reason: 'r2',
    });
    const all = readOverrides(root);
    expect(all).toHaveLength(2);
  });
});
