/**
 * skills-rules-optimizer e2e tests.
 *
 * Phase 0/2 — implementation tests for audit-skills, detect-overlap, merge-skills.
 * Fixtures: tests/fixtures/skills-rules-optimizer/{6 dirs}.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

const FIXTURES_ROOT = path.join(__dirname, '..', 'fixtures', 'skills-rules-optimizer');
const SCRIPTS_DIR = path.join(__dirname, '..', '..', '.claude', 'skills', 'skills-rules-optimizer', 'scripts');

function runScript(script: string, args: string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(
    'npx',
    ['tsx', path.join(SCRIPTS_DIR, script), ...args],
    { encoding: 'utf-8', shell: process.platform === 'win32' },
  );
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status };
}

describe('SRO_AUDIT: audit-skills.ts (FR-1, FR-2, FR-3)', () => {
  it('emits structured JSON with required keys (FR-1, AC-1, @feature1)', () => {
    const res = runScript('audit-skills.ts', ['--dir', FIXTURES_ROOT]);
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed).toHaveProperty('totalSkills');
    expect(parsed).toHaveProperty('withErrors');
    expect(parsed).toHaveProperty('withWarnings');
    expect(parsed).toHaveProperty('details');
    expect(parsed.totalSkills).toBeGreaterThanOrEqual(5);
  });

  it('detects forbidden token "claude" in name (FR-2, AC-2, @feature2)', () => {
    const res = runScript('audit-skills.ts', ['--dir', FIXTURES_ROOT]);
    const parsed = JSON.parse(res.stdout);
    const finding = parsed.withErrors.find(
      (f: { code: string; path: string }) =>
        f.code === 'FRONTMATTER_NAME_FORBIDDEN_TOKEN' && f.path.includes('claude-in-name'),
    );
    expect(finding).toBeDefined();
    expect(finding.details.token).toBe('claude');
  });

  it('flags allowed-tools missing (FR-3, AC-3, @feature3)', () => {
    const res = runScript('audit-skills.ts', ['--dir', FIXTURES_ROOT]);
    const parsed = JSON.parse(res.stdout);
    const finding = parsed.withErrors.find(
      (f: { code: string; path: string; details: { missing: string[] } }) =>
        f.code === 'ALLOWED_TOOLS_MISSING' && f.path.includes('missing-allowed-tools'),
    );
    expect(finding).toBeDefined();
    expect(finding.details.missing).toContain('Skill');
    expect(finding.details.missing).toContain('Bash');
  });

  it('emits OVERSIZE warning when SKILL.md > 500 lines (FR-2)', () => {
    const res = runScript('audit-skills.ts', ['--dir', FIXTURES_ROOT]);
    const parsed = JSON.parse(res.stdout);
    const finding = parsed.withWarnings.find(
      (f: { code: string; path: string; details: { lines: number } }) =>
        f.code === 'OVERSIZE' && f.path.includes('oversize-skill'),
    );
    expect(finding).toBeDefined();
    expect(finding.details.lines).toBeGreaterThan(500);
  });
});

describe('SRO_OVERLAP: detect-overlap.ts (FR-4)', () => {
  it('detects trigger-axis overlap pair with similarity >= 0.3 (FR-4, AC-4, @feature4)', () => {
    const res = runScript('detect-overlap.ts', ['--dir', FIXTURES_ROOT]);
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout);
    const pair = parsed.overlaps.find(
      (p: { a: string; b: string; axis: string; similarity: number }) =>
        (p.a === 'a' && p.b === 'b') || (p.a === 'b' && p.b === 'a'),
    );
    expect(pair).toBeDefined();
    expect(pair.axis).toBe('trigger');
    expect(pair.similarity).toBeGreaterThanOrEqual(0.3);
  });
});

describe('SRO_MERGE: merge-skills.ts envelope (FR-5)', () => {
  it('emits valid invoke-agent envelope with both SKILL.md в prompt (FR-5, AC-5, @feature5)', () => {
    const overlapDir = path.join(FIXTURES_ROOT, 'overlap-pair');
    const res = runScript('merge-skills.ts', [
      '--execute', 'a', 'b',
      '--merged-name', 'merged-ab',
      '--skills-dir', overlapDir,
    ]);
    expect(res.status).toBe(0);
    const env = JSON.parse(res.stdout);
    expect(env.action).toBe('invoke-agent');
    expect(env.subagent_type).toBe('general-purpose');
    expect(env.prompt).toContain('overlap-fixture-a');
    expect(env.prompt).toContain('overlap-fixture-b');
    expect(env.continuation).toContain('verify-merge.ts');
    expect(env.merged_path).toContain('merged-ab');
  });

  it('rejects path traversal в --merged-name (NFR-Security)', () => {
    const overlapDir = path.join(FIXTURES_ROOT, 'overlap-pair');
    const res = runScript('merge-skills.ts', [
      '--execute', 'a', 'b',
      '--merged-name', '../escape',
      '--skills-dir', overlapDir,
    ]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('path traversal');
  });

  it('rejects forbidden token в --merged-name (FR-2 reuse)', () => {
    const overlapDir = path.join(FIXTURES_ROOT, 'overlap-pair');
    const res = runScript('merge-skills.ts', [
      '--execute', 'a', 'b',
      '--merged-name', 'claude-helper',
      '--skills-dir', overlapDir,
    ]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('forbidden token');
  });
});

describe('SRO_RATCHET: verify-merge.ts (FR-6)', () => {
  it('emits scorer envelope with prompt containing merged + originals', () => {
    const overlapDir = path.join(FIXTURES_ROOT, 'overlap-pair');
    // Use existing SKILL.md as fake "merged draft" — verify envelope shape
    const fakeDraft = path.join(overlapDir, 'a', 'SKILL.md');
    const res = runScript('verify-merge.ts', [
      '--merged', fakeDraft,
      '--originals', 'a', 'b',
      '--skills-dir', overlapDir,
    ]);
    expect(res.status).toBe(0);
    const env = JSON.parse(res.stdout);
    expect(env.action).toBe('invoke-agent');
    expect(env.subagent_type).toBe('general-purpose');
    expect(env.decision_handler).toBeDefined();
    expect(env.decision_handler.on_regression).toBe('delete_draft_emit_report');
    expect(env.decision_handler.on_pass).toBe('rename_draft_emit_cleanup');
  });

  it('--force flag propagates через decision_handler.force', () => {
    const overlapDir = path.join(FIXTURES_ROOT, 'overlap-pair');
    const fakeDraft = path.join(overlapDir, 'a', 'SKILL.md');
    const res = runScript('verify-merge.ts', [
      '--merged', fakeDraft,
      '--originals', 'a', 'b',
      '--skills-dir', overlapDir,
      '--force',
    ]);
    expect(res.status).toBe(0);
    const env = JSON.parse(res.stdout);
    expect(env.decision_handler.force).toBe(true);
  });
});

describe('SRO_PRESERVE: originals untouched (FR-7)', () => {
  it('originals A and B remain on disk after merge envelope generation', () => {
    const overlapDir = path.join(FIXTURES_ROOT, 'overlap-pair');
    const aPath = path.join(overlapDir, 'a', 'SKILL.md');
    const bPath = path.join(overlapDir, 'b', 'SKILL.md');
    const fs = require('node:fs');
    const aBefore = fs.readFileSync(aPath, 'utf-8');
    const bBefore = fs.readFileSync(bPath, 'utf-8');

    runScript('merge-skills.ts', [
      '--execute', 'a', 'b',
      '--merged-name', 'merged-preserve-test',
      '--skills-dir', overlapDir,
    ]);

    expect(fs.readFileSync(aPath, 'utf-8')).toBe(aBefore);
    expect(fs.readFileSync(bPath, 'utf-8')).toBe(bBefore);
  });

  it('cleanup_suggestions array содержит rm -rf commands для обоих originals', () => {
    const overlapDir = path.join(FIXTURES_ROOT, 'overlap-pair');
    const fakeDraft = path.join(overlapDir, 'a', 'SKILL.md');
    const res = runScript('verify-merge.ts', [
      '--merged', fakeDraft,
      '--originals', 'a', 'b',
      '--skills-dir', overlapDir,
    ]);
    const env = JSON.parse(res.stdout);
    expect(env.decision_handler.cleanup_suggestions).toHaveLength(2);
    expect(env.decision_handler.cleanup_suggestions[0]).toContain('rm -rf');
    expect(env.decision_handler.cleanup_suggestions[0]).toContain('a');
    expect(env.decision_handler.cleanup_suggestions[1]).toContain('rm -rf');
    expect(env.decision_handler.cleanup_suggestions[1]).toContain('b');
  });
});

describe('SRO_RULES_COMPAT: rules backward compat (FR-9, AC-8)', () => {
  it('audit dispatcher routes .claude/rules to audit-rules pipeline (verbatim output)', () => {
    const rulesDir = path.join(__dirname, '..', '..', '.claude', 'rules');
    const res = runScript('audit.ts', ['--dir', rulesDir]);
    // audit-rules.ts text output starts with "=== Rules Audit ===" header
    expect(res.stdout).toContain('=== Rules Audit ===');
    expect(res.stdout).toMatch(/Total files: \d+/);
    expect(res.stdout).toMatch(/Total tokens: \d+/);
  });
});
