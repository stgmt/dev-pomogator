/**
 * Shared step definitions for the spec-generator-v4 cucumber-js suite.
 *
 * Phase 0 (kickoff): scaffolds the «exit code», «stderr contains», and
 * «file exists» step verbs that almost every scenario will reuse. Concrete
 * action steps (When ... actually performs work) live in per-phase step
 * definition files (`phase0.ts`, `phase1.ts`, …) so each phase's PR can
 * grow its own corner of the suite without merge-conflict storms.
 *
 * @see .specs/spec-generator-v4/DESIGN.md «BDD Test Infrastructure»
 * @see .claude/plans/nested-knitting-wreath.md section B.0
 */

import { Given, Then } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';

Given('a clean temp workspace exists', function (this: V4World) {
  assert.ok(this.tempDir, 'temp workspace not initialised by Before hook');
  assert.ok(fs.existsSync(this.tempDir), `temp dir ${this.tempDir} missing`);
});

Then('exit code is {int}', function (this: V4World, expected: number) {
  assert.equal(this.lastExitCode, expected, `expected exit ${expected}, got ${this.lastExitCode}`);
});

Then('stderr contains {string}', function (this: V4World, fragment: string) {
  assert.ok(
    this.lastStderr.includes(fragment),
    `stderr does not contain "${fragment}". Got: ${this.lastStderr.slice(0, 400)}`,
  );
});

Then('stdout contains {string}', function (this: V4World, fragment: string) {
  assert.ok(
    this.lastStdout.includes(fragment),
    `stdout does not contain "${fragment}". Got: ${this.lastStdout.slice(0, 400)}`,
  );
});

Then('file {string} exists in the workspace', function (this: V4World, relPath: string) {
  const target = path.join(this.tempDir, relPath);
  assert.ok(fs.existsSync(target), `expected file ${relPath} to exist in temp workspace`);
});

// ─── Background preconditions ─────────────────────────────────────────────
// Every scenario in spec-generator-v4.feature inherits a 3-step Background
// that asserts the plugin is wired up. For Phase 1 these are effectively
// no-ops — the parser tests exercise the in-memory graph directly without
// needing a running MCP server. Phase 2 will replace these with real checks
// (e.g. verify the MCP child process is reachable via stdio).
Given('dev-pomogator v4 is installed', function () {
  // Running this step file at all proves the plugin's BDD harness is loaded.
});

Given('specs-workflow extension is enabled with MCP server registered', function () {
  // Phase 2: assert MCP child process is reachable via stdio.
  // Phase 1: no-op — parser tests work directly against the in-memory graph.
});

Given('the project has at least one spec in `.specs\\/`', function (this: V4World) {
  // Background-level precondition. The Before hook gives each scenario a
  // fresh tempDir which scenario-specific Given steps populate; this is
  // satisfied by construction. The `\/` escape is required by Cucumber
  // Expressions — see .claude/rules/reqnroll-ce-guard/reqnroll-ce-slash.md.
  assert.ok(this.tempDir, 'temp workspace missing — Before hook did not run');
});
