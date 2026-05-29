// Phase 5 BDD step definitions — migrate-v3-to-v4 CLI (FR-11).
//
// SPECGEN004_24 (--suggest-only mode) — fully implemented.
// SPECGEN004_25 (interactive 30s timeout) — interactive prompts are a
// follow-up on this same branch; the step defs mark the relevant Then
// substeps as PENDING so the scenario surfaces the deferral explicitly
// rather than silently passing.

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { run as runMigrate, type RunResult } from '../../tools/migrate-v3-to-v4/cli.ts';
import type { V4World } from '../hooks/before-after.ts';

interface MigrateWorld extends V4World {
  migrateResult?: RunResult;
  preMigrateFileBytes?: string;
  preMigrateProgressVersion?: number | null;
}

// ─── SPECGEN004_24 — --suggest-only mode ────────────────────────────────

Given(
  /^an existing v3 project with `\.specs\/auth\/FR\.md` containing `([^`]+)`$/,
  function (this: MigrateWorld, headingText: string) {
    const auth = path.join(this.tempDir, '.specs/auth');
    fs.mkdirSync(auth, { recursive: true });
    fs.writeFileSync(path.join(auth, 'FR.md'), `${headingText}\n`);
    fs.mkdirSync(path.join(this.tempDir, '.specs'), { recursive: true });
    fs.writeFileSync(
      path.join(this.tempDir, '.specs/.progress.json'),
      JSON.stringify({ version: 3 }),
    );
    this.preMigrateFileBytes = fs.readFileSync(path.join(auth, 'FR.md'), 'utf8');
    this.preMigrateProgressVersion = 3;
  },
);

When('the user runs `dev-pomogator migrate-v3-to-v4 --suggest-only`', function (this: MigrateWorld) {
  this.migrateResult = runMigrate({ repoRoot: this.tempDir, suggestOnly: true });
});

Then(
  /^per-file diffs are printed to stdout showing conversion to `([^`]+)`$/,
  function (this: MigrateWorld, expectedHeading: string) {
    assert.ok(this.migrateResult, 'migrate must have run');
    assert.ok(this.migrateResult.text.includes(expectedHeading), this.migrateResult.text);
  },
);

Then('the file is NOT modified', function (this: MigrateWorld) {
  const auth = path.join(this.tempDir, '.specs/auth/FR.md');
  assert.equal(fs.readFileSync(auth, 'utf8'), this.preMigrateFileBytes);
});

Then('`.progress.json::version` is NOT bumped', function (this: MigrateWorld) {
  const p = JSON.parse(
    fs.readFileSync(path.join(this.tempDir, '.specs/.progress.json'), 'utf8'),
  ) as { version: number };
  assert.equal(p.version, this.preMigrateProgressVersion);
  assert.equal(this.migrateResult?.versionBumped, false);
});

// ─── SPECGEN004_25 — interactive 30s timeout (deferred) ────────────────

Given('the user runs `dev-pomogator migrate-v3-to-v4` \\(no flag)', function () {
  return 'pending';
});

Given('the migration encounters a spec file with ambiguous structure', function () {
  return 'pending';
});

When('the migration prompts approve\\/skip\\/edit', function () {
  return 'pending';
});

When('the user provides no input for {int} seconds', function (_seconds: number) {
  return 'pending';
});

Then('the default action `skip` is applied', function () {
  return 'pending';
});

Then('the file is left unchanged', function () {
  return 'pending';
});

Then('the migration proceeds to the next file', function () {
  return 'pending';
});
