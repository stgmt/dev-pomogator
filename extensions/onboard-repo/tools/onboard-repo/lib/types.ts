/**
 * Types for Phase 0 Repo Onboarding artifacts and state.
 * Mirrors .specs/onboard-repo-phase0/onboard-repo-phase0_SCHEMA.md v1.0.
 */

export type Archetype =
  | 'python-api'
  | 'nodejs-backend'
  | 'nodejs-frontend'
  | 'fullstack-monorepo'
  | 'dotnet-service'
  | 'cli-tool'
  | 'library'
  | 'infra'
  | 'ml-research'
  | 'unknown';

export type Confidence = 'high' | 'medium' | 'low';


export interface ArchetypeTriageResult {
  archetype: Archetype;
  confidence: Confidence;
  evidence: string;
  sub_archetypes?: Array<{ path: string; archetype: Archetype }>;
}


export interface LanguageInfo { name: string; version: string; usage: string }
export interface FrameworkInfo { name: string; version: string; role: string }
export interface EnvRequirement { var: string; purpose: string; found_in: string[]; example_value_format?: string }


export interface CommandBlock {
  via_skill: string | null;
  preferred_invocation: string;
  fallback_cmd: string;
  raw_pattern_to_block: string;
  forbidden_if_skill_present: boolean;
  reason: string;
  enforces?: string;
}


export interface BaselineTestResult {
  framework: string | null;
  command: string;
  via_skill: string | null;
  passed: number;
  failed: number;
  skipped: number;
  duration_s: number;
  failed_test_ids: string[];
  reason_if_null: string | null;
  skipped_by_user: boolean;
}


export interface RuleIndexEntry {
  name: string;
  trigger: string;
  enforces: string;
  path: string;
  always_loaded: boolean;
}


export interface SkillRegistryEntry {
  name: string;
  trigger: string;
  description: string;
  invocation_example: string;
  path: string;
}


export interface HookRegistryEntry {
  event: 'SessionStart' | 'Stop' | 'PreToolUse' | 'PostToolUse' | 'UserPromptSubmit';
  matcher: string;
  action: string;
  path: string;
  managed_by?: string;
}


export interface Boundaries {
  always: string[];
  ask_first: string[];
  never: string[];
}


export interface Gotcha {
  symptom: string;
  cause: string;
  fix: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}


export interface SubagentAOutput {
  manifests_found: string[];
  languages: LanguageInfo[];
  frameworks: FrameworkInfo[];
  package_managers: string[];
  env_files: string[];
  required_env_vars: EnvRequirement[];
  ci_configs: string[];
}


export interface SubagentBOutput {
  test_framework: string | null;
  test_commands: string[];
  bdd_present: boolean;
  existing_ai_configs: string[];
  pytest_config_location?: string;
  vitest_config_location?: string;
  [key: string]: unknown;
}


export interface SubagentCOutput {
  entry_points: Array<{ file: string; role: string }>;
  top_level_dirs: string[];
  architecture_hint: string;
  sub_archetypes?: Array<{ path: string; archetype: Archetype }>;
}


export interface SubagentFailure {
  _crashed: true;
  _error: string;
  subagent_id: 'A' | 'B' | 'C';
}


export interface ParallelReconOutput {
  subagent_A_manifest_env: SubagentAOutput | SubagentFailure;
  subagent_B_tests_configs: SubagentBOutput | SubagentFailure;
  subagent_C_entry_points: SubagentCOutput | SubagentFailure;
}


export interface OnboardingJson {
  schema_version: string;
  version: string;
  last_indexed_sha: string;
  indexed_at: string;
  generated_by: string;
  cache_policy: {
    invalidate_on_sha_drift: boolean;
    drift_threshold_commits: number;
    invalidate_on_file_change: string[];
  };
  project: {
    name: string;
    purpose: string;
    domain_problem: string;
    audience: string[];
    scope_boundaries?: string;
  };
  tech_context: {
    languages: LanguageInfo[];
    frameworks: FrameworkInfo[];
    package_managers: string[];
    runtime_versions: Record<string, string>;
    technical_constraints: string[];
  };
  commands: Record<string, CommandBlock>;
  system_patterns?: {
    architecture: string;
    key_decisions: string[];
    design_patterns: string[];
    component_relationships: string[];
    critical_paths: string[];
  };
  repo_map?: {
    entry_points: Array<{ file: string; role: string }>;
    key_symbols: Array<{ file: string; symbol: string; signature: string; why_important: string }>;
  };
  rules_index: RuleIndexEntry[];
  skills_registry: SkillRegistryEntry[];
  hooks_registry: HookRegistryEntry[];
  subagents_registry?: Array<{ name: string; description: string; tools: string[]; path: string }>;
  mcp_servers: Array<{ name: string; capabilities: string[]; auth_required: string | null; url_or_path?: string }>;
  boundaries: Boundaries;
  gotchas: Gotcha[];
  env_requirements: {
    required: EnvRequirement[];
    optional: Array<{ var: string; purpose: string; default: string }>;
    secrets_never_in_code: string[];
  };
  verification: {
    primary_command: string;
    success_criteria: string;
    screenshot_workflow?: string;
    manual_checks: string[];
  };
  code_style?: {
    rules: string[];
    examples: Array<{ pattern: string; path: string; snippet: string }>;
  };
  workflow?: {
    git_workflow: string;
    commit_style: string;
    branch_naming: string;
    pr_conventions: string;
  };
  imports?: string[];
  ignore: {
    ai_excluded_paths: string[];
    index_only_excluded: string[];
    external_configs_found: string[];
  };
  glossary: Array<{ term: string; definition: string; example?: string }>;
  archetype: Archetype;
  archetype_confidence: Confidence;
  archetype_evidence: string;
  archetype_specific?: Record<string, unknown>;
  ingestion?: {
    method: 'repomix' | 'fallback';
    output_path: string | null;
    compression_ratio: number;
    files_included: number;
    total_tokens_estimate: number;
  };
  baseline_tests: BaselineTestResult;
  active_context?: {
    current_focus: string;
    recent_changes: string[];
    next_steps: string[];
    active_decisions_considerations: string[];
  };
  progress?: {
    works: string[];
    pending: string[];
    known_issues: string[];
  };
  warnings?: Array<{
    step: 'archetype' | 'recon' | 'ingestion' | 'baseline' | 'scratch' | 'gate' | 'finalize';
    severity: 'info' | 'warning' | 'error';
    message: string;
    context?: Record<string, unknown>;
  }>;
  metrics?: {
    total_duration_ms: number;
    per_step_duration_ms: Record<string, number>;
    files_scanned: number;
    subagent_retries: number;
    tokens_consumed_estimate: number;
  };
  phase0_duration_ms: number;
  existing_ai_configs: string[];
}


export interface Phase0State {
  slug: string;
  projectPath: string;
  gitSha: string;
  gitAvailable: boolean;
  archetype?: ArchetypeTriageResult;
  recon?: ParallelReconOutput;
  ingestion?: OnboardingJson['ingestion'];
  baseline_tests?: BaselineTestResult;
  scratch_used: boolean;
  warnings: NonNullable<OnboardingJson['warnings']>;
  startedAt: number;
}


export type CacheStatus =
  | { status: 'missing' }
  | { status: 'valid'; json: OnboardingJson }
  | { status: 'drift'; json: OnboardingJson; commitsAhead: number }
  | { status: 'error'; error: string };
