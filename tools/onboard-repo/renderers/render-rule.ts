/**
 * Renders `.claude/rules/onboarding-context.md` from `.specs/.onboarding.json`.
 *
 * Decision (see DESIGN.md DD-6): managed rule file без `paths:` frontmatter →
 * always-loaded в каждой сессии Claude Code. Managed marker block делает файл
 * recognizable updater-ом и предотвращает случайный manual edit.
 *
 * See .specs/onboard-repo-phase0/{FR.md#fr-15, AC.md#ac-15}.
 */

import type { OnboardingJson } from '../lib/types.ts';


export const MANAGED_MARKER_START = '<!-- managed by dev-pomogator onboarding v1, do not edit -->';
export const MANAGED_MARKER_END = '<!-- END managed onboarding context -->';


export function renderOnboardingContext(json: OnboardingJson): string {
  const shaShort = json.last_indexed_sha ? json.last_indexed_sha.slice(0, 7) : 'non-git';

  const sections: string[] = [];
  sections.push(MANAGED_MARKER_START);
  sections.push(`<!-- source: .specs/.onboarding.json (schema v${json.schema_version}) -->`);
  sections.push(`<!-- regenerate via: /create-spec <any-slug> --refresh-onboarding -->`);
  sections.push('');
  sections.push(`# Project onboarding context — ${json.project.name}`);
  sections.push('');
  sections.push(`_Archetype: \`${json.archetype}\` (${json.archetype_confidence}) | Indexed: ${json.indexed_at} | SHA: ${shaShort}_`);
  sections.push('');

  sections.push('## Project');
  sections.push(`- **Name:** ${json.project.name}`);
  sections.push(`- **Purpose:** ${json.project.purpose}`);
  sections.push(`- **Domain:** ${json.project.domain_problem}`);
  sections.push('');

  sections.push('## Tech context');
  sections.push(`- **Languages:** ${formatLanguages(json)}`);
  sections.push(`- **Frameworks:** ${formatFrameworks(json)}`);
  sections.push(`- **Package managers:** ${formatList(json.tech_context.package_managers, '`', '`')}`);
  sections.push('');

  sections.push('## Commands (use wrappers, not raw)');
  if (Object.keys(json.commands).length === 0) {
    sections.push('_No commands registered._');
  } else {
    for (const [name, cmd] of Object.entries(json.commands)) {
      sections.push(`### \`${name}\``);
      sections.push(`- **Preferred:** \`${cmd.preferred_invocation}\``);
      if (cmd.via_skill) {
        sections.push(`- **Skill wrapper:** \`${cmd.via_skill}\` — DO NOT bypass.`);
      }
      sections.push(`- **Reason:** ${cmd.reason}`);
      if (cmd.forbidden_if_skill_present) {
        sections.push(`- **⚠️ Raw command blocked by PreToolUse hook.**`);
      }
      sections.push('');
    }
  }

  sections.push('## Rules index');
  if (json.rules_index.length === 0) {
    sections.push('_No `.claude/rules/` detected in this repo._');
  } else {
    for (const rule of json.rules_index) {
      sections.push(`- \`${rule.name}\` — ${rule.enforces} _(path: \`${rule.path}\`)_`);
    }
  }
  sections.push('');

  sections.push('## Skills registry');
  if (json.skills_registry.length === 0) {
    sections.push('_No `.claude/skills/` detected._');
  } else {
    for (const skill of json.skills_registry) {
      sections.push(`- \`${skill.name}\` — ${skill.description} | invocation: \`${skill.invocation_example}\``);
    }
  }
  sections.push('');

  sections.push('## Hooks registry');
  if (json.hooks_registry.length === 0) {
    sections.push('_No hooks installed._');
  } else {
    for (const hook of json.hooks_registry) {
      sections.push(`- \`${hook.event}\` on \`${hook.matcher}\` → ${hook.action} _(path: \`${hook.path}\`)_`);
    }
  }
  sections.push('');

  sections.push('## MCP servers');
  if (json.mcp_servers.length === 0) {
    sections.push('_No MCP servers configured._');
  } else {
    for (const mcp of json.mcp_servers) {
      const capsStr = mcp.capabilities.join(', ');
      const authStr = mcp.auth_required ? ` (auth: \`${mcp.auth_required}\`)` : '';
      sections.push(`- \`${mcp.name}\` — capabilities: ${capsStr}${authStr}`);
    }
  }
  sections.push('');

  sections.push('## Boundaries');
  sections.push('');
  sections.push('**✅ Always:**');
  sections.push(...renderBulletList(json.boundaries.always));
  sections.push('');
  sections.push('**⚠️ Ask first:**');
  sections.push(...renderBulletList(json.boundaries.ask_first));
  sections.push('');
  sections.push('**🚫 Never:**');
  sections.push(...renderBulletList(json.boundaries.never));
  sections.push('');

  sections.push('## Gotchas');
  if (json.gotchas.length === 0) {
    sections.push('_No known gotchas._');
  } else {
    for (const g of json.gotchas) {
      sections.push(`### ${g.symptom} _(severity: ${g.severity})_`);
      sections.push(`- **Cause:** ${g.cause}`);
      sections.push(`- **Fix:** ${g.fix}`);
      sections.push('');
    }
  }
  sections.push('');

  sections.push('## Verification');
  sections.push(`- **Primary command:** \`${json.verification.primary_command}\``);
  sections.push(`- **Success criteria:** ${json.verification.success_criteria}`);
  for (const check of json.verification.manual_checks) {
    sections.push(`- Manual: ${check}`);
  }
  sections.push('');

  sections.push('## Glossary');
  if (json.glossary.length === 0) {
    sections.push('_No domain-specific terminology catalogued._');
  } else {
    for (const g of json.glossary) {
      const example = g.example ? ` (e.g. _${g.example}_)` : '';
      sections.push(`- **${g.term}** — ${g.definition}${example}`);
    }
  }
  sections.push('');

  sections.push('## Env requirements');
  sections.push('**Required:**');
  if (json.env_requirements.required.length === 0) {
    sections.push('_none_');
  } else {
    for (const env of json.env_requirements.required) {
      sections.push(`- \`${env.var}\` — ${env.purpose} (found in: ${env.found_in.join(', ')})`);
    }
  }
  sections.push('');
  sections.push(`**Secrets that must NEVER appear in code:** ${json.env_requirements.secrets_never_in_code.join(', ') || '_none_'}`);
  sections.push('');
  sections.push(MANAGED_MARKER_END);

  return sections.join('\n') + '\n';
}


