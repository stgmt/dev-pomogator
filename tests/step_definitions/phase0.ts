/**
 * Phase 0 step definitions — SPECGEN004_01 (cucumber-js canonical NDJSON) and
 * SPECGEN004_02 (per-spec NDJSON split).
 *
 * _01 asserts dev-pomogator's REAL cucumber-js wiring (package.json deps,
 * cucumber.json message format, step_definitions present) and parses a real
 * cucumber output via `@cucumber/messages`. The NDJSON artifact under test is a
 * committed real cucumber-js run (verify-against-real-artifact) — spawning
 * `npm run test:bdd` from inside a scenario would recurse.
 *
 * _02 drives the real `splitNdjsonBySpec` ingest over that master and asserts
 * each `.specs/<slug>/.test-results.ndjson` shard carries only its own pickles
 * while the master is preserved.
 *
 * All step patterns are REGEX (not Cucumber Expressions) because the phrases
 * contain `/`, which a Cucumber Expression treats as alternation — see
 * .claude/rules/reqnroll-ce-guard/reqnroll-ce-slash.md.
 *
 * @see .specs/spec-generator-v4/FR.md FR-1
 * @see ../../tools/bash-post-test/ingest.ts (splitNdjsonBySpec)
 */

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseEnvelope } from '@cucumber/messages';
import { splitNdjsonBySpec, type SplitResult } from '../../tools/bash-post-test/ingest.ts';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = process.cwd();
/** A real cucumber-js run over a 2-spec (auth + billing) project. */
const REAL_NDJSON_FIXTURE = path.join(REPO_ROOT, 'tests/fixtures/ndjson/two-spec-master.ndjson');

interface Phase0World extends V4World {
  ndjsonArtifact?: string;
  splitResult?: SplitResult;
}

const readLines = (file: string): string[] =>
  fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim().length > 0);

const pickleUrisIn = (file: string): string[] => {
  const out: string[] = [];
  for (const line of readLines(file)) {
    const o = JSON.parse(line) as { pickle?: { uri?: string } };
    if (o.pickle?.uri) out.push(o.pickle.uri.replace(/\\/g, '/'));
  }
  return out;
};

// ── SPECGEN004_01 — cucumber-js generates canonical NDJSON ──────────────────

Given(/package\.json has .@cucumber\/cucumber. and .@cucumber\/messages. deps installed/, function () {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  assert.ok(deps['@cucumber/cucumber'], '@cucumber/cucumber must be a declared dependency');
  assert.ok(deps['@cucumber/messages'], '@cucumber/messages must be a declared dependency');
});

Given(/.cucumber\.json. config has .format: "message:/, function () {
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'cucumber.json'), 'utf8')) as {
    default?: { format?: string[] };
  };
  const formats = cfg.default?.format ?? [];
  assert.ok(
    formats.some((f) => f === 'message:.dev-pomogator/.last-test-run.ndjson'),
    `cucumber.json must emit the message NDJSON; got ${JSON.stringify(formats)}`,
  );
});

Given(/.tests\/step_definitions\/. contains step impls for .* files/, function () {
  const dir = path.join(REPO_ROOT, 'tests', 'step_definitions');
  const impls = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));
  assert.ok(impls.length > 0, 'tests/step_definitions must contain step implementation files');
});

When(/the developer runs .npm run test:bdd./, function (this: Phase0World) {
  // Re-running the suite from inside a scenario would recurse — the committed
  // fixture is a real cucumber-js run standing in for the developer's invocation.
  this.ndjsonArtifact = REAL_NDJSON_FIXTURE;
});

Then(/.\.dev-pomogator\/\.last-test-run\.ndjson. is created/, function (this: Phase0World) {
  assert.ok(fs.existsSync(this.ndjsonArtifact!), 'the message NDJSON artifact must exist');
});

Then(/the file is parseable via .@cucumber\/messages. package/, function (this: Phase0World) {
  // parseEnvelope throws on a non-conforming Cucumber Message — so a clean pass
  // over every line proves the file is genuinely @cucumber/messages-parseable.
  let parsed = 0;
  for (const line of readLines(this.ndjsonArtifact!)) {
    const env = parseEnvelope(line);
    assert.ok(env && typeof env === 'object', 'parseEnvelope returned a non-object');
    parsed++;
  }
  assert.ok(parsed > 0, 'expected at least one parseable envelope');
});

Then(/the file contains .*gherkinDocument.*pickle.*testCase.*envelopes/, function (this: Phase0World) {
  const keys = new Set<string>();
  for (const line of readLines(this.ndjsonArtifact!)) keys.add(Object.keys(JSON.parse(line))[0]);
  for (const required of [
    'gherkinDocument',
    'pickle',
    'testCase',
    'testCaseStarted',
    'testStepFinished',
    'testCaseFinished',
  ]) {
    assert.ok(keys.has(required), `NDJSON is missing the ${required} envelope`);
  }
});

// ── SPECGEN004_02 — per-spec NDJSON split ───────────────────────────────────

Given(/the master .\.dev-pomogator\/\.last-test-run\.ndjson. exists after a test run/, function (
  this: Phase0World,
) {
  const master = path.join(this.tempDir, '.dev-pomogator', '.last-test-run.ndjson');
  fs.mkdirSync(path.dirname(master), { recursive: true });
  fs.copyFileSync(REAL_NDJSON_FIXTURE, master);
  this.ndjsonArtifact = master;
});

Given(/the file contains pickles from .* and .*/, function (this: Phase0World) {
  const uris = pickleUrisIn(this.ndjsonArtifact!);
  assert.ok(uris.some((u) => u.includes('.specs/auth/')), 'fixture must carry an auth pickle');
  assert.ok(uris.some((u) => u.includes('.specs/billing/')), 'fixture must carry a billing pickle');
});

When(/the bash-post-test-ingest hook fires/, function (this: Phase0World) {
  this.splitResult = splitNdjsonBySpec({ masterPath: this.ndjsonArtifact!, repoRoot: this.tempDir });
});

Then(/.\.specs\/auth\/\.test-results\.ndjson. is created containing only auth/, function (
  this: Phase0World,
) {
  const shard = path.join(this.tempDir, '.specs', 'auth', '.test-results.ndjson');
  assert.ok(fs.existsSync(shard), 'auth shard must be created');
  const uris = pickleUrisIn(shard);
  assert.ok(uris.length > 0, 'auth shard must carry at least one pickle');
  assert.ok(
    uris.every((u) => u.includes('.specs/auth/')),
    `auth shard must contain ONLY auth pickles, got ${JSON.stringify(uris)}`,
  );
});

Then(/.\.specs\/billing\/\.test-results\.ndjson. is created containing only billing/, function (
  this: Phase0World,
) {
  const shard = path.join(this.tempDir, '.specs', 'billing', '.test-results.ndjson');
  assert.ok(fs.existsSync(shard), 'billing shard must be created');
  const uris = pickleUrisIn(shard);
  assert.ok(uris.length > 0, 'billing shard must carry at least one pickle');
  assert.ok(
    uris.every((u) => u.includes('.specs/billing/')),
    `billing shard must contain ONLY billing pickles, got ${JSON.stringify(uris)}`,
  );
});

Then(/master NDJSON is preserved/, function (this: Phase0World) {
  assert.ok(fs.existsSync(this.ndjsonArtifact!), 'master NDJSON must remain on disk');
  const uris = pickleUrisIn(this.ndjsonArtifact!);
  assert.ok(
    uris.some((u) => u.includes('.specs/auth/')) && uris.some((u) => u.includes('.specs/billing/')),
    'master must still carry both specs after the split',
  );
});
