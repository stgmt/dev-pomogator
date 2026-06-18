/**
 * @feature40 step definitions (FR-40 — mutation door, optimistic CAS) — SPECGEN004_216.
 *
 * P3-rollout migration of tools/spec-mcp-server/__tests__/mutations-cas.test.ts (docSha pure +
 * casCheck artifact). docSha is the concurrency token read_spec_doc hands out; casCheck is what
 * apply_spec_change uses to refuse a write against a stale read. Drives the REAL primitives over a
 * real tmpdir doc. vitest twin kept until the gate-switch.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_216
 * @see tools/spec-mcp-server/mutations.ts (docSha / casCheck)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { docSha, casCheck } from '../../tools/spec-mcp-server/mutations.ts';
import { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';

interface CasWorld extends V4World {
  casRoot?: string;
  casResults?: {
    deterministic: boolean;
    hexShape: boolean;
    contentSensitive: boolean;
    match: ReturnType<typeof casCheck>;
    mismatch: ReturnType<typeof casCheck>;
    missing: ReturnType<typeof casCheck>;
  };
}

Given('the mutation door CAS primitives and a spec doc on disk', function (this: CasWorld) {
  const root = path.join(os.tmpdir(), `cas-bdd-${randomUUID()}`);
  fs.mkdirSync(path.join(root, '.specs', 'casd'), { recursive: true });
  fs.writeFileSync(path.join(root, '.specs', 'casd', 'FR.md'), 'body\n');
  this.casRoot = root;
});

When('docSha hashes content and casCheck compares an expected sha to the current doc', function (this: CasWorld) {
  this.casResults = {
    deterministic: docSha('hello\n') === docSha('hello\n'),
    hexShape: /^[0-9a-f]{64}$/.test(docSha('hello\n')),
    contentSensitive: docSha('a') !== docSha('b') && docSha('x\n') !== docSha('x\r\n'),
    match: casCheck(this.casRoot!, 'casd', 'FR.md', docSha('body\n')),
    mismatch: casCheck(this.casRoot!, 'casd', 'FR.md', 'deadbeef'),
    missing: casCheck(this.casRoot!, 'casd', 'NOPE.md', 'whatever'),
  };
});

Then('docSha is a deterministic sha256 sensitive to content casCheck is ok on a match returns the actual sha on a mismatch and yields a null sha for a missing doc', function (this: CasWorld) {
  const r = this.casResults!;
  assert.equal(r.deterministic, true, 'docSha is deterministic for equal content');
  assert.equal(r.hexShape, true, 'docSha is 64 hex chars (sha256)');
  assert.equal(r.contentSensitive, true, 'docSha changes with content, CRLF included');
  assert.deepEqual(r.match, { ok: true }, 'casCheck ok when the expected sha matches');
  assert.equal(r.mismatch.ok, false, 'casCheck refuses a stale read');
  assert.equal((r.mismatch as { actualSha: string }).actualSha, docSha('body\n'), 'and returns the actual current sha so the caller can rebase');
  assert.deepEqual(r.missing, { ok: false, actualSha: null }, 'a missing doc yields actualSha null, not a crash');
  fs.rmSync(this.casRoot!, { recursive: true, force: true });
});
