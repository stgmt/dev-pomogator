/**
 * Archival door tests — starts with FR-3 (ARCHIVE_SEALED): the mutation door
 * seals `.specs/archive/` against apply/delete/rename. `archive_spec` +
 * `get_archival_proof` tool tests land here as those tools ship.
 */
import { describe, it, expect } from 'vitest';
import { validateTarget, isArchivedSlug } from '../mutations.ts';
import { buildGraphFromCwd } from '../../spec-graph/builder.ts';
import { buildToolRegistry } from '../tools.ts';

const registry = buildToolRegistry(() => buildGraphFromCwd(process.cwd()), {});
const callTool = async (name: string, args: Record<string, unknown>) => {
  const t = registry.find((x) => x.name === name)!;
  const res = await t.handler(args as never);
  return JSON.parse((res as { content: Array<{ text: string }> }).content[0].text);
};

describe('ARCHSEAL: archive is read-only through the mutation door (FR-3)', () => {
  it('ARCHSEAL_01: isArchivedSlug flags archive root + nested, not lookalikes', () => {
    expect(isArchivedSlug('archive')).toBe(true);
    expect(isArchivedSlug('archive/legacy-v3')).toBe(true);
    expect(isArchivedSlug('spec-generator-v4')).toBe(false);
    expect(isArchivedSlug('archived-thing')).toBe(false); // not under archive/
  });

  it('ARCHSEAL_02: validateTarget denies any write under archive/ with ARCHIVE_SEALED', () => {
    const a = validateTarget('archive', 'legacy-v3.feature');
    expect(a).not.toBeNull();
    expect(a!.message).toMatch(/ARCHIVE_SEALED/);
    const b = validateTarget('archive/old-spec', 'FR.md');
    expect(b!.message).toMatch(/ARCHIVE_SEALED/);
  });

  it('ARCHSEAL_03: live specs + lookalike slugs still pass; existing guards intact', () => {
    expect(validateTarget('spec-generator-v4', 'FR.md')).toBeNull();
    expect(validateTarget('archived-thing', 'FR.md')).toBeNull();
    expect(validateTarget('../escape', 'FR.md')).not.toBeNull(); // traversal still denied
    expect(validateTarget('spec-generator-v4', 'FR.MD')).not.toBeNull(); // mixed-case ext still denied
  });
});

describe('ARCHTOOL: get_archival_proof + archive_spec on the real graph (FR-45)', () => {
  it('ARCHTOOL_01: get_archival_proof gives a verdict; live-referenced spec is KEEP_FALSE_POSITIVE', async () => {
    const r = await callTool('get_archival_proof', { slug: 'spec-generator-v4' });
    expect(r.ok).toBe(true);
    expect(['ARCHIVE', 'KEEP_FALSE_POSITIVE']).toContain(r.verdict);
    // v4 is referenced by other specs in prose → must be flagged NOT abandoned.
    expect(r.verdict).toBe('KEEP_FALSE_POSITIVE');
    expect(r.live_inbound_count).toBeGreaterThan(0);
  });

  it('ARCHTOOL_02: unknown slug → SPEC_NOT_FOUND; archived slug → ALREADY_ARCHIVED', async () => {
    expect((await callTool('get_archival_proof', { slug: 'no-such-spec-xyz' })).error).toBe('SPEC_NOT_FOUND');
    expect((await callTool('get_archival_proof', { slug: 'archive' })).error).toBe('ALREADY_ARCHIVED');
  });

  it('ARCHTOOL_03: archive_spec refuses a live-referenced spec (ARCHIVE_BLOCKED) — no move', async () => {
    const r = await callTool('archive_spec', { slug: 'spec-generator-v4', reason: 'test' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('ARCHIVE_BLOCKED');
    expect(r.live_inbound_count).toBeGreaterThan(0);
  });

  it('ARCHTOOL_04: archive_spec refuses an archived/unknown slug before touching disk', async () => {
    expect((await callTool('archive_spec', { slug: 'archive', reason: 'x' })).error).toBe('INVALID_SLUG');
    expect((await callTool('archive_spec', { slug: 'no-such-spec-xyz', reason: 'x' })).error).toBe('SPEC_NOT_FOUND');
  });
});