export interface OnboardingMdContext {
  risks?: string[];
  suggestedNextSteps?: string[];
}


export function renderOnboardingMd(json: OnboardingJson, ctx: OnboardingMdContext = {}): string {
  const sections: string[] = [];

  sections.push(`# Phase 0 Onboarding — ${json.project.name}`);
  sections.push('');
  sections.push(`_Generated by dev-pomogator onboard-repo v${json.generated_by} on ${json.indexed_at}._`);
  sections.push(`_Archetype: \`${json.archetype}\` (confidence: ${json.archetype_confidence})._`);
  sections.push('');

  // Section 1
  sections.push('## 1. Project snapshot');
  sections.push('');
  sections.push(json.project.purpose);
  sections.push('');
  sections.push(json.project.domain_problem);
  sections.push('');
  if (json.repo_map && json.repo_map.entry_points.length > 0) {
    sections.push('**Main packages / components:**');
    for (const ep of json.repo_map.entry_points) {
      sections.push(`- \`${ep.file}\` — ${ep.role}`);
    }
    sections.push('');
  }

  // Section 2
  sections.push('## 2. Dev environment');
  sections.push('');
  sections.push(`**Languages:** ${formatLanguages(json)}`);
  sections.push(`**Frameworks:** ${formatFrameworks(json)}`);
  sections.push(`**Package managers:** ${formatList(json.tech_context.package_managers, '`', '`')}`);
  const runtimeList = Object.entries(json.tech_context.runtime_versions).map(([k, v]) => `${k}@${v}`);
  sections.push(`**Runtime versions:** ${runtimeList.join(', ') || '_N/A_'}`);
  sections.push('');
  sections.push('**Required env vars:**');
  if (json.env_requirements.required.length === 0) {
    sections.push('_none_');
  } else {
    for (const env of json.env_requirements.required) {
      sections.push(`- \`${env.var}\` — ${env.purpose}`);
    }
  }
  sections.push('');

  // Section 3
  sections.push('## 3. How to run tests');
  sections.push('');
  if (json.baseline_tests.framework) {
    sections.push(`Framework: **${json.baseline_tests.framework}**`);
    sections.push('');
    const testCmd = json.commands.test;
    if (testCmd) {
      sections.push('Primary command (use skill wrapper if available):');
      sections.push('```');
      sections.push(testCmd.preferred_invocation);
      sections.push('```');
      sections.push('');
      sections.push('Raw fallback:');
      sections.push('```');
      sections.push(json.baseline_tests.command);
      sections.push('```');
    } else {
      sections.push('```');
      sections.push(json.baseline_tests.command);
      sections.push('```');
    }
  } else {
    sections.push('_No test framework detected — baseline skipped._');
  }
  sections.push('');

  // Section 4
  sections.push('## 4. Behavior from tests');
  sections.push('');
  if (json.baseline_tests.framework) {
    const passedStr = `${json.baseline_tests.passed} passed`;
    const failedStr = json.baseline_tests.failed > 0 ? `, ${json.baseline_tests.failed} failed` : '';
    const skippedStr = json.baseline_tests.skipped > 0 ? `, ${json.baseline_tests.skipped} skipped` : '';
    sections.push(`**Baseline**: ${passedStr}${failedStr}${skippedStr} in ${json.baseline_tests.duration_s}s.`);
    sections.push('');
    if (json.baseline_tests.failed_test_ids.length > 0) {
      sections.push('**Known-failing tests (pre-existing, not caused by your work):**');
      for (const id of json.baseline_tests.failed_test_ids) {
        sections.push(`- \`${id}\``);
      }
      sections.push('');
    }
  } else {
    sections.push('_N/A — no test framework detected._');
    sections.push('');
  }

  // Section 5
  sections.push('## 5. Risks and notes');
  sections.push('');
  const risks = ctx.risks ?? [];
  if (risks.length === 0) {
    sections.push('_none identified_');
  } else {
    for (const risk of risks) {
      sections.push(`- ${risk}`);
    }
  }
  sections.push('');

  // Section 6
  sections.push('## 6. Suggested next steps');
  sections.push('');
  const nextSteps = ctx.suggestedNextSteps ?? deriveSuggestedNextSteps(json);
  if (nextSteps.length === 0) {
    sections.push('_No actionable recommendations._');
  } else {
    nextSteps.forEach((step, i) => sections.push(`${i + 1}. ${step}`));
  }
  sections.push('');

  return sections.join('\n');
}


