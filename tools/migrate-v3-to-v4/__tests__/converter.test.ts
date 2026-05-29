// Tests for the v3 → v4 heading converter (FR-11).
//
// Pure-function coverage of all the heading levels the converter accepts,
// plus negative cases: bodies that contain no legacy headings, Jira trace
// lines that must survive unchanged, and modern v4 headings that should
// be left alone (idempotence).

import { describe, it, expect } from 'vitest';
import { convertSource, renderDiff } from '../converter.ts';

describe('convertSource — heading-level coverage', () => {
  for (const hashes of ['##', '###', '####']) {
    it(`converts \`${hashes} Requirement: FR-N <title>\` → \`${hashes} FR-N: <title>\``, () => {
      const src = `${hashes} Requirement: FR-001 Login flow\n\nbody\n`;
      const r = convertSource(src);
      expect(r.changed).toBe(true);
      expect(r.changes).toHaveLength(1);
      expect(r.changes[0].before).toBe(`${hashes} Requirement: FR-001 Login flow`);
      expect(r.changes[0].after).toBe(`${hashes} FR-001: Login flow`);
      expect(r.changes[0].frId).toBe('FR-001');
      expect(r.newSource).toContain(`${hashes} FR-001: Login flow`);
      expect(r.newSource).not.toContain('Requirement: FR-001');
    });
  }

  it('idempotent — modern `### FR-001: Login` is left unchanged', () => {
    const src = '### FR-001: Login\nbody\n';
    const r = convertSource(src);
    expect(r.changed).toBe(false);
    expect(r.newSource).toBe(src);
  });

  it('preserves body content + Jira trace lines byte-for-byte', () => {
    const src = [
      '## Requirement: FR-001 Login',
      '',
      '_Jira: PROJ-42_',
      '',
      'Body paragraph with `inline code`.',
      '',
    ].join('\n');
    const r = convertSource(src);
    expect(r.newSource).toContain('_Jira: PROJ-42_');
    expect(r.newSource).toContain('Body paragraph with `inline code`.');
    expect(r.newSource).toContain('## FR-001: Login');
  });

  it('handles multiple legacy headings in one file', () => {
    const src = [
      '### Requirement: FR-001 First',
      'body1',
      '### Requirement: FR-002 Second',
      'body2',
    ].join('\n');
    const r = convertSource(src);
    expect(r.changes).toHaveLength(2);
    expect(r.changes.map((c) => c.frId)).toEqual(['FR-001', 'FR-002']);
  });

  it('returns changed=false on a body with zero legacy headings', () => {
    const r = convertSource('# Doc\n\n## Section\n');
    expect(r.changed).toBe(false);
    expect(r.changes).toEqual([]);
  });

  it('does NOT match `Requirement:` inside body prose (heading-anchored regex)', () => {
    const src = 'See the Requirement: FR-001 in the design doc.\n';
    expect(convertSource(src).changed).toBe(false);
  });
});

describe('renderDiff', () => {
  it('returns empty string when nothing changed', () => {
    const r = convertSource('# Doc\n');
    expect(renderDiff('test.md', r)).toBe('');
  });

  it('emits a recognisable unified-diff-ish block per change', () => {
    const r = convertSource('## Requirement: FR-001 Login\n');
    const d = renderDiff('.specs/auth/FR.md', r);
    expect(d).toContain('--- .specs/auth/FR.md (v3)');
    expect(d).toContain('+++ .specs/auth/FR.md (v4)');
    expect(d).toContain('- ## Requirement: FR-001 Login');
    expect(d).toContain('+ ## FR-001: Login');
  });
});
