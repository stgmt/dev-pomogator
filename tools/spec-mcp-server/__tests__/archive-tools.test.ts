/**
 * Archival door tests — starts with FR-3 (ARCHIVE_SEALED): the mutation door
 * seals `.specs/archive/` against apply/delete/rename. `archive_spec` +
 * `get_archival_proof` tool tests land here as those tools ship.
 */
import { describe, it, expect } from 'vitest';
import { validateTarget, isArchivedSlug } from '../mutations.ts';

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
