/**
 * Unit: P18-1 legacy/drift SUSPICION classifier (tools/specs-generator/legacy-triage.ts).
 *
 * Real tmpdir corpus (no mocks). Pins the FR-43 contract:
 *   - SUPERSEDED suspicion from old-version ids inside a newer spec + lineage header,
 *   - not_run ALONE is NOT abandonment (the 107-file-flood guard),
 *   - the classifier only REPORTS (no auto-retire — FR-43c HITL).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildGraphFromCwd } from '../../spec-graph/builder.ts';
import { computeLegacyTriage } from '../legacy-triage.ts';

let root: string;
const specDir = () => path.join(root, '.specs', 'demo-v4');
beforeEach(() => {
  root = path.join(os.tmpdir(), `lt-${randomUUID()}`);
  fs.mkdirSync(specDir(), { recursive: true });
  fs.writeFileSync(path.join(specDir(), 'FR.md'), '## FR-1: Demo\n\nBody.\n');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function feature(name: string, body: string) {
  fs.writeFileSync(path.join(specDir(), name), body);
}

describe('computeLegacyTriage — FR-43 suspicion', () => {
  it('suspects SUPERSEDED from old-version ids + lineage header inside a newer spec', () => {
    feature('legacy.feature', '# preserved as part of the v3 → v4 consolidation\n@FR-1\nFeature: L\n  Scenario: SPECGEN003_01 old\n    Given x\n');
    const r = computeLegacyTriage(buildGraphFromCwd(root), root);
    const c = r.candidates.find((x) => x.file.endsWith('legacy.feature'))!;
    expect(c.suspected).toBe('SUPERSEDED');
    expect(c.signals.some((s) => /SPECGEN003/.test(s))).toBe(true);
    expect(c.signals.some((s) => /lineage|consolidat/i.test(s))).toBe(true);
    expect(c.recommendedAction).toMatch(/archive/);
  });

  it('does NOT flag a plain not_run feature with no abandonment signal (anti-flood gate)', () => {
    // SPECGEN999 is NEWER than v4 → no version-older signal; no lineage header.
    feature('normal.feature', '@FR-1\nFeature: N\n  Scenario: SPECGEN999_01 current\n    Given x\n');
    const r = computeLegacyTriage(buildGraphFromCwd(root), root);
    expect(r.candidates.some((x) => x.file.endsWith('normal.feature'))).toBe(false);
  });

  it('only the old-version feature is a candidate when both coexist', () => {
    feature('legacy.feature', '# v3 → v4 consolidation, preserved\n@FR-1\nFeature: L\n  Scenario: SPECGEN003_01 old\n    Given x\n');
    feature('normal.feature', '@FR-1\nFeature: N\n  Scenario: SPECGEN999_01 current\n    Given x\n');
    const r = computeLegacyTriage(buildGraphFromCwd(root), root);
    expect(r.candidates.map((x) => path.basename(x.file)).sort()).toEqual(['legacy.feature']);
  });

  it('reports only — the suspected file is never auto-moved or deleted (FR-43c)', () => {
    feature('legacy.feature', '# v3 → v4 consolidation\n@FR-1\nFeature: L\n  Scenario: SPECGEN003_01 old\n    Given x\n');
    computeLegacyTriage(buildGraphFromCwd(root), root);
    expect(fs.existsSync(path.join(specDir(), 'legacy.feature'))).toBe(true);
  });
});
