/**
 * Merge outputs from 3 parallel Explore subagents (Phase 0 Step 2).
 *
 * Priority rule per-field: A > B > C. If Subagent A has data for field X, use A's.
 * Otherwise fall back to B, then C.
 *
 * Partial failure handling: one or more subagents may crash (NFR-R4).
 * Merge continues с remaining data + produces warnings array.
 *
 * See .specs/onboard-repo-phase0/{FR.md#fr-7, NFR.md#reliability AC-7}.
 */

import type {
  ParallelReconOutput,
  SubagentAOutput,
  SubagentBOutput,
  SubagentCOutput,
  SubagentFailure,
  OnboardingJson,
} from './types.ts';


export interface MergedRecon {
  languages: SubagentAOutput['languages'];
  frameworks: SubagentAOutput['frameworks'];
  package_managers: string[];
  manifests_found: string[];
  required_env_vars: SubagentAOutput['required_env_vars'];
  ci_configs: string[];
  test_framework: string | null;
  test_commands: string[];
  bdd_present: boolean;
  existing_ai_configs: string[];
  entry_points: SubagentCOutput['entry_points'];
  top_level_dirs: string[];
  architecture_hint: string;
  sub_archetypes: SubagentCOutput['sub_archetypes'];
  warnings: NonNullable<OnboardingJson['warnings']>;
  failed_subagents: Array<'A' | 'B' | 'C'>;
}


function isFailure<T>(output: T | SubagentFailure): output is SubagentFailure {
  return typeof output === 'object' && output !== null && '_crashed' in output && (output as SubagentFailure)._crashed === true;
}


function emptyA(): SubagentAOutput {
  return {
    manifests_found: [],
    languages: [],
    frameworks: [],
    package_managers: [],
    env_files: [],
    required_env_vars: [],
    ci_configs: [],
  };
}


function emptyB(): SubagentBOutput {
  return {
    test_framework: null,
    test_commands: [],
    bdd_present: false,
    existing_ai_configs: [],
  };
}


function emptyC(): SubagentCOutput {
  return {
    entry_points: [],
    top_level_dirs: [],
    architecture_hint: '',
  };
}


export function mergeRecon(recon: ParallelReconOutput): MergedRecon {
  const warnings: MergedRecon['warnings'] = [];
  const failed: Array<'A' | 'B' | 'C'> = [];

  const aOut = recon.subagent_A_manifest_env;
  const bOut = recon.subagent_B_tests_configs;
  const cOut = recon.subagent_C_entry_points;

  const a: SubagentAOutput = isFailure(aOut) ? (failed.push('A'), recordFailure(warnings, 'A', aOut), emptyA()) : aOut;
  const b: SubagentBOutput = isFailure(bOut) ? (failed.push('B'), recordFailure(warnings, 'B', bOut), emptyB()) : bOut;
  const c: SubagentCOutput = isFailure(cOut) ? (failed.push('C'), recordFailure(warnings, 'C', cOut), emptyC()) : cOut;

  // Priority: A > B > C per field category
  const merged: MergedRecon = {
    languages: a.languages,
    frameworks: a.frameworks,
    package_managers: a.package_managers,
    manifests_found: a.manifests_found,
    required_env_vars: a.required_env_vars,
    ci_configs: a.ci_configs,
    test_framework: b.test_framework,
    test_commands: b.test_commands,
    bdd_present: b.bdd_present,
    existing_ai_configs: b.existing_ai_configs,
    entry_points: c.entry_points,
    top_level_dirs: c.top_level_dirs,
    architecture_hint: c.architecture_hint,
    sub_archetypes: c.sub_archetypes,
    warnings,
    failed_subagents: failed,
  };

  return merged;
}


function recordFailure(
  warnings: NonNullable<OnboardingJson['warnings']>,
  subagentId: 'A' | 'B' | 'C',
  failure: SubagentFailure,
): void {
  warnings.push({
    step: 'recon',
    severity: 'warning',
    message: `Subagent ${subagentId} failed: ${failure._error}`,
    context: { subagent: subagentId },
  });
}


export function allSubagentsFailed(recon: ParallelReconOutput): boolean {
  return isFailure(recon.subagent_A_manifest_env) && isFailure(recon.subagent_B_tests_configs) && isFailure(recon.subagent_C_entry_points);
}
