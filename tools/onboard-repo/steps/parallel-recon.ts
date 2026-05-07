/**
 * Phase 0 Step 2: Parallel recon (FR-7, NFR-P3, NFR-R4).
 *
 * Launches 3 Claude Code Explore subagents concurrently IN ONE TOOL CALL
 * (one message containing 3 Agent tool invocations). Each subagent has isolated
 * context — keeps main agent context clean. Results are merged via priority rule
 * A > B > C per-field (see lib/subagent-merge.ts).
 *
 * Implementation approach (DI pattern):
 * - `buildReconPrompts(archetype, projectPath)` — pure function, returns 3 prompt
 *   strings. Main orchestrator (phase0.ts) passes these to Agent tool invocations.
 * - `runParallelRecon(context, invoker)` — accepts an `invoker` callback that
 *   returns `ParallelReconOutput`. In production the invoker actually calls the
 *   Agent tool 3× и aggregates results. In tests — `mockSubagents.invoke()`.
 * - This keeps the step testable без real Agent tool dependency.
 *
 * See .specs/onboard-repo-phase0/{FR.md#fr-7, NFR.md#reliability AC-7}.
 */

import type { Archetype, ParallelReconOutput } from '../lib/types.ts';
import { mergeRecon, allSubagentsFailed, type MergedRecon } from '../lib/subagent-merge.ts';


export interface ReconContext {
  archetype: Archetype;
  projectPath: string;
}


export interface ReconPrompts {
  subagentA: string;
  subagentB: string;
  subagentC: string;
}


export function buildReconPrompts(ctx: ReconContext): ReconPrompts {
  const archetypeFocus = archetypeHint(ctx.archetype);

  const subagentA = [
    `You are Subagent A (manifest + environment) for Phase 0 Repo Onboarding.`,
    `Target repo: ${ctx.projectPath}`,
    `Detected archetype: ${ctx.archetype}`,
    ``,
    `Your task:`,
    `1. Read ALL top-level manifests: package.json, pyproject.toml, Cargo.toml, go.mod, *.csproj, pom.xml, Gemfile, composer.json, mix.exs, pubspec.yaml, requirements.txt`,
    `2. Read .env.example, .tool-versions, .nvmrc if present`,
    `3. Read CI configs: .github/workflows/*.yml, .gitlab-ci.yml, azure-pipelines.yml`,
    `4. Archetype-specific focus: ${archetypeFocus.manifestFocus}`,
    ``,
    `Return strict JSON matching SubagentAOutput schema:`,
    `{ manifests_found, languages[], frameworks[], package_managers[], env_files[], required_env_vars[], ci_configs[] }`,
    ``,
    `Do NOT read business logic. Do NOT exceed 3 minutes wall-clock.`,
  ].join('\n');

  const subagentB = [
    `You are Subagent B (tests + AI configs) for Phase 0 Repo Onboarding.`,
    `Target repo: ${ctx.projectPath}`,
    `Detected archetype: ${ctx.archetype}`,
    ``,
    `Your task:`,
    `1. Detect test framework: pytest.ini, vitest.config, jest.config, *.test.cs (xunit/nunit), *.feature (Gherkin)`,
    `2. Find commands to run them: reference package.json scripts, pyproject.toml [tool.pytest.ini_options], Cargo.toml [[test]], etc.`,
    `3. Read existing AI configs VERBATIM only for their presence/role: CLAUDE.md, .cursor/rules/*.mdc, AGENTS.md, .github/copilot-instructions.md`,
    `4. Archetype-specific focus: ${archetypeFocus.testFocus}`,
    ``,
    `Return strict JSON matching SubagentBOutput schema:`,
    `{ test_framework, test_commands[], bdd_present, existing_ai_configs[] }`,
    ``,
    `Do NOT modify CLAUDE.md or other AI configs. Read-only discovery.`,
  ].join('\n');

  const subagentC = [
    `You are Subagent C (entry points + architecture) for Phase 0 Repo Onboarding.`,
    `Target repo: ${ctx.projectPath}`,
    `Detected archetype: ${ctx.archetype}`,
    ``,
    `Your task:`,
    `1. Identify entry points: main.*, index.*, app.*, Program.cs, server.* by archetype`,
    `2. List top-level directories (src/, lib/, app/, packages/, apps/, tests/, docs/)`,
    `3. Derive architecture hint in 1-2 sentences: layered? hex? monolith? monorepo? etc.`,
    `4. For monorepo archetype — detect sub_archetypes под packages/ и apps/`,
    `5. Archetype-specific focus: ${archetypeFocus.entryFocus}`,
    ``,
    `Return strict JSON matching SubagentCOutput schema:`,
    `{ entry_points[], top_level_dirs[], architecture_hint, sub_archetypes? }`,
    ``,
    `Do NOT dump file contents. Signatures/role descriptions only.`,
  ].join('\n');

  return { subagentA, subagentB, subagentC };
}


