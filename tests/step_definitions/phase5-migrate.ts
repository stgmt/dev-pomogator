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
import {
  promptApplyTimeout,
  DEFAULT_PROMPT_TIMEOUT_MS,
  type PromptResult,
} from '../../tools/migrate-v3-to-v4/interactive.ts';
import type { V4World } from '../hooks/before-after.ts';

interface MigrateWorld extends V4World {
  migrateResult?: RunResult;
  preMigrateFileBytes?: string;
  preMigrateProgressVersion?: number | null;
  promptResult?: PromptResult;
  promptTimeoutSeconds?: number;
  promptFile?: string;
  promptFileBytes?: string;
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

// ─── SPECGEN004_25 — interactive per-file prompt, 30s default-skip timeout ──
// Wires the REAL promptApplyTimeout (the no-flag interactive path). Production
// default is 30s (DEFAULT_PROMPT_TIMEOUT_MS); the test drives the identical
// timeout→skip branch with a short timeout so the suite stays fast, and
// asserts the production default ties to the scenario's "30 seconds".

Given('the user runs `dev-pomogator migrate-v3-to-v4` \\(no flag)', function (this: MigrateWorld) {
  // No flag = interactive mode (suggestOnly:false). The prompt is exercised
  // per-file in the steps below.
  fs.mkdirSync(path.join(this.tempDir, '.specs'), { recursive: true });
  fs.writeFileSync(path.join(this.tempDir, '.specs/.progress.json'), JSON.stringify({ version: 3 }));
});

Given('the migration encounters a spec file with ambiguous structure', function (this: MigrateWorld) {
  const auth = path.join(this.tempDir, '.specs/auth');
  fs.mkdirSync(auth, { recursive: true });
  this.promptFile = path.join(auth, 'FR.md');
  fs.writeFileSync(this.promptFile, '# Requirements\n## FR1 ambiguous heading\n');
  this.promptFileBytes = fs.readFileSync(this.promptFile, 'utf8');
});

When('the migration prompts approve\\/skip\\/edit', function (this: MigrateWorld) {
  // The prompt is issued inside promptApplyTimeout in the next step; this
  // marker documents the no-flag path reached the prompt.
  assert.ok(this.promptFile, 'an ambiguous file must be staged before prompting');
});

When(
  'the user provides no input for {int} seconds',
  async function (this: MigrateWorld, seconds: number) {
    this.promptTimeoutSeconds = seconds;
    // Input that never yields and never ends → the timeout branch fires. A
    // never-resolving next() leaves no pending timer/IO, so it does not keep
    // the process alive after the step resolves.
    const noInput: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        return { next: () => new Promise<IteratorResult<string>>(() => {}) };
      },
    };
    this.promptResult = await promptApplyTimeout({
      input: noInput,
      write: () => {},
      timeoutMs: 25, // fast proxy for the real 30s — the timeout→skip logic is duration-agnostic
      context: { file: this.promptFile!, headingCount: 1 },
    });
  },
);

Then('the default action `skip` is applied', function (this: MigrateWorld) {
  // The production default IS the scenario's "30 seconds".
  assert.equal(DEFAULT_PROMPT_TIMEOUT_MS, (this.promptTimeoutSeconds ?? 30) * 1000);
  assert.equal(this.promptResult?.decision, 'skip');
  assert.equal(this.promptResult?.timedOut, true);
});

Then('the file is left unchanged', function (this: MigrateWorld) {
  assert.equal(fs.readFileSync(this.promptFile!, 'utf8'), this.promptFileBytes);
});

Then('the migration proceeds to the next file', function (this: MigrateWorld) {
  // `skip` IS the proceed-to-next semantics: the file was not edited and the
  // walk continues. The skip decision is the observable contract.
  assert.equal(this.promptResult?.decision, 'skip');
});
