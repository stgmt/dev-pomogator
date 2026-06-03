// Tests for the cross-spec-resolve step-7 batch re-check (SPECGEN004_48).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { recheckStatuses, applyRecheck } from '../recheck.ts';
import type { ReportFinding } from '../walker.ts';

const f = (over: Partial<ReportFinding>): ReportFinding => ({
  code: 'cross-spec/x',
  class: 'uncovered',
  severity: 'WARNING',
  ...over,
});

describe('recheckStatuses', () => {
  it('labels resolved / still_present / transformed by key + same-code fallback', () => {
    const original = [
      f({ code: 'a', referenced_in: '.specs/s/FR.md:1' }), // gone entirely → resolved
      f({ code: 'b', referenced_in: '.specs/s/FR.md:2' }), // identical → still_present
      f({ code: 'c', referenced_in: '.specs/s/FR.md:3' }), // key gone, code remains → transformed
    ];
    const fresh = [
      f({ code: 'b', referenced_in: '.specs/s/FR.md:2' }), // identical to original b
      f({ code: 'c', referenced_in: '.specs/s/FR.md:99' }), // same code c, line moved
    ];
    const m = recheckStatuses(original, fresh);
    expect(m.get('a|||.specs/s/FR.md:1')).toBe('resolved');
    expect(m.get('b|||.specs/s/FR.md:2')).toBe('still_present');
    expect(m.get('c|||.specs/s/FR.md:3')).toBe('transformed');
  });

  it('empty fresh run → every original finding is resolved', () => {
    const m = recheckStatuses([f({ code: 'a' }), f({ code: 'b' })], []);
    expect([...m.values()]).toEqual(['resolved', 'resolved']);
  });
});

describe('applyRecheck', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `recheck-${randomUUID()}`);
    fs.mkdirSync(path.join(root, '.specs/demo'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('stamps resolution_status onto the YAML atomically (no .tmp leftover)', () => {
    const yamlPath = path.join(root, '.specs/demo/consistency-report.yaml');
    fs.writeFileSync(
      yamlPath,
      [
        'findings:',
        '  - code: a',
        '    class: uncovered',
        '    severity: WARNING',
        '    referenced_in: .specs/demo/FR.md:1',
        '  - code: b',
        '    class: uncovered',
        '    severity: WARNING',
        '    referenced_in: .specs/demo/FR.md:2',
        '',
      ].join('\n'),
    );
    const original: ReportFinding[] = [
      f({ code: 'a', referenced_in: '.specs/demo/FR.md:1' }),
      f({ code: 'b', referenced_in: '.specs/demo/FR.md:2' }),
    ];
    const fresh: ReportFinding[] = [f({ code: 'b', referenced_in: '.specs/demo/FR.md:2' })];
    const res = applyRecheck({
      repoRoot: root,
      slug: 'demo',
      original,
      fresh,
      timestamp: '2026-06-03T00:00:00Z',
    });
    expect(res.statuses['a|||.specs/demo/FR.md:1']).toBe('resolved');
    expect(res.statuses['b|||.specs/demo/FR.md:2']).toBe('still_present');
    expect(res.matched).toBe(2);
    const body = fs.readFileSync(yamlPath, 'utf8');
    expect(body).toMatch(/resolution_status: resolved/);
    expect(body).toMatch(/resolution_status: still_present/);
    // Atomic temp+rename: no temp file is left behind.
    const leftovers = fs.readdirSync(path.join(root, '.specs/demo')).filter((n) => n.includes('.tmp'));
    expect(leftovers).toEqual([]);
  });
});
