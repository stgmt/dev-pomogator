/**
 * Phase 0 Red — todo stubs для skills-rules-optimizer feature.
 *
 * Implementation: T04 (audit-skills.ts), T05 (detect-overlap.ts),
 * T08 (merge-skills.ts), T09 (verify-merge.ts), T06 (rules-compat).
 */
import { describe, it } from 'vitest';

describe('SRO_AUDIT: audit-skills.ts (FR-1, FR-2, FR-3)', () => {
  it.todo('SRO002: emits structured JSON FR-1 AC-1 feature1');
  it.todo('SRO003: forbidden token claude in name FR-2 AC-2 feature2');
  it.todo('SRO004: allowed-tools missing FR-3 AC-3 feature3');
  it.todo('FR-2: oversize warning >500 lines');
  it.todo('FR-2: description third-person validation');
  it.todo('FR-1: transitive references depth>1');
});

describe('SRO_OVERLAP: detect-overlap.ts (FR-4)', () => {
  it.todo('SRO005: triple-axis Jaccard finds overlap pair FR-4 AC-4 feature4');
  it.todo('FR-4: section headings axis');
  it.todo('FR-4: functional keywords axis');
  it.todo('FR-4: configurable threshold');
  it.todo('FR-4: pair NOT flagged when all axes < 0.3');
});

describe('SRO_MERGE: merge-skills.ts envelope (FR-5)', () => {
  it.todo('SRO006: emits invoke-agent envelope FR-5 AC-5 feature5');
  it.todo('FR-5: subagent_type general-purpose');
  it.todo('FR-5: continuation references verify-merge.ts');
  it.todo('FR-5: rejects path traversal in --merged-name');
});

describe('SRO_RATCHET: verify-merge.ts scorer (FR-6)', () => {
  it.todo('SRO007: regression → shouldRevert FR-6 AC-6 feature6');
  it.todo('FR-6: --force overrides regression');
  it.todo('FR-6: scorer evaluates 4 criteria');
});

describe('SRO_PRESERVE: originals untouched (FR-7)', () => {
  it.todo('SRO008: originals remain on disk after merge FR-7 AC-7 feature7');
  it.todo('FR-7: cleanup_suggestions array');
});

describe('SRO_RULES_COMPAT: rules-side backward compat (FR-9)', () => {
  it.todo('SRO009: rules audit byte-identical to baseline FR-9 AC-8 feature8');
  it.todo('FR-9: check-antipatterns.ts rules-only verbatim');
  it.todo('FR-9: report.ts --before --after rules-only verbatim');
});
