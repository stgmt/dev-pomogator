// Tests for the create-spec complexity heuristic (SPECGEN004_28 / FR-12).

import { describe, it, expect } from 'vitest';
import { detectComplexity } from '../complexity-heuristic.ts';

describe('detectComplexity', () => {
  it('routes to architecture-research-workflow on Russian "архитектура" keyword', () => {
    const r = detectComplexity('Нужна новая архитектура для биллинга.');
    expect(r.verdict).toBe('use-architecture-research-workflow');
    expect(r.keywordHits.length).toBeGreaterThan(0);
  });

  it('routes to architecture-research-workflow on English "rebuild"', () => {
    const r = detectComplexity('We need to rebuild the auth subsystem.');
    expect(r.verdict).toBe('use-architecture-research-workflow');
  });

  it('routes to architecture-research-workflow on version-bump keyword like "v4"', () => {
    expect(detectComplexity('Plan for v4').verdict).toBe('use-architecture-research-workflow');
    expect(detectComplexity('Bump to v12').verdict).toBe('use-architecture-research-workflow');
  });

  it('routes to architecture-research-workflow when ≥3 component nouns present', () => {
    const r = detectComplexity(
      'AuthService, BillingProcessor, EventBus, AnalyticsPipeline need wiring.',
    );
    expect(r.verdict).toBe('use-architecture-research-workflow');
    expect(r.components.length).toBeGreaterThanOrEqual(3);
  });

  it('routes to regular research-workflow when no keyword + <3 components', () => {
    const r = detectComplexity('Add a CLI flag --dry-run to migrate-script.');
    expect(r.verdict).toBe('use-research-workflow');
  });

  it('keyword wins over component count (early exit)', () => {
    const r = detectComplexity('Rebuild AuthService BillingService EventBus.');
    expect(r.verdict).toBe('use-architecture-research-workflow');
    expect(r.reason).toMatch(/keyword/);
  });

  it('explains the verdict in plain language', () => {
    const r = detectComplexity('refactor a small function');
    expect(r.reason).toMatch(/no architecture keyword/);
    expect(r.reason).toMatch(/threshold/);
  });
});
