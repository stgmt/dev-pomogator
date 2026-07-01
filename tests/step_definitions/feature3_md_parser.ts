/**
 * @feature3 step definitions (FR-3 / FR-11 — MD parser triple-anchor backward-compat) — SPECGEN004_209.
 *
 * P3-rollout migration of tools/spec-graph/__tests__/md-parser-triple-anchor.test.ts (5 pure cases).
 * Drives the REAL parseMarkdown in-process: a legacy v3 `Requirement:` heading registers THREE
 * aliases (compact id + modern slug + legacy `requirement-` slug) at one location; a modern v4
 * heading keeps the two-anchor pair (no regression); a mixed file registers each; the legacy title
 * is what slugifies into the legacy alias. vitest twin kept until the gate-switch.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_209
 * @see tools/spec-graph/parsers/md.ts (parseMarkdown)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { parseMarkdown } from '../../tools/spec-graph/parsers/md.ts';
import { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';

type MdOut = ReturnType<typeof parseMarkdown>;
interface MdWorld extends V4World {
  mdLegacy?: MdOut;
  mdV4?: MdOut;
  mdMixed?: MdOut;
  mdTitle?: MdOut;
}

Given('the markdown parser with legacy v3 and modern v4 spec headings', function () {
  // parseMarkdown is pure — applied in the When
});

When('it parses a legacy Requirement heading a modern v4 heading a mixed file and a legacy title', function (this: MdWorld) {
  this.mdLegacy = parseMarkdown('### Requirement: FR-001 Login flow\n', 'specs/auth/FR.md');
  this.mdV4 = parseMarkdown('### FR-001: Login flow\n', 'specs/auth/FR.md');
  this.mdMixed = parseMarkdown('## Requirement: FR-001 Legacy\n\n## FR-002: Modern\n', 'mixed.md');
  this.mdTitle = parseMarkdown('### Requirement: FR-007 Edge case handling\n', 'x.md');
});

Then(
  "a legacy heading registers three aliases at one location the v4 heading keeps the two-anchor pair a mixed file registers each heading's own anchors and the legacy title slugifies into the legacy alias",
  function (this: MdWorld) {
    const leg = this.mdLegacy!;
    assert.equal(leg.nodes.length, 1, 'one FR node from the legacy heading');
    assert.equal(leg.nodes[0].id, 'FR-001');
    assert.equal(leg.nodes[0].type, 'FR');
    assert.deepEqual(
      [...leg.anchors.map((a) => a.alias)].sort(),
      ['FR-001', 'fr-001-login-flow', 'requirement-fr-001-login-flow'].sort(),
      'three aliases: compact id + modern slug + legacy requirement- slug',
    );
    for (const a of leg.anchors) assert.equal(a.canonicalId, 'FR-001', 'all aliases share the canonical id');
    assert.equal(new Set(leg.anchors.map((a) => `${a.location.file}:${a.location.line}`)).size, 1, 'all three resolve to one file:line');

    assert.deepEqual(this.mdV4!.anchors.map((a) => a.alias), ['FR-001', 'fr-001-login-flow'], 'a modern v4 heading keeps only the compact + modern pair (no regression)');

    const mx = this.mdMixed!;
    assert.equal(mx.nodes.length, 2, 'a mixed file yields both FR nodes');
    assert.equal(mx.anchors.filter((a) => a.canonicalId === 'FR-001').length, 3, 'the legacy heading still registers three');
    assert.equal(mx.anchors.filter((a) => a.canonicalId === 'FR-002').length, 2, 'the v4 heading registers two');

    const ti = this.mdTitle!.anchors.map((a) => a.alias);
    assert.ok(ti.includes('requirement-fr-007-edge-case-handling'), 'the legacy title slugifies into the legacy alias');
    assert.ok(ti.includes('fr-007-edge-case-handling'), 'plus the modern slug');
  },
);
