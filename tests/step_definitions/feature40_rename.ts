/**
 * @feature40 step definitions (FR-40 — mutation door, rename/move helpers) — SPECGEN004_210.
 *
 * P3-rollout migration of tools/spec-mcp-server/__tests__/mutations-rename.test.ts (2 artifact
 * cases — the migrator classified them artifact because their corpus is built in beforeEach via
 * writeFileSync). Drives the REAL findInboundLinks / rewriteInboundLinks over a real tmpdir corpus:
 * inbound markdown links to a target are found across the corpus (self-links + external URLs
 * excluded), and a rewrite retargets the path while preserving the #fragment — so the rename_spec_doc
 * gate never silently strands a link. vitest twin kept until the gate-switch.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_210
 * @see tools/spec-mcp-server/mutations.ts (findInboundLinks / rewriteInboundLinks)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { findInboundLinks, rewriteInboundLinks } from '../../tools/spec-mcp-server/mutations.ts';
import { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';

interface RnWorld extends V4World {
  rnRoot?: string;
  rnInbound?: ReturnType<typeof findInboundLinks>;
  rnEdits?: ReturnType<typeof rewriteInboundLinks>;
}

Given('a spec corpus with same-spec cross-spec self and external links to a target doc', function (this: RnWorld) {
  const root = path.join(os.tmpdir(), `rn-bdd-${randomUUID()}`);
  const dir = path.join(root, '.specs', 'demo');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'FR.md'), '## FR-1: Demo\n\nSelf [me](FR.md#fr-1) — a self-link, must NOT count.\n');
  fs.writeFileSync(path.join(dir, 'ACCEPTANCE_CRITERIA.md'), '# AC\n\n[a](FR.md#fr-1) and [b](FR.md#fr-2) and external [x](https://e/FR.md#z).\n');
  const other = path.join(root, '.specs', 'other');
  fs.mkdirSync(other, { recursive: true });
  fs.writeFileSync(path.join(other, 'DESIGN.md'), '# D\n\nSee [it](../demo/FR.md#fr-1).\n');
  this.rnRoot = root;
});

When('the rename helpers find the inbound links and rewrite them to a new doc name', function (this: RnWorld) {
  this.rnInbound = findInboundLinks(this.rnRoot!, '.specs/demo/FR.md');
  this.rnEdits = rewriteInboundLinks(this.rnRoot!, this.rnInbound, '.specs/demo/REQUIREMENTS.md');
});

Then(
  'self-links and external URLs are excluded fragments are preserved and each referencing file is retargeted once to the new name',
  function (this: RnWorld) {
    const inbound = this.rnInbound!;
    assert.deepEqual(
      inbound.map((l) => l.file).sort(),
      ['.specs/demo/ACCEPTANCE_CRITERIA.md', '.specs/demo/ACCEPTANCE_CRITERIA.md', '.specs/other/DESIGN.md'],
      'same-spec (AC x2) + cross-spec (DESIGN); the https one and the self-link are excluded',
    );
    assert.equal(inbound.some((l) => l.file.endsWith('/FR.md')), false, 'the FR.md self-link is NOT counted (it travels with the moved doc)');
    assert.equal(inbound.find((l) => l.file.endsWith('DESIGN.md'))!.fragment, '#fr-1', 'the #fragment is preserved');

    const edits = this.rnEdits!;
    assert.deepEqual(
      edits.map((e) => e.file).sort(),
      ['.specs/demo/ACCEPTANCE_CRITERIA.md', '.specs/other/DESIGN.md'],
      'one edit per referencing file (AC two links -> one file)',
    );
    const ac = edits.find((e) => e.file.endsWith('ACCEPTANCE_CRITERIA.md'))!.content;
    assert.equal(ac.includes('](FR.md#'), false, 'the old same-dir path is gone');
    assert.ok(ac.includes('REQUIREMENTS.md#fr-1') && ac.includes('REQUIREMENTS.md#fr-2'), 'both links retargeted to the new name, fragments kept');
    assert.ok(ac.includes('https://e/FR.md#z'), 'the external URL is untouched');
    const design = edits.find((e) => e.file.endsWith('DESIGN.md'))!.content;
    assert.ok(design.includes('../demo/REQUIREMENTS.md#fr-1'), 'the cross-spec relative path is retargeted to the new name');

    fs.rmSync(this.rnRoot!, { recursive: true, force: true });
  },
);
