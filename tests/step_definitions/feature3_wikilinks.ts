/**
 * @feature3 step definitions (FR-3 / AC-3.3 — graph wiki-link resolver) — SPECGEN004_200.
 *
 * First file of the P3 rollout migrated VIA the bdd-migrator: its inventory flagged all 6 cases as
 * `pure` (drive resolveWikiLinks in-process). Bundled into one scenario that drives the REAL
 * resolveWikiLinks / brokenWikiLinks, with the same assertions as the vitest twin (which stays
 * until the gate-switch). Deterministic, in-process — no spawn, no token.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_200
 * @see tools/spec-graph/wikilinks.ts · migrated from tools/spec-graph/__tests__/wikilinks.test.ts
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { resolveWikiLinks, brokenWikiLinks } from '../../tools/spec-graph/wikilinks.ts';
import type { NodeLocation } from '../../tools/spec-graph/types.ts';
import { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';

type Occ = ReturnType<typeof resolveWikiLinks>;
interface WikiWorld extends V4World {
  wlDefs?: Map<string, NodeLocation>;
  wl?: Record<string, Occ>;
}

Given('the graph wiki-link resolver and a registry of node locations', function (this: WikiWorld) {
  this.wlDefs = new Map<string, NodeLocation>([
    ['FR-1', { file: '.specs/x/FR.md', line: 3 }],
    ['fr-1-login-flow', { file: '.specs/x/FR.md', line: 3 }],
    ['AC-1.1', { file: '.specs/x/ACCEPTANCE_CRITERIA.md', line: 5 }],
  ]);
});

When(
  'it resolves a compact id a slug alias an unknown target an alias-plus-fragment a same-file fragment and multiple links on one line',
  function (this: WikiWorld) {
    const d = this.wlDefs!;
    this.wl = {
      compact: resolveWikiLinks('see [[FR-1]] for login', '.specs/x/USE_CASES.md', d),
      slug: resolveWikiLinks('[[fr-1-login-flow]]', 'a.md', d),
      unknown: resolveWikiLinks('[[FR-999]] and [[FR-001]]', 'a.md', d),
      aliasFrag: resolveWikiLinks('[[FR-1#acceptance|the FR]]', 'a.md', d),
      sameFile: resolveWikiLinks('[[#section]]', 'a.md', d),
      multi: resolveWikiLinks('x\n[[FR-1]] then [[AC-1.1]]', 'a.md', d),
    };
  },
);

Then(
  'ids and slug aliases resolve identically unknown targets are broken the alias and fragment are stripped a same-file fragment is empty-but-not-broken and line numbers are recorded',
  function (this: WikiWorld) {
    const wl = this.wl!;
    assert.equal(wl.compact.length, 1, 'a compact id link produces one occurrence');
    assert.equal(wl.compact[0].target, 'FR-1');
    assert.deepEqual(wl.compact[0].resolved, { file: '.specs/x/FR.md', line: 3 });
    assert.deepEqual(wl.slug[0].resolved, wl.compact[0].resolved, 'a slug alias resolves identically to the compact id');
    assert.deepEqual(
      wl.unknown.map((o) => o.resolved),
      [null, null],
      'unknown targets (FR-999, FR-001) are unresolved',
    );
    assert.deepEqual(
      brokenWikiLinks(wl.unknown).map((o) => o.target),
      ['FR-999', 'FR-001'],
      'unresolved targets are reported as broken candidates',
    );
    assert.equal(wl.aliasFrag[0].target, 'FR-1', 'the |display alias and #fragment are stripped from the target');
    assert.equal(wl.aliasFrag[0].fragment, 'acceptance');
    assert.notEqual(wl.aliasFrag[0].resolved, null);
    assert.equal(wl.sameFile[0].target, '', 'a same-file [[#fragment]] has an empty target');
    assert.deepEqual(brokenWikiLinks(wl.sameFile), [], 'a same-file fragment is not broken');
    assert.deepEqual(
      wl.multi.map((o) => [o.target, o.line]),
      [
        ['FR-1', 2],
        ['AC-1.1', 2],
      ],
      'line numbers are recorded and multiple links per line are found',
    );
  },
);
