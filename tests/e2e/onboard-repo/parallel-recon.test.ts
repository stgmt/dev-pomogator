/**
 * Phase 3 Green tests: parallel recon (@feature7).
 * Covers: ONBOARD013 (parallel prompts built correctly), ONBOARD014 (partial failure recovery).
 *
 * Parallel subagent invocation is NOT exercised here (requires real Claude Code Agent tool).
 * Instead we verify:
 *  - buildReconPrompts produces 3 distinct, well-formed prompts
 *  - runParallelRecon applies merge priority correctly via mock invoker
 *  - Partial failure (Subagent B crash) records warning, drops to fallback
 *  - All-failed recognized
 */

import { describe, it, expect, afterEach } from 'vitest';
import { runBeforeEach, type BeforeEachContext } from './hooks/before-each.ts';
import { runAfterEach } from './hooks/after-each.ts';
import { mockSubagents } from './hooks/mock-subagent.ts';
import {
  buildReconPrompts,
  runParallelRecon,
  type ReconPrompts,
} from '../../../extensions/onboard-repo/tools/onboard-repo/steps/parallel-recon.ts';
import type { ParallelReconOutput } from '../../../extensions/onboard-repo/tools/onboard-repo/lib/types.ts';


describe('Phase 3: Parallel recon (@feature7)', () => {
  let ctx: BeforeEachContext;

  afterEach(async () => {
    if (ctx) await runAfterEach(ctx);
  });

  // @feature7 ONBOARD013
  it('ONBOARD013: builds 3 distinct prompts per subagent role', async () => {
    ctx = await runBeforeEach('fake-python-api');

    const prompts = buildReconPrompts({ archetype: 'python-api', projectPath: ctx.tmpdir });

    expect(prompts.subagentA).toMatch(/Subagent A \(manifest \+ environment\)/);
    expect(prompts.subagentB).toMatch(/Subagent B \(tests \+ AI configs\)/);
    expect(prompts.subagentC).toMatch(/Subagent C \(entry points \+ architecture\)/);

    expect(prompts.subagentA).not.toBe(prompts.subagentB);
    expect(prompts.subagentB).not.toBe(prompts.subagentC);
    expect(prompts.subagentA).not.toBe(prompts.subagentC);
  });

  // @feature7 + @feature8 linkage
  it('ONBOARD013: prompts embed archetype-specific focus hints', async () => {
    ctx = await runBeforeEach('fake-python-api');

    const prompts = buildReconPrompts({ archetype: 'python-api', projectPath: ctx.tmpdir });
    expect(prompts.subagentA).toContain('FastAPI');
    expect(prompts.subagentC).toContain('src/main.py');

    const frontend = buildReconPrompts({ archetype: 'nodejs-frontend', projectPath: ctx.tmpdir });
    expect(frontend.subagentA).toContain('Next.js');
    expect(frontend.subagentC).toContain('src/app/');

    const monorepo = buildReconPrompts({ archetype: 'fullstack-monorepo', projectPath: ctx.tmpdir });
    expect(monorepo.subagentC).toContain('sub_archetypes');
  });

  // @feature7
  it('ONBOARD013: prompts include projectPath and archetype verbatim', async () => {
    ctx = await runBeforeEach('fake-python-api');

    const prompts = buildReconPrompts({ archetype: 'dotnet-service', projectPath: '/tmp/some-path' });
    for (const p of [prompts.subagentA, prompts.subagentB, prompts.subagentC]) {
      expect(p).toContain('/tmp/some-path');
      expect(p).toContain('dotnet-service');
    }
  });

  // @feature7 ONBOARD013
  it('ONBOARD013: runParallelRecon merges 3 successful subagent outputs', async () => {
    ctx = await runBeforeEach('fake-python-api');
    await mockSubagents.register('python-api.json');

    const invoker = async (_prompts: ReconPrompts): Promise<ParallelReconOutput> => mockSubagents.invoke();

    const result = await runParallelRecon({ archetype: 'python-api', projectPath: ctx.tmpdir }, invoker);

    expect(result.allFailed).toBe(false);
    expect(result.merged.failed_subagents).toHaveLength(0);
    expect(result.merged.warnings).toHaveLength(0);
    expect(result.merged.languages.map((l) => l.name)).toContain('python');
    expect(result.merged.test_framework).toBe('pytest');
    expect(result.merged.entry_points.map((e) => e.file)).toContain('src/main.py');
  });

  // @feature7 ONBOARD014 partial failure
  it('ONBOARD014: Subagent B crash still produces merged output with warning', async () => {
    ctx = await runBeforeEach('fake-python-api');
    await mockSubagents.register('subagent-b-crash.json');

    const invoker = async (_prompts: ReconPrompts): Promise<ParallelReconOutput> => mockSubagents.invoke();

    const result = await runParallelRecon({ archetype: 'python-api', projectPath: ctx.tmpdir }, invoker);

    expect(result.allFailed).toBe(false);
    expect(result.merged.failed_subagents).toEqual(['B']);
    expect(result.merged.warnings).toHaveLength(1);
    expect(result.merged.warnings[0].step).toBe('recon');
    expect(result.merged.warnings[0].message).toContain('Subagent B failed');

    // A и C still contributed their data
    expect(result.merged.languages.map((l) => l.name)).toContain('python');
    expect(result.merged.entry_points.length).toBeGreaterThan(0);

    // B's fields фоллбэкнулись к empty defaults
    expect(result.merged.test_framework).toBeNull();
    expect(result.merged.test_commands).toEqual([]);
    expect(result.merged.bdd_present).toBe(false);
  });

  // @feature7 all failed
  it('NFR-R4: all 3 subagents failed → allFailed=true, 3 warnings', async () => {
    ctx = await runBeforeEach('fake-python-api');

    const invoker = async (_prompts: ReconPrompts): Promise<ParallelReconOutput> => ({
      subagent_A_manifest_env: { _crashed: true, _error: 'timeout', subagent_id: 'A' },
      subagent_B_tests_configs: { _crashed: true, _error: 'oom', subagent_id: 'B' },
      subagent_C_entry_points: { _crashed: true, _error: 'network', subagent_id: 'C' },
    });

    const result = await runParallelRecon({ archetype: 'python-api', projectPath: ctx.tmpdir }, invoker);

    expect(result.allFailed).toBe(true);
    expect(result.merged.failed_subagents).toEqual(['A', 'B', 'C']);
    expect(result.merged.warnings).toHaveLength(3);
    expect(result.merged.languages).toEqual([]);
    expect(result.merged.entry_points).toEqual([]);
  });

  // @feature7 merge-priority unit test
  it('priority rule A > B > C: A has manifests, B has tests, C has entry points — all preserved', async () => {
    ctx = await runBeforeEach('fake-python-api');
    await mockSubagents.register('nodejs-frontend.json');

    const invoker = async (_prompts: ReconPrompts): Promise<ParallelReconOutput> => mockSubagents.invoke();

    const result = await runParallelRecon({ archetype: 'nodejs-frontend', projectPath: ctx.tmpdir }, invoker);

    // A contributed
    expect(result.merged.frameworks.some((f) => f.name === 'Next.js')).toBe(true);
    expect(result.merged.package_managers).toContain('npm');
    // B contributed
    expect(result.merged.test_framework).toBe('vitest');
    // C contributed
    expect(result.merged.entry_points.some((e) => e.file.includes('page.tsx'))).toBe(true);
  });

  // @feature8 monorepo sub_archetypes surfaced via recon
  it('ONBOARD017: monorepo recon preserves sub_archetypes from Subagent C', async () => {
    ctx = await runBeforeEach('fake-python-api'); // actual fixture not needed — recon is mocked
    await mockSubagents.register('monorepo.json');

    const invoker = async (_prompts: ReconPrompts): Promise<ParallelReconOutput> => mockSubagents.invoke();

    const result = await runParallelRecon({ archetype: 'fullstack-monorepo', projectPath: ctx.tmpdir }, invoker);

    expect(result.merged.sub_archetypes).toBeDefined();
    const subs = result.merged.sub_archetypes as Array<{ path: string; archetype: string }>;
    expect(subs.length).toBeGreaterThanOrEqual(2);
    expect(subs.some((s) => s.archetype === 'python-api')).toBe(true);
    expect(subs.some((s) => s.archetype === 'nodejs-frontend')).toBe(true);
  });
});
