/**
 * Phase 8 Green tests: finalize + renderers (@feature2, @feature9, @feature15).
 * Covers: ONBOARD002 (happy path pipeline), ONBOARD019 (schema conformance),
 * ONBOARD021 (schema violation abort), ONBOARD023 (hook blocks raw), ONBOARD024 (dual-render),
 * ONBOARD029 (6 sections), ONBOARD030 (next steps with env).
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fsExtra from 'fs-extra';
import { runBeforeEach, type BeforeEachContext } from './hooks/before-each.ts';
import { runAfterEach } from './hooks/after-each.ts';
import { getHeadSha } from '../../../extensions/onboard-repo/tools/onboard-repo/lib/git-sha-cache.ts';
import { mergeRecon } from '../../../extensions/onboard-repo/tools/onboard-repo/lib/subagent-merge.ts';
import {
  composeOnboardingJson,
  finalize,
  type ComposeContext,
} from '../../../extensions/onboard-repo/tools/onboard-repo/steps/finalize.ts';
import {
  SchemaViolationError,
  validateOnboardingJson,
  validateOrThrow,
} from '../../../extensions/onboard-repo/tools/onboard-repo/lib/schema-validator.ts';
import {
  compilePreToolUseBlock,
  evaluateBashCommand,
  MANAGED_MARKER,
  mergeHookIntoSettingsLocal,
} from '../../../extensions/onboard-repo/tools/onboard-repo/renderers/compile-hook.ts';
import {
  MANAGED_MARKER_START,
  MANAGED_MARKER_END,
  renderOnboardingContext,
  renderOnboardingMd,
} from '../../../extensions/onboard-repo/tools/onboard-repo/renderers/render-rule.ts';
import type {
  CommandBlock,
  ParallelReconOutput,
  Phase0State,
  BaselineTestResult,
} from '../../../extensions/onboard-repo/tools/onboard-repo/lib/types.ts';


function fakeRecon(): ParallelReconOutput {
  return {
    subagent_A_manifest_env: {
      manifests_found: ['pyproject.toml'],
      languages: [{ name: 'python', version: '3.11+', usage: 'all' }],
      frameworks: [{ name: 'FastAPI', version: '0.110', role: 'web framework' }],
      package_managers: ['uv'],
      env_files: ['.env.example'],
      required_env_vars: [
        { var: 'DATABASE_URL', purpose: 'Postgres', found_in: ['.env.example'] },
        { var: 'JWT_SECRET', purpose: 'auth', found_in: ['.env.example'] },
      ],
      ci_configs: [],
    },
    subagent_B_tests_configs: {
      test_framework: 'pytest',
      test_commands: ['uv run pytest'],
      bdd_present: false,
      existing_ai_configs: ['CLAUDE.md'],
    },
    subagent_C_entry_points: {
      entry_points: [{ file: 'src/main.py', role: 'FastAPI entry' }],
      top_level_dirs: ['src', 'tests'],
      architecture_hint: 'layered FastAPI',
    },
  };
}


function fakeBaseline(): BaselineTestResult {
  return {
    framework: 'pytest',
    command: 'uv run pytest',
    via_skill: 'run-tests',
    passed: 145,
    failed: 2,
    skipped: 8,
    duration_s: 47,
    failed_test_ids: ['tests/integration/auth_test.py::test_refresh'],
    reason_if_null: null,
    skipped_by_user: false,
  };
}


function fakeCommands(): Record<string, CommandBlock> {
  return {
    test: {
      via_skill: 'run-tests',
      preferred_invocation: '/run-tests',
      fallback_cmd: 'uv run pytest',
      raw_pattern_to_block: '^(npm|yarn|pnpm)\\s+(run\\s+)?test|^pytest|^uv\\s+run\\s+pytest',
      forbidden_if_skill_present: true,
      reason: '/run-tests wraps pytest with TUI + YAML status',
    },
    build: {
      via_skill: null,
      preferred_invocation: 'uv build',
      fallback_cmd: 'uv build',
      raw_pattern_to_block: '',
      forbidden_if_skill_present: false,
      reason: 'No wrapper',
    },
  };
}


function makeState(projectPath: string): Phase0State {
  return {
    slug: 'test-feature',
    projectPath,
    gitSha: getHeadSha(projectPath) ?? '0000000000000000000000000000000000000000',
    gitAvailable: true,
    archetype: { archetype: 'python-api', confidence: 'high', evidence: 'pyproject.toml + FastAPI' },
    recon: fakeRecon(),
    scratch_used: false,
    warnings: [],
    startedAt: Date.now() - 12_000,
  };
}


function makeContext(projectPath: string, overrides: Partial<ComposeContext> = {}): ComposeContext {
  return {
    state: makeState(projectPath),
    baseline: fakeBaseline(),
    commands: fakeCommands(),
    projectName: 'fake-python-api',
    projectPurpose: 'Test fixture FastAPI service',
    projectDomainProblem: 'Exists for onboard-repo-phase0 integration tests.',
    skillsRegistry: [
      {
        name: 'run-tests',
        trigger: 'тесты/запуск тестов',
        description: 'Centralized test runner',
        invocation_example: '/run-tests',
        path: '.claude/skills/run-tests/SKILL.md',
      },
    ],
    boundaries: { always: ['Use /run-tests'], ask_first: [], never: ['Commit secrets'] },
    existingAiConfigs: ['CLAUDE.md'],
    ...overrides,
  };
}


describe('Phase 8: Finalize + renderers (@feature2 @feature9 @feature15)', () => {
  let ctx: BeforeEachContext;

  afterEach(async () => {
    if (ctx) await runAfterEach(ctx);
  });

  // --- schema-validator unit tests ---
  describe('schema-validator', () => {
    it('AC-2: valid minimal onboarding.json passes', () => {
      ctx = undefined as unknown as BeforeEachContext;
      const json = composeOnboardingJson(makeContext('/tmp/unused'));
      const result = validateOnboardingJson(json);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('ONBOARD021: missing required fields → schema violation', () => {
      const broken = { schema_version: '1.0', project: { name: 'x' } };
      const result = validateOnboardingJson(broken);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(5);
      expect(result.errors.some((e) => e.includes('commands'))).toBe(true);
      expect(result.errors.some((e) => e.includes('boundaries'))).toBe(true);
    });

    it('AC-10: missing AI-first sections flagged (rules_index/skills_registry/boundaries/glossary/gotchas)', () => {
      ctx = undefined as unknown as BeforeEachContext;
      const json = composeOnboardingJson(makeContext('/tmp/unused')) as unknown as Record<string, unknown>;
      delete json.rules_index;
      delete json.boundaries;
      delete json.glossary;
      const result = validateOnboardingJson(json);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('missing required field: rules_index');
      expect(result.errors).toContain('missing required field: boundaries');
      expect(result.errors).toContain('missing required field: glossary');
    });

    it('AC-18 FR-18: via_skill set + forbidden=true requires non-empty raw_pattern_to_block', () => {
      ctx = undefined as unknown as BeforeEachContext;
      const commands = fakeCommands();
      commands.test.raw_pattern_to_block = '';
      const json = composeOnboardingJson(makeContext('/tmp/unused', { commands }));
      const result = validateOnboardingJson(json);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('commands.test') && e.includes('raw_pattern_to_block'))).toBe(true);
    });

    it('invalid regex in raw_pattern_to_block → error', () => {
      ctx = undefined as unknown as BeforeEachContext;
      const commands = fakeCommands();
      commands.test.raw_pattern_to_block = '[unclosed';
      const json = composeOnboardingJson(makeContext('/tmp/unused', { commands }));
      const result = validateOnboardingJson(json);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('invalid regex'))).toBe(true);
    });

    it('validateOrThrow throws SchemaViolationError on invalid JSON', () => {
      expect(() => validateOrThrow({ foo: 'bar' })).toThrow(SchemaViolationError);
    });

    it('archetype enum enforced', () => {
      ctx = undefined as unknown as BeforeEachContext;
      const json = composeOnboardingJson(makeContext('/tmp/unused')) as unknown as Record<string, unknown>;
      json.archetype = 'bogus';
      const result = validateOnboardingJson(json);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('archetype'))).toBe(true);
    });
  });

  // --- render-rule unit tests ---
  describe('render-rule', () => {
    it('ONBOARD024: renderOnboardingContext wraps content in managed markers', () => {
      ctx = undefined as unknown as BeforeEachContext;
      const json = composeOnboardingJson(makeContext('/tmp/unused'));
      const rendered = renderOnboardingContext(json);
      expect(rendered).toContain(MANAGED_MARKER_START);
      expect(rendered).toContain(MANAGED_MARKER_END);
      expect(rendered.indexOf(MANAGED_MARKER_START)).toBeLessThan(rendered.indexOf(MANAGED_MARKER_END));
    });

    it('rendered rule includes boundaries 3-tier and skills registry', () => {
      ctx = undefined as unknown as BeforeEachContext;
      const json = composeOnboardingJson(makeContext('/tmp/unused'));
      const rendered = renderOnboardingContext(json);
      expect(rendered).toContain('✅ Always');
      expect(rendered).toContain('⚠️ Ask first');
      expect(rendered).toContain('🚫 Never');
      expect(rendered).toContain('Use /run-tests');
      expect(rendered).toContain('run-tests');
    });

    it('ONBOARD029: renderOnboardingMd has all 6 sections', () => {
      ctx = undefined as unknown as BeforeEachContext;
      const json = composeOnboardingJson(makeContext('/tmp/unused'));
      const rendered = renderOnboardingMd(json);
      expect(rendered).toContain('## 1. Project snapshot');
      expect(rendered).toContain('## 2. Dev environment');
      expect(rendered).toContain('## 3. How to run tests');
      expect(rendered).toContain('## 4. Behavior from tests');
      expect(rendered).toContain('## 5. Risks and notes');
      expect(rendered).toContain('## 6. Suggested next steps');
    });

    it('ONBOARD030: Section 6 mentions env var when required', () => {
      ctx = undefined as unknown as BeforeEachContext;
      const json = composeOnboardingJson(makeContext('/tmp/unused'));
      const rendered = renderOnboardingMd(json);
      // Default derivation suggests env vars
      expect(rendered).toMatch(/DATABASE_URL|JWT_SECRET/);
    });

    it('renderOnboardingMd respects custom risks/nextSteps override', () => {
      ctx = undefined as unknown as BeforeEachContext;
      const json = composeOnboardingJson(makeContext('/tmp/unused'));
      const rendered = renderOnboardingMd(json, {
        risks: ['2 failing tests in baseline'],
        suggestedNextSteps: ['Fix auth_test.py first'],
      });
      expect(rendered).toContain('2 failing tests in baseline');
      expect(rendered).toContain('Fix auth_test.py first');
    });
  });

  // --- compile-hook unit tests ---
  describe('compile-hook', () => {
    it('compilePreToolUseBlock extracts only forbidden commands', () => {
      const commands = fakeCommands();
      const block = compilePreToolUseBlock(commands);
      expect(block._marker).toBe(MANAGED_MARKER);
      const entries = block.hooks.PreToolUse[0].hooks[0]._entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].command_name).toBe('test');
      expect(entries[0].skill).toBe('run-tests');
    });

    it('ONBOARD023: evaluateBashCommand denies raw npm test with hint pointing to skill', () => {
      const entries = compilePreToolUseBlock(fakeCommands()).hooks.PreToolUse[0].hooks[0]._entries;
      const decision = evaluateBashCommand('npm test', entries);
      expect(decision.allow).toBe(false);
      expect(decision.permissionDecision).toBe('deny');
      expect(decision.permissionDecisionReason).toContain('/run-tests');
      expect(decision.permissionDecisionReason).toContain('raw');
    });

    it('ONBOARD023: raw pytest also blocked', () => {
      const entries = compilePreToolUseBlock(fakeCommands()).hooks.PreToolUse[0].hooks[0]._entries;
      const decision = evaluateBashCommand('pytest -v', entries);
      expect(decision.allow).toBe(false);
    });

    it('non-matching command passes through', () => {
      const entries = compilePreToolUseBlock(fakeCommands()).hooks.PreToolUse[0].hooks[0]._entries;
      const decision = evaluateBashCommand('ls -la', entries);
      expect(decision.allow).toBe(true);
      expect(decision.permissionDecision).toBeUndefined();
    });
  });

  // --- end-to-end finalize integration tests ---
  describe('finalize integration', () => {
    // ONBOARD002 full happy path
    it('ONBOARD002: finalize writes all 4 artifacts atomically', async () => {
      ctx = await runBeforeEach('fake-python-api');
      const composeCtx = makeContext(ctx.tmpdir);

      const { json, result } = await finalize(composeCtx);

      expect(json.archetype).toBe('python-api');
      expect(json.schema_version).toBe('1.0');

      expect(await fsExtra.pathExists(result.jsonPath)).toBe(true);
      expect(await fsExtra.pathExists(result.mdPath)).toBe(true);
      expect(await fsExtra.pathExists(result.ruleFilePath)).toBe(true);
      expect(await fsExtra.pathExists(result.hookMerge.settingsPath)).toBe(true);

      const diskJson = await fsExtra.readJson(result.jsonPath);
      expect(diskJson.archetype).toBe('python-api');
      expect(diskJson.commands.test.via_skill).toBe('run-tests');
    });

    // ONBOARD024 dual-render
    it('ONBOARD024: dual-render — rule file has managed marker, hook in settings.local.json', async () => {
      ctx = await runBeforeEach('fake-python-api');
      const { result } = await finalize(makeContext(ctx.tmpdir));

      const ruleContent = await fsExtra.readFile(result.ruleFilePath, 'utf-8');
      expect(ruleContent).toContain(MANAGED_MARKER_START);
      expect(ruleContent).toContain(MANAGED_MARKER_END);

      const settings = await fsExtra.readJson(result.hookMerge.settingsPath);
      expect(settings.hooks.PreToolUse).toBeDefined();
      const preToolUse = settings.hooks.PreToolUse as Array<Record<string, unknown>>;
      const managed = preToolUse.find((p) => {
        const hooks = p.hooks as Array<Record<string, unknown>>;
        return hooks?.some((h) => h._managed === true);
      });
      expect(managed).toBeDefined();
      expect(result.hookMerge.entriesAdded).toBe(1);
    });

    // ONBOARD003 via cache semantics — no test here, cache tested in Phase 1

    // ONBOARD015 smart merge preserves user hooks
    it('AC-3: smart-merge preserves pre-existing user hooks in settings.local.json', async () => {
      ctx = await runBeforeEach('fake-python-api');
      const settingsPath = path.join(ctx.tmpdir, '.claude', 'settings.local.json');
      await fsExtra.ensureDir(path.dirname(settingsPath));
      await fsExtra.writeJson(settingsPath, {
        hooks: {
          PreToolUse: [
            { matcher: 'Write', hooks: [{ type: 'command', command: 'user-custom' }] },
          ],
          Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'auto-commit' }] }],
        },
        env: { CUSTOM_USER_VAR: 'preserved' },
      });

      const { result } = await finalize(makeContext(ctx.tmpdir));

      expect(result.hookMerge.userHooksPreserved).toBe(1);
      const merged = await fsExtra.readJson(result.hookMerge.settingsPath);
      expect(merged.env.CUSTOM_USER_VAR).toBe('preserved');
      expect(merged.hooks.Stop[0].hooks[0].command).toBe('auto-commit');

      const preToolUse = merged.hooks.PreToolUse as Array<Record<string, unknown>>;
      // User Write hook preserved + managed Bash hook appended
      expect(preToolUse).toHaveLength(2);
      expect(preToolUse.some((p) => p.matcher === 'Write')).toBe(true);
      expect(preToolUse.some((p) => p.matcher === 'Bash')).toBe(true);
    });

    // Idempotent re-merge — prior managed entries replaced, not duplicated
    it('AC-3: re-running finalize replaces prior managed entries (idempotent)', async () => {
      ctx = await runBeforeEach('fake-python-api');
      await finalize(makeContext(ctx.tmpdir));
      const { result } = await finalize(makeContext(ctx.tmpdir));

      const merged = await fsExtra.readJson(result.hookMerge.settingsPath);
      const bashEntries = (merged.hooks.PreToolUse as Array<Record<string, unknown>>).filter(
        (p) => p.matcher === 'Bash',
      );
      expect(bashEntries).toHaveLength(1);
    });

    // ONBOARD019 schema conformance for real fixture
    it('ONBOARD019: finalized .onboarding.json validates against schema', async () => {
      ctx = await runBeforeEach('fake-python-api');
      const { json } = await finalize(makeContext(ctx.tmpdir));

      const result = validateOnboardingJson(json);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    // ONBOARD021 schema violation abort — do NOT write corrupted file
    it('ONBOARD021: invalid commands abort finalize WITHOUT writing .onboarding.json', async () => {
      ctx = await runBeforeEach('fake-python-api');
      const commands = fakeCommands();
      commands.test.raw_pattern_to_block = '[unclosed';

      await expect(finalize(makeContext(ctx.tmpdir, { commands }))).rejects.toThrow(SchemaViolationError);

      const jsonPath = path.join(ctx.tmpdir, '.specs', '.onboarding.json');
      expect(await fsExtra.pathExists(jsonPath)).toBe(false);
    });

    // ONBOARD030 suggested next steps mention env vars
    it('ONBOARD030: Section 6 of rendered .onboarding.md mentions required env vars', async () => {
      ctx = await runBeforeEach('fake-python-api');
      const { result } = await finalize(makeContext(ctx.tmpdir));
      const mdContent = await fsExtra.readFile(result.mdPath, 'utf-8');
      expect(mdContent).toContain('## 6. Suggested next steps');
      expect(mdContent).toMatch(/DATABASE_URL|JWT_SECRET/);
    });

    // merge-recon integration check
    it('warnings from recon merge flow through to final .onboarding.json', async () => {
      ctx = await runBeforeEach('fake-python-api');
      const state = makeState(ctx.tmpdir);
      // Simulate Subagent B crash
      state.recon = {
        ...fakeRecon(),
        subagent_B_tests_configs: { _crashed: true, _error: 'timeout', subagent_id: 'B' },
      };

      const { json } = await finalize({ ...makeContext(ctx.tmpdir), state });
      const warnings = json.warnings ?? [];
      expect(warnings.some((w) => w.step === 'recon' && w.message.includes('Subagent B'))).toBe(true);
    });
  });

  // standalone hook-merge tests
  describe('mergeHookIntoSettingsLocal', () => {
    it('creates settings.local.json if absent', async () => {
      ctx = await runBeforeEach('fake-python-api');
      const settingsPath = path.join(ctx.tmpdir, '.claude', 'settings.local.json');
      await fsExtra.remove(settingsPath).catch(() => undefined);

      const block = compilePreToolUseBlock(fakeCommands());
      const result = await mergeHookIntoSettingsLocal(ctx.tmpdir, block);

      expect(await fsExtra.pathExists(result.settingsPath)).toBe(true);
      expect(result.entriesAdded).toBe(1);
      expect(result.userHooksPreserved).toBe(0);
    });
  });
});
