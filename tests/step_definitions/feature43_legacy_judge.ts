/**
 * @FR-43 step definitions — legacy-judge unit-level coverage
 *
 * Covers SPECGEN004_316-323: the three exports of legacy-judge.ts exercised
 * in-process with injected spawn where applicable (no real `claude -p` needed):
 *   316 → findBasenameElsewhere: finds a moved file by basename
 *   317 → findBasenameElsewhere: returns [] for a truly missing file
 *   318 → buildLegacyPrompt: embeds missing paths and grep evidence
 *   319 → judgeLegacyState: parses clean MOVED verdict
 *   320 → judgeLegacyState: tolerates JSON in stray prose / fences
 *   321 → judgeLegacyState: degrades to UNKNOWN when binary unavailable
 *   322 → judgeLegacyState: degrades to UNKNOWN on unparseable output
 *   323 → judgeLegacyState: rejects invalid state value → UNKNOWN
 *
 * All scenarios drive the REAL exported functions — no mock-of-production-
 * logic. The injectable `spawn` param is the transport seam that the
 * production code itself declares; feeding it a canned return is supplying
 * the judge's INPUT (as a fixture), not mocking internal logic.
 *
 * @see .specs/spec-generator-v4/FR.md FR-43
 * @see tools/specs-generator/legacy-judge.ts
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  findBasenameElsewhere,
  buildLegacyPrompt,
  judgeLegacyState,
  type LegacyVerdict,
} from '../../tools/specs-generator/legacy-judge.ts';
import { V4World } from '../hooks/before-after.ts';

// ─── SPECGEN004_316 — findBasenameElsewhere finds a moved file ──────────────

interface F316World extends V4World {
  repoRoot316?: string;
  movedFilePath?: string;
  findResult316?: string[];
}

Given('a repo root with a file placed inside a tools subdirectory', function (this: F316World) {
  // Create a fake repo root with a tools/ subdirectory holding a file
  this.repoRoot316 = this.tempDir;
  const toolsDir = path.join(this.tempDir, 'tools', 'my-feature');
  fs.mkdirSync(toolsDir, { recursive: true });
  this.movedFilePath = path.join(toolsDir, 'my-module.ts');
  fs.writeFileSync(this.movedFilePath, '// moved here');
});

When('findBasenameElsewhere searches for the original missing path by basename', function (this: F316World) {
  // The "original" missing path (as recorded in FILE_CHANGES) — just the basename matters
  this.findResult316 = findBasenameElsewhere(this.repoRoot316!, 'old/location/my-module.ts');
});

Then('it returns the relative path where the file now lives', function (this: F316World) {
  assert.ok(Array.isArray(this.findResult316), 'Expected an array result');
  assert.ok(this.findResult316!.length > 0, 'Expected at least one hit for the moved file');
  assert.ok(
    this.findResult316!.some((p) => p.includes('my-module.ts')),
    `Expected a result containing my-module.ts; got: ${JSON.stringify(this.findResult316)}`,
  );
});

// ─── SPECGEN004_317 — findBasenameElsewhere returns [] for missing ───────────

interface F317World extends V4World {
  repoRoot317?: string;
  findResult317?: string[];
}

Given('a repo root with no file matching the queried basename', function (this: F317World) {
  // Empty repo root (only the tmp dir — no tools/ files)
  this.repoRoot317 = this.tempDir;
  // Ensure tools/ exists but is empty so the walker has something to enter
  fs.mkdirSync(path.join(this.tempDir, 'tools'), { recursive: true });
});

When('findBasenameElsewhere searches for the missing basename', function (this: F317World) {
  this.findResult317 = findBasenameElsewhere(this.repoRoot317!, 'old/location/totally-gone-file.ts');
});

Then('it returns an empty array', function (this: F317World) {
  assert.ok(Array.isArray(this.findResult317), 'Expected an array result');
  assert.deepEqual(this.findResult317, [], `Expected empty array; got: ${JSON.stringify(this.findResult317)}`);
});

// ─── SPECGEN004_318 — buildLegacyPrompt embeds evidence ─────────────────────

interface F318World extends V4World {
  prompt318?: string;
}

Given('a slug and evidence list with one moved path and one truly missing path', function (this: F318World) {
  // No setup needed — buildLegacyPrompt is a pure function; evidence is passed directly.
  // Store evidence on world for reuse in When/Then steps.
  (this as unknown as { _evidence318: Array<{ missing: string; foundAt: string[] }> })._evidence318 = [
    { missing: 'tools/old/my-feature.ts', foundAt: ['tools/new/my-feature.ts'] },
    { missing: 'tools/old/gone-feature.ts', foundAt: [] },
  ];
});

When('buildLegacyPrompt constructs the classification prompt', function (this: F318World) {
  const evidence = (
    this as unknown as { _evidence318: Array<{ missing: string; foundAt: string[] }> }
  )._evidence318;
  this.prompt318 = buildLegacyPrompt('my-spec-slug', evidence);
});

Then('the prompt contains the slug and both missing paths with their found-at evidence', function (this: F318World) {
  assert.ok(typeof this.prompt318 === 'string', 'Expected a string prompt');
  assert.match(this.prompt318!, /my-spec-slug/, 'Prompt must contain the spec slug');
  assert.match(this.prompt318!, /tools\/old\/my-feature\.ts/, 'Prompt must contain the moved missing path');
  assert.match(this.prompt318!, /tools\/new\/my-feature\.ts/, 'Prompt must reference the found-at path');
  assert.match(this.prompt318!, /tools\/old\/gone-feature\.ts/, 'Prompt must contain the truly missing path');
  assert.match(this.prompt318!, /NO file with this name found anywhere/, 'Prompt must state no-hit for the missing file');
});

// ─── Shared Given for judgeLegacyState scenarios (319-323) ──────────────────

interface F319World extends V4World {
  judgeRoot?: string;
  judgeSlug?: string;
  judgeMissing?: string[];
  judgeVerdict?: LegacyVerdict;
}

Given('a repo root and a list of missing paths for a slug', function (this: F319World) {
  this.judgeRoot = this.tempDir;
  this.judgeSlug = 'test-spec';
  this.judgeMissing = ['tools/old/gone.ts'];
});

// ─── SPECGEN004_319 — clean MOVED verdict ────────────────────────────────────

When('judgeLegacyState runs with an injected spawn returning a clean MOVED JSON', async function (this: F319World) {
  const mockSpawn = async (_prompt: string): Promise<string> =>
    JSON.stringify({ state: 'MOVED', why: 'Same-named file found at new path.' });
  this.judgeVerdict = await judgeLegacyState({
    repoRoot: this.judgeRoot!,
    slug: this.judgeSlug!,
    missingPaths: this.judgeMissing!,
    spawn: mockSpawn,
  });
});

Then('the verdict has state MOVED and ran true', function (this: F319World) {
  assert.equal(this.judgeVerdict!.state, 'MOVED', `Expected MOVED; got ${this.judgeVerdict!.state}`);
  assert.equal(this.judgeVerdict!.ran, true, 'Expected ran=true for a successful parse');
});

// ─── SPECGEN004_320 — JSON inside prose/fence tolerated ──────────────────────

When(
  'judgeLegacyState runs with an injected spawn returning JSON inside a markdown fence',
  async function (this: F319World) {
    const mockSpawn = async (_prompt: string): Promise<string> =>
      'Here is the verdict:\n```json\n{"state":"REMOVED","why":"No replacement found."}\n```\nEnd.';
    this.judgeVerdict = await judgeLegacyState({
      repoRoot: this.judgeRoot!,
      slug: this.judgeSlug!,
      missingPaths: this.judgeMissing!,
      spawn: mockSpawn,
    });
  },
);

Then('the verdict has state REMOVED and ran true', function (this: F319World) {
  assert.equal(this.judgeVerdict!.state, 'REMOVED', `Expected REMOVED; got ${this.judgeVerdict!.state}`);
  assert.equal(this.judgeVerdict!.ran, true, 'Expected ran=true for a fenced-JSON parse');
});

// ─── SPECGEN004_321 — binary unavailable → UNKNOWN / ran:false ───────────────

When(
  'judgeLegacyState runs with an injected spawn that throws a binary-unavailable error',
  async function (this: F319World) {
    const mockSpawn = async (_prompt: string): Promise<string> => {
      throw new Error('spawn ENOENT: claude binary not found');
    };
    this.judgeVerdict = await judgeLegacyState({
      repoRoot: this.judgeRoot!,
      slug: this.judgeSlug!,
      missingPaths: this.judgeMissing!,
      spawn: mockSpawn,
    });
  },
);

Then('the verdict has state UNKNOWN and ran false', function (this: F319World) {
  assert.equal(this.judgeVerdict!.state, 'UNKNOWN', `Expected UNKNOWN; got ${this.judgeVerdict!.state}`);
  assert.equal(this.judgeVerdict!.ran, false, 'Expected ran=false for a degrade path');
});

// ─── SPECGEN004_322 — unparseable output → UNKNOWN ───────────────────────────

When(
  'judgeLegacyState runs with an injected spawn returning unparseable output',
  async function (this: F319World) {
    const mockSpawn = async (_prompt: string): Promise<string> =>
      'I cannot determine the status of this spec. Please check manually.';
    this.judgeVerdict = await judgeLegacyState({
      repoRoot: this.judgeRoot!,
      slug: this.judgeSlug!,
      missingPaths: this.judgeMissing!,
      spawn: mockSpawn,
    });
  },
);

// Then step shared: "the verdict has state UNKNOWN and ran false" (reused from 321)

// ─── SPECGEN004_323 — invalid state value → UNKNOWN ─────────────────────────

When(
  'judgeLegacyState runs with an injected spawn returning an invalid state value',
  async function (this: F319World) {
    const mockSpawn = async (_prompt: string): Promise<string> =>
      JSON.stringify({ state: 'BANISHED', why: 'Not a valid state.' });
    this.judgeVerdict = await judgeLegacyState({
      repoRoot: this.judgeRoot!,
      slug: this.judgeSlug!,
      missingPaths: this.judgeMissing!,
      spawn: mockSpawn,
    });
  },
);

// Then step shared: "the verdict has state UNKNOWN and ran false" (reused from 321)
