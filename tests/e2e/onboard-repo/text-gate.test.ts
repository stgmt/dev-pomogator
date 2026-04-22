/**
 * Phase 7 Green tests: text gate (@feature6).
 * Covers: ONBOARD010 (confirm), ONBOARD011 (iterate on correction), ONBOARD012 (3-iter abort).
 */

import { describe, it, expect } from 'vitest';
import {
  classifyResponse,
  composeSummary,
  runTextGate,
  type TextGateContext,
  type TextGateDeps,
  MAX_ITERATIONS,
} from '../../../extensions/onboard-repo/tools/onboard-repo/steps/text-gate.ts';


function makeContext(overrides: Partial<TextGateContext> = {}): TextGateContext {
  return {
    archetype: { archetype: 'python-api', confidence: 'high', evidence: 'pyproject.toml' },
    recon: {
      languages: [{ name: 'python', version: '3.11+', usage: 'all' }],
      frameworks: [{ name: 'FastAPI', version: '0.110', role: 'web framework' }],
      package_managers: ['uv'],
      manifests_found: ['pyproject.toml'],
      required_env_vars: [
        { var: 'DATABASE_URL', purpose: 'Postgres', found_in: ['.env.example'] },
        { var: 'JWT_SECRET', purpose: 'auth', found_in: ['.env.example'] },
      ],
      ci_configs: [],
      test_framework: 'pytest',
      test_commands: ['uv run pytest'],
      bdd_present: false,
      existing_ai_configs: [],
      entry_points: [{ file: 'src/main.py', role: 'FastAPI entry' }],
      top_level_dirs: ['src', 'tests'],
      architecture_hint: 'layered FastAPI',
      sub_archetypes: undefined,
      warnings: [],
      failed_subagents: [],
    },
    baseline: {
      framework: 'pytest',
      command: 'uv run pytest',
      via_skill: 'run-tests',
      passed: 145,
      failed: 2,
      skipped: 0,
      duration_s: 47,
      failed_test_ids: ['tests/a::test_a', 'tests/b::test_b'],
      reason_if_null: null,
      skipped_by_user: false,
    },
    project: { name: 'fake-python-api' },
    ...overrides,
  };
}


