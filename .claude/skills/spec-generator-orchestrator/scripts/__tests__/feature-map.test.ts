/**
 * Tests for the orchestrator feature map + drift guard (FR-33 / AC-33.1, 33.5).
 */
import { describe, it, expect } from 'vitest';
import {
  WORKFLOW,
  REFERENCED_CAPABILITIES,
  checkFeatureMapDrift,
} from '../feature-map.ts';
import { liveCapabilities } from '../drift-check.ts';

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
