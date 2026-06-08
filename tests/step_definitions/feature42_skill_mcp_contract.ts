/**
 * @FR-42 step definitions — SPECGEN004_120/_121, the thin-skill/thick-server
 * layering contract (P17-9). Bound to the REAL drift-guard logic + the REAL
 * skill files — no mocks.
 *
 * @see .specs/spec-generator-v4/FR.md FR-42
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import {
  checkToolConsumers,
  TOOL_CONSUMERS,
} from '../../.claude/skills/spec-generator-orchestrator/scripts/feature-map.ts';

const REPO = path.resolve(import.meta.dirname ?? __dirname, '..', '..');

interface F42World extends V4World {
  consumerResult?: ReturnType<typeof checkToolConsumers>;
  createSpecBody?: string;
}

// _120 — a live tool with no consumer fails the guard, named.
Given('the MCP tool to skill consumer table in the design', function (this: F42World) {
  assert.ok(Object.keys(TOOL_CONSUMERS).length > 0, 'TOOL_CONSUMERS must be populated');
});

When('a new user-facing MCP tool ships without a skill consumer', function (this: F42World) {
  // Simulate a freshly-added registry tool that nobody declared a consumer for.
  const liveToolsPlusStray = [...Object.keys(TOOL_CONSUMERS), 'brand_new_unconsumed_tool'];
  this.consumerResult = checkToolConsumers(liveToolsPlusStray);
});

Then('the extended drift guard fails naming that tool', function (this: F42World) {
  assert.equal(this.consumerResult!.ok, false, 'an unconsumed tool must fail the guard');
  assert.ok(
    this.consumerResult!.unconsumed.includes('brand_new_unconsumed_tool'),
    `the guard must NAME the stray tool, got: ${this.consumerResult!.unconsumed.join(', ')}`,
  );
});

// _121 — create-spec is the entry; it drives MCP, re-implements no server logic.
Given('the create-spec skill as the user entry point', function (this: F42World) {
  this.createSpecBody = fs.readFileSync(path.join(REPO, '.claude/skills/create-spec/SKILL.md'), 'utf-8');
});

When('the user asks to create a spec', function (this: F42World) {
  // The skill IS the door — nothing to spawn here; the assertions read its body.
});

Then('the skill orchestrates the phases through MCP calls', function (this: F42World) {
  const body = this.createSpecBody!;
  // It must point at the mutation door tools (FR-42c).
  for (const tool of ['create_spec', 'apply_spec_change', 'propose_spec_change']) {
    assert.ok(body.includes(tool), `create-spec must reference the MCP mutation tool ${tool}`);
  }
  // And every tool the table credits create-spec for must really appear in it.
  for (const [tool, consumers] of Object.entries(TOOL_CONSUMERS)) {
    if ((consumers as readonly string[]).includes('create-spec')) {
      assert.ok(body.includes(tool), `TOOL_CONSUMERS credits create-spec for ${tool} — its SKILL.md must use it`);
    }
  }
});

Then('the skill body re-implements none of the server logic', function (this: F42World) {
  const body = this.createSpecBody!;
  // A thin skill must not carry server-side validation/parse logic inline.
  for (const banned of ['checkConformance', 'parseTaskBlocks', 'checkLinks(', 'buildGraph(']) {
    assert.ok(!body.includes(banned), `create-spec must NOT re-implement server logic (found ${banned})`);
  }
});
