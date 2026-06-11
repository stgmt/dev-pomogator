/**
 * Unit: the LLM-judge escalation for legacy-triage (tools/specs-generator/legacy-judge.ts).
 *
 * The `claude -p` spawn is INJECTED (a mock), so every branch is covered without a
 * binary — including the honest degrade (no binary / unparseable → UNKNOWN, ran:false).
 * `findBasenameElsewhere` is exercised against a real tmpdir (the deterministic
 * grep-evidence the judge is grounded on).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { judgeLegacyState, findBasenameElsewhere, buildLegacyPrompt } from '../legacy-judge.ts';

let root: string;
beforeEach(() => {
  root = path.join(os.tmpdir(), `lj-${randomUUID()}`);
  fs.mkdirSync(path.join(root, 'tools', '_shared'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tools', '_shared', 'tsx-runner.js'), '// moved here');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('findBasenameElsewhere — grep evidence', () => {
  it('finds a same-named file at its new path (the "moved" signal)', () => {
    const hits = findBasenameElsewhere(root, 'src/scripts/tsx-runner.js');
    expect(hits).toContain('tools/_shared/tsx-runner.js');
  });
  it('returns [] when no same-named file exists', () => {
    expect(findBasenameElsewhere(root, 'src/nonexistent-xyz.ts')).toEqual([]);
  });
});

describe('buildLegacyPrompt', () => {
  it('embeds the missing paths and the same-name evidence', () => {
    const p = buildLegacyPrompt('demo', [{ missing: 'src/a.ts', foundAt: ['tools/a.ts'] }, { missing: 'src/b.ts', foundAt: [] }]);
    expect(p).toContain('src/a.ts');
    expect(p).toContain('tools/a.ts');
    expect(p).toMatch(/NO file with this name found/);
    expect(p).toMatch(/MOVED|REMOVED|ABSORBED/);
  });
});

describe('judgeLegacyState — injected spawn', () => {
  const mock = (out: string) => async () => out;

  it('parses a clean MOVED verdict', async () => {
    const v = await judgeLegacyState({ repoRoot: root, slug: 'demo', missingPaths: ['src/x.ts'], spawn: mock('{"state":"MOVED","why":"same-named file at a new path"}') });
    expect(v).toMatchObject({ state: 'MOVED', ran: true });
  });

  it('tolerates a JSON object wrapped in stray prose/fence', async () => {
    const v = await judgeLegacyState({ repoRoot: root, slug: 'demo', missingPaths: ['src/x.ts'], spawn: mock('Here is my answer:\n```json\n{"state":"REMOVED","why":"gone"}\n```') });
    expect(v).toMatchObject({ state: 'REMOVED', ran: true });
  });

  it('degrades to UNKNOWN (ran:false) when the binary is unavailable', async () => {
    const v = await judgeLegacyState({ repoRoot: root, slug: 'demo', missingPaths: ['src/x.ts'], spawn: async () => { throw new Error('claude not found'); } });
    expect(v).toMatchObject({ state: 'UNKNOWN', ran: false });
  });

  it('degrades to UNKNOWN on unparseable output (never fabricates a verdict)', async () => {
    const v = await judgeLegacyState({ repoRoot: root, slug: 'demo', missingPaths: ['src/x.ts'], spawn: mock('I think it was probably moved, not sure though') });
    expect(v).toMatchObject({ state: 'UNKNOWN', ran: false });
  });

  it('rejects an invalid state value as UNKNOWN', async () => {
    const v = await judgeLegacyState({ repoRoot: root, slug: 'demo', missingPaths: ['src/x.ts'], spawn: mock('{"state":"MAYBE","why":"x"}') });
    expect(v.ran).toBe(false);
  });
});
