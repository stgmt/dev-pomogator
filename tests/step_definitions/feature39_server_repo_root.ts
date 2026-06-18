/**
 * @feature39 step definitions (FR-39 — MCP server repo-root resolution) — SPECGEN004_217.
 *
 * P3-rollout migration of tools/spec-mcp-server/__tests__/server-repo-root.test.ts (4 artifact).
 * Regression for the P17-6 live-diagnosis: a headless launch passed the unresolved
 * `${CLAUDE_PROJECT_DIR}` literal as the repo-root env, so the server built its graph from a
 * nonexistent path and every get_node/get_trace returned NODE_NOT_FOUND. resolveRepoRoot now trusts
 * the env ONLY when it is a real dir containing `.specs/`, else falls back to cwd. Drives the REAL
 * resolveRepoRoot over real tmpdirs. vitest twin kept until the gate-switch.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_217
 * @see tools/spec-mcp-server/server.ts (resolveRepoRoot)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveRepoRoot } from '../../tools/spec-mcp-server/server.ts';
import { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';

interface SrrWorld extends V4World {
  srrRepo?: string;
  srrCwd?: string;
  srrResults?: Record<string, string>;
}

Given('a real repo dir and a cwd both holding a specs tree', function (this: SrrWorld) {
  const repo = path.join(os.tmpdir(), `srr-repo-${randomUUID()}`);
  const cwd = path.join(os.tmpdir(), `srr-cwd-${randomUUID()}`);
  fs.mkdirSync(path.join(repo, '.specs'), { recursive: true });
  fs.mkdirSync(path.join(cwd, '.specs'), { recursive: true });
  this.srrRepo = repo;
  this.srrCwd = cwd;
});

When('resolveRepoRoot is given a valid env path the unresolved project-dir literal a no-specs path and an empty env', function (this: SrrWorld) {
  const noSpecs = path.join(os.tmpdir(), `srr-nospecs-${randomUUID()}`);
  fs.mkdirSync(noSpecs, { recursive: true });
  this.srrResults = {
    valid: resolveRepoRoot(this.srrRepo!, this.srrCwd!),
    literal: resolveRepoRoot('${CLAUDE_PROJECT_DIR}', this.srrCwd!),
    noSpecs: resolveRepoRoot(noSpecs, this.srrCwd!),
    undef: resolveRepoRoot(undefined, this.srrCwd!),
    empty: resolveRepoRoot('', this.srrCwd!),
  };
  fs.rmSync(noSpecs, { recursive: true, force: true });
});

Then('it trusts a valid env path and falls back to cwd for the literal a no-specs path and an empty or missing env', function (this: SrrWorld) {
  const r = this.srrResults!;
  assert.equal(r.valid, this.srrRepo, 'a real env dir containing .specs/ is trusted');
  assert.equal(r.literal, this.srrCwd, 'the unresolved ${CLAUDE_PROJECT_DIR} literal falls back to cwd');
  assert.equal(r.noSpecs, this.srrCwd, 'an env dir without .specs/ falls back to cwd');
  assert.equal(r.undef, this.srrCwd, 'undefined env falls back to cwd');
  assert.equal(r.empty, this.srrCwd, 'empty env falls back to cwd');
  fs.rmSync(this.srrRepo!, { recursive: true, force: true });
  fs.rmSync(this.srrCwd!, { recursive: true, force: true });
});
