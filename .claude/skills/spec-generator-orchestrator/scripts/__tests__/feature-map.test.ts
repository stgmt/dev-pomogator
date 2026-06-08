/**
 * Tests for the orchestrator feature map + drift guard (FR-33 / AC-33.1, 33.5).
 */
import { describe, it, expect } from 'vitest';
import {
  WORKFLOW,
  REFERENCED_CAPABILITIES,
  checkFeatureMapDrift,
  checkToolConsumers,
  verifyConsumerTruthfulness,
  TOOL_CONSUMERS,
} from '../feature-map.ts';
import { liveCapabilities, liveTools } from '../drift-check.ts';

describe('feature map routing (AC-33.1 — delegate, never re-implement)', () => {
  it('routes the coverage + honesty-gate steps to the get_coverage MCP tool', () => {
    const coverage = WORKFLOW.filter((s) => s.step === 'coverage' || s.step === 'honesty-gate');
    expect(coverage.length).toBeGreaterThan(0);
    for (const s of coverage) {
      expect(s.worker).toBe('get_coverage');
      expect(s.kind).toBe('mcp-tool');
    }
  });

  it('every workflow worker is in the referenced-capability set', () => {
    const referenced = new Set(REFERENCED_CAPABILITIES);
    for (const s of WORKFLOW) expect(referenced.has(s.worker)).toBe(true);
  });
});

describe('checkFeatureMapDrift (AC-33.5)', () => {
  it('is clean when actual ⊆ referenced', () => {
    const res = checkFeatureMapDrift(REFERENCED_CAPABILITIES);
    expect(res.ok).toBe(true);
    expect(res.unreferenced).toEqual([]);
  });

  it('fails and names a capability the feature map does not reference', () => {
    const res = checkFeatureMapDrift([...REFERENCED_CAPABILITIES, 'brand_new_tool']);
    expect(res.ok).toBe(false);
    expect(res.unreferenced).toEqual(['brand_new_tool']);
    expect(res.message).toMatch(/brand_new_tool/);
  });

  it('the LIVE capability surface (real MCP registry + workers) has no drift', () => {
    // The honesty discipline turned on the orchestrator itself: if a tool was
    // added to the registry without updating REFERENCED_CAPABILITIES, this fails.
    const res = checkFeatureMapDrift(liveCapabilities());
    expect(res.ok).toBe(true);
  });
});

describe('FR-42 layering contract (thin skill, thick server)', () => {
  it('FR-42a: flags a live MCP tool with no skill consumer, naming it', () => {
    const res = checkToolConsumers([...Object.keys(TOOL_CONSUMERS), 'naked_new_tool']);
    expect(res.ok).toBe(false);
    expect(res.unconsumed).toContain('naked_new_tool');
  });

  it('FR-42a: every LIVE registry tool has a declared consumer', () => {
    expect(checkToolConsumers(liveTools()).ok).toBe(true);
  });

  it('FR-42b: flags a LYING declaration — consumer skill that never references the tool', () => {
    // injected reader: the skill exists but does NOT mention the tool.
    const res = verifyConsumerTruthfulness(() => 'a skill body with no tool name', { some_tool: ['some-skill'] });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/some-skill.*some_tool/);
  });

  it('FR-42b: the REAL TOOL_CONSUMERS table is truthful (every consumer skill uses its tool)', () => {
    // caught 2026-06-07: spec-status was credited for get_coverage/get_spec_status it never named.
    const fs2 = require('node:fs'); const path2 = require('node:path');
    const dir = path2.resolve(__dirname, '..', '..', '..');
    const res = verifyConsumerTruthfulness((skill) => {
      const f = path2.join(dir, skill, 'SKILL.md');
      return fs2.existsSync(f) ? fs2.readFileSync(f, 'utf-8') : null;
    });
    expect(res.ok, res.message).toBe(true);
  });
});

