// FR-34c / AC-34.5 — the `claude -p` fallback for ambiguous broken anchors.
// The three invariants are asserted with an injected spawn (zero real processes):
//   1. NON-BLOCKING  → every child is detached + unref()d, call returns synchronously.
//   2. NO GUESS      → binary unavailable ⇒ 0 spawns, links stay flagged.
//   3. AMBIGUOUS-ONLY→ a link with a currentSlug is the deterministic fixer's job.
// Plus an honest real-bg smoke that skips when `claude` is not on PATH.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveClaudeBin, buildClaudePrompt, dispatchClaudeFallback } from '../claude-fallback.mjs';
import { fixSpecDir } from '../fix.mjs';

/** @returns {import('../check.mjs').BrokenAnchor} */
const ambiguous = (over = {}) => ({
  file: 'FR.md', line: 3, linkText: 'see the design notes', targetFile: '', targetRaw: '',
  brokenAnchor: 'old-design-anchor', inferredId: '', currentSlug: null, ...over,
});
/** A fake spawn that records argv + options and hands back an unref-spy child. */
function fakeSpawn() {
  const calls = [];
  let unrefs = 0;
  const fn = (bin, args, opts) => {
    calls.push({ bin, args, opts });
    return { unref: () => { unrefs++; } };
  };
  return { fn, calls, unrefs: () => unrefs };
}

describe('resolveClaudeBin', () => {
  it('honours the ANCHOR_CLAUDE_BIN override', () => {
    expect(resolveClaudeBin({ env: { ANCHOR_CLAUDE_BIN: '/opt/claude' } })).toBe('/opt/claude');
  });
  it('returns the first PATH hit, or null when the probe fails', () => {
    const ok = resolveClaudeBin({ env: {}, spawnSyncFn: () => ({ status: 0, stdout: '/usr/bin/claude\n/other\n' }) });
    expect(ok).toBe('/usr/bin/claude');
    const miss = resolveClaudeBin({ env: {}, spawnSyncFn: () => ({ status: 1, stdout: '' }) });
    expect(miss).toBeNull();
    const threw = resolveClaudeBin({ env: {}, spawnSyncFn: () => { throw new Error('no which'); } });
    expect(threw).toBeNull();
  });
});

describe('buildClaudePrompt', () => {
  it('names the broken link + lists candidate headings with their slugs', () => {
    const p = buildClaudePrompt(ambiguous(), [
      { text: 'Design', slug: 'design' },
      { text: 'Components', slug: 'components' },
    ]);
    expect(p).toContain('FR.md on line 3');
    expect(p).toContain('[see the design notes](#old-design-anchor)');
    expect(p).toContain('Design  (#design)');
    expect(p).toContain('Components  (#components)');
    expect(p).toMatch(/do NOT guess/i);
  });
});

describe('dispatchClaudeFallback', () => {
  const candidates = new Map([['FR.md', [{ text: 'Design', slug: 'design' }]]]);

  it('NO GUESS: unavailable binary ⇒ 0 spawns, links left flagged', () => {
    const sp = fakeSpawn();
    const r = dispatchClaudeFallback([ambiguous()], candidates, { claudeBin: null, spawnFn: sp.fn });
    expect(r).toMatchObject({ available: false, dispatched: 0, flagged: 1 });
    expect(sp.calls).toHaveLength(0);
  });

  it('NON-BLOCKING: available ⇒ detached + unref per ambiguous link', () => {
    const sp = fakeSpawn();
    const r = dispatchClaudeFallback([ambiguous(), ambiguous({ line: 9 })], candidates, { claudeBin: '/bin/claude', spawnFn: sp.fn });
    expect(r).toMatchObject({ available: true, dispatched: 2, flagged: 0 });
    expect(sp.calls).toHaveLength(2);
    expect(sp.unrefs()).toBe(2);
    for (const c of sp.calls) {
      expect(c.bin).toBe('/bin/claude');
      expect(c.args[0]).toBe('-p');
      expect(c.args).toContain('--permission-mode');
      expect(c.opts).toMatchObject({ detached: true, stdio: 'ignore' });
    }
  });

  it('AMBIGUOUS-ONLY: a link with a currentSlug is not dispatched here', () => {
    const sp = fakeSpawn();
    const deterministic = ambiguous({ currentSlug: 'design', inferredId: 'FR-1' });
    const r = dispatchClaudeFallback([deterministic], candidates, { claudeBin: '/bin/claude', spawnFn: sp.fn });
    expect(r).toMatchObject({ dispatched: 0, flagged: 0 });
    expect(sp.calls).toHaveLength(0);
  });
});

describe('fixSpecDir --claude integration (mocked spawn)', () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-claude-'));
    fs.mkdirSync(path.join(dir, '.specs', 's'), { recursive: true });
    // One DETERMINISTIC broken link ([FR-1] → inferable) + one AMBIGUOUS (prose text).
    fs.writeFileSync(path.join(dir, '.specs', 's', 'FR.md'),
      '## FR-1: Title\n## Design\n[FR-1](#fr-1-old)\n[see notes](#design-old)\n');
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('unavailable claude ⇒ ambiguous stays flagged, file not guess-rewritten', () => {
    const before = fs.readFileSync(path.join(dir, '.specs', 's', 'FR.md'), 'utf-8');
    const r = fixSpecDir(path.join(dir, '.specs', 's'), dir, { apply: false, claude: true, claudeBin: null });
    expect(r.skipped).toBe(1);                 // the prose link
    expect(r.claude).toMatchObject({ available: false, dispatched: 0, flagged: 1 });
    expect(fs.readFileSync(path.join(dir, '.specs', 's', 'FR.md'), 'utf-8')).toBe(before); // untouched
  });

  it('available claude ⇒ dispatches exactly the ambiguous remainder', () => {
    const sp = fakeSpawn();
    const r = fixSpecDir(path.join(dir, '.specs', 's'), dir, { apply: false, claude: true, claudeBin: '/bin/claude', spawnFn: sp.fn });
    expect(r.fixable).toBe(1);                  // [FR-1] handled deterministically
    expect(r.claude).toMatchObject({ available: true, dispatched: 1 });
    expect(sp.calls).toHaveLength(1);
    expect(sp.calls[0].args.join(' ')).toContain('#design-old');
  });
});

describe('real-bg smoke (skips when claude not installed)', () => {
  const bin = resolveClaudeBin();
  it.skipIf(!bin)('a real detached dispatch returns immediately without throwing', () => {
    const t0 = Date.now();
    const r = dispatchClaudeFallback([ambiguous()], new Map([['FR.md', [{ text: 'Design', slug: 'design' }]]]), { claudeBin: bin });
    expect(r.dispatched).toBe(1);
    expect(Date.now() - t0).toBeLessThan(2000); // non-blocking: we never await claude
  });
});
