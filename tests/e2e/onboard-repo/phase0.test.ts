/**
 * Phase 0 BDD Red test entry.
 *
 * @feature1..@feature15 — все сценарии ONBOARD001..ONBOARD034 in Red state:
 * step definitions throw PENDING. Green phase: each Phase (1-13 в TASKS.md)
 * заменяет PENDING throws на реальные assertions.
 *
 * Mirror .feature file: tests/features/onboard-repo/onboard-repo-phase0.feature
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runBeforeEach, type BeforeEachContext } from './hooks/before-each.ts';
import { runAfterEach } from './hooks/after-each.ts';
import { mockSubagents } from './hooks/mock-subagent.ts';


describe('ONBOARD001_Phase0_Repo_Onboarding', () => {
  let ctx: BeforeEachContext;

  afterEach(async () => {
    if (ctx) await runAfterEach(ctx);
  });

  // @feature1
  it('ONBOARD002_First_create_spec_auto_triggers_phase0 (PENDING Red)', async () => {
    ctx = await runBeforeEach('fake-python-api');
    await mockSubagents.register('python-api.json');

    // Green phase: invoke phase0.ts orchestrator и assert artifacts созданы
    expect(() => {
      throw new Error('PENDING: phase0.ts not implemented (Red phase)');
    }).toThrow(/PENDING/);
  });

  // @feature4
  it('ONBOARD003_Cache_hit_skips_phase0 (PENDING Red)', async () => {
    ctx = await runBeforeEach('fake-python-api');

    expect(() => {
      throw new Error('PENDING: cache check not implemented');
    }).toThrow(/PENDING/);
  });

  // @feature4
  it('ONBOARD004_SHA_drift_prompts_refresh (PENDING Red)', async () => {
    ctx = await runBeforeEach('fake-python-api');

    expect(() => {
      throw new Error('PENDING: SHA drift detection not implemented');
    }).toThrow(/PENDING/);
  });

  // @feature4
  it('ONBOARD005_Manual_refresh_flag_forces_rerun (PENDING Red)', async () => {
    ctx = await runBeforeEach('fake-python-api');

    expect(() => {
      throw new Error('PENDING: --refresh-onboarding flag not implemented');
    }).toThrow(/PENDING/);
  });

  // @feature13
  it('ONBOARD006_Missing_dev_pomogator_errors_early (PENDING Red)', async () => {
    ctx = await runBeforeEach('fake-python-api');

    expect(() => {
      throw new Error('PENDING: dev-pomogator presence check not implemented');
    }).toThrow(/PENDING/);
  });

  // @feature5
  it('ONBOARD007_Baseline_tests_invoke_run_tests_skill (PENDING Red)', async () => {
    ctx = await runBeforeEach('fake-python-api');

    expect(() => {
      throw new Error('PENDING: baseline tests step not implemented');
    }).toThrow(/PENDING/);
  });

  // @feature5
  it('ONBOARD008_No_test_framework_skips_baseline (PENDING Red)', async () => {
    ctx = await runBeforeEach('fake-no-tests');

    expect(() => {
      throw new Error('PENDING: baseline skip logic not implemented');
    }).toThrow(/PENDING/);
  });

  // @feature8
  it('ONBOARD015_Archetype_triage_classifies_python_api (PENDING Red)', async () => {
    ctx = await runBeforeEach('fake-python-api');

    expect(() => {
      throw new Error('PENDING: archetype-triage.ts not implemented');
    }).toThrow(/PENDING/);
  });

  // @feature8
  it('ONBOARD016_Archetype_triage_classifies_nextjs_frontend (PENDING Red)', async () => {
    ctx = await runBeforeEach('fake-nextjs-frontend');

    expect(() => {
      throw new Error('PENDING: archetype-triage for nextjs-frontend not implemented');
    }).toThrow(/PENDING/);
  });

  // @feature8 EC-4
  it('ONBOARD018_Minimal_repo_gets_short_report (PENDING Red)', async () => {
    ctx = await runBeforeEach('fake-empty');

    expect(() => {
      throw new Error('PENDING: minimal repo handling not implemented');
    }).toThrow(/PENDING/);
  });

  // @feature2 @feature10
  it('ONBOARD019_Onboarding_json_conforms_to_schema_v1 (PENDING Red)', async () => {
    ctx = await runBeforeEach('fake-python-api');
    await mockSubagents.register('python-api.json');

    expect(() => {
      throw new Error('PENDING: schema + finalize not implemented');
    }).toThrow(/PENDING/);
  });

  // @feature10
  it('ONBOARD020_AI_specific_sections_are_mandatory (PENDING Red)', async () => {
    ctx = await runBeforeEach('fake-python-api');

    expect(() => {
      throw new Error('PENDING: AI-specific sections enforcement not implemented');
    }).toThrow(/PENDING/);
  });

  // @feature3 @feature15
  it('ONBOARD022_Commands_via_skill_reference_when_skill_exists (PENDING Red)', async () => {
    ctx = await runBeforeEach('fake-python-api');

    expect(() => {
      throw new Error('PENDING: commands.via_skill logic not implemented');
    }).toThrow(/PENDING/);
  });

  // @feature3
  it('ONBOARD023_PreToolUse_hook_blocks_raw_npm_test (PENDING Red)', async () => {
    ctx = await runBeforeEach('fake-python-api');

    expect(() => {
      throw new Error('PENDING: compile-hook.ts not implemented');
    }).toThrow(/PENDING/);
  });

  // @feature15
  it('ONBOARD024_Dual_render_produces_both_artifacts (PENDING Red)', async () => {
    ctx = await runBeforeEach('fake-python-api');

    expect(() => {
      throw new Error('PENDING: render-rule.ts and compile-hook.ts not implemented');
    }).toThrow(/PENDING/);
  });

  // @feature12
  it('ONBOARD027_Coexistence_with_init_does_not_modify_claude_md (PENDING Red)', async () => {
    ctx = await runBeforeEach('fake-python-api');

    expect(() => {
      throw new Error('PENDING: coexistence /init handling not implemented');
    }).toThrow(/PENDING/);
  });

  // @feature2
  it('ONBOARD028_Cursorignore_respected_by_phase0 (PENDING Red)', async () => {
    ctx = await runBeforeEach('fake-with-cursorignore');

    expect(() => {
      throw new Error('PENDING: ignore-parser.ts not implemented');
    }).toThrow(/PENDING/);
  });

  // EC-1
  it('ONBOARD032_Non_git_repo_falls_back_to_mtime_cache (PENDING Red)', async () => {
    ctx = await runBeforeEach('fake-no-git', { initGit: false });

    expect(() => {
      throw new Error('PENDING: non-git fallback not implemented');
    }).toThrow(/PENDING/);
  });
});
