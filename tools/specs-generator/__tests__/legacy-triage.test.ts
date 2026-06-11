/**
 * Unit: P18-1 legacy/drift SUSPICION classifier (tools/specs-generator/legacy-triage.ts).
 *
 * Fixtures are CAPTURED FROM THE REAL CORPUS (real-fixtures discipline), not
 * hand-fabricated — see __fixtures__/legacy-triage/PROVENANCE.md:
 *   - superseded-v4/legacy.feature = the real legacy-v3.feature (28 SPECGEN003
 *     scenarios, v3→v4 lineage header) → ground truth SUPERSEDED.
 *   - drifted-real/FILE_CHANGES.md = the real worktree-setup FILE_CHANGES (a LIVE
 *     skill whose paths went stale at the v2 migration) → ground truth DRIFTED.
 * (Anti-flood + no-REMOVED + tool↔disk reconcile on the LIVE corpus are covered
 * by the dogfood, evals/legacy-triage-dogfood.ts — those need the real corpus.)
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildGraphFromCwd } from '../../spec-graph/builder.ts';
import { computeLegacyTriage } from '../legacy-triage.ts';

const FIXTURES = path.resolve(import.meta.dirname ?? __dirname, '..', '__fixtures__', 'legacy-triage');

describe('computeLegacyTriage — on REAL captured fixtures', () => {
  const report = computeLegacyTriage(buildGraphFromCwd(FIXTURES), FIXTURES);
  const find = (suffix: string) => report.candidates.find((c) => c.file.endsWith(suffix));

  it('the REAL legacy-v3 feature classifies SUPERSEDED with its lineage evidence', () => {
    const c = find('superseded-v4/legacy.feature');
    expect(c, `candidates: ${report.candidates.map((x) => x.file).join(', ')}`).toBeDefined();
    expect(c!.suspected).toBe('SUPERSEDED');
    expect(c!.scenarioCount).toBe(28); // the real scenario count, captured
    expect(c!.signals.some((s) => /SPECGEN003/.test(s))).toBe(true);
    expect(c!.signals.some((s) => /lineage|consolidat/i.test(s))).toBe(true);
    expect(c!.recommendedAction).toMatch(/archive/);
  });

  it('a REAL spec with stale FILE_CHANGES paths classifies DRIFTED (re-sync), never REMOVED', () => {
    const c = find('drifted-real/FILE_CHANGES.md');
    expect(c).toBeDefined();
    expect(c!.suspected).toBe('DRIFTED');
    expect(c!.recommendedAction).toMatch(/UPDATE the spec/i);
    // A missing FILE_CHANGES path is staleness — NEVER auto-claimed as REMOVED.
    expect(report.candidates.every((x) => x.suspected !== 'REMOVED')).toBe(true);
  });

  it('reports only — the fixtures are never moved or deleted (FR-43c)', () => {
    expect(fs.existsSync(path.join(FIXTURES, '.specs', 'superseded-v4', 'legacy.feature'))).toBe(true);
    expect(fs.existsSync(path.join(FIXTURES, '.specs', 'drifted-real', 'FILE_CHANGES.md'))).toBe(true);
  });
});
