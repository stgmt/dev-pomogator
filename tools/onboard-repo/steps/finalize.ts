/**
 * Phase 0 Step 7: Finalize (FR-2, FR-9, FR-15, AC-2, AC-9, AC-15).
 *
 * Composes phase0State into OnboardingJson, validates via schema-validator,
 * atomic-writes `.specs/.onboarding.json` + `.specs/.onboarding.md`,
 * renders `.claude/rules/onboarding-context.md` + injects PreToolUse hook into
 * `.claude/settings.local.json`.
 *
 * See .specs/onboard-repo-phase0/{FR.md#fr-2, FR.md#fr-9, FR.md#fr-15}.
 */

import * as path from 'node:path';
import * as fsExtra from 'fs-extra';
import type { OnboardingJson, Phase0State, CommandBlock, BaselineTestResult } from '../lib/types.ts';
import { validateOrThrow } from '../lib/schema-validator.ts';
import { mergeRecon } from '../lib/subagent-merge.ts';
import { assertNoSecretsInContent, assertNoSecretsInObject } from '../lib/secret-redaction.ts';
import { renderOnboardingContext, renderOnboardingMd } from '../renderers/render-rule.ts';
import { mergeHookIntoSettingsLocal, compilePreToolUseBlock, type CompiledHookBlock, type MergeResult } from '../renderers/compile-hook.ts';


const ONBOARDING_JSON_REL = path.join('.specs', '.onboarding.json');
const ONBOARDING_MD_REL = path.join('.specs', '.onboarding.md');
const RULE_FILE_REL = path.join('.claude', 'rules', 'onboarding-context.md');

const GENERATED_BY = 'dev-pomogator/onboard-repo/0.1.0';
const SCHEMA_VERSION = '1.0';


export interface ComposeContext {
  state: Phase0State;
  baseline: BaselineTestResult;
  commands: Record<string, CommandBlock>;
  rulesIndex?: OnboardingJson['rules_index'];
  skillsRegistry?: OnboardingJson['skills_registry'];
  hooksRegistry?: OnboardingJson['hooks_registry'];
  mcpServers?: OnboardingJson['mcp_servers'];
  boundaries?: OnboardingJson['boundaries'];
  gotchas?: OnboardingJson['gotchas'];
  glossary?: OnboardingJson['glossary'];
  verification?: OnboardingJson['verification'];
  envRequirements?: OnboardingJson['env_requirements'];
  ingestion?: OnboardingJson['ingestion'];
  imports?: string[];
  ignore?: OnboardingJson['ignore'];
  existingAiConfigs?: string[];
  projectName?: string;
  projectPurpose?: string;
  projectDomainProblem?: string;
  textGateSummary?: string;
}