interface ArchetypeFocusHints {
  manifestFocus: string;
  testFocus: string;
  entryFocus: string;
}


function archetypeHint(archetype: Archetype): ArchetypeFocusHints {
  switch (archetype) {
    case 'python-api':
      return {
        manifestFocus: 'FastAPI/Flask/Django/uvicorn versions, database deps (SQLAlchemy, asyncpg)',
        testFocus: 'pytest configuration, pytest-bdd if Gherkin present',
        entryFocus: 'src/main.py или app/main.py with FastAPI app, router structure',
      };
    case 'nodejs-backend':
      return {
        manifestFocus: 'Express/Fastify/NestJS/Koa versions, ORM deps (Prisma, TypeORM)',
        testFocus: 'vitest/jest/mocha, supertest for HTTP, any cucumber-js',
        entryFocus: 'src/server.ts, src/app.ts, or nest main module',
      };
    case 'nodejs-frontend':
      return {
        manifestFocus: 'Next.js/Vite/Nuxt versions, UI libs (React/Vue/Svelte)',
        testFocus: 'vitest/playwright/cypress, testing-library',
        entryFocus: 'src/app/ routes, src/pages/ routes, state management hints',
      };
    case 'fullstack-monorepo':
      return {
        manifestFocus: 'workspace root package.json, turbo.json/pnpm-workspace.yaml, per-package manifests',
        testFocus: 'root test command (turbo test), per-package frameworks',
        entryFocus: 'packages/ и apps/ sub-archetypes detection',
      };
    case 'dotnet-service':
      return {
        manifestFocus: '*.csproj dependencies, global.json SDK, .config/dotnet-tools.json',
        testFocus: 'xunit/nunit projects, SpecFlow/Reqnroll feature files',
        entryFocus: 'Program.cs, Startup.cs, /Controllers/, minimal API or MVC',
      };
    case 'cli-tool':
      return {
        manifestFocus: 'bin/ entry scripts, [bin] in package.json, [project.scripts] in pyproject',
        testFocus: 'CLI integration tests, snapshot tests для output',
        entryFocus: 'bin/index.ts, src/cli.ts — subcommand structure',
      };
    case 'library':
      return {
        manifestFocus: 'exports/main fields, peerDependencies, publish config',
        testFocus: 'unit-heavy test setup, any integration in examples/',
        entryFocus: 'src/index.ts, public API surface',
      };
    case 'infra':
      return {
        manifestFocus: 'Terraform providers, Pulumi dependencies, Ansible requirements',
        testFocus: 'terratest, ansible molecule — often absent',
        entryFocus: '*.tf modules, Pulumi.yaml stacks, ansible/roles/',
      };
    case 'ml-research':
      return {
        manifestFocus: 'torch/tensorflow/jupyter/numpy versions, conda environment',
        testFocus: 'nbval для notebooks if present, pytest для utils',
        entryFocus: 'notebooks/*.ipynb, src/models/, data pipelines',
      };
    case 'unknown':
    default:
      return {
        manifestFocus: 'Broad scan — any manifest that exists',
        testFocus: 'Any test runner signals',
        entryFocus: 'Any obvious entry file — README may give hints',
      };
  }
}


export interface ReconExecutionResult {
  merged: MergedRecon;
  allFailed: boolean;
}


export async function runParallelRecon(
  ctx: ReconContext,
  invoker: (prompts: ReconPrompts) => Promise<ParallelReconOutput>,
): Promise<ReconExecutionResult> {
  const prompts = buildReconPrompts(ctx);
  const recon = await invoker(prompts);
  const allFailed = allSubagentsFailed(recon);
  const merged = mergeRecon(recon);
  return { merged, allFailed };
}
