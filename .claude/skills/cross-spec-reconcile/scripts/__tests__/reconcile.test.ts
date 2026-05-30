// Tests for cross-spec-reconcile light-mode (FR-17 mechanical subset).
//
// Pin the four shipping finding codes against synthetic fixtures rooted
// in a fresh tmpdir, plus the YAML emitter shape + SARIF round-trip +
// overrides-log JSONL semantics.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { reconcileLight, type Finding } from '../reconcile.ts';
import { emitYaml, writeReport } from '../yaml-writer.ts';
import { buildSarif, writeSarif } from '../sarif.ts';
import { appendOverride, readOverrides } from '../overrides-log.ts';

function seedSpec(root: string, slug: string, files: Record<string, string>): void {
  const dir = path.join(root, '.specs', slug);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), body);
  }
}

describe('reconcileLight — finding-code coverage', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `reconcile-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('impl-drift/missing-file fires when an FR references a path that does not exist', () => {
    seedSpec(root, 'spec-c', {
      'FR.md':
        '## FR-1: Validate user\n\nThe code lives at `src/mcp/validate_user.ts`.\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['spec-c'] });
    const missing = report.findings.filter((f) => f.code === 'impl-drift/missing-file');
    expect(missing).toHaveLength(1);
    expect(missing[0].severity).toBe('WARNING');
    expect(missing[0].expected_path).toBe('src/mcp/validate_user.ts');
    expect(missing[0].referenced_in).toMatch(/spec-c\/FR\.md:\d+/);
  });

  it('does NOT fire missing-file when a glob-ish path matches at least one file', () => {
    fs.mkdirSync(path.join(root, 'src/mcp'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/mcp/validate_user.ts'), '// real');
    seedSpec(root, 'spec-c', {
      'FR.md': '## FR-1: Validate user — see `src/mcp/validate_user*.ts`.\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['spec-c'] });
    expect(report.findings.filter((f) => f.code === 'impl-drift/missing-file')).toEqual([]);
  });

  it('cross-spec/runtime-identifier-drift fires when two specs name the same concept differently', () => {
    seedSpec(root, 'spec-a', { 'FR.md': '## FR-1\n\nfeedback_key = "session_token"\n' });
    seedSpec(root, 'spec-b', { 'FR.md': '## FR-2\n\nfeedback_key = "sessionToken"\n' });
    const reports = reconcileLight({ repoRoot: root });
    const drift = reports
      .flatMap((r) => r.findings)
      .find((f) => f.code === 'cross-spec/runtime-identifier-drift');
    expect(drift).toBeDefined();
    expect(drift!.severity).toBe('CRITICAL');
    expect(drift!.spec_a).toContain('session_token');
    expect(drift!.spec_b).toContain('sessionToken');
  });

  it('cross-spec/concept-overlap fires when two specs share ≥10 capitalised concept-nouns (post batch-10)', () => {
    // Threshold history: batch-3 = 3, batch-9 = 5, batch-10 = 10.
    // Fixture needs 10+ shared NON-stoplisted PascalCase nouns to fire.
    const sharedTen =
      'AuthFlow LoginPath TokenStorage SessionInfo UserProfile AccessRole EmailToken PasswordHash ResetLink VerifyCode';
    seedSpec(root, 'spec-x', {
      'FR.md': `## FR-1\n\n${sharedTen} UniqueAlpha UniqueBeta UniqueGamma\n`,
    });
    seedSpec(root, 'spec-y', {
      'FR.md': `## FR-2\n\n${sharedTen} DifferentDelta DifferentEpsilon DifferentZeta\n`,
    });
    const reports = reconcileLight({ repoRoot: root });
    const overlap = reports
      .flatMap((r) => r.findings)
      .find((f) => f.code === 'cross-spec/concept-overlap');
    expect(overlap).toBeDefined();
    expect(overlap!.severity).toBe('INFO');
  });

  it('empty .specs/ folder produces no findings + no error', () => {
    expect(reconcileLight({ repoRoot: root })).toEqual([]);
  });

  it('spec-only/orphan-FR fires when an FR is defined but never referenced again', () => {
    seedSpec(root, 'spec-orph', {
      'FR.md': '## FR-1: Login\n\n## FR-2: Logout\nDescribed at length here.\nFR-2 also used here.\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['spec-orph'] });
    const orphans = report.findings.filter((f) => f.code === 'spec-only/orphan-FR');
    // FR-1 is the orphan (one heading, zero refs, no @feature tag).
    expect(orphans).toHaveLength(1);
    expect(orphans[0].severity).toBe('WARNING');
    expect(orphans[0].referenced_in).toMatch(/spec-orph\/FR\.md$/);
  });

  it('spec-only/orphan-FR does NOT fire when an @featureN tag covers the FR', () => {
    seedSpec(root, 'spec-cov', {
      'FR.md': '## FR-7: Test me\n',
      'spec-cov.feature': '\n@feature7\nScenario: covered\n  Given step\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['spec-cov'] });
    expect(report.findings.find((f) => f.code === 'spec-only/orphan-FR')).toBeUndefined();
  });

  it('spec-only/uncovered-AC fires when AC headings exist but the spec has zero .feature files', () => {
    seedSpec(root, 'spec-ac', {
      'AC.md': '### AC-1: first\n\n### AC-2: second\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['spec-ac'] });
    const uncovered = report.findings.filter((f) => f.code === 'spec-only/uncovered-AC');
    expect(uncovered).toHaveLength(1);
    expect(uncovered[0].suggested_fix).toContain('2 AC heading');
  });

  it('cross-spec/duplicate-fr-id fires when two specs both define the same FR-N (shared namespace opt-in)', () => {
    seedSpec(root, 'spec-x', { 'FR.md': '## FR-1: Login\n' });
    seedSpec(root, 'spec-y', { 'FR.md': '## FR-1: Different thing\n' });
    const reports = reconcileLight({ repoRoot: root, crossSpecFrNamespace: 'shared' });
    const dup = reports
      .flatMap((r) => r.findings)
      .find((f) => f.code === 'cross-spec/duplicate-fr-id');
    expect(dup).toBeDefined();
    expect(dup!.severity).toBe('CRITICAL');
    expect(dup!.spec_a).toContain('FR-1');
    expect(dup!.spec_b).toContain('FR-1');
  });

  it('cross-spec/contradictory-fr fires when the same FR id has substantially different bodies (shared namespace opt-in)', () => {
    seedSpec(root, 'spec-p', {
      'FR.md': '## FR-1: Auth\n\nUsers log in with email + password, redirect to dashboard.\n',
    });
    seedSpec(root, 'spec-q', {
      'FR.md': '## FR-1: Inventory\n\nWarehouse manages SKUs across multiple bins.\n',
    });
    const reports = reconcileLight({ repoRoot: root, crossSpecFrNamespace: 'shared' });
    const contradictory = reports
      .flatMap((r) => r.findings)
      .find((f) => f.code === 'cross-spec/contradictory-fr');
    expect(contradictory).toBeDefined();
    expect(contradictory!.severity).toBe('CRITICAL');
  });

  it('impl-drift/test-without-fr fires when a @featureN tag has no matching FR in any spec', () => {
    seedSpec(root, 'spec-orph2', {
      'spec-orph2.feature': '\n@feature99\nScenario: orphan tag\n  Given step\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['spec-orph2'] });
    const orphans = report.findings.filter((f) => f.code === 'impl-drift/test-without-fr');
    expect(orphans).toHaveLength(1);
    expect(orphans[0].severity).toBe('WARNING');
    expect(orphans[0].referenced_in).toContain('@fr99');
  });

  it('spec-only/orphan-task fires when a TASKS.md block has no FR-N citation', () => {
    seedSpec(root, 'spec-tasks', {
      'TASKS.md': '### task-1\nDo something without FR ref.\n\n### task-2\nThis one references FR-1 properly.\n',
      'FR.md': '## FR-1: Defined\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['spec-tasks'] });
    const orphans = report.findings.filter((f) => f.code === 'spec-only/orphan-task');
    expect(orphans).toHaveLength(1);
    expect(orphans[0].suggested_fix).toContain('task-1');
  });

  it('spec-only/missing-fr-section fires when body cites FR-N but no heading defines it', () => {
    seedSpec(root, 'spec-miss', {
      'FR.md': '## FR-1: Login\nMentioned FR-99 here but it has no heading.\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['spec-miss'] });
    const missing = report.findings.filter((f) => f.code === 'spec-only/missing-fr-section');
    expect(missing).toHaveLength(1);
    expect(missing[0].severity).toBe('WARNING');
    expect(missing[0].suggested_fix).toContain('FR-99');
  });

  it('schema-drift/missing-feature-heading fires on .feature without Feature: line', () => {
    seedSpec(root, 'spec-bad', {
      'bad.feature': '@feature1\nScenario: but no Feature heading\n  Given step\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['spec-bad'] });
    const broken = report.findings.filter((f) => f.code === 'schema-drift/missing-feature-heading');
    expect(broken).toHaveLength(1);
    expect(broken[0].severity).toBe('CRITICAL');
    expect(broken[0].referenced_in).toBe('.specs/spec-bad/bad.feature');
  });

  it('schema-drift/missing-feature-heading does NOT fire on valid .feature with Feature: line', () => {
    seedSpec(root, 'spec-good', {
      'good.feature': 'Feature: a valid one\n\n@feature1\nScenario: covered\n  Given step\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['spec-good'] });
    expect(report.findings.find((f) => f.code === 'schema-drift/missing-feature-heading')).toBeUndefined();
  });

  it('impl-drift/dead-link fires when an MD link target does not exist on disk', () => {
    seedSpec(root, 'spec-link', {
      'FR.md': '## FR-1: Login\nSee [missing doc](./does-not-exist.md) for details.\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['spec-link'] });
    const dead = report.findings.filter((f) => f.code === 'impl-drift/dead-link');
    expect(dead).toHaveLength(1);
    expect(dead[0].severity).toBe('WARNING');
    expect(dead[0].expected_path).toBe('./does-not-exist.md');
  });

  it('impl-drift/dead-link ignores absolute URLs + mailto + anchor-only links', () => {
    seedSpec(root, 'spec-good-link', {
      'FR.md':
        '## FR-1\nSee [docs](https://example.com/x) and [mail](mailto:a@b.c) and [anchor](#section).\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['spec-good-link'] });
    expect(report.findings.find((f) => f.code === 'impl-drift/dead-link')).toBeUndefined();
  });

  it('spec-only/missing-acceptance fires when an FR is defined but no AC heading exists anywhere', () => {
    seedSpec(root, 'spec-noac', {
      'FR.md': '## FR-1: Login\nNo AC defined here or anywhere else.\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['spec-noac'] });
    const missing = report.findings.filter((f) => f.code === 'spec-only/missing-acceptance');
    expect(missing).toHaveLength(1);
    expect(missing[0].suggested_fix).toContain('FR-1');
  });

  it('spec-only/missing-acceptance does NOT fire when ACCEPTANCE_CRITERIA.md has AC heading', () => {
    seedSpec(root, 'spec-ac-ok', {
      'FR.md': '## FR-1: Login\n',
      'ACCEPTANCE_CRITERIA.md': '### AC-1: covered\nDetails here.\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['spec-ac-ok'] });
    expect(report.findings.find((f) => f.code === 'spec-only/missing-acceptance')).toBeUndefined();
  });

  it('schema-drift/invalid-frontmatter fires when # language: is not on the first line', () => {
    seedSpec(root, 'spec-fm', {
      'late.feature': 'Feature: lang not first\n\n# language: en\nScenario: y\n  Given step\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['spec-fm'] });
    const fm = report.findings.filter((f) => f.code === 'schema-drift/invalid-frontmatter');
    expect(fm).toHaveLength(1);
    expect(fm[0].suggested_fix).toContain('first line');
  });

  it('schema-drift/invalid-frontmatter fires when language code shape is invalid', () => {
    seedSpec(root, 'spec-fm2', {
      'bad.feature': '# language: xx-yy\nFeature: bad lang\nScenario: x\n  Given step\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['spec-fm2'] });
    const fm = report.findings.filter((f) => f.code === 'schema-drift/invalid-frontmatter');
    expect(fm).toHaveLength(1);
    expect(fm[0].suggested_fix).toContain('xx-yy');
  });

  it('impl-drift/missing-symbol fires when MD imports a name not exported by the target .ts', () => {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/order.ts'), 'export const Foo = 1;\n');
    seedSpec(root, 'spec-imp', {
      'IMPORTS.md': '```ts\nimport { OrderService } from "../../src/order";\n```\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['spec-imp'] });
    const missing = report.findings.filter((f) => f.code === 'impl-drift/missing-symbol');
    expect(missing).toHaveLength(1);
    expect(missing[0].suggested_fix).toContain('OrderService');
  });

  it('impl-drift/missing-symbol does NOT fire when the symbol IS exported', () => {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/order.ts'), 'export class OrderService {}\n');
    seedSpec(root, 'spec-imp2', {
      'IMPORTS.md': '```ts\nimport { OrderService } from "../../src/order";\n```\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['spec-imp2'] });
    expect(report.findings.find((f) => f.code === 'impl-drift/missing-symbol')).toBeUndefined();
  });

  it('cross-spec/url-shape-drift fires when two specs reference the same suffix differently', () => {
    seedSpec(root, 'spec-url-a', {
      'FR.md': '## FR-1\nPOST to "/api/orders" to submit.\n',
    });
    seedSpec(root, 'spec-url-b', {
      'FR.md': '## FR-2\nPOST to "/api/v2/orders" to submit.\n',
    });
    const reports = reconcileLight({ repoRoot: root });
    const drift = reports
      .flatMap((r) => r.findings)
      .find((f) => f.code === 'cross-spec/url-shape-drift');
    expect(drift).toBeDefined();
    expect(drift!.severity).toBe('CRITICAL');
  });

  it('cross-spec/cli-flag-drift fires when two specs name the same flag with different shapes', () => {
    seedSpec(root, 'spec-cli-a', {
      'FR.md': '## FR-1\nCLI: `--target-dir` works.\n',
    });
    seedSpec(root, 'spec-cli-b', {
      'FR.md': '## FR-2\nCLI: `--targetdir` works.\n',
    });
    const reports = reconcileLight({ repoRoot: root });
    const drift = reports
      .flatMap((r) => r.findings)
      .find((f) => f.code === 'cross-spec/cli-flag-drift');
    expect(drift).toBeDefined();
    expect(drift!.severity).toBe('WARNING');
  });

  it('cross-spec/enum-divergence fires when same enum name has different value sets', () => {
    seedSpec(root, 'spec-enum-a', {
      'FR.md': '## FR-1\n### Values\nValues: pending | confirmed | shipped\n',
    });
    seedSpec(root, 'spec-enum-b', {
      'FR.md': '## FR-2\n### Values\nValues: pending | confirmed | cancelled\n',
    });
    const reports = reconcileLight({ repoRoot: root });
    const drift = reports
      .flatMap((r) => r.findings)
      .find((f) => f.code === 'cross-spec/enum-divergence');
    expect(drift).toBeDefined();
    expect(drift!.severity).toBe('CRITICAL');
    expect(drift!.suggested_fix).toMatch(/shipped|cancelled/);
  });

  it('cross-spec/module-ownership-conflict fires when two specs reference the same module path', () => {
    seedSpec(root, 'spec-own-a', {
      'FR.md': '## FR-1\nClaims `tools/order/main.ts`.\n',
    });
    seedSpec(root, 'spec-own-b', {
      'FR.md': '## FR-2\nClaims `tools/order/main.ts`.\n',
    });
    const reports = reconcileLight({ repoRoot: root });
    const conflict = reports
      .flatMap((r) => r.findings)
      .find((f) => f.code === 'cross-spec/module-ownership-conflict');
    expect(conflict).toBeDefined();
    expect(conflict!.severity).toBe('CRITICAL');
    expect(conflict!.spec_a).toContain('tools/order/main.ts');
  });

  // ---- Batch-6 adversarial-review regression pins ----

  it('FIX: impl-drift/missing-symbol — recognises `export default <ident>`', () => {
    fs.mkdirSync(path.join(root, '.specs/sp-def/src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.specs/sp-def/src/m.ts'),
      'export default function Foo() { return 1; }\n',
    );
    seedSpec(root, 'sp-def', {
      'IMP.md': '```ts\nimport { default as Foo } from "./src/m";\n```\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['sp-def'] });
    expect(report.findings.find((f) => f.code === 'impl-drift/missing-symbol')).toBeUndefined();
  });

  it('FIX: impl-drift/missing-symbol — `export * from` suppresses the check (no FP)', () => {
    seedSpec(root, 'sp-star', {
      'm.ts': 'export * from "./other";\n',
      'IMP.md': '```ts\nimport { AnythingAtAll } from "./m";\n```\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['sp-star'] });
    expect(report.findings.find((f) => f.code === 'impl-drift/missing-symbol')).toBeUndefined();
  });

  it('FIX: impl-drift/missing-file — appends "Glob prefix dir does not exist" hint', () => {
    seedSpec(root, 'sp-glob', {
      'FR.md': '## FR-1\nSee `tools/removed_dir/foo*.ts` for impl.\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['sp-glob'] });
    const found = report.findings.find((f) => f.code === 'impl-drift/missing-file');
    expect(found).toBeDefined();
    expect(found!.suggested_fix).toContain('Glob prefix dir');
  });

  it('FIX: runtime-identifier-drift — assignments inside ```ts``` blocks suppressed', () => {
    seedSpec(root, 'sp-cb-a', {
      'FR.md': '## FR-1\n```ts\nconst session_token = "v1";\n```\n',
    });
    seedSpec(root, 'sp-cb-b', {
      'FR.md': '## FR-2\n```ts\nconst session_token = "v2";\n```\n',
    });
    const reports = reconcileLight({ repoRoot: root });
    expect(
      reports.flatMap((r) => r.findings).find((f) => f.code === 'cross-spec/runtime-identifier-drift'),
    ).toBeUndefined();
  });

  it('FIX: runtime-identifier-drift — snake_case + camelCase collapse to the same lemma', () => {
    seedSpec(root, 'sp-norm-a', {
      'FR.md': '## FR-1\nProvision: `session_token = "v1"`\n',
    });
    seedSpec(root, 'sp-norm-b', {
      'FR.md': '## FR-2\nProvision: `sessionToken = "v2"`\n',
    });
    const reports = reconcileLight({ repoRoot: root });
    const drift = reports
      .flatMap((r) => r.findings)
      .find((f) => f.code === 'cross-spec/runtime-identifier-drift');
    expect(drift).toBeDefined();
    expect(drift!.suggested_fix).toContain('session_token');
    expect(drift!.suggested_fix).toContain('sessionToken');
  });

  it('FIX: url-shape-drift — generic action segments (`/list`, `/get`) excluded', () => {
    seedSpec(root, 'sp-url-gen-a', {
      'FR.md': '## FR-1\nGET to "/api/users/list" returns the list.\n',
    });
    seedSpec(root, 'sp-url-gen-b', {
      'FR.md': '## FR-2\nGET to "/admin/groups/list" returns the list.\n',
    });
    const reports = reconcileLight({ repoRoot: root });
    expect(
      reports.flatMap((r) => r.findings).find((f) => f.code === 'cross-spec/url-shape-drift'),
    ).toBeUndefined();
  });

  it('FIX: spec-only/duplicate-fr-id — fires for WITHIN-spec duplicate headings (renamed in batch-8)', () => {
    seedSpec(root, 'sp-dup', {
      'FR.md': '## FR-1: first\nA\n\n## FR-1: duplicate\nB\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['sp-dup'] });
    // Batch-8: within-spec duplicate now emits under `spec-only/duplicate-fr-id`
    // to distinguish from cross-spec collisions.
    const dup = report.findings.find((f) => f.code === 'spec-only/duplicate-fr-id');
    expect(dup).toBeDefined();
    expect(dup!.referenced_in).toContain('sp-dup');
  });

  it('FIX: module-ownership — identical trailing-glob path collides', () => {
    seedSpec(root, 'sp-glob-a', {
      'FR.md': '## FR-1\nClaims `tools/foo*.ts`.\n',
    });
    seedSpec(root, 'sp-glob-b', {
      'FR.md': '## FR-2\nClaims `tools/foo*.ts`.\n',
    });
    const reports = reconcileLight({ repoRoot: root });
    const conflict = reports
      .flatMap((r) => r.findings)
      .find((f) => f.code === 'cross-spec/module-ownership-conflict');
    expect(conflict).toBeDefined();
    expect(conflict!.spec_a).toContain('tools/foo.ts');
  });

  it('FIX: contradictory-fr — borderline 0.4-0.55 overlap no longer suppressed (shared namespace opt-in)', () => {
    // Both share auth domain vocabulary but say different things — the OLD
    // threshold of 0.4 would have suppressed this; 0.55 lets it through.
    // Batch-9: per-spec namespace is default; opt into 'shared' to test.
    seedSpec(root, 'sp-contra-a', {
      'FR.md': '## FR-1: Auth\nSystem validates credentials and issues authentication tokens for the user session.\n',
    });
    seedSpec(root, 'sp-contra-b', {
      'FR.md': '## FR-1: Cart\nThe shopping cart system maintains customer SKU items with quantity tracking.\n',
    });
    const reports = reconcileLight({ repoRoot: root, crossSpecFrNamespace: 'shared' });
    const contradictory = reports
      .flatMap((r) => r.findings)
      .find((f) => f.code === 'cross-spec/contradictory-fr');
    expect(contradictory).toBeDefined();
  });

  // ---- Batch-7: final 9 finding codes (workflow wzbmwybag design) ----

  it('impl-drift/missing-test fires for FR without matching @featureN tag', () => {
    seedSpec(root, 'sp-mt', {
      'FR.md': '## FR-1: Login\n## FR-2: Logout\n',
      'sp-mt.feature': 'Feature: x\n  @feature1\n  Scenario: x\n    Given step\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['sp-mt'] });
    const missing = report.findings.filter((f) => f.code === 'impl-drift/missing-test');
    expect(missing).toHaveLength(1);
    expect(missing[0].suggested_fix).toContain('FR-2');
    expect(missing[0].severity).toBe('INFO');
  });

  it('spec-only/orphan-AC fires when AC references an undefined FR', () => {
    seedSpec(root, 'sp-oac', {
      'FR.md': '## FR-1: Defined\n',
      'ACCEPTANCE_CRITERIA.md': '## AC-1 (FR-1)\nGood.\n\n## AC-3 (FR-5)\nOrphan reference.\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['sp-oac'] });
    const orphans = report.findings.filter((f) => f.code === 'spec-only/orphan-AC');
    expect(orphans.length).toBeGreaterThanOrEqual(1);
    expect(orphans.some((f) => f.suggested_fix!.includes('FR-5'))).toBe(true);
  });

  it('impl-drift/test-result-stale fires when .feature mtime predates spec MD mtime', () => {
    seedSpec(root, 'sp-stale', {
      'FR.md': '## FR-1\n',
      'sp-stale.feature': 'Feature: x\n  @feature1\n  Scenario: x\n    Given step\n',
    });
    const featurePath = path.join(root, '.specs/sp-stale/sp-stale.feature');
    const past = (Date.now() - 2 * 3600_000) / 1000;
    fs.utimesSync(featurePath, past, past);
    const [report] = reconcileLight({ repoRoot: root, slugs: ['sp-stale'] });
    const stale = report.findings.filter((f) => f.code === 'impl-drift/test-result-stale');
    expect(stale).toHaveLength(1);
    expect(stale[0].suggested_fix).toContain('CI gotcha');
  });

  it('spec-only/unreachable-task fires when task targets a Phase higher than phase_index', () => {
    seedSpec(root, 'sp-unr', {
      '.progress.json': '{"phase_index": 0}',
      'TASKS.md': [
        '## Task Summary Table',
        '',
        '| ID | Title | Status | Phase | Est. |',
        '|----|-------|--------|-------|------|',
        '| install | Install deps | DONE | Phase 0 | 30m |',
        '| build-schema | Build schema | TODO | Phase 5 | 120m |',
        '',
      ].join('\n'),
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['sp-unr'] });
    const unr = report.findings.filter((f) => f.code === 'spec-only/unreachable-task');
    expect(unr).toHaveLength(1);
    expect(unr[0].suggested_fix).toContain('Phase 5');
    expect(unr[0].suggested_fix).toContain('Phase 0');
  });

  it('schema-drift/json-shape-drift fires when JSON top-level keys diverge from SCHEMA.md bullets', () => {
    seedSpec(root, 'sp-jsd', {
      'SCHEMA.md':
        '## Data JSON Schema\n\nTop-level keys:\n- `version`\n- `phase`\n- `phase_index`\n- `started_at`\n',
      'data.json': JSON.stringify({ version: 4, phase: 'Phase 3', created_at: '2026-05-30T00:00:00Z' }, null, 2),
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['sp-jsd'] });
    const drift = report.findings.filter((f) => f.code === 'schema-drift/json-shape-drift');
    expect(drift).toHaveLength(1);
    expect(drift[0].suggested_fix).toMatch(/phase_index|started_at/);
    expect(drift[0].suggested_fix).toContain('created_at');
  });

  it('cross-spec/missing-cross-ref fires when slug mentioned but no markdown link', () => {
    seedSpec(root, 'auth-mcr', {
      'FR.md': '## FR-1: OAuth\nBuilds on user-service-mcr schema for tokens.\n',
    });
    seedSpec(root, 'user-service-mcr', {
      'FR.md': '## FR-1: User CRUD\n',
    });
    const reports = reconcileLight({ repoRoot: root });
    const missing = reports
      .flatMap((r) => r.findings)
      .find((f) => f.code === 'cross-spec/missing-cross-ref');
    expect(missing).toBeDefined();
    expect(missing!.suggested_fix).toContain('user-service-mcr');
  });

  it('cross-spec/contradictory-nfr fires when same NFR budget has divergent values', () => {
    seedSpec(root, 'sp-nfr-a', {
      'DESIGN.md': '## Performance\nMax API latency: 200ms target.\n',
    });
    seedSpec(root, 'sp-nfr-b', {
      'DESIGN.md': '## Performance\nAPI latency budget: 500ms enforced.\n',
    });
    const reports = reconcileLight({ repoRoot: root });
    const contradiction = reports
      .flatMap((r) => r.findings)
      .find((f) => f.code === 'cross-spec/contradictory-nfr');
    expect(contradiction).toBeDefined();
    expect(contradiction!.severity).toBe('CRITICAL');
    expect(contradiction!.suggested_fix).toMatch(/200ms.*500ms|500ms.*200ms/);
  });

  it('cross-spec/schema-mismatch fires when same TS interface has different field sets', () => {
    seedSpec(root, 'sp-sma', {
      'DESIGN.md':
        '## Schema\n\n```ts\ninterface AuthToken {\n  sessionToken: string;\n  expiresAt: number;\n}\n```\n',
    });
    seedSpec(root, 'sp-smb', {
      'DESIGN.md':
        '## Schema\n\n```ts\ninterface AuthToken {\n  session_token: string;\n  expiresAt: number;\n  refreshToken?: string;\n}\n```\n',
    });
    const reports = reconcileLight({ repoRoot: root });
    const mismatch = reports
      .flatMap((r) => r.findings)
      .find((f) => f.code === 'cross-spec/schema-mismatch');
    expect(mismatch).toBeDefined();
    expect(mismatch!.severity).toBe('CRITICAL');
    expect(mismatch!.suggested_fix).toContain('AuthToken');
  });

  it('cross-spec/decision-locked-but-reality-diverges fires when impl imports wrong package', () => {
    fs.mkdirSync(path.join(root, 'src/auth'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src/auth/jwt.ts'),
      'import jose from "jose";\nexport function sign() {}\n',
    );
    seedSpec(root, 'sp-dl', {
      'DECISIONS.md':
        '## Decision: jwt-library\n\nStatus: LOCKED\nChosen: jsonwebtoken@9\nImplemented in: `src/auth/jwt.ts`\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['sp-dl'] });
    const drift = report.findings.filter((f) => f.code === 'cross-spec/decision-locked-but-reality-diverges');
    expect(drift).toHaveLength(1);
    expect(drift[0].suggested_fix).toContain('jsonwebtoken');
    expect(drift[0].suggested_fix).toContain('jose');
  });

  it('cross-spec/decision-locked does NOT fire when impl imports the chosen package', () => {
    fs.mkdirSync(path.join(root, 'src/auth'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src/auth/jwt.ts'),
      'import jwt from "jsonwebtoken";\nexport function sign() {}\n',
    );
    seedSpec(root, 'sp-dl-ok', {
      'DECISIONS.md':
        '## Decision: jwt-library\n\nStatus: LOCKED\nChosen: jsonwebtoken@9\nImplemented in: `src/auth/jwt.ts`\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['sp-dl-ok'] });
    expect(report.findings.find((f) => f.code === 'cross-spec/decision-locked-but-reality-diverges')).toBeUndefined();
  });

  // ---- Batch-8 adversarial-review-2 regression pins ----

  it('FIX: missing-test — `@feature05` with leading zero maps to FR-5 (no false orphan)', () => {
    seedSpec(root, 'sp-lz', {
      'FR.md': '## FR-5: Login\n',
      'x.feature': 'Feature: x\n  @feature05\n  Scenario: y\n    Given step\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['sp-lz'] });
    expect(report.findings.find((f) => f.code === 'impl-drift/missing-test')).toBeUndefined();
  });

  it('FIX: cli-flag-drift — flags inside fenced ```bash``` blocks suppressed', () => {
    seedSpec(root, 'sp-cli-fb-a', {
      'FR.md': '## FR-1\n```bash\n--targetdir example\n```\n',
    });
    seedSpec(root, 'sp-cli-fb-b', {
      'FR.md': '## FR-2\n```bash\n--target-dir example\n```\n',
    });
    const reports = reconcileLight({ repoRoot: root });
    expect(
      reports.flatMap((r) => r.findings).find((f) => f.code === 'cross-spec/cli-flag-drift'),
    ).toBeUndefined();
  });

  it('FIX: enum-divergence — values inside fenced blocks suppressed', () => {
    seedSpec(root, 'sp-en-fb-a', {
      'FR.md': '## FR-1\n```\n### Values\nValues: a | b\n```\n',
    });
    seedSpec(root, 'sp-en-fb-b', {
      'FR.md': '## FR-2\n```\n### Values\nValues: c | d\n```\n',
    });
    const reports = reconcileLight({ repoRoot: root });
    expect(
      reports.flatMap((r) => r.findings).find((f) => f.code === 'cross-spec/enum-divergence'),
    ).toBeUndefined();
  });

  it('FIX: missing-fr-section — FR refs inside fenced ```ts``` blocks suppressed', () => {
    seedSpec(root, 'sp-fr-fb', {
      'FR.md': '## FR-1: Defined\n```ts\n// example referencing FR-99\n```\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['sp-fr-fb'] });
    expect(report.findings.find((f) => f.code === 'spec-only/missing-fr-section')).toBeUndefined();
  });

  it('FIX: decision-locked — chosen regex now captures only package id, not trailing prose', () => {
    fs.mkdirSync(path.join(root, 'src/auth'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src/auth/jwt.ts'),
      'import jose from "jose";\nexport function sign() {}\n',
    );
    seedSpec(root, 'sp-dl-prose', {
      'DECISIONS.md':
        '## Decision: jwt-library\n\nStatus: LOCKED\nChosen: jsonwebtoken library for signing tokens\nImplemented in: `src/auth/jwt.ts`\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['sp-dl-prose'] });
    const drift = report.findings.find((f) => f.code === 'cross-spec/decision-locked-but-reality-diverges');
    expect(drift).toBeDefined();
    expect(drift!.suggested_fix).toContain('jsonwebtoken');
  });

  it('FIX: dead-link — leading-slash path resolves against repoRoot, not POSIX root', () => {
    fs.writeFileSync(path.join(root, 'GUIDE.md'), '# Guide\n');
    seedSpec(root, 'sp-dl-abs', {
      'FR.md': '## FR-1\nSee [guide](/GUIDE.md).\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['sp-dl-abs'] });
    expect(report.findings.find((f) => f.code === 'impl-drift/dead-link')).toBeUndefined();
  });

  it('FIX: orphan-FR — self-citation in heading no longer counts as external reference', () => {
    seedSpec(root, 'sp-self-cite', {
      'FR.md': '## FR-1: See FR-1 for context\nNo references in body at all.\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['sp-self-cite'] });
    const orphan = report.findings.find((f) => f.code === 'spec-only/orphan-FR');
    expect(orphan).toBeDefined();
  });

  it('FIX: contradictory-nfr — `s` and `ms` units normalised to same bucket', () => {
    seedSpec(root, 'sp-nfr-s-a', {
      'DESIGN.md': '## Performance\nMax API latency: 200ms target.\n',
    });
    seedSpec(root, 'sp-nfr-s-b', {
      'DESIGN.md': '## Performance\nAPI latency budget: 2s enforced.\n',
    });
    const reports = reconcileLight({ repoRoot: root });
    const contradiction = reports
      .flatMap((r) => r.findings)
      .find((f) => f.code === 'cross-spec/contradictory-nfr');
    expect(contradiction).toBeDefined();
    expect(contradiction!.suggested_fix).toMatch(/200ms.*2000ms|2000ms.*200ms/);
  });

  it('FIX: within-spec duplicate-fr-id now uses spec-only/duplicate-fr-id code', () => {
    seedSpec(root, 'sp-within-dup', {
      'FR.md': '## FR-1: first\nA\n\n## FR-1: dup\nB\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['sp-within-dup'] });
    const withinDup = report.findings.find((f) => f.code === 'spec-only/duplicate-fr-id');
    expect(withinDup).toBeDefined();
  });

  it('FIX: json-shape-drift — heading match widened to "Fields" / "Shape" / "Structure"', () => {
    seedSpec(root, 'sp-fields', {
      'SCHEMA.md': '## Data Fields\n\n- `version`\n- `phase`\n',
      'data.json': JSON.stringify({ version: 4, extra: 'x' }, null, 2),
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['sp-fields'] });
    const drift = report.findings.find((f) => f.code === 'schema-drift/json-shape-drift');
    expect(drift).toBeDefined();
  });

  // ---- Batch-9 dogfood-driven option fixes ----

  it('DOGFOOD: per-spec FR namespace (default) — cross-spec/duplicate-fr-id does NOT fire', () => {
    // Real corpus has 30+ specs each using FR-1..N. Default per-spec
    // namespace must NOT flag them as collisions.
    seedSpec(root, 'sp-ns-a', { 'FR.md': '## FR-1: A flow\n' });
    seedSpec(root, 'sp-ns-b', { 'FR.md': '## FR-1: B flow\n' });
    const reports = reconcileLight({ repoRoot: root });
    expect(
      reports.flatMap((r) => r.findings).find((f) => f.code === 'cross-spec/duplicate-fr-id'),
    ).toBeUndefined();
    expect(
      reports.flatMap((r) => r.findings).find((f) => f.code === 'cross-spec/contradictory-fr'),
    ).toBeUndefined();
  });

  it('DOGFOOD: shared FR namespace (opt-in) — cross-spec/duplicate-fr-id DOES fire', () => {
    seedSpec(root, 'sp-shr-a', { 'FR.md': '## FR-1: Login\n' });
    seedSpec(root, 'sp-shr-b', { 'FR.md': '## FR-1: Cart\n' });
    const reports = reconcileLight({
      repoRoot: root,
      crossSpecFrNamespace: 'shared',
    });
    const dup = reports
      .flatMap((r) => r.findings)
      .find((f) => f.code === 'cross-spec/duplicate-fr-id');
    expect(dup).toBeDefined();
  });

  it('DOGFOOD: module-ownership default stoplist — shared test infra suppressed', () => {
    seedSpec(root, 'sp-own-a', {
      'FR.md': '## FR-1\nUses `tests/e2e/helpers.ts` for setup.\n',
    });
    seedSpec(root, 'sp-own-b', {
      'FR.md': '## FR-2\nAlso uses `tests/e2e/helpers.ts`.\n',
    });
    const reports = reconcileLight({ repoRoot: root });
    expect(
      reports.flatMap((r) => r.findings).find((f) => f.code === 'cross-spec/module-ownership-conflict'),
    ).toBeUndefined();
  });

  it('DOGFOOD: module-ownership custom stoplist override fires for non-stoplisted paths', () => {
    seedSpec(root, 'sp-own-c', { 'FR.md': '## FR-1\nClaims `tools/order/main.ts`.\n' });
    seedSpec(root, 'sp-own-d', { 'FR.md': '## FR-2\nClaims `tools/order/main.ts`.\n' });
    const reports = reconcileLight({ repoRoot: root, ownershipStoplist: [] });
    const conflict = reports
      .flatMap((r) => r.findings)
      .find((f) => f.code === 'cross-spec/module-ownership-conflict');
    expect(conflict).toBeDefined();
  });

  it('DOGFOOD: concept-overlap stoplist suppresses generic ecosystem nouns', () => {
    // Both specs share Schema + Changelog + Acceptance + Criteria + Stop — all stoplisted.
    seedSpec(root, 'sp-co-a', {
      'FR.md': '## FR-1\nSchema definition. Changelog log. Acceptance Criteria. Stop hook.\n',
    });
    seedSpec(root, 'sp-co-b', {
      'FR.md': '## FR-2\nSchema definition. Changelog entries. Acceptance Criteria. Stop hook.\n',
    });
    const reports = reconcileLight({ repoRoot: root });
    expect(
      reports.flatMap((r) => r.findings).find((f) => f.code === 'cross-spec/concept-overlap'),
    ).toBeUndefined();
  });

  // ---- Batch-10 readiness-audit fixes ----

  it('AUDIT: missing-test gated by phase_index < 2 — suppressed for Phase 0/1 specs', () => {
    seedSpec(root, 'sp-mt-p0', {
      'FR.md': '## FR-1: Login\n## FR-2: Logout\n',
      'sp-mt-p0.feature': 'Feature: x\n  @feature1\n  Scenario: x\n    Given step\n',
      '.progress.json': '{"phase_index": 0}',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['sp-mt-p0'] });
    // FR-2 lacks @feature2 but spec is Phase 0 → suppressed.
    expect(report.findings.find((f) => f.code === 'impl-drift/missing-test')).toBeUndefined();
  });

  it('AUDIT: missing-test still fires when phase_index >= 2', () => {
    seedSpec(root, 'sp-mt-p2', {
      'FR.md': '## FR-1: Login\n## FR-2: Logout\n',
      'sp-mt-p2.feature': 'Feature: x\n  @feature1\n  Scenario: x\n    Given step\n',
      '.progress.json': '{"phase_index": 2}',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['sp-mt-p2'] });
    const missing = report.findings.filter((f) => f.code === 'impl-drift/missing-test');
    expect(missing).toHaveLength(1);
    expect(missing[0].suggested_fix).toContain('FR-2');
  });

  it('AUDIT: missing-test suppressed when .progress.json missing (defaults to phase 0)', () => {
    seedSpec(root, 'sp-mt-nop', {
      'FR.md': '## FR-1: Login\n## FR-2: Logout\n',
      'sp-mt-nop.feature': 'Feature: x\n  @feature1\n  Scenario: x\n    Given step\n',
    });
    const [report] = reconcileLight({ repoRoot: root, slugs: ['sp-mt-nop'] });
    expect(report.findings.find((f) => f.code === 'impl-drift/missing-test')).toBeUndefined();
  });

  it('AUDIT: ownership stoplist expanded — tools/specs-generator/ paths suppressed by default', () => {
    seedSpec(root, 'sp-own-genA', {
      'FR.md': '## FR-1\nUses `tools/specs-generator/validate-spec.ts` extensively.\n',
    });
    seedSpec(root, 'sp-own-genB', {
      'FR.md': '## FR-2\nAlso uses `tools/specs-generator/validate-spec.ts`.\n',
    });
    const reports = reconcileLight({ repoRoot: root });
    expect(
      reports.flatMap((r) => r.findings).find((f) => f.code === 'cross-spec/module-ownership-conflict'),
    ).toBeUndefined();
  });

  it('AUDIT: ownership stoplist — .claude/skills/ paths suppressed', () => {
    seedSpec(root, 'sp-own-skA', {
      'FR.md': '## FR-1\nDefines `.claude/skills/my-skill/SKILL.md`.\n',
    });
    seedSpec(root, 'sp-own-skB', {
      'FR.md': '## FR-2\nReferences `.claude/skills/my-skill/SKILL.md`.\n',
    });
    const reports = reconcileLight({ repoRoot: root });
    expect(
      reports.flatMap((r) => r.findings).find((f) => f.code === 'cross-spec/module-ownership-conflict'),
    ).toBeUndefined();
  });

  it('AUDIT: concept-overlap threshold bumped 5→10 — five shared nouns no longer fires', () => {
    // 5 shared design-pattern nouns + 5 unique each = 5 shared. Old threshold 5
    // would have fired. Batch-10 threshold 10 suppresses.
    seedSpec(root, 'sp-th-a', {
      'FR.md': '## FR-1\nAuthService LoginCtrl SessionMgr TokenCache UserStore UniqueA UniqueB UniqueC\n',
    });
    seedSpec(root, 'sp-th-b', {
      'FR.md': '## FR-2\nAuthService LoginCtrl SessionMgr TokenCache UserStore DifferentX DifferentY DifferentZ\n',
    });
    const reports = reconcileLight({ repoRoot: root });
    expect(
      reports.flatMap((r) => r.findings).find((f) => f.code === 'cross-spec/concept-overlap'),
    ).toBeUndefined();
  });
});

describe('emitYaml + writeReport', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `yaml-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function fakeReport(findings: Finding[]) {
    return {
      generatedAt: '2026-05-30T03:00:00.000Z',
      mode: 'light' as const,
      specSlug: 'demo',
      findings,
    };
  }

  it('emits an empty findings list as `findings: []`', () => {
    const out = emitYaml(fakeReport([]));
    expect(out).toContain('total_findings: 0');
    expect(out).toContain('findings: []');
  });

  it('emits one block per finding with the canonical keys', () => {
    const out = emitYaml(
      fakeReport([
        {
          code: 'impl-drift/missing-file',
          class: 'uncovered',
          severity: 'WARNING',
          referenced_in: '.specs/demo/FR.md:1',
          expected_path: 'src/x.ts',
          suggested_fix: 'create or remove',
        },
      ]),
    );
    expect(out).toContain('code: impl-drift/missing-file');
    expect(out).toContain('class: uncovered');
    expect(out).toContain('severity: WARNING');
    expect(out).toContain('expected_path: src/x.ts');
  });

  it('writeReport writes atomically to the canonical location', () => {
    const target = writeReport(root, fakeReport([]));
    expect(target).toBe(path.join(root, '.specs/demo/consistency-report.yaml'));
    expect(fs.existsSync(target)).toBe(true);
  });
});

describe('SARIF emitter', () => {
  it('rounds-trips one finding into a valid SARIF result with correct level mapping', () => {
    const doc = buildSarif({
      generatedAt: 't',
      mode: 'light',
      specSlug: 'x',
      findings: [
        {
          code: 'cross-spec/runtime-identifier-drift',
          class: 'runtime-identifier-drift',
          severity: 'CRITICAL',
          spec_a: '.specs/spec-a/FR.md:12',
          spec_b: '.specs/spec-b/FR.md:8',
          suggested_fix: 'pick one',
        },
      ],
    });
    expect(doc.version).toBe('2.1.0');
    expect(doc.runs[0].results[0].level).toBe('error');
    expect(doc.runs[0].results[0].ruleId).toBe('cross-spec/runtime-identifier-drift');
    expect(doc.runs[0].results[0].locations).toHaveLength(2);
  });

  it('writes SARIF to the canonical sibling file', () => {
    const tmp = path.join(os.tmpdir(), `sarif-${randomUUID()}`);
    fs.mkdirSync(tmp, { recursive: true });
    try {
      const target = writeSarif(tmp, {
        generatedAt: 't',
        mode: 'light',
        specSlug: 'x',
        findings: [],
      });
      expect(target).toBe(path.join(tmp, '.specs/x/consistency-report.sarif'));
      const body = JSON.parse(fs.readFileSync(target, 'utf8')) as { version: string };
      expect(body.version).toBe('2.1.0');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('overrides-log JSONL writer (FR-17 SPECGEN004_41)', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `overrides-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('appends one JSON line per override', () => {
    appendOverride(root, {
      timestamp: '2026-05-30T03:00:00Z',
      session_id: 'sess-1',
      finding_code: 'cross-spec/runtime-identifier-drift',
      spec_slug: 'spec-a',
      reason: 'covered by parametrized test runner',
    });
    appendOverride(root, {
      timestamp: '2026-05-30T03:01:00Z',
      session_id: 'sess-1',
      finding_code: 'impl-drift/missing-file',
      spec_slug: 'spec-c',
      reason: 'deferred per JIRA-42',
    });
    const all = readOverrides(root);
    expect(all).toHaveLength(2);
    expect(all[0].reason).toBe('covered by parametrized test runner');
    expect(all[1].reason).toBe('deferred per JIRA-42');
  });

  it('tolerates a malformed line + skips it', () => {
    appendOverride(root, {
      timestamp: 't',
      finding_code: 'x',
      spec_slug: 's',
      reason: 'r',
    });
    const file = path.join(root, '.claude/logs/cross-spec-overrides.jsonl');
    fs.appendFileSync(file, 'this-is-not-json\n');
    appendOverride(root, {
      timestamp: 't2',
      finding_code: 'y',
      spec_slug: 's',
      reason: 'r2',
    });
    const all = readOverrides(root);
    expect(all).toHaveLength(2);
  });
});
