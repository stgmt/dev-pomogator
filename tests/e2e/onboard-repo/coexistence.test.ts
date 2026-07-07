/**
 * Phase 12 Green tests: coexistence + archetype edge cases (@feature12, @feature8, EC-4).
 * Covers: ONBOARD027 (/init coexistence), ONBOARD017 (monorepo sub_archetypes),
 * ONBOARD018 (minimal repo).
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fsExtra from 'fs-extra';
import { runBeforeEach, type BeforeEachContext } from './hooks/before-each.ts';
import { runAfterEach } from './hooks/after-each.ts';
import { archetypeTriage } from '../../../extensions/onboard-repo/tools/onboard-repo/steps/archetype-triage.ts';
import { finalize } from '../../../extensions/onboard-repo/tools/onboard-repo/steps/finalize.ts';
import type {
  ParallelReconOutput,
  Phase0State,
  BaselineTestResult,
  CommandBlock,
} from '../../../extensions/onboard-repo/tools/onboard-repo/lib/types.ts';


function makeBaseCtx(tmpdir: string) {
  const state: Phase0State = {
    slug: 'test',
    projectPath: tmpdir,
    gitSha: '0000000000000000000000000000000000000000',
    gitAvailable: true,
    archetype: { archetype: 'python-api', confidence: 'high', evidence: 'pyproject.toml' },
    recon: fakeRecon(),
    scratch_used: false,
    warnings: [],
    startedAt: Date.now() - 5_000,
  };
  const baseline: BaselineTestResult = {
    framework: 'pytest',
    command: 'uv run pytest',
    via_skill: 'run-tests',
    passed: 10,
    failed: 0,
    skipped: 0,
    duration_s: 1,
    failed_test_ids: [],
    reason_if_null: null,
    skipped_by_user: false,
  };
  const commands: Record<string, CommandBlock> = {
    test: {
      via_skill: 'run-tests',
      preferred_invocation: '/run-tests',
      fallback_cmd: 'uv run pytest',
      raw_pattern_to_block: '^pytest',
      forbidden_if_skill_present: true,
      reason: 'test wrapper',
    },
  };
  return {
    state,
    baseline,
    commands,
    projectName: 'coexist-test',
    projectPurpose: 'Coexistence fixture',
    projectDomainProblem: 'Phase 12 tests',
  };
}


function fakeRecon(): ParallelReconOutput {
  return {
    subagent_A_manifest_env: {
      manifests_found: ['pyproject.toml'],
      languages: [{ name: 'python', version: '3.11', usage: 'all' }],
      frameworks: [{ name: 'FastAPI', version: '0.110', role: 'web' }],
      package_managers: ['uv'],
      env_files: [],
      required_env_vars: [],
      ci_configs: [],
    },
    subagent_B_tests_configs: {
      test_framework: 'pytest',
      test_commands: ['uv run pytest'],
      bdd_present: false,
      existing_ai_configs: [],
    },
    subagent_C_entry_points: {
      entry_points: [{ file: 'src/main.py', role: 'entry' }],
      top_level_dirs: ['src'],
      architecture_hint: 'layered',
    },
  };
}


describe('Phase 12: Coexistence + archetype edge cases', () => {
  let ctx: BeforeEachContext;

  afterEach(async () => {
    if (ctx) await runAfterEach(ctx);
  });

  // ONBOARD027 @feature12
  it('ONBOARD027: finalize does NOT modify pre-existing CLAUDE.md', async () => {
    ctx = await runBeforeEach('fake-python-api');

    const claudeMdPath = path.join(ctx.tmpdir, 'CLAUDE.md');
    const originalContent = [
      '# CLAUDE.md — User-written',
      '',
      '## Commands',
      '- `npm run custom` — custom user command',
      '',
      '## Architecture',
      'User-written architecture description.',
      '',
    ].join('\n');
    await fsExtra.writeFile(claudeMdPath, originalContent, 'utf-8');
    const originalStat = await fsExtra.stat(claudeMdPath);

    // wait to ensure mtime diff detectable
    await new Promise((r) => setTimeout(r, 20));

    const base = makeBaseCtx(ctx.tmpdir);
    const withExisting = { ...base, existingAiConfigs: ['CLAUDE.md'] };

    const { json } = await finalize(withExisting);

    expect(json.existing_ai_configs).toContain('CLAUDE.md');

    const afterContent = await fsExtra.readFile(claudeMdPath, 'utf-8');
    expect(afterContent).toBe(originalContent);

    const afterStat = await fsExtra.stat(claudeMdPath);
    expect(afterStat.mtimeMs).toBeCloseTo(originalStat.mtimeMs, 0);
  });

  // @feature12 — CLAUDE.md absent → existing_ai_configs not populated, still works
  it('CLAUDE.md absent → existing_ai_configs empty, Phase 0 finalize succeeds', async () => {
    ctx = await runBeforeEach('fake-python-api');

    const claudeMdPath = path.join(ctx.tmpdir, 'CLAUDE.md');
    expect(await fsExtra.pathExists(claudeMdPath)).toBe(false);

    const { json } = await finalize(makeBaseCtx(ctx.tmpdir));
    expect(json.existing_ai_configs).not.toContain('CLAUDE.md');
  });

  // @feature12 — other AI configs (.cursor/rules) also preserved
  it('pre-existing .cursor/rules/*.mdc untouched by Phase 0', async () => {
    ctx = await runBeforeEach('fake-python-api');

    const rulePath = path.join(ctx.tmpdir, '.cursor', 'rules', 'workflow.mdc');
    await fsExtra.ensureDir(path.dirname(rulePath));
    const ruleContent = '---\nalwaysApply: true\n---\n# User workflow rule\n';
    await fsExtra.writeFile(rulePath, ruleContent, 'utf-8');

    await finalize({
      ...makeBaseCtx(ctx.tmpdir),
      existingAiConfigs: ['.cursor/rules/workflow.mdc'],
    });

    const after = await fsExtra.readFile(rulePath, 'utf-8');
    expect(after).toBe(ruleContent);
  });

  // ONBOARD017 @feature8 — monorepo detection end-to-end с реальным fixture
  it('ONBOARD017: fake-fullstack-monorepo → archetype=fullstack-monorepo with sub_archetypes', async () => {
    ctx = await runBeforeEach('fake-fullstack-monorepo');

    const result = await archetypeTriage(ctx.tmpdir);

    expect(result.archetype).toBe('fullstack-monorepo');
    expect(result.confidence).not.toBe('low');
    expect(result.sub_archetypes).toBeDefined();
    const subs = result.sub_archetypes as Array<{ path: string; archetype: string }>;
    expect(subs.length).toBeGreaterThanOrEqual(2);
    expect(subs.some((s) => s.archetype === 'python-api')).toBe(true);
    expect(subs.some((s) => s.archetype === 'nodejs-frontend' || s.archetype === 'library')).toBe(true);
  });

  // ONBOARD018 @feature8 EC-4 — minimal repo end-to-end через triage
  it('ONBOARD018: fake-empty → unknown archetype, low confidence', async () => {
    ctx = await runBeforeEach('fake-empty');

    const result = await archetypeTriage(ctx.tmpdir);

    expect(result.archetype).toBe('unknown');
    expect(result.confidence).toBe('low');
    expect(result.evidence).toContain('minimal');
  });

  // ONBOARD018 + finalize — empty repo still produces valid artifacts
  it('ONBOARD018: finalize on fake-empty produces valid .onboarding.json with archetype=unknown', async () => {
    ctx = await runBeforeEach('fake-empty');

    const base = makeBaseCtx(ctx.tmpdir);
    base.state.archetype = { archetype: 'unknown', confidence: 'low', evidence: 'minimal' };
    base.state.recon = {
      subagent_A_manifest_env: {
        manifests_found: [],
        languages: [],
        frameworks: [],
        package_managers: [],
        env_files: [],
        required_env_vars: [],
        ci_configs: [],
      },
      subagent_B_tests_configs: {
        test_framework: null,
        test_commands: [],
        bdd_present: false,
        existing_ai_configs: [],
      },
      subagent_C_entry_points: {
        entry_points: [],
        top_level_dirs: [],
        architecture_hint: 'minimal — only README',
      },
    };
    base.baseline = {
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
    base.commands = {}; // no commands for empty repo

    const { json, result } = await finalize(base);
    expect(json.archetype).toBe('unknown');
    expect(json.tech_context.languages).toEqual([]);
    expect(json.baseline_tests.framework).toBeNull();

    const mdContent = await fsExtra.readFile(result.mdPath, 'utf-8');
    expect(mdContent).toContain('## 1. Project snapshot');
    expect(mdContent).toContain('## 6. Suggested next steps');
    expect(mdContent).toMatch(/N\/A|No test framework detected/);
  });

  // EC-2 sub-archetypes preserved through finalize → JSON
  it('monorepo sub_archetypes surface in final .onboarding.json.archetype_specific', async () => {
    ctx = await runBeforeEach('fake-fullstack-monorepo');

    const triage = await archetypeTriage(ctx.tmpdir);
    const base = makeBaseCtx(ctx.tmpdir);
    base.state.archetype = triage;

    const { json } = await finalize(base);
    expect(json.archetype).toBe('fullstack-monorepo');
    const specific = json.archetype_specific as { sub_archetypes?: Array<{ path: string }> };
    expect(specific.sub_archetypes).toBeDefined();
    expect((specific.sub_archetypes as Array<unknown>).length).toBeGreaterThanOrEqual(2);
  });
});
