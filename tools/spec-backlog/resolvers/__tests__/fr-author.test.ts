import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { frAuthor } from '../fr-author.ts';
import type { BacklogEntry } from '../../types.ts';

function mkEntry(slug: string, citingFile: string = 'REQUIREMENTS.md'): BacklogEntry {
  return {
    id: 'test5678efgh',
    ts: '2026-05-31T00:00:00Z',
    slug,
    code: 'spec-only/missing-fr-section',
    category: 'missing-fr-section',
    evidence: { file: citingFile },
    suggested_resolver: 'fr-author',
    difficulty: 'medium',
    status: 'open',
  };
}

describe('fr-author resolver', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `fr-${randomUUID()}`);
    fs.mkdirSync(path.join(root, '.specs/foo'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('drafts new FR-N section from citing file context', async () => {
    fs.writeFileSync(
      path.join(root, '.specs/foo/FR.md'),
      ['# Functional Requirements', '', '## FR-1: Login', 'User authentication flow.', ''].join('\n'),
    );
    fs.writeFileSync(
      path.join(root, '.specs/foo/REQUIREMENTS.md'),
      ['# Requirements', '', 'FR-2 is the logout feature.', 'FR-3 handles password reset.'].join('\n'),
    );
    const result = await frAuthor.resolve({ repoRoot: root, entry: mkEntry('foo') });
    expect(result.bailed_out).toBeUndefined();
    expect(result.files_changed.map((p) => p.replace(/\\/g, '/'))).toEqual([
      '.specs/foo/FR.md',
    ]);
    expect(result.confidence).toBeGreaterThan(0.5);
    const fr = fs.readFileSync(path.join(root, '.specs/foo/FR.md'), 'utf8');
    expect(fr).toContain('## FR-2: [TBD title]');
    expect(fr).toContain('## FR-3: [TBD title]');
    expect(fr).toContain('[TBD description');
    expect(fr).toContain('### Citations');
    // Fixture lines (1-based, blank lines counted): 1=`# Requirements`, 2=``,
    // 3=`FR-2 is the logout feature.`, 4=`FR-3 handles password reset.`
    expect(fr).toContain('REQUIREMENTS.md:3');
    expect(fr).toContain('REQUIREMENTS.md:4');
  });

  it('bails out when FR.md is missing', async () => {
    fs.writeFileSync(
      path.join(root, '.specs/foo/REQUIREMENTS.md'),
      'Cites FR-1 but no FR.md exists.\n',
    );
    const result = await frAuthor.resolve({ repoRoot: root, entry: mkEntry('foo') });
    expect(result.bailed_out?.reason).toBe('fr-md-missing');
    expect(result.confidence).toBe(0);
  });

  it('idempotent — does NOT re-draft already-existing FR-N', async () => {
    fs.writeFileSync(
      path.join(root, '.specs/foo/FR.md'),
      ['# Functional Requirements', '', '## FR-1: Login', 'Exists already.', ''].join('\n'),
    );
    fs.writeFileSync(
      path.join(root, '.specs/foo/REQUIREMENTS.md'),
      ['# Requirements', '', 'FR-1 is mentioned here.'].join('\n'),
    );
    const result = await frAuthor.resolve({ repoRoot: root, entry: mkEntry('foo') });
    expect(result.bailed_out?.reason).toBe('already-defined');
    expect(result.files_changed).toEqual([]);
    const fr = fs.readFileSync(path.join(root, '.specs/foo/FR.md'), 'utf8');
    expect(fr).toContain('Exists already.');
    expect(fr).not.toContain('[TBD title]');
  });

  it('bails out when citing file has no FR-N citations', async () => {
    fs.writeFileSync(path.join(root, '.specs/foo/FR.md'), '# Functional Requirements\n');
    fs.writeFileSync(
      path.join(root, '.specs/foo/REQUIREMENTS.md'),
      'No FR citations here, just generic text.\n',
    );
    const result = await frAuthor.resolve({ repoRoot: root, entry: mkEntry('foo') });
    expect(result.bailed_out?.reason).toBe('no-fr-citations');
    expect(result.confidence).toBe(0);
  });

  it('deduplicates multiple citations of same FR-N', async () => {
    fs.writeFileSync(
      path.join(root, '.specs/foo/FR.md'),
      ['# Functional Requirements', '', '## FR-1: Login', 'Authentication.', ''].join('\n'),
    );
    fs.writeFileSync(
      path.join(root, '.specs/foo/REQUIREMENTS.md'),
      ['# Requirements', '', 'FR-2 is mentioned here.', 'Later: FR-2 is also used there.', 'And again: FR-2.'].join(
        '\n',
      ),
    );
    const result = await frAuthor.resolve({ repoRoot: root, entry: mkEntry('foo') });
    expect(result.bailed_out).toBeUndefined();
    const fr = fs.readFileSync(path.join(root, '.specs/foo/FR.md'), 'utf8');
    // Should only have one FR-2 section, not three
    const fr2Count = (fr.match(/## FR-2:/g) || []).length;
    expect(fr2Count).toBe(1);
    // But should cite all three lines. Fixture (1-based): 1=`# Requirements`,
    // 2=``, 3=`FR-2 is mentioned here.`, 4=`Later: FR-2 …`, 5=`And again: FR-2.`
    expect(fr).toContain('REQUIREMENTS.md:3');
    expect(fr).toContain('REQUIREMENTS.md:4');
    expect(fr).toContain('REQUIREMENTS.md:5');
  });

  it('continues with generic draft when citing file is missing', async () => {
    fs.writeFileSync(
      path.join(root, '.specs/foo/FR.md'),
      ['# Functional Requirements', '', '## FR-1: Login', 'Auth.', ''].join('\n'),
    );
    // REQUIREMENTS.md does not exist, but we cite it in the entry
    const result = await frAuthor.resolve({ repoRoot: root, entry: mkEntry('foo', 'MISSING.md') });
    expect(result.bailed_out?.reason).toBe('citing-file-missing');
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('handles multiple FR citations across lines', async () => {
    fs.writeFileSync(path.join(root, '.specs/foo/FR.md'), '# Functional Requirements\n');
    fs.writeFileSync(
      path.join(root, '.specs/foo/DESIGN.md'),
      ['# Design', '', 'The system uses FR-5 for auth and FR-7 for logging.', 'FR-5 must be encrypted.'].join('\n'),
    );
    const result = await frAuthor.resolve({ repoRoot: root, entry: mkEntry('foo', 'DESIGN.md') });
    expect(result.bailed_out).toBeUndefined();
    const fr = fs.readFileSync(path.join(root, '.specs/foo/FR.md'), 'utf8');
    expect(fr).toContain('## FR-5: [TBD title]');
    expect(fr).toContain('## FR-7: [TBD title]');
    // Fixture (1-based): 1=`# Design`, 2=``, 3=`The system uses FR-5 for auth
    // and FR-7 for logging.`, 4=`FR-5 must be encrypted.`
    expect(fr).toContain('DESIGN.md:3');
    expect(fr).toContain('DESIGN.md:4');
  });
});
