// Tests for the architecture-research-workflow rewind tracker (SPECGEN004_27).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  countRewinds,
  decideRewind,
  appendRewindEntry,
  REWIND_LIMIT,
} from '../rewind-tracker.ts';

describe('rewind-tracker', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `rewind-${randomUUID()}`);
    fs.mkdirSync(path.join(root, '.specs/demo/.architecture-research'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('countRewinds is 0 on a fresh stage-5 file', () => {
    fs.writeFileSync(
      path.join(root, '.specs/demo/.architecture-research/5-decisions-locked.md'),
      '# Stage 5\n',
    );
    expect(countRewinds(root, 'demo')).toBe(0);
  });

  it('countRewinds counts `[REWIND] ...` lines', () => {
    fs.writeFileSync(
      path.join(root, '.specs/demo/.architecture-research/5-decisions-locked.md'),
      [
        '# Stage 5',
        '[REWIND] Stage 5 → Stage 4: new constraint',
        '[REWIND] Stage 5 → Stage 3: deeper rethink',
      ].join('\n'),
    );
    expect(countRewinds(root, 'demo')).toBe(2);
  });

  it('decideRewind allows + produces an audit entry when under the limit', () => {
    const r = decideRewind({
      repoRoot: root,
      slug: 'demo',
      attempt: { fromStage: 5, toStage: 4, reason: 'new perf constraint' },
      now: new Date('2026-05-30T03:00:00.000Z'),
    });
    expect(r.allowed).toBe(true);
    expect(r.entry).toContain('[REWIND] Stage 5 → Stage 4: new perf constraint');
    expect(r.entry).toContain('2026-05-30T03:00:00.000Z');
    expect(r.attemptsUsed).toBe(1);
  });

  it('decideRewind blocks once the 3-rewind hard limit is reached', () => {
    fs.writeFileSync(
      path.join(root, '.specs/demo/.architecture-research/5-decisions-locked.md'),
      Array(REWIND_LIMIT)
        .fill('[REWIND] Stage 5 → Stage 4: x')
        .join('\n'),
    );
    const r = decideRewind({
      repoRoot: root,
      slug: 'demo',
      attempt: { fromStage: 5, toStage: 4, reason: 'another one' },
      now: new Date(),
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/hard limit/);
  });

  it('appendRewindEntry appends on its own line', () => {
    const target = appendRewindEntry(root, 'demo', '[REWIND] Stage 5 → Stage 4: x');
    expect(fs.existsSync(target)).toBe(true);
    const body = fs.readFileSync(target, 'utf8');
    expect(body).toContain('[REWIND] Stage 5 → Stage 4: x');
    // Second append doesn't munge the first line.
    appendRewindEntry(root, 'demo', '[REWIND] Stage 5 → Stage 3: y');
    const after = fs.readFileSync(target, 'utf8');
    const lines = after.split('\n').filter((l) => l.startsWith('[REWIND]'));
    expect(lines).toHaveLength(2);
  });
});
