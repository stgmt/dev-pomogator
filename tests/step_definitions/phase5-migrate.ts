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
import {
  run as runMigrate,
  dispatch as dispatchMigrate,
  type RunResult,
  type FileResult,
  type InteractivePrompt,
} from '../../tools/migrate-v3-to-v4/cli.ts';
import {
  promptApplyTimeout,
  DEFAULT_PROMPT_TIMEOUT_MS,
} from '../../tools/migrate-v3-to-v4/interactive.ts';
import type { V4World } from '../hooks/before-after.ts';

interface MigrateWorld extends V4World {
  migrateResult?: RunResult;
  preMigrateFileBytes?: string;
  preMigrateProgressVersion?: number | null;
  promptTimeoutSeconds?: number;
  ambiguousFile?: string; // abs path of the file the prompt times out on
  ambiguousBefore?: string; // its bytes before the (skipped) migration
  ambiguousEntry?: FileResult; // its per-file result from the real loop
  nextFile?: string; // abs path of the file the loop proceeds to
  featureBefore?: string; // .feature bytes before the (advisory) tag-prediction run
}

/** Input source that never yields — only the prompt's timer can resolve it. */
const idleInput: AsyncIterable<string> = {
  async *[Symbol.asyncIterator](): AsyncIterator<string> {
    await new Promise(() => {});
  },
};

/** Single-line input source — drives the real promptApplyTimeout parser. */
function lineInput(line: string): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator](): AsyncIterator<string> {
      yield line;
    },
  };
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
// Drives the REAL no-flag path end-to-end: dispatch() routes (suggestOnly:false,
// no --yes) → runInteractive, which walks the changed files and consults the
// prompt per file. The ambiguous file's prompt is fed a never-yielding input so
// only the timer can resolve (→ skip); a short timeoutMs keeps the suite fast
// while exercising the identical timeout→skip branch the 30s default uses. The
// "file unchanged" + "proceeds to next" claims are asserted against the real
// migration loop, not the prompt function in isolation.

Given('the user runs `dev-pomogator migrate-v3-to-v4` \\(no flag)', function (this: MigrateWorld) {
  // No flag = interactive mode (suggestOnly:false, yes:false → dispatch → runInteractive).
  fs.mkdirSync(path.join(this.tempDir, '.specs'), { recursive: true });
  fs.writeFileSync(path.join(this.tempDir, '.specs/.progress.json'), JSON.stringify({ version: 3 }));
  // A second, unambiguous file so "proceeds to the next file" is observable.
  const nextDir = path.join(this.tempDir, '.specs/znext');
  fs.mkdirSync(nextDir, { recursive: true });
  this.nextFile = path.join(nextDir, 'FR.md');
  fs.writeFileSync(this.nextFile, '### Requirement: FR-050 Next file\n');
});

Given('the migration encounters a spec file with ambiguous structure', function (this: MigrateWorld) {
  const auth = path.join(this.tempDir, '.specs/auth');
  fs.mkdirSync(auth, { recursive: true });
  this.ambiguousFile = path.join(auth, 'FR.md');
  // A real legacy heading → convertSource flags it changed → the interactive
  // loop prompts the user to decide on it (the "ambiguous" file).
  fs.writeFileSync(this.ambiguousFile, '### Requirement: FR-001 Ambiguous login\n');
  this.ambiguousBefore = fs.readFileSync(this.ambiguousFile, 'utf8');
});

When('the migration prompts approve\\/skip\\/edit', function (this: MigrateWorld) {
  // The prompt is issued inside runInteractive in the next step; this marker
  // documents the no-flag path reached the per-file prompt.
  assert.ok(this.ambiguousFile, 'an ambiguous file must be staged before prompting');
});

When(
  'the user provides no input for {int} seconds',
  async function (this: MigrateWorld, seconds: number) {
    this.promptTimeoutSeconds = seconds;
    // Per-file prompt: ambiguous file gets a never-yielding input so only the
    // timer resolves (→ skip); the next file is applied so the loop's "proceed"
    // is observable. Real promptApplyTimeout drives both decisions.
    const prompt: InteractivePrompt = (ctx) =>
      ctx.file.includes('auth')
        ? promptApplyTimeout({ input: idleInput, write: () => {}, timeoutMs: 25, context: ctx })
        : promptApplyTimeout({ input: lineInput('apply'), write: () => {}, timeoutMs: 5_000, context: ctx });
    this.migrateResult = await dispatchMigrate(
      { repoRoot: this.tempDir, suggestOnly: false },
      { prompt },
    );
    this.ambiguousEntry = this.migrateResult.files.find((f) => f.file.includes('auth'));
  },
);

