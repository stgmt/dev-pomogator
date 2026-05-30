import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { scenarioWriter } from '../scenario-writer.ts';
import type { BacklogEntry } from '../../types.ts';

function mkEntry(slug: string): BacklogEntry {
  return {
    id: 'test1234abcd',
    ts: '2026-05-31T00:00:00Z',
    slug,
    code: 'impl-drift/missing-test',
    category: 'missing-test',
    evidence: { file: 'TASKS.md' },
    suggested_resolver: 'scenario-writer',
    difficulty: 'medium',
    status: 'open',
  };
}

describe.skip('scenario-writer resolver', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `scenario-${randomUUID()}`);
    fs.mkdirSync(path.join(root, '.specs/foo'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('generates .feature file with one Scenario per FR-N', async () => {
    fs.writeFileSync(
      path.join(root, '.specs/foo/FR.md'),
      [
        '## FR-1: User login',
        'User can authenticate with email and password',
        '',
        '## FR-2: Password reset',
        'User can reset forgotten password via email link',
        '',
        '## FR-3: Session management',
        'Session tokens expire after 24 hours',
        '',
      ].join('\n'),
    );
    const result = await scenarioWriter.resolve({ repoRoot: root, entry: mkEntry('foo') });
    expect(result.bailed_out).toBeUndefined();
    expect(result.files_changed).toEqual(['.specs/foo/foo.feature']);
    expect(result.confidence).toBeGreaterThan(0.5);
    const feature = fs.readFileSync(path.join(root, '.specs/foo/foo.feature'), 'utf8');
    expect(feature).toContain('Feature: foo');
    expect(feature).toContain('@feature1');
    expect(feature).toContain('@feature2');
    expect(feature).toContain('@feature3');
    expect(feature).toContain('Scenario: FR-1: User login');
    expect(feature).toContain('Scenario: FR-2: Password reset');
    expect(feature).toContain('Scenario: FR-3: Session management');
    expect(feature).toContain('Given `<precondition');
    expect(feature).toContain('When `<action');
    expect(feature).toContain('Then `<expected');
    expect(feature).toContain('[TBD]');
  });

  it('bails out when FR.md is missing', async () => {
    const result = await scenarioWriter.resolve({ repoRoot: root, entry: mkEntry('foo') });
    expect(result.bailed_out?.reason).toBe('fr-md-missing');
    expect(result.confidence).toBe(0);
  });

  it('bails out when FR.md has no FR-N headings', async () => {
    fs.writeFileSync(
      path.join(root, '.specs/foo/FR.md'),
      '# Main title\nNo requirements sections here.\n',
    );
    const result = await scenarioWriter.resolve({ repoRoot: root, entry: mkEntry('foo') });
    expect(result.bailed_out?.reason).toBe('no-fr-headings');
    expect(result.confidence).toBe(0);
  });

  it('idempotent — does NOT overwrite .feature file that already has @featureN tags', async () => {
    fs.writeFileSync(
      path.join(root, '.specs/foo/FR.md'),
      '## FR-1: Login\n## FR-2: Logout\n',
    );
    fs.writeFileSync(
      path.join(root, '.specs/foo/foo.feature'),
      [
        'Feature: foo',
        '  @feature1',
        '  Scenario: Already implemented login',
        '    Given user is on login page',
        '    When user enters credentials',
        '    Then user should be logged in',
        '',
      ].join('\n'),
    );
    const result = await scenarioWriter.resolve({ repoRoot: root, entry: mkEntry('foo') });
    expect(result.bailed_out?.reason).toBe('already-covered');
    expect(result.files_changed).toEqual([]);
    const feature = fs.readFileSync(path.join(root, '.specs/foo/foo.feature'), 'utf8');
    expect(feature).toContain('Already implemented login');
  });

  it('handles legacy `### Requirement: FR-N` heading form', async () => {
    fs.writeFileSync(
      path.join(root, '.specs/foo/FR.md'),
      [
        '### Requirement: FR-1 Login',
        'Description',
        '',
        '### Requirement: FR-2 Logout',
        'Description',
        '',
      ].join('\n'),
    );
    const result = await scenarioWriter.resolve({ repoRoot: root, entry: mkEntry('foo') });
    expect(result.bailed_out).toBeUndefined();
    const feature = fs.readFileSync(path.join(root, '.specs/foo/foo.feature'), 'utf8');
    expect(feature).toContain('@feature1');
    expect(feature).toContain('@feature2');
    expect(feature).toContain('Scenario: FR-1 Login');
    expect(feature).toContain('Scenario: FR-2 Logout');
  });

  it('creates new .feature file when it does not exist', async () => {
    fs.writeFileSync(
      path.join(root, '.specs/foo/FR.md'),
      '## FR-1: Single requirement\nBrief description\n',
    );
    expect(fs.existsSync(path.join(root, '.specs/foo/foo.feature'))).toBe(false);
    const result = await scenarioWriter.resolve({ repoRoot: root, entry: mkEntry('foo') });
    expect(result.bailed_out).toBeUndefined();
    expect(fs.existsSync(path.join(root, '.specs/foo/foo.feature'))).toBe(true);
    const feature = fs.readFileSync(path.join(root, '.specs/foo/foo.feature'), 'utf8');
    expect(feature).toContain('Feature: foo');
    expect(feature).toContain('Background:');
  });

  it('tolerates FR heading without title', async () => {
    fs.writeFileSync(
      path.join(root, '.specs/foo/FR.md'),
      '## FR-1\nNo title here\n\n## FR-2\nAlso no title\n',
    );
    const result = await scenarioWriter.resolve({ repoRoot: root, entry: mkEntry('foo') });
    expect(result.bailed_out).toBeUndefined();
    const feature = fs.readFileSync(path.join(root, '.specs/foo/foo.feature'), 'utf8');
    expect(feature).toContain('Scenario: FR-1');
    expect(feature).toContain('Scenario: FR-2');
  });
});
