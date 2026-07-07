/**
 * Phase 9 Green tests: full AJV schema validation (@feature2 @feature10 + FR-20).
 * Covers: ONBOARD019 (schema conformance), ONBOARD020 (AI-first sections mandatory),
 * ONBOARD021 (violation abort), ONBOARD022 (via_skill consistency).
 *
 * These tests exercise AJV-specific behavior (format validation, enum, pattern,
 * custom keyword) beyond what Phase 8 minimal validator tested.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fsExtra from 'fs-extra';
import {
  validateOnboardingJson,
  validateOrThrow,
  SchemaViolationError,
  resetValidatorCache,
} from '../../../extensions/onboard-repo/tools/onboard-repo/lib/schema-validator.ts';


const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const GOLDEN_JSON = path.join(REPO_ROOT, 'tests', 'fixtures', 'onboarding-artifacts', 'valid-v1.json');
const INVALID_JSON = path.join(REPO_ROOT, 'tests', 'fixtures', 'onboarding-artifacts', 'invalid-schema.json');


describe('Phase 9: Schema validation (FR-20)', () => {
  beforeEachReset();

  // ONBOARD019
  it('ONBOARD019: F-16 valid-v1.json passes full AJV schema', async () => {
    const raw = await fsExtra.readJson(GOLDEN_JSON);
    const result = validateOnboardingJson(raw);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  // ONBOARD021 via golden fixture
  it('ONBOARD021: F-18 invalid-schema.json fails with multiple errors', async () => {
    const raw = await fsExtra.readJson(INVALID_JSON);
    const result = validateOnboardingJson(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(5);
  });

  it('ONBOARD021: non-object input fails early', () => {
    expect(validateOnboardingJson(null).valid).toBe(false);
    expect(validateOnboardingJson('string').valid).toBe(false);
    expect(validateOnboardingJson(42).valid).toBe(false);
    expect(validateOnboardingJson([]).valid).toBe(false);
  });

  // ONBOARD020: AI-first sections — type check enforced
  it('ONBOARD020: rules_index as object (not array) fails', async () => {
    const raw = (await fsExtra.readJson(GOLDEN_JSON)) as Record<string, unknown>;
    raw.rules_index = {};
    const result = validateOnboardingJson(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('rules_index'))).toBe(true);
  });

  it('ONBOARD020: boundaries missing always/never fails', async () => {
    const raw = (await fsExtra.readJson(GOLDEN_JSON)) as Record<string, unknown>;
    raw.boundaries = { ask_first: [] }; // missing always + never
    const result = validateOnboardingJson(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('always'))).toBe(true);
    expect(result.errors.some((e) => e.includes('never'))).toBe(true);
  });

  // ONBOARD022 via_skill custom keyword
  it('ONBOARD022: via_skill set + forbidden=true without raw_pattern_to_block fails', async () => {
    const raw = (await fsExtra.readJson(GOLDEN_JSON)) as Record<string, unknown>;
    const commands = { ...(raw.commands as Record<string, unknown>) };
    commands.test = {
      via_skill: 'run-tests',
      preferred_invocation: '/run-tests',
      fallback_cmd: 'pytest',
      raw_pattern_to_block: '',
      forbidden_if_skill_present: true,
      reason: 'demo',
    };
    raw.commands = commands;
    const result = validateOnboardingJson(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('raw_pattern_to_block') && e.includes('FR-18'))).toBe(true);
  });

  it('ONBOARD022: invalid regex in raw_pattern_to_block fails', async () => {
    const raw = (await fsExtra.readJson(GOLDEN_JSON)) as Record<string, unknown>;
    const commands = { ...(raw.commands as Record<string, unknown>) };
    commands.test = {
      via_skill: 'run-tests',
      preferred_invocation: '/run-tests',
      fallback_cmd: 'pytest',
      raw_pattern_to_block: '[unclosed-bracket',
      forbidden_if_skill_present: true,
      reason: 'demo',
    };
    raw.commands = commands;
    const result = validateOnboardingJson(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('invalid regex'))).toBe(true);
  });

  it('ONBOARD022: via_skill=null with forbidden=false OK (no block needed)', async () => {
    const raw = (await fsExtra.readJson(GOLDEN_JSON)) as Record<string, unknown>;
    const commands = { ...(raw.commands as Record<string, unknown>) };
    commands.test = {
      via_skill: null,
      preferred_invocation: 'npm test',
      fallback_cmd: 'npm test',
      raw_pattern_to_block: '',
      forbidden_if_skill_present: false,
      reason: 'No wrapper available',
    };
    raw.commands = commands;
    const result = validateOnboardingJson(raw);
    expect(result.valid).toBe(true);
  });

  // Format validation — date-time
  it('indexed_at must be ISO-8601 date-time', async () => {
    const raw = (await fsExtra.readJson(GOLDEN_JSON)) as Record<string, unknown>;
    raw.indexed_at = 'not-a-date';
    const result = validateOnboardingJson(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('indexed_at'))).toBe(true);
  });

  // Pattern validation — SHA
  it('last_indexed_sha must match ^[a-f0-9]{40}$ or empty', async () => {
    const raw = (await fsExtra.readJson(GOLDEN_JSON)) as Record<string, unknown>;
    raw.last_indexed_sha = 'not-a-sha';
    const result = validateOnboardingJson(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('last_indexed_sha'))).toBe(true);

    // Empty string still valid (non-git repo)
    raw.last_indexed_sha = '';
    const result2 = validateOnboardingJson(raw);
    expect(result2.valid).toBe(true);
  });

  // Enum validation — archetype
  it('archetype enum enforced', async () => {
    const raw = (await fsExtra.readJson(GOLDEN_JSON)) as Record<string, unknown>;
    raw.archetype = 'bogus';
    const result = validateOnboardingJson(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('archetype'))).toBe(true);
  });

  // Nested enum — hooks_registry.event
  it('hooks_registry.event enum enforced', async () => {
    const raw = (await fsExtra.readJson(GOLDEN_JSON)) as Record<string, unknown>;
    raw.hooks_registry = [
      { event: 'NotARealEvent', matcher: 'Bash', action: 'x', path: '.claude/settings.json' },
    ];
    const result = validateOnboardingJson(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('event'))).toBe(true);
  });

  // Nested enum — gotchas.severity
  it('gotchas.severity enum enforced', async () => {
    const raw = (await fsExtra.readJson(GOLDEN_JSON)) as Record<string, unknown>;
    raw.gotchas = [{ symptom: 'x', cause: 'y', fix: 'z', severity: 'epic' }];
    const result = validateOnboardingJson(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('severity'))).toBe(true);
  });

  // Nested enum — ingestion.method
  it('ingestion.method enum enforced', async () => {
    const raw = (await fsExtra.readJson(GOLDEN_JSON)) as Record<string, unknown>;
    raw.ingestion = { method: 'not-a-method' };
    const result = validateOnboardingJson(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('method'))).toBe(true);
  });

  // validateOrThrow
  it('validateOrThrow throws SchemaViolationError with all errors', async () => {
    const raw = await fsExtra.readJson(INVALID_JSON);
    try {
      validateOrThrow(raw);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SchemaViolationError);
      const svErr = err as SchemaViolationError;
      expect(svErr.errors.length).toBeGreaterThan(0);
      expect(svErr.message).toContain('Schema violation');
    }
  });

  // Integer minimum
  it('phase0_duration_ms must be non-negative integer', async () => {
    const raw = (await fsExtra.readJson(GOLDEN_JSON)) as Record<string, unknown>;
    raw.phase0_duration_ms = -1;
    const result = validateOnboardingJson(raw);
    expect(result.valid).toBe(false);
  });

  // baseline_tests structure
  it('baseline_tests.framework allows null (no framework detected)', async () => {
    const raw = (await fsExtra.readJson(GOLDEN_JSON)) as Record<string, unknown>;
    raw.baseline_tests = {
      framework: null,
      command: '',
      via_skill: null,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration_s: 0,
      failed_test_ids: [],
      reason_if_null: 'no test framework detected',
      skipped_by_user: false,
    };
    const result = validateOnboardingJson(raw);
    expect(result.valid).toBe(true);
  });

  // Caching
  it('validator compiled once (cache)', async () => {
    const raw = await fsExtra.readJson(GOLDEN_JSON);
    // First call compiles
    expect(validateOnboardingJson(raw).valid).toBe(true);
    // Subsequent calls reuse cached compiled validator
    expect(validateOnboardingJson(raw).valid).toBe(true);
    expect(validateOnboardingJson(raw).valid).toBe(true);
    // Reset → next call recompiles (should still pass)
    resetValidatorCache();
    expect(validateOnboardingJson(raw).valid).toBe(true);
  });
});


function beforeEachReset(): void {
  // Reset cache before every test to avoid leaking state between test runs
  // (e.g., schema reload scenarios)
  import('vitest').then(({ beforeEach }) => beforeEach(() => resetValidatorCache()));
}
