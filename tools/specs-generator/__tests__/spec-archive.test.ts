/**
 * spec-archive agent — `investigateDrifted` unit tests. The agent must do what a human
 * does on a NEEDS_HUMAN (drifted) spec: read it, and decide KEEP_DRIFTED (the feature's
 * impl is still on disk — even MOVED by the v1→v2 refactor — so the spec text is just
 * stale) vs RETIRE_CANDIDATE (no impl found, confirm). Deterministic temp-repo fixtures.
 *
 * @see ../spec-archive.ts investigateDrifted
 * @see .specs/spec-generator-v4/FR.md FR-45
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { investigateDrifted } from '../spec-archive.ts';

/** A throwaway repo with a `tools/foo/` source root the index can walk. */
function mkRepo(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-archive-'));
  fs.mkdirSync(path.join(tmp, 'tools', 'foo'), { recursive: true });
  return tmp;
}
function writeSpec(tmp: string, slug: string, readme: string, fileChanges: string): void {
  const dir = path.join(tmp, '.specs', slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'README.md'), readme);
  fs.writeFileSync(path.join(dir, 'FILE_CHANGES.md'), fileChanges);
}

describe('SPECARCH: investigateDrifted — read the spec, check code on disk', () => {
  it('SPECARCH_01: shipped README + impl present → KEEP_DRIFTED', () => {
    const tmp = mkRepo();
    writeSpec(tmp, 'alive', '# Alive\n\n**Status: shipped 0.1.0** body line\n', '| `tools/foo/bar.ts` | create |\n');
    fs.writeFileSync(path.join(tmp, 'tools', 'foo', 'bar.ts'), 'export {};\n');
    const inv = investigateDrifted(tmp, 'alive');
    expect(inv.recommendation).toBe('KEEP_DRIFTED');
    expect(inv.shipped).toBe(true);
    expect(inv.codePresent).toBe(true);
    expect(inv.summary).toMatch(/shipped/);
  });

  it('SPECARCH_02: code MOVED (spec claims extensions/…, file lives in tools/ — same basename) → KEEP_DRIFTED', () => {
    const tmp = mkRepo();
    // spec points at the OLD v1 path; the real file moved to tools/ keeping its basename.
    writeSpec(tmp, 'moved', '# Moved\n\nbody, no status marker\n', '| `extensions/x/tools/widget.py` | create |\n');
    fs.writeFileSync(path.join(tmp, 'tools', 'foo', 'widget.py'), '# moved here in v2\n');
    const inv = investigateDrifted(tmp, 'moved');
    expect(inv.recommendation).toBe('KEEP_DRIFTED');
    expect(inv.shipped).toBe(false);
    expect(inv.codePresent).toBe(true);
    expect(inv.evidence).toMatch(/drifted, feature lives/);
  });

  it('SPECARCH_03: no shipped marker + claimed impl absent → RETIRE_CANDIDATE', () => {
    const tmp = mkRepo();
    writeSpec(tmp, 'dead', '# Dead\n\nbody, no status marker\n', '| `tools/gone/missing.ts` | create |\n');
    const inv = investigateDrifted(tmp, 'dead');
    expect(inv.recommendation).toBe('RETIRE_CANDIDATE');
    expect(inv.codePresent).toBe(false);
    expect(inv.evidence).toMatch(/none of .* found|cannot tell/);
  });

  it('SPECARCH_04: missing spec docs → RETIRE_CANDIDATE, no throw (best-effort read)', () => {
    const tmp = mkRepo();
    fs.mkdirSync(path.join(tmp, '.specs', 'empty'), { recursive: true });
    const inv = investigateDrifted(tmp, 'empty');
    expect(inv.recommendation).toBe('RETIRE_CANDIDATE');
    expect(inv.codePresent).toBe(false);
  });
});