Then('the default action `skip` is applied', function (this: MigrateWorld) {
  // The production default IS the scenario's "30 seconds".
  assert.equal(DEFAULT_PROMPT_TIMEOUT_MS, (this.promptTimeoutSeconds ?? 30) * 1000);
  assert.equal(this.ambiguousEntry?.decision, 'skip');
  assert.equal(this.ambiguousEntry?.timedOut, true);
});

Then('the file is left unchanged', function (this: MigrateWorld) {
  // The file went through the REAL interactive loop; skip must not have written.
  assert.equal(this.ambiguousEntry?.applied, false);
  assert.equal(fs.readFileSync(this.ambiguousFile!, 'utf8'), this.ambiguousBefore);
});

Then('the migration proceeds to the next file', function (this: MigrateWorld) {
  // The loop continued past the skipped file and processed a later one.
  const next = this.migrateResult?.files.find((f) => f.file.includes('znext'));
  assert.ok(next, 'the loop must have visited the next file after the skip');
  assert.equal(next.applied, true);
  assert.equal(fs.readFileSync(this.nextFile!, 'utf8'), '### FR-050: Next file\n');
});

// ─── SPECGEN004_176 — tag prediction (FR-11) ────────────────────────────
// Reuses the SPECGEN004_24 When ("--suggest-only"); the Given seeds an FR catalog
// + a .feature with one untagged + one already-tagged scenario, and the Then asserts
// the predicted @FR-N appears in stdout while the .feature stays byte-stable (advisory).

Given(
  /^a v3 spec whose FR\.md defines FR-001 "([^"]+)"$/,
  function (this: MigrateWorld, title: string) {
    const auth = path.join(this.tempDir, '.specs/auth');
    fs.mkdirSync(auth, { recursive: true });
    fs.writeFileSync(
      path.join(auth, 'FR.md'),
      `## FR-001: ${title}\nThe system SHALL allow a user to login with email and password.\n## FR-002: Export report to PDF\nGenerate a PDF export of the dashboard.\n`,
    );
    fs.mkdirSync(path.join(this.tempDir, '.specs'), { recursive: true });
    fs.writeFileSync(path.join(this.tempDir, '.specs/.progress.json'), JSON.stringify({ version: 3 }));
  },
);

Given(
  /^a `\.feature` with an untagged scenario "([^"]+)" and an already-tagged scenario$/,
  function (this: MigrateWorld, scenarioName: string) {
    const fp = path.join(this.tempDir, '.specs/auth/auth.feature');
    fs.writeFileSync(
      fp,
      `Feature: auth\n\n  Scenario: ${scenarioName}\n    Given the login page\n\n  @FR-002\n  Scenario: Export the report\n    Given a dashboard\n`,
    );
    this.featureBefore = fs.readFileSync(fp, 'utf8');
  },
);

Then(
  /^a tag suggestion `(@FR-\d+)` is printed for the untagged "([^"]+)" scenario$/,
  function (this: MigrateWorld, tag: string, scenarioName: string) {
    assert.ok(this.migrateResult, 'migrate must have run');
    assert.ok(
      this.migrateResult.text.includes(scenarioName) && this.migrateResult.text.includes(tag),
      this.migrateResult.text,
    );
  },
);

Then('the already-tagged scenario gets no suggestion', function (this: MigrateWorld) {
  assert.ok(
    !this.migrateResult!.text.includes('Export the report'),
    'an already-tagged scenario must not appear in the tag suggestions',
  );
});

Then(/^no tag is written into the `\.feature` \(advisory only\)$/, function (this: MigrateWorld) {
  const fp = path.join(this.tempDir, '.specs/auth/auth.feature');
  assert.equal(fs.readFileSync(fp, 'utf8'), this.featureBefore);
});
