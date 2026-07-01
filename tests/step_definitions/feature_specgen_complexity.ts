/**
 * @feature12 step definitions — SPECGEN004_234–240 (FR-12 complexity heuristic).
 *
 * Drives the REAL `detectComplexity()` pure function in-process.
 * Covers the 7 vitest cases from
 * `.claude/skills/create-spec/scripts/__tests__/complexity-heuristic.test.ts`.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_234–240
 * @see .specs/spec-generator-v4/FR.md FR-12
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import {
  detectComplexity,
  type HeuristicResult,
} from '../../.claude/skills/create-spec/scripts/complexity-heuristic.ts';
import { V4World } from '../hooks/before-after.ts';

interface ComplexityWorld extends V4World {
  complexityResult?: HeuristicResult;
}

// ── SPECGEN004_234 — Russian keyword ──────────────────────────────────────────

Given(
  /^the create-spec complexity heuristic is available$/,
  function (this: ComplexityWorld) {
    // No setup — pure function, no I/O.
  },
);

When(
  /^detectComplexity is called with a prompt containing the Russian "архитектура" keyword$/,
  function (this: ComplexityWorld) {
    this.complexityResult = detectComplexity('Нужна новая архитектура для биллинга.');
  },
);

Then(
  /^the verdict is "use-architecture-research-workflow" and at least one keyword hit is recorded$/,
  function (this: ComplexityWorld) {
    const r = this.complexityResult!;
    assert.equal(r.verdict, 'use-architecture-research-workflow');
    assert.ok(r.keywordHits.length > 0, `expected ≥1 keyword hit, got: ${JSON.stringify(r.keywordHits)}`);
  },
);

// ── SPECGEN004_235 — English "rebuild" keyword ────────────────────────────────

When(
  /^detectComplexity is called with an English "rebuild" keyword$/,
  function (this: ComplexityWorld) {
    this.complexityResult = detectComplexity('We need to rebuild the auth subsystem.');
  },
);

Then(
  /^the verdict is "use-architecture-research-workflow"$/,
  function (this: ComplexityWorld) {
    assert.equal(this.complexityResult!.verdict, 'use-architecture-research-workflow');
  },
);

// ── SPECGEN004_236 — Version-bump keyword "v4" ───────────────────────────────

When(
  /^detectComplexity is called with a version-bump keyword like "v4"$/,
  function (this: ComplexityWorld) {
    this.complexityResult = detectComplexity('Plan for v4');
  },
);

Then(
  /^the verdict is "use-architecture-research-workflow" for version prompts$/,
  function (this: ComplexityWorld) {
    assert.equal(this.complexityResult!.verdict, 'use-architecture-research-workflow');
    // Verify v12 also triggers
    const r2 = detectComplexity('Bump to v12');
    assert.equal(r2.verdict, 'use-architecture-research-workflow');
  },
);

// ── SPECGEN004_237 — ≥3 PascalCase component nouns ───────────────────────────

When(
  /^detectComplexity is called with a prompt that lists ≥3 PascalCase component nouns$/,
  function (this: ComplexityWorld) {
    this.complexityResult = detectComplexity(
      'AuthService, BillingProcessor, EventBus, AnalyticsPipeline need wiring.',
    );
  },
);

Then(
  /^the verdict is "use-architecture-research-workflow" and at least 3 components are detected$/,
  function (this: ComplexityWorld) {
    const r = this.complexityResult!;
    assert.equal(r.verdict, 'use-architecture-research-workflow');
    assert.ok(
      r.components.length >= 3,
      `expected ≥3 components, got ${r.components.length}: ${r.components.join(', ')}`,
    );
  },
);

// ── SPECGEN004_238 — No keyword and <3 components → research-workflow ─────────

When(
  /^detectComplexity is called with a plain prompt with no keyword and fewer than 3 component nouns$/,
  function (this: ComplexityWorld) {
    this.complexityResult = detectComplexity('Add a CLI flag --dry-run to migrate-script.');
  },
);

Then(
  /^the verdict is "use-research-workflow"$/,
  function (this: ComplexityWorld) {
    assert.equal(this.complexityResult!.verdict, 'use-research-workflow');
  },
);

// ── SPECGEN004_239 — Keyword wins over component count (early exit) ───────────

When(
  /^detectComplexity is called with a prompt containing both a keyword and ≥3 component nouns$/,
  function (this: ComplexityWorld) {
    this.complexityResult = detectComplexity('Rebuild AuthService BillingService EventBus.');
  },
);

Then(
  /^the verdict is "use-architecture-research-workflow" with the reason citing keywords not components$/,
  function (this: ComplexityWorld) {
    const r = this.complexityResult!;
    assert.equal(r.verdict, 'use-architecture-research-workflow');
    assert.match(r.reason, /keyword/, `expected reason to cite keywords, got: ${r.reason}`);
  },
);

// ── SPECGEN004_240 — Plain-language reason explanation ───────────────────────

When(
  /^detectComplexity is called with a simple refactor prompt$/,
  function (this: ComplexityWorld) {
    this.complexityResult = detectComplexity('refactor a small function');
  },
);

Then(
  /^the verdict is "use-research-workflow" and the reason mentions no architecture keyword and the threshold$/,
  function (this: ComplexityWorld) {
    const r = this.complexityResult!;
    assert.equal(r.verdict, 'use-research-workflow');
    assert.match(r.reason, /no architecture keyword/, `reason missing "no architecture keyword": ${r.reason}`);
    assert.match(r.reason, /threshold/, `reason missing "threshold": ${r.reason}`);
  },
);
