/**
 * @feature17 step-definitions for the spec-backlog JSONL writer
 * (SPECGEN004_332 – SPECGEN004_338).
 *
 * All scenarios use a fresh temp directory (this.tempDir, provided by the
 * V4World Before hook) as the repoRoot so they are isolated from the real
 * .dev-pomogator/.specs-backlog/ directory.
 *
 * All steps call the REAL exported functions from writer.ts — no mocks.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import {
  appendEntry,
  entryId,
  readAll,
  readEntry,
  readOpen,
  updateStatus,
} from '../../tools/spec-backlog/writer.ts';
import type { BacklogEntry } from '../../tools/spec-backlog/types.ts';

// ─── World ────────────────────────────────────────────────────────────────────

interface WriterWorld extends V4World {
  _entryA?: BacklogEntry;
  _entryB?: BacklogEntry;
  _id?: string;
  _idA?: string;
  _idB?: string;
  _idC?: string;
  _all?: BacklogEntry[];
  _open?: BacklogEntry[];
  _single?: BacklogEntry | null;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const EVIDENCE_BASE = { file: 'FR.md', line: 12, target: 'ACCEPTANCE_CRITERIA.md' };

// ─── SPECGEN004_332  entryId is deterministic for same inputs ────────────────

When(
  /^entryId is called twice with slug `foo`, code `impl-drift\/dead-link`, and the same evidence$/,
  function (this: WriterWorld) {
    const ev = EVIDENCE_BASE;
    this._idA = entryId('foo', 'impl-drift/dead-link', ev);
    this._idB = entryId('foo', 'impl-drift/dead-link', ev);
  },
);

Then(
  /^both calls return the same 12-character hex id$/,
  function (this: WriterWorld) {
    assert.strictEqual(this._idA, this._idB, 'entryId must be deterministic');
    assert.strictEqual(this._idA!.length, 12, 'id must be 12 chars');
  },
);

// ─── SPECGEN004_333  entryId differs across slug or code ─────────────────────

When(
  /^entryId is called with three different slug\/code combinations but the same evidence$/,
  function (this: WriterWorld) {
    const ev = { file: 'FR.md' };
    this._idA = entryId('foo', 'impl-drift/dead-link', ev);
    this._idB = entryId('bar', 'impl-drift/dead-link', ev);
    this._idC = entryId('foo', 'impl-drift/missing-file', ev);
  },
);

Then(
  /^all three ids are distinct$/,
  function (this: WriterWorld) {
    assert.notStrictEqual(this._idA, this._idB, 'different slug → different id');
    assert.notStrictEqual(this._idA, this._idC, 'different code → different id');
  },
);

// ─── SPECGEN004_334  appendEntry creates the daily JSONL file ────────────────

When(
  /^appendEntry is called for slug `foo` with code `impl-drift\/dead-link` in the writer temp dir$/,
  function (this: WriterWorld) {
    this._entryA = appendEntry(this.tempDir, {
      slug: 'foo',
      code: 'impl-drift/dead-link',
      category: 'missing-spec-file',
      evidence: { file: '.specs/foo/FR.md', line: 10, target: 'AC.md' },
      suggested_resolver: 'ac-author',
      difficulty: 'medium',
    });
  },
);

Then(
  /^the returned entry has status `open` and an id of length 12$/,
  function (this: WriterWorld) {
    assert.strictEqual(this._entryA!.status, 'open');
    assert.strictEqual(this._entryA!.id.length, 12);
  },
);

Then(
  /^the daily JSONL file exists under \.dev-pomogator\/\.specs-backlog\/ in the writer temp dir$/,
  function (this: WriterWorld) {
    const today = new Date().toISOString().slice(0, 10);
    const file = path.join(
      this.tempDir,
      '.dev-pomogator',
      '.specs-backlog',
      `${today}.jsonl`,
    );
    assert.ok(fs.existsSync(file), `expected JSONL file at ${file}`);
  },
);

// ─── SPECGEN004_335  readAll deduplicates by id (latest line wins) ───────────

When(
  /^appendEntry is called for a backlog entry and then updateStatus marks it resolved$/,
  function (this: WriterWorld) {
    this._entryA = appendEntry(this.tempDir, {
      slug: 'sp',
      code: 'c1',
      category: 'missing-spec-file',
      evidence: { file: 'a' },
      suggested_resolver: 'ac-author',
      difficulty: 'easy',
    });
    updateStatus(this.tempDir, this._entryA.id, 'resolved', {
      resolver: 'ac-author',
      at: new Date().toISOString(),
    });
    this._all = readAll(this.tempDir);
  },
);

Then(
  /^readAll returns the entry with status `resolved` \(latest line wins\)$/,
  function (this: WriterWorld) {
    const found = this._all!.find((x) => x.id === this._entryA!.id);
    assert.ok(found, 'entry must be present in readAll result');
    assert.strictEqual(found!.status, 'resolved', 'latest line must win');
  },
);

// ─── SPECGEN004_336  readOpen filters to open entries only ───────────────────

When(
  /^two backlog entries exist and the second one is resolved$/,
  function (this: WriterWorld) {
    this._entryA = appendEntry(this.tempDir, {
      slug: 'sp',
      code: 'c1',
      category: 'missing-spec-file',
      evidence: { file: 'a' },
      suggested_resolver: 'ac-author',
      difficulty: 'easy',
    });
    this._entryB = appendEntry(this.tempDir, {
      slug: 'sp',
      code: 'c2',
      category: 'missing-test',
      evidence: { file: 'b' },
      suggested_resolver: 'scenario-writer',
      difficulty: 'easy',
    });
    updateStatus(this.tempDir, this._entryB.id, 'resolved', {
      resolver: 'scenario-writer',
      at: new Date().toISOString(),
    });
    this._open = readOpen(this.tempDir);
  },
);

Then(
  /^readOpen returns exactly 1 entry and its id matches the first entry$/,
  function (this: WriterWorld) {
    assert.strictEqual(this._open!.length, 1, 'readOpen must return exactly 1 open entry');
    assert.strictEqual(this._open![0].id, this._entryA!.id);
  },
);

// ─── SPECGEN004_337  tolerates malformed JSONL lines ─────────────────────────

When(
  /^two valid backlog entries are appended with a malformed line injected between them$/,
  function (this: WriterWorld) {
    appendEntry(this.tempDir, {
      slug: 's',
      code: 'c',
      category: 'unrecognised',
      evidence: {},
      suggested_resolver: 'human',
      difficulty: 'easy',
    });
    // Inject a malformed line directly into the daily file
    const today = new Date().toISOString().slice(0, 10);
    const file = path.join(
      this.tempDir,
      '.dev-pomogator',
      '.specs-backlog',
      `${today}.jsonl`,
    );
    fs.appendFileSync(file, 'not-json\n');
    appendEntry(this.tempDir, {
      slug: 's2',
      code: 'c2',
      category: 'unrecognised',
      evidence: {},
      suggested_resolver: 'human',
      difficulty: 'easy',
    });
    this._all = readAll(this.tempDir);
  },
);

Then(
  /^readAll returns exactly 2 entries \(the malformed line is skipped\)$/,
  function (this: WriterWorld) {
    assert.strictEqual(this._all!.length, 2, 'malformed line must be skipped');
  },
);

// ─── SPECGEN004_338  readEntry returns null for unknown id ───────────────────

When(
  /^readEntry is called with an id that does not exist in the writer temp dir$/,
  function (this: WriterWorld) {
    this._single = readEntry(this.tempDir, 'nope');
  },
);

Then(
  /^readEntry returns null$/,
  function (this: WriterWorld) {
    assert.strictEqual(this._single, null);
  },
);
