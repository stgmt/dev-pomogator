/**
 * Tests for the PostToolUse push hook.
 *
 * The throttle decision is a pure function — easy to drive synthetically.
 * The stateful runner is tested against a tmpdir repo where we plant a tiny
 * spec corpus that intentionally triggers UNCOVERED_FR.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { decidePush, runPush } from '../spec-conformance-push.ts';
import type { Finding } from '../../spec-graph/conformance.ts';

function findingAt(line: number): Finding {
  return {
    code: 'UNCOVERED_FR',
    severity: 'warning',
    location: { file: '.specs/x/FR.md', line },
    message: 'FR-N uncovered',
    nodeId: 'FR-1',
  };
}

describe('decidePush — pure throttle decision', () => {
  it('emits nothing when there are zero findings', () => {
    const r = decidePush({ now: 1000, previous: null, newFindings: [] });
    expect(r.emit).toBeNull();
    expect(r.newState).toBeNull();
  });

  it('accumulates within a 3-second window without emitting', () => {
    const r = decidePush({ now: 1000, previous: null, newFindings: [findingAt(1)] });
    expect(r.emit).toBeNull();
    expect(r.newState?.window_start).toBe(1000);
    expect(r.newState?.pending).toHaveLength(1);
  });

  it('dedupes a finding that arrives twice across the window', () => {
    const previous = { window_start: 1000, pending: [findingAt(1)] };
    const r = decidePush({ now: 1500, previous, newFindings: [findingAt(1)] });
    expect(r.newState?.pending).toHaveLength(1);
  });

  it('flushes after the 3-second window with the aggregated set', () => {
    const previous = { window_start: 1000, pending: [findingAt(1)] };
    const r = decidePush({ now: 1000 + 3000, previous, newFindings: [findingAt(2)] });
    expect(r.emit).toContain('<system-reminder>');
    expect(r.emit).toContain('2 finding(s)');
    expect(r.newState).toBeNull();
  });

  it('keeps the original window_start when accumulating across multiple bursts', () => {
    const a = decidePush({ now: 1000, previous: null, newFindings: [findingAt(1)] });
    const b = decidePush({ now: 1500, previous: a.newState, newFindings: [findingAt(2)] });
    expect(b.newState?.window_start).toBe(1000);
    expect(b.newState?.pending).toHaveLength(2);
  });
});

describe('runPush — stateful runner', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `push-${randomUUID()}`);
    fs.mkdirSync(path.join(root, '.specs', 'x'), { recursive: true });
    // FR-1 with no AC and no tested-by — triggers UNCOVERED_FR.
    fs.writeFileSync(path.join(root, '.specs/x/FR.md'), '## FR-1: Uncovered\n');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('first invocation accumulates silently; later invocation emits', () => {
    const t0 = 1_700_000_000_000;
    const out1 = runPush(root, '.specs/x/FR.md', t0);
    expect(out1).toBe('');
    const out2 = runPush(root, '.specs/x/FR.md', t0 + 4_000);
    expect(out2).toContain('UNCOVERED_FR');
    expect(out2).toContain('FR-1');
  });

  it('per-spec opt-out (`_no_push_check: true`) suppresses push for that file', () => {
    fs.writeFileSync(
      path.join(root, '.specs/x/FR.md'),
      '# _no_push_check: true\n## FR-1: Uncovered\n',
    );
    const out = runPush(root, '.specs/x/FR.md', 1_700_000_000_000);
    expect(out).toBe('');
  });
});