export function composeOnboardingJson(ctx: ComposeContext): OnboardingJson {
  const { state, baseline, commands } = ctx;
  const recon = state.recon ? mergeRecon(state.recon) : null;

  const languages = recon?.languages ?? [];
  const frameworks = recon?.frameworks ?? [];
  const packageManagers = recon?.package_managers ?? [];
  const requiredEnvVars = recon?.required_env_vars ?? [];
  const architectureHint = recon?.architecture_hint ?? '';
  const entryPoints = recon?.entry_points ?? [];
  const existingAiConfigs = ctx.existingAiConfigs ?? recon?.existing_ai_configs ?? [];

  const warnings: NonNullable<OnboardingJson['warnings']> = [...(recon?.warnings ?? []), ...state.warnings];

  const json: OnboardingJson = {
    schema_version: SCHEMA_VERSION,
    version: SCHEMA_VERSION,
    last_indexed_sha: state.gitSha,
    indexed_at: new Date().toISOString(),
    generated_by: GENERATED_BY,
    cache_policy: {
      invalidate_on_sha_drift: true,
      drift_threshold_commits: 5,
      invalidate_on_file_change: ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod'],
    },
    project: {
      name: ctx.projectName ?? (path.basename(state.projectPath) || 'unnamed'),
      purpose: ctx.projectPurpose ?? 'Not provided',
      domain_problem: ctx.projectDomainProblem ?? 'Not provided',
      audience: [],
      scope_boundaries: '',
    },
    tech_context: {
      languages,
      frameworks,
      package_managers: packageManagers,
      runtime_versions: {},
      technical_constraints: [],
    },
    commands,
    system_patterns: {
      architecture: architectureHint,
      key_decisions: [],
      design_patterns: [],
      component_relationships: [],
      critical_paths: [],
    },
    repo_map: {
      entry_points: entryPoints,
      key_symbols: [],
    },
    rules_index: ctx.rulesIndex ?? [],
    skills_registry: ctx.skillsRegistry ?? [],
    hooks_registry: ctx.hooksRegistry ?? [],
    mcp_servers: ctx.mcpServers ?? [],
    boundaries: ctx.boundaries ?? { always: [], ask_first: [], never: [] },
    gotchas: ctx.gotchas ?? [],
    env_requirements: ctx.envRequirements ?? {
      required: requiredEnvVars,
      optional: [],
      secrets_never_in_code: ['API keys', 'tokens'],
    },
    verification: ctx.verification ?? {
      primary_command: commands.test?.preferred_invocation ?? '',
      success_criteria: 'All baseline tests pass',
      manual_checks: [],
    },
    code_style: { rules: [], examples: [] },
    workflow: { git_workflow: '', commit_style: '', branch_naming: '', pr_conventions: '' },
    imports: ctx.imports ?? [],
    ignore: ctx.ignore ?? {
      ai_excluded_paths: ['.env', '.env.local'],
      index_only_excluded: ['node_modules/', 'dist/', '.git/'],
      external_configs_found: [],
    },
    glossary: ctx.glossary ?? [],
    archetype: state.archetype?.archetype ?? 'unknown',
    archetype_confidence: state.archetype?.confidence ?? 'low',
    archetype_evidence: state.archetype?.evidence ?? 'no evidence',
    archetype_specific: state.archetype?.sub_archetypes ? { sub_archetypes: state.archetype.sub_archetypes } : {},
    ingestion: ctx.ingestion,
    baseline_tests: baseline,
    active_context: {
      current_focus: ctx.textGateSummary ?? '',
      recent_changes: [],
      next_steps: [],
      active_decisions_considerations: [],
    },
    progress: {
      works: [],
      pending: [],
      known_issues: baseline.failed_test_ids,
    },
    warnings,
    phase0_duration_ms: Date.now() - state.startedAt,
    existing_ai_configs: existingAiConfigs,
  };

  return json;
}


export interface FinalizeResult {
  jsonPath: string;
  mdPath: string;
  ruleFilePath: string;
  hookMerge: MergeResult;
  compiled: CompiledHookBlock;
}


export interface FinalizeOptions {
  risks?: string[];
  suggestedNextSteps?: string[];
}


export async function finalize(
  ctx: ComposeContext,
  options: FinalizeOptions = {},
): Promise<{ json: OnboardingJson; result: FinalizeResult }> {
  const json = composeOnboardingJson(ctx);
  const validated = validateOrThrow(json);

  // NFR-S1 pre-write guard: reject artifacts carrying critical secrets
  assertNoSecretsInObject(validated, '.onboarding.json');

  const projectPath = ctx.state.projectPath;
  const jsonPath = path.join(projectPath, ONBOARDING_JSON_REL);
  const mdPath = path.join(projectPath, ONBOARDING_MD_REL);
  const ruleFilePath = path.join(projectPath, RULE_FILE_REL);

  await atomicWriteJson(jsonPath, validated);

  const mdContent = renderOnboardingMd(validated, options);
  assertNoSecretsInContent(mdContent, '.onboarding.md');
  await atomicWriteFile(mdPath, mdContent);

  const ruleContent = renderOnboardingContext(validated);
  assertNoSecretsInContent(ruleContent, 'onboarding-context.md');
  await fsExtra.ensureDir(path.dirname(ruleFilePath));
  await atomicWriteFile(ruleFilePath, ruleContent);

  const compiled = compilePreToolUseBlock(validated.commands);
  const hookMerge = await mergeHookIntoSettingsLocal(projectPath, compiled);

  return {
    json: validated,
    result: { jsonPath, mdPath, ruleFilePath, hookMerge, compiled },
  };
}


async function atomicWriteJson(dest: string, data: unknown): Promise<void> {
  await fsExtra.ensureDir(path.dirname(dest));
  const tempPath = `${dest}.tmp-${process.pid}-${Date.now()}`;
  await fsExtra.writeJson(tempPath, data, { spaces: 2 });
  await fsExtra.move(tempPath, dest, { overwrite: true });
}


async function atomicWriteFile(dest: string, content: string): Promise<void> {
  await fsExtra.ensureDir(path.dirname(dest));
  const tempPath = `${dest}.tmp-${process.pid}-${Date.now()}`;
  await fsExtra.writeFile(tempPath, content, 'utf-8');
  await fsExtra.move(tempPath, dest, { overwrite: true });
}
