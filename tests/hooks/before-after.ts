/**
 * Cucumber-js global lifecycle hooks for spec-generator-v4 BDD suite.
 *
 * Phase 0 (kickoff): minimal scaffolding. BeforeAll / AfterAll are stubs —
 * Phase 2 will spawn the MCP server here and tear it down after the run.
 * Before / After are per-scenario: create a fresh temp workspace dir for the
 * scenario's World, then remove it afterwards so tests are isolated.
 *
 * @see .specs/spec-generator-v4/DESIGN.md «BDD Test Infrastructure»
 * @see .specs/spec-generator-v4/FR.md FR-1 (Phase 0)
 * @see .claude/plans/nested-knitting-wreath.md section B.0
 */

import { BeforeAll, AfterAll, Before, After, setWorldConstructor, World } from '@cucumber/cucumber';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Per-scenario World — holds the temp workspace dir and a place for step
 * definitions to stash state during a scenario. Phase 2 will attach an MCP
 * client handle here as well.
 */
export class V4World extends World {
  public tempDir: string = '';
  public lastExitCode: number | null = null;
  public lastStderr: string = '';
  public lastStdout: string = '';
}

setWorldConstructor(V4World);

BeforeAll(async function () {
  // Phase 0 stub. Phase 2 will spawn the MCP server here (single instance
  // for the run) and run a stdio `initialize` handshake before any scenario.
});

Before(async function (this: V4World) {
  // Fresh temp workspace per scenario keeps tests independent. We use a
  // UUID rather than the scenario name to avoid path-unsafe characters.
  this.tempDir = path.join(os.tmpdir(), `v4-test-${randomUUID()}`);
  fs.mkdirSync(this.tempDir, { recursive: true });
});

After(async function (this: V4World) {
  if (this.tempDir && fs.existsSync(this.tempDir)) {
    fs.rmSync(this.tempDir, { recursive: true, force: true });
  }
});

AfterAll(async function () {
  // Phase 0 stub. Phase 2 will send `shutdown` + `exit` to the MCP server
  // and wait for the subprocess to terminate cleanly.
});