describe('Phase 7: Text gate (@feature6)', () => {
  // classifier unit tests
  describe('classifyResponse', () => {
    it('confirm synonyms (RU + EN)', () => {
      const cases = ['да', 'да, верно', 'верно', 'правильно', 'точно', 'yes', 'Yes, correct', 'yep', 'ok', 'okay'];
      for (const input of cases) expect(classifyResponse(input)).toBe('confirm');
    });

    it('abort synonyms', () => {
      const cases = ['abort', 'cancel', 'прервать', 'отмена', 'stop', 'quit', 'выход'];
      for (const input of cases) expect(classifyResponse(input)).toBe('abort');
    });

    it('correction synonyms', () => {
      const cases = [
        'не совсем — это monorepo',
        'нет, на самом деле это CLI',
        'not quite — actually we use FastAPI',
        'но там ещё Next.js',
        'wrong — это node backend',
      ];
      for (const input of cases) expect(classifyResponse(input)).toBe('correction');
    });

    it('abort wins over confirm when both present', () => {
      expect(classifyResponse('ok cancel')).toBe('abort');
    });

    it('empty/gibberish → ambiguous', () => {
      expect(classifyResponse('')).toBe('ambiguous');
      expect(classifyResponse('   ')).toBe('ambiguous');
      expect(classifyResponse('xxxxx')).toBe('ambiguous');
    });
  });

  // summary composition
  describe('composeSummary', () => {
    it('mentions archetype, framework, language, test command, env vars', () => {
      const summary = composeSummary(makeContext());
      expect(summary).toContain('python-api');
      expect(summary).toContain('FastAPI');
      expect(summary).toContain('python');
      expect(summary).toContain('uv run pytest');
      expect(summary).toContain('DATABASE_URL');
      expect(summary).toContain('Правильно я понял суть?');
    });

    it('flags baseline failures as risk', () => {
      const summary = composeSummary(makeContext());
      expect(summary).toMatch(/2 падающих теста|failed/);
    });

    it('handles missing test framework gracefully', () => {
      const ctx = makeContext();
      ctx.recon.test_framework = null;
      ctx.recon.test_commands = [];
      ctx.baseline.framework = null;
      const summary = composeSummary(ctx);
      expect(summary).toContain('не обнаружен');
    });

    it('mentions subagent failure when recon partial', () => {
      const ctx = makeContext();
      ctx.recon.failed_subagents = ['B'];
      const summary = composeSummary(ctx);
      expect(summary).toMatch(/частичный recon|Subagent B/);
    });
  });

  // @feature6 ONBOARD010 confirm on first try
  it('ONBOARD010: first response "да, верно" → confirmed on iteration 1', async () => {
    const responses = ['да, верно'];
    const deps: TextGateDeps = {
      askUser: async (iteration) => responses[iteration - 1] ?? '',
    };

    const result = await runTextGate(makeContext(), deps);
    expect(result.confirmed).toBe(true);
    expect(result.aborted).toBe(false);
    expect(result.iterations).toBe(1);
  });

  // @feature6 ONBOARD011 iterate on correction
  it('ONBOARD011: correction → summary updated → confirmed on iteration 2', async () => {
    const responses = ['не совсем — это web backend на FastAPI + asyncpg', 'да, правильно'];
    const askedSummaries: string[] = [];

    const deps: TextGateDeps = {
      askUser: async (iteration, summary) => {
        askedSummaries.push(summary);
        return responses[iteration - 1] ?? '';
      },
    };

    const result = await runTextGate(makeContext(), deps);
    expect(result.confirmed).toBe(true);
    expect(result.iterations).toBe(2);
    expect(askedSummaries).toHaveLength(2);
    expect(askedSummaries[1]).toContain('Уточнение от пользователя');
    expect(askedSummaries[1]).toContain('asyncpg');
  });

  // @feature6 ONBOARD012 3-iter abort
  it('ONBOARD012: 3 corrections without confirmation → aborted', async () => {
    const responses = [
      'не совсем — 1',
      'не совсем — 2',
      'не совсем — 3',
    ];
    const deps: TextGateDeps = {
      askUser: async (iteration) => responses[iteration - 1] ?? '',
    };

    const result = await runTextGate(makeContext(), deps);
    expect(result.confirmed).toBe(false);
    expect(result.aborted).toBe(true);
    expect(result.iterations).toBe(MAX_ITERATIONS);
    expect(result.abortReason).toContain('not confirmed after 3 iterations');
    expect(result.abortReason).toContain('--refresh-onboarding');
  });

  // @feature6 explicit abort
  it('AC-6: explicit "прервать" → immediate abort', async () => {
    const deps: TextGateDeps = {
      askUser: async () => 'прервать',
    };

    const result = await runTextGate(makeContext(), deps);
    expect(result.aborted).toBe(true);
    expect(result.confirmed).toBe(false);
    expect(result.iterations).toBe(1);
    expect(result.abortReason).toContain('user requested abort');
  });

  // @feature6 AC-6 abort on 2nd iteration
  it('correction then abort → aborted on iteration 2', async () => {
    const responses = ['не совсем — 1', 'cancel'];
    const deps: TextGateDeps = {
      askUser: async (iteration) => responses[iteration - 1] ?? '',
    };

    const result = await runTextGate(makeContext(), deps);
    expect(result.aborted).toBe(true);
    expect(result.iterations).toBe(2);
  });

  // @feature6 ambiguous re-prompt
  it('ambiguous response → re-prompt with clarification (counts as iteration)', async () => {
    const responses = ['xxxxx', 'да'];
    const askedSummaries: string[] = [];

    const deps: TextGateDeps = {
      askUser: async (iteration, summary) => {
        askedSummaries.push(summary);
        return responses[iteration - 1] ?? '';
      },
    };

    const result = await runTextGate(makeContext(), deps);
    expect(result.confirmed).toBe(true);
    expect(result.iterations).toBe(2);
    expect(askedSummaries[1]).toContain('Ответ не распознан');
  });

  // @feature6 correction respects applyCorrection DI
  it('applyCorrection override is used for custom merge logic', async () => {
    let customApplied = false;
    const deps: TextGateDeps = {
      askUser: async (iteration) => (iteration === 1 ? 'не совсем — что-то другое' : 'да'),
      applyCorrection: (prev, correction) => {
        customApplied = true;
        return `${prev}\n[CUSTOM MERGED: ${correction}]`;
      },
    };

    const result = await runTextGate(makeContext(), deps);
    expect(customApplied).toBe(true);
    expect(result.confirmed).toBe(true);
    expect(result.iterations).toBe(2);
    expect(result.finalSummary).toContain('[CUSTOM MERGED');
  });
});