export function deriveSuggestedNextSteps(json: OnboardingJson): string[] {
  const steps: string[] = [];

  const requiredVars = json.env_requirements.required;
  if (requiredVars.length > 0) {
    const varsStr = requiredVars.slice(0, 3).map((e) => e.var).join(', ');
    steps.push(`Install env vars: ${varsStr}${requiredVars.length > 3 ? ` (${requiredVars.length - 3} more — see .env.example)` : ''}`);
  }

  const highGotchas = json.gotchas.filter((g) => g.severity === 'high' || g.severity === 'critical');
  for (const g of highGotchas.slice(0, 2)) {
    steps.push(`Gotcha to watch: ${g.symptom} → ${g.fix}`);
  }

  if (steps.length === 0 && json.verification.primary_command) {
    steps.push(`Verify setup by running: \`${json.verification.primary_command}\``);
  }

  return steps;
}


function formatLanguages(json: OnboardingJson): string {
  const list = json.tech_context.languages.map((l) => `${l.name} ${l.version}`.trim());
  return list.length > 0 ? list.join(', ') : '_unknown_';
}


function formatFrameworks(json: OnboardingJson): string {
  const list = json.tech_context.frameworks.map((f) => `${f.name} ${f.version}`.trim());
  return list.length > 0 ? list.join(', ') : '_none detected_';
}


function formatList(items: string[], prefix = '', suffix = ''): string {
  if (items.length === 0) return '_none_';
  return items.map((i) => `${prefix}${i}${suffix}`).join(', ');
}


function renderBulletList(items: string[]): string[] {
  if (items.length === 0) return ['_none_'];
  return items.map((i) => `- ${i}`);
}
