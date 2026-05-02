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

// Remaining stubs — Phase 3 follow-up
describe('SRO_RATCHET: verify-merge.ts (FR-6) — Phase 3 follow-up', () => {
  it.todo('SRO007: regression detected → shouldRevert: true');
  it.todo('FR-6: --force overrides regression');
});

describe('SRO_PRESERVE: originals untouched (FR-7) — Phase 3 follow-up', () => {
  it.todo('SRO008: originals remain on disk after successful merge');
  it.todo('FR-7: cleanup_suggestions array');
});

describe('SRO_RULES_COMPAT: rules backward compat (FR-9) — Phase 3 follow-up', () => {
  it.todo('SRO009: audit byte-identical to baseline');
});
