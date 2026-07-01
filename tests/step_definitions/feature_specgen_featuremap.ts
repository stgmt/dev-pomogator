/**
 * @feature33 / @feature42 step definitions — SPECGEN004_241–249.
 *
 * Drives the REAL orchestrator feature-map logic in-process:
 *   SPECGEN004_241–242: @feature33 — WORKFLOW routing (AC-33.1)
 *   SPECGEN004_243–245: @feature33 — checkFeatureMapDrift (AC-33.5)
 *   SPECGEN004_246–247: @feature42 — checkToolConsumers (FR-42a)
 *   SPECGEN004_248–249: @feature42 — verifyConsumerTruthfulness (FR-42b)
 *
 * All cases are pure / in-process. No mocks, no inline copies.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_241–249
 * @see .specs/spec-generator-v4/FR.md FR-33, FR-42
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import {
  WORKFLOW,
  REFERENCED_CAPABILITIES,
  checkFeatureMapDrift,
  checkToolConsumers,
  verifyConsumerTruthfulness,
  TOOL_CONSUMERS,
  type DriftResult,
  type ConsumerDriftResult,
  type TruthResult,
} from '../../.claude/skills/spec-generator-orchestrator/scripts/feature-map.ts';
import { liveCapabilities, liveTools } from '../../.claude/skills/spec-generator-orchestrator/scripts/drift-check.ts';

const REPO = path.resolve(import.meta.dirname ?? __dirname, '..', '..');

interface FeatureMapWorld extends V4World {
  driftResult?: DriftResult;
  consumerResult?: ConsumerDriftResult;
  truthResult?: TruthResult;
}

// ── SPECGEN004_241 — coverage + honesty-gate steps delegate to get_spec_status ──

Given(
  /^the orchestrator feature-map routing table is loaded$/,
  function (this: FeatureMapWorld) {
    assert.ok(WORKFLOW.length > 0, 'WORKFLOW must be non-empty');
  },
);

When(
  /^the coverage and honesty-gate workflow steps are inspected$/,
  function (this: FeatureMapWorld) {
    // Step is pure — just verify state is available (no side-effect needed).
  },
);

Then(
  /^every coverage and honesty-gate step delegates to the get_spec_status MCP tool and never re-implements it$/,
  function (this: FeatureMapWorld) {
    const steps = WORKFLOW.filter(
      (s) => s.step === 'coverage' || s.step === 'honesty-gate',
    );
    assert.ok(steps.length > 0, 'WORKFLOW must contain coverage and/or honesty-gate steps');
    for (const s of steps) {
      assert.equal(s.worker, 'get_spec_status', `step ${s.step} must delegate to get_spec_status`);
      assert.equal(s.kind, 'mcp-tool', `step ${s.step} kind must be mcp-tool`);
    }
  },
);

// ── SPECGEN004_242 — every WORKFLOW worker is in REFERENCED_CAPABILITIES ──────

When(
  /^each WORKFLOW step's worker is cross-checked against REFERENCED_CAPABILITIES$/,
  function (this: FeatureMapWorld) {
    // Pure assertion — no async or I/O.
  },
);

Then(
  /^every WORKFLOW worker appears in the referenced-capability set$/,
  function (this: FeatureMapWorld) {
    const referenced = new Set(REFERENCED_CAPABILITIES);
    for (const s of WORKFLOW) {
      assert.ok(
        referenced.has(s.worker),
        `WORKFLOW step ${s.step} delegates to ${s.worker} which is NOT in REFERENCED_CAPABILITIES`,
      );
    }
  },
);

// ── SPECGEN004_243 — checkFeatureMapDrift: clean when actual ⊆ referenced ─────

When(
  /^checkFeatureMapDrift is called with the REFERENCED_CAPABILITIES set as the actual surface$/,
  function (this: FeatureMapWorld) {
    this.driftResult = checkFeatureMapDrift(REFERENCED_CAPABILITIES);
  },
);

Then(
  /^the drift check reports ok with no unreferenced capabilities$/,
  function (this: FeatureMapWorld) {
    const r = this.driftResult!;
    assert.equal(r.ok, true, `expected ok=true, got: ${r.message}`);
    assert.deepEqual(r.unreferenced, []);
  },
);

// ── SPECGEN004_244 — checkFeatureMapDrift: unknown capability causes failure ───

When(
  /^checkFeatureMapDrift is called with a surface that includes an unknown capability "brand_new_tool"$/,
  function (this: FeatureMapWorld) {
    this.driftResult = checkFeatureMapDrift([...REFERENCED_CAPABILITIES, 'brand_new_tool']);
  },
);

Then(
  /^the drift check reports not-ok and names "brand_new_tool" as unreferenced$/,
  function (this: FeatureMapWorld) {
    const r = this.driftResult!;
    assert.equal(r.ok, false, 'drift check must fail for an unknown capability');
    assert.ok(r.unreferenced.includes('brand_new_tool'), `unreferenced must include brand_new_tool, got: ${r.unreferenced}`);
    assert.match(r.message, /brand_new_tool/);
  },
);

// ── SPECGEN004_245 — LIVE MCP registry + workers has no drift ─────────────────

When(
  /^checkFeatureMapDrift is called against the live MCP registry and worker skills$/,
  function (this: FeatureMapWorld) {
    this.driftResult = checkFeatureMapDrift(liveCapabilities());
  },
);

Then(
  /^the live capability surface has no drift against the orchestrator feature-map$/,
  function (this: FeatureMapWorld) {
    const r = this.driftResult!;
    assert.equal(
      r.ok,
      true,
      `live capability surface has drift: ${r.message}`,
    );
  },
);

// ── SPECGEN004_246 — checkToolConsumers: naked tool with no consumer fails ────

When(
  /^checkToolConsumers is called with a surface that includes "naked_new_tool" with no declared consumer$/,
  function (this: FeatureMapWorld) {
    this.consumerResult = checkToolConsumers([...Object.keys(TOOL_CONSUMERS), 'naked_new_tool']);
  },
);

Then(
  /^the consumer check reports not-ok and names "naked_new_tool" as unconsumed$/,
  function (this: FeatureMapWorld) {
    const r = this.consumerResult!;
    assert.equal(r.ok, false, 'consumer check must fail for a naked tool');
    assert.ok(r.unconsumed.includes('naked_new_tool'), `unconsumed must include naked_new_tool, got: ${r.unconsumed}`);
  },
);

// ── SPECGEN004_247 — every LIVE registry tool has a declared consumer ─────────

When(
  /^checkToolConsumers is called against the live MCP tool registry$/,
  function (this: FeatureMapWorld) {
    this.consumerResult = checkToolConsumers(liveTools());
  },
);

Then(
  /^every live MCP tool has at least one declared skill consumer$/,
  function (this: FeatureMapWorld) {
    const r = this.consumerResult!;
    assert.equal(
      r.ok,
      true,
      `live tools missing consumers: ${r.message}`,
    );
  },
);

// ── SPECGEN004_248 — verifyConsumerTruthfulness: lying declaration is flagged ──

When(
  /^verifyConsumerTruthfulness is called with an injected reader where "some-skill" never mentions "some_tool"$/,
  function (this: FeatureMapWorld) {
    this.truthResult = verifyConsumerTruthfulness(
      () => 'a skill body with no tool name',
      { some_tool: ['some-skill'] },
    );
  },
);

Then(
  /^the truth check reports not-ok and the message names "some-skill" and "some_tool"$/,
  function (this: FeatureMapWorld) {
    const r = this.truthResult!;
    assert.equal(r.ok, false, 'truth check must fail for a lying consumer declaration');
    assert.match(r.message, /some-skill/, `message must name some-skill: ${r.message}`);
    assert.match(r.message, /some_tool/, `message must name some_tool: ${r.message}`);
  },
);

// ── SPECGEN004_249 — REAL TOOL_CONSUMERS table is truthful ───────────────────

When(
  /^verifyConsumerTruthfulness is called against the real TOOL_CONSUMERS table and real SKILL\.md files$/,
  function (this: FeatureMapWorld) {
    const skillsDir = path.join(REPO, '.claude', 'skills');
    this.truthResult = verifyConsumerTruthfulness((skill) => {
      const f = path.join(skillsDir, skill, 'SKILL.md');
      return fs.existsSync(f) ? fs.readFileSync(f, 'utf-8') : null;
    });
  },
);

Then(
  /^every consumer skill in TOOL_CONSUMERS genuinely references its declared tool in its SKILL\.md$/,
  function (this: FeatureMapWorld) {
    const r = this.truthResult!;
    assert.equal(
      r.ok,
      true,
      `TOOL_CONSUMERS has false declarations: ${r.message}`,
    );
  },
);
