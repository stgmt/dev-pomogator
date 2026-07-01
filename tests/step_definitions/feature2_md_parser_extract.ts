/**
 * @feature2 step definitions (FR-2 — SpecGraph markdown parser) — SPECGEN004_213/214/215.
 *
 * P3-rollout migration of tools/spec-graph/__tests__/md-parser.test.ts (14 pure cases). Drives the
 * REAL parseMarkdown in-process, grouped into the three invariants: node extraction (FR/NFR/AC +
 * anchors + covers edges), order/lines/filtering/slugify/empty, and migrated short headings (FR-7c).
 * vitest twin kept until the gate-switch.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_213/214/215 · FR.md FR-2
 * @see tools/spec-graph/parsers/md.ts (parseMarkdown)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { parseMarkdown } from '../../tools/spec-graph/parsers/md.ts';
import type { FrNode, NfrNode, AcNode } from '../../tools/spec-graph/types.ts';
import { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';

type Out = ReturnType<typeof parseMarkdown>;
interface MpWorld extends V4World {
  mpExtract?: Record<string, Out>;
  mpMisc?: Record<string, Out>;
  mpShort?: Record<string, Out>;
}

// --- 213: FR/NFR/AC extraction ---
Given('FR NFR and AC headings including a categorised NFR a plain NFR and a dotted AC', function () {
  // inputs inline in the When
});

When('parseMarkdown extracts them', function (this: MpWorld) {
  this.mpExtract = {
    fr: parseMarkdown('# Functional Requirements\n\n## FR-1: Login flow\n\nbody\n', '.specs/auth/FR.md'),
    nfrCat: parseMarkdown('## NFR-Performance-1: SpecGraph cold start\n', '.specs/v4/NFR.md'),
    nfrPlain: parseMarkdown('## NFR-7: Backward compatibility\n', '.specs/v4/NFR.md'),
    ac: parseMarkdown('## AC-3 (FR-1): User logs in\n\nWHEN user submits valid creds THEN SHALL be redirected.\n', '.specs/auth/ACCEPTANCE_CRITERIA.md'),
    acDot: parseMarkdown('## AC-2.1 (FR-5): Edge case\n', '.specs/v4/ACCEPTANCE_CRITERIA.md'),
  };
});

Then('each FR and NFR node carries compact and slug anchors the NFR category is read where present and each AC emits a covers edge to its parent FR', function (this: MpWorld) {
  const m = this.mpExtract!;
  const fr = m.fr.nodes[0] as FrNode;
  assert.equal(fr.type, 'FR');
  assert.equal(fr.id, 'auth:FR-1');
  assert.equal(fr.title, 'Login flow');
  assert.equal(fr.line, 3);
  assert.deepEqual(fr.anchors, ['FR-1', 'fr-1-login-flow']);
  assert.deepEqual(m.fr.anchors, [
    { alias: 'FR-1', canonicalId: 'FR-1', location: { file: '.specs/auth/FR.md', line: 3 } },
    { alias: 'fr-1-login-flow', canonicalId: 'FR-1', location: { file: '.specs/auth/FR.md', line: 3 } },
  ]);
  const nfrC = m.nfrCat.nodes[0] as NfrNode;
  assert.equal(nfrC.id, 'v4:NFR-Performance-1');
  assert.equal(nfrC.category, 'Performance');
  assert.equal(nfrC.title, 'SpecGraph cold start');
  assert.ok(nfrC.anchors.includes('NFR-Performance-1') && nfrC.anchors.includes('nfr-performance-1-specgraph-cold-start'));
  const nfrP = m.nfrPlain.nodes[0] as NfrNode;
  assert.equal(nfrP.id, 'v4:NFR-7');
  assert.equal(nfrP.category, undefined);
  assert.ok(nfrP.anchors.includes('NFR-7'));
  const ac = m.ac.nodes[0] as AcNode;
  assert.equal(ac.id, 'auth:AC-3');
  assert.equal(ac.parentFr, 'auth:FR-1');
  assert.deepEqual(m.ac.edges, [{ from: 'auth:FR-1', to: 'auth:AC-3', type: 'covers' }]);
  const acDot = m.acDot.nodes[0] as AcNode;
  assert.equal(acDot.id, 'v4:AC-2.1');
  assert.equal(acDot.parentFr, 'v4:FR-5');
});

// --- 214: order/lines, filtering, slugify, empty ---
Given('a multi-heading spec a file with non-spec headings a cyrillic-titled FR and a plain readme', function () {
  // inputs inline in the When
});

When('parseMarkdown processes each', function (this: MpWorld) {
  this.mpMisc = {
    multi: parseMarkdown(
      ['# Spec', '', '## FR-1: Alpha', '', 'body', '', '## FR-2: Beta', '', 'body', '', '## NFR-Performance-1: Cold start', '', '## AC-1 (FR-1)', '', 'WHEN x THEN y SHALL z'].join('\n'),
      'spec.md',
    ),
    ignore: parseMarkdown('## Overview\n\n## Implementation Notes\n\n## FR-1: Real one\n', 'spec.md'),
    cyr: parseMarkdown('## FR-9: Логин (с двух-факторкой!)\n', 'spec.md'),
    plain: parseMarkdown('# README\n\nThis project does X.\n\n## Setup\n\nrun `npm install`.\n', 'README.md'),
  };
});

Then('nodes keep source order with 1-indexed lines non-spec headings are ignored a cyrillic title slugifies to an ascii slug and a plain file yields no nodes edges or anchors', function (this: MpWorld) {
  const m = this.mpMisc!;
  assert.deepEqual(m.multi.nodes.map((n) => n.id), ['FR-1', 'FR-2', 'NFR-Performance-1', 'AC-1']);
  assert.equal((m.multi.nodes[0] as FrNode).line, 3);
  assert.equal((m.multi.nodes[1] as FrNode).line, 7);
  assert.deepEqual(m.multi.edges, [{ from: 'FR-1', to: 'AC-1', type: 'covers' }]);
  assert.equal(m.ignore.nodes.length, 1);
  assert.equal(m.ignore.nodes[0].id, 'FR-1');
  const cyr = m.cyr.nodes[0] as FrNode;
  assert.equal(cyr.id, 'FR-9');
  assert.ok(cyr.anchors[1].startsWith('fr-9-'));
  assert.ok(/[a-z0-9-]+/.test(cyr.anchors[1]));
  assert.deepEqual(m.plain.nodes, []);
  assert.deepEqual(m.plain.edges, []);
  assert.deepEqual(m.plain.anchors, []);
});

// --- 215: migrated short headings (FR-7c) ---
Given('short-form FR NFR and AC headings with titles relocated to bold lines and the old long forms', function () {
  // inputs inline in the When
});

When('parseMarkdown reads them', function (this: MpWorld) {
  this.mpShort = {
    frBold: parseMarkdown('## FR-7\n\n**Phase 2 — Native LSP plugin**\n\n> body\n', '.specs/v4/FR.md'),
    frNoBold: parseMarkdown('## FR-7\n\n> just a blockquote, no bold title\n', '.specs/v4/FR.md'),
    nfrShort: parseMarkdown('### NFR-Reliability-6\n\n**Marksman crash isolation**\n', '.specs/v4/NFR.md'),
    acShort: parseMarkdown('## AC-1.1\n**Требование:** [FR-1](FR.md#fr-1)\n\nWHEN x THEN y SHALL z\n', '.specs/v4/ACCEPTANCE_CRITERIA.md'),
    old: parseMarkdown('## FR-1: Login flow\n\n## AC-3 (FR-1): submits\n', '.specs/auth/FR.md'),
  };
});

Then('a short FR or NFR takes its bold title with a short slug a short AC reads its parent FR from the requirement line plus a dot-removed slug and the old long forms still work unchanged', function (this: MpWorld) {
  const m = this.mpShort!;
  const fb = m.frBold.nodes[0] as FrNode;
  assert.equal(fb.id, 'v4:FR-7');
  assert.equal(fb.title, 'Phase 2 — Native LSP plugin');
  assert.deepEqual(fb.anchors, ['FR-7', 'fr-7']);
  const fnb = m.frNoBold.nodes[0] as FrNode;
  assert.equal(fnb.title, '');
  assert.deepEqual(fnb.anchors, ['FR-7', 'fr-7']);
  const ns = m.nfrShort.nodes[0] as NfrNode;
  assert.equal(ns.id, 'v4:NFR-Reliability-6');
  assert.equal(ns.category, 'Reliability');
  assert.equal(ns.title, 'Marksman crash isolation');
  assert.deepEqual(ns.anchors, ['NFR-Reliability-6', 'nfr-reliability-6']);
  const acs = m.acShort.nodes[0] as AcNode;
  assert.equal(acs.id, 'v4:AC-1.1');
  assert.equal(acs.parentFr, 'v4:FR-1');
  assert.deepEqual(m.acShort.edges, [{ from: 'v4:FR-1', to: 'v4:AC-1.1', type: 'covers' }]);
  assert.ok(m.acShort.anchors.some((a) => a.alias === 'ac-11' && a.canonicalId === 'AC-1.1'));
  assert.equal((m.old.nodes[0] as FrNode).title, 'Login flow');
  assert.deepEqual((m.old.nodes[0] as FrNode).anchors, ['FR-1', 'fr-1-login-flow']);
  assert.equal((m.old.nodes[1] as AcNode).parentFr, 'auth:FR-1');
});
