// Tests for the migrate-v3-to-v4 interactive prompt (SPECGEN004_25).
//
// Drives `promptApplyTimeout` with a deterministic async-iterable input
// source — no real stdin / no real wall-clock dependency past tiny
// vitest fake timers. Pins the 30s-default-skip contract + decision
// parsing + recovery from unrecognised input.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { promptApplyTimeout } from '../interactive.ts';

function lineSource(lines: string[], delayMs = 0): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator](): AsyncIterator<string> {
      for (const line of lines) {
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
        yield line;
      }
    },
  };
}

const context = { file: '.specs/auth/FR.md', headingCount: 2 };

describe('promptApplyTimeout — decision parsing', () => {
  const writes: string[] = [];
  const write = (c: string): void => {
    writes.push(c);
  };
  afterEach(() => writes.splice(0));

  it('resolves "apply" on "a" / "apply" / "y" / "yes"', async () => {
    for (const ans of ['a', 'apply', 'y', 'yes', 'A', 'YES']) {
      const r = await promptApplyTimeout({
        input: lineSource([ans]),
        write,
        timeoutMs: 5_000,
        context,
      });
      expect(r.decision).toBe('apply');
      expect(r.timedOut).toBe(false);
    }
  });

  it('resolves "skip" on "s" / "skip" / "n" / "no"', async () => {
    for (const ans of ['s', 'skip', 'n', 'no']) {
      const r = await promptApplyTimeout({
        input: lineSource([ans]),
        write,
        timeoutMs: 5_000,
        context,
      });
      expect(r.decision).toBe('skip');
    }
  });

  it('resolves "edit" on "e" / "edit"', async () => {
    for (const ans of ['e', 'edit']) {
      const r = await promptApplyTimeout({
        input: lineSource([ans]),
        write,
        timeoutMs: 5_000,
        context,
      });
      expect(r.decision).toBe('edit');
    }
  });

  it('re-prompts on unrecognised input + accepts the next valid answer', async () => {
    const r = await promptApplyTimeout({
      input: lineSource(['huh?', 'maybe', 'apply']),
      write,
      timeoutMs: 5_000,
      context,
    });
    expect(r.decision).toBe('apply');
    expect(writes.some((w) => w.includes('unrecognised "huh?"'))).toBe(true);
    expect(writes.some((w) => w.includes('unrecognised "maybe"'))).toBe(true);
  });
});

describe('promptApplyTimeout — timeout', () => {
  it('defaults to "skip" when no input arrives before the timeout', async () => {
    vi.useFakeTimers();
    try {
      const writes: string[] = [];
      // Input source that yields nothing for the test's duration.
      const idle: AsyncIterable<string> = {
        async *[Symbol.asyncIterator](): AsyncIterator<string> {
          // Never yields.
          await new Promise(() => {});
        },
      };
      const promise = promptApplyTimeout({
        input: idle,
        write: (c) => writes.push(c),
        timeoutMs: 30_000,
        context,
      });
      vi.advanceTimersByTime(30_001);
      const r = await promise;
      expect(r.timedOut).toBe(true);
      expect(r.decision).toBe('skip');
      expect(writes.some((w) => w.includes('[timeout → skip]'))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips when input stream ends without a parseable answer', async () => {
    const r = await promptApplyTimeout({
      input: lineSource([]),
      write: () => undefined,
      timeoutMs: 5_000,
      context,
    });
    expect(r.decision).toBe('skip');
    expect(r.timedOut).toBe(false);
  });
});

describe('promptApplyTimeout — prompt text', () => {
  it('includes the file path + heading count + timeout seconds', async () => {
    const writes: string[] = [];
    await promptApplyTimeout({
      input: lineSource(['apply']),
      write: (c) => writes.push(c),
      timeoutMs: 30_000,
      context: { file: '.specs/x/FR.md', headingCount: 5 },
    });
    const joined = writes.join('');
    expect(joined).toContain('.specs/x/FR.md');
    expect(joined).toContain('5 legacy heading');
    expect(joined).toContain('30s');
  });
});
