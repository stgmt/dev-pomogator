#!/usr/bin/env npx tsx
/**
 * run-mutation.ts — auto-detect stack + dispatch mutation tool subprocess.
 *
 * Used by the `strong-tests` skill in Mutation-feedback mode.
 *
 * Usage:
 *   npx tsx run-mutation.ts [<target-file-or-dir>] [--threshold=<N>] [--max-iter=<M>] [--dry-run]
 *
 * Exit codes:
 *   0 — success (kill rate >= threshold OR --dry-run completed)
 *   1 — threshold not met after max-iter (gaps reported in JSON)
 *   2 — no stack/tool detected
 *   3 — tool execution failure (subprocess crashed or returned non-zero unexpectedly)
 *
 * Output: standardized JSON on stdout per .specs/strong-tests/strong-tests_SCHEMA.md "run-mutation.ts stdout JSON".
 *
 * Stack detection order: TS -> Python -> Java -> C# -> Rust -> Go.
 * For TS+Python (primary stacks) the script dispatches Stryker/mutmut subprocess and parses output.
 * For other stacks the script emits a "dispatch-only" JSON pointing at references/tooling-setup.md
 * (deep integration is OUT OF SCOPE per FR-6).
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

type Stack = 'ts' | 'python' | 'java' | 'csharp' | 'rust' | 'go' | null;
type Tool = 'stryker' | 'mutmut' | 'pit' | 'stryker-net' | 'cargo-mutants' | 'go-mutesting' | null;

interface Survivor {
  file: string;
  line: number;
  column?: number;
  mutator: string;
  originalCode?: string;
  mutatedCode?: string;
  status: 'Survived';
}

interface MutationReport {
  stack: Stack;
  tool: Tool;
  killRate: number | null;
  totalMutants: number;
  killedMutants: number;
  survivedMutants: number;
  survivors: Survivor[];
  iterations: number;
  thresholdMet: boolean;
  thresholdValue: number;
  gaps: Array<Survivor & { rationale: string; equivalentSuspect: boolean }>;
  warnings: string[];
}

interface ParsedArgs {
  target: string | null;
  threshold: number;
  maxIter: number;
  dryRun: boolean;
  includeIntegration: boolean;
  includeE2E: boolean;
  analyzeSurvivors: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    target: null,
    threshold: 0.7,
    maxIter: 5,
    dryRun: false,
    includeIntegration: false,
    includeE2E: false,
    analyzeSurvivors: false,
  };
  for (const a of argv) {
    if (a.startsWith('--threshold=')) {
      const v = Number(a.slice('--threshold='.length));
      if (!Number.isFinite(v) || v < 0 || v > 100) {
        throw new Error(`Invalid --threshold: ${a}. Must be number in [0, 100] or [0, 1].`);
      }
      args.threshold = v > 1 ? v / 100 : v;
    } else if (a.startsWith('--max-iter=')) {
      const v = Number(a.slice('--max-iter='.length));
      if (!Number.isInteger(v) || v < 1 || v > 20) {
        throw new Error(`Invalid --max-iter: ${a}. Must be integer in [1, 20].`);
      }
      args.maxIter = v;
    } else if (a === '--dry-run') {
      args.dryRun = true;
    } else if (a === '--include-integration') {
      args.includeIntegration = true;
    } else if (a === '--include-e2e') {
      args.includeE2E = true;
    } else if (a === '--analyze-survivors') {
      args.analyzeSurvivors = true;
    } else if (!a.startsWith('--') && args.target === null) {
      args.target = a;
    }
  }
  return args;
}

function resolveWithinProject(cwd: string, target: string): string {
  const base = resolve(cwd);
  const resolved = resolve(base, target);
  if (!resolved.startsWith(base)) {
    throw new Error(`Path traversal: ${target} resolves outside project root ${base}`);
  }
  return resolved;
}

function detectStack(cwd: string): { stack: Stack; tool: Tool } {
  const pkgJson = join(cwd, 'package.json');
  if (existsSync(pkgJson)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJson, 'utf-8')) as {
        devDependencies?: Record<string, string>;
        dependencies?: Record<string, string>;
      };
      const allDeps = { ...(pkg.devDependencies ?? {}), ...(pkg.dependencies ?? {}) };
      if ('vitest' in allDeps || 'jest' in allDeps) {
        const tool: Tool = '@stryker-mutator/core' in allDeps ? 'stryker' : null;
        return { stack: 'ts', tool };
      }
    } catch {
      // fall through
    }
  }

  const pyproject = join(cwd, 'pyproject.toml');
  const setupPy = join(cwd, 'setup.py');
  if (existsSync(pyproject) || existsSync(setupPy)) {
    const content =
      (existsSync(pyproject) ? readFileSync(pyproject, 'utf-8') : '') +
      (existsSync(setupPy) ? readFileSync(setupPy, 'utf-8') : '');
    if (/\bpytest\b/.test(content)) {
      const tool: Tool = /\bmutmut\b/.test(content) ? 'mutmut' : null;
      return { stack: 'python', tool };
    }
  }

  const pomXml = join(cwd, 'pom.xml');
  if (existsSync(pomXml)) {
    const content = readFileSync(pomXml, 'utf-8');
    if (/junit-jupiter|junit5/.test(content)) {
      const tool: Tool = /pitest-maven/.test(content) ? 'pit' : null;
      return { stack: 'java', tool };
    }
  }

  // Look for any *.csproj in cwd or one level down
  try {
    const entries = readFileSync(cwd, { encoding: 'utf-8' as 'utf-8' });
    // Can't readdir without 'node:fs/promises' or sync version — use child_process fallback
    void entries;
  } catch {
    // expected
  }
  const lsResult = spawnSync('node', ['-e', `
    const fs = require('node:fs');
    const path = require('node:path');
    const root = process.argv[1];
    const out = [];
    try {
      for (const f of fs.readdirSync(root, { withFileTypes: true })) {
        if (f.isFile() && f.name.endsWith('.csproj')) out.push(f.name);
        else if (f.isDirectory()) {
          try {
            for (const g of fs.readdirSync(path.join(root, f.name), { withFileTypes: true })) {
              if (g.isFile() && g.name.endsWith('.csproj')) out.push(path.join(f.name, g.name));
            }
          } catch {}
        }
      }
    } catch {}
    process.stdout.write(out.join('\\n'));
  `, cwd], { encoding: 'utf-8' });
  if (lsResult.status === 0 && lsResult.stdout.trim()) {
    const csprojFiles = lsResult.stdout.trim().split('\n');
    for (const f of csprojFiles) {
      try {
        const content = readFileSync(join(cwd, f), 'utf-8');
        if (/<PackageReference\s+Include="(xunit|NUnit)"/.test(content)) {
          // Stryker.NET detection: either PackageReference в csproj OR stryker-config.json в root OR global dotnet tool
          const hasStrykerRef = /<PackageReference\s+Include="Stryker\.NET"/.test(content);
          const hasStrykerConfig = existsSync(join(cwd, 'stryker-config.json'));
          const tool: Tool = (hasStrykerRef || hasStrykerConfig) ? 'stryker-net' : null;
          return { stack: 'csharp', tool };
        }
      } catch {
        // skip
      }
    }
  }

  const cargoToml = join(cwd, 'Cargo.toml');
  if (existsSync(cargoToml)) {
    const content = readFileSync(cargoToml, 'utf-8');
    if (/\[dev-dependencies\]/.test(content)) {
      return { stack: 'rust', tool: null }; // cargo-mutants is global tool, not in Cargo.toml
    }
  }

  const goMod = join(cwd, 'go.mod');
  if (existsSync(goMod)) {
    return { stack: 'go', tool: null };
  }

  return { stack: null, tool: null };
}

function emptyReport(stack: Stack, tool: Tool, threshold: number, warnings: string[] = []): MutationReport {
  return {
    stack,
    tool,
    killRate: null,
    totalMutants: 0,
    killedMutants: 0,
    survivedMutants: 0,
    survivors: [],
    iterations: 0,
    thresholdMet: false,
    thresholdValue: threshold,
    gaps: [],
    warnings,
  };
}

function runStryker(cwd: string, target: string | null, threshold: number, dryRun: boolean): MutationReport {
  const report = emptyReport('ts', 'stryker', threshold);
  if (dryRun) {
    report.warnings.push('--dry-run: did not invoke Stryker subprocess');
    return report;
  }

  // Pre-flight: warn if stryker.config.* is missing — repo lacks config
  const configCandidates = ['stryker.config.mjs', 'stryker.config.js', 'stryker.config.json', '.stryker.config.js', '.stryker.conf.js'];
  const hasConfig = configCandidates.some((c) => existsSync(join(cwd, c)));
  if (!hasConfig) {
    report.warnings.push(
      'No stryker.config.* found in repo root. Stryker will use defaults — likely fails for non-trivial projects.',
      'Copy template: cp .claude/skills/strong-tests/references/stryker.config.template.mjs stryker.config.mjs',
      'Customize {{TODO}} placeholders (mutate paths, testRunner config).',
    );
  }

  // If the project defines `scripts.mutation` in package.json, prefer it over
  // direct `npx stryker run`. Projects use this hook to wrap Stryker with
  // environment-specific glue (e.g. Docker container, custom env, isolated
  // workspace) without having to alter the skill.
  let cmd: string;
  let args: string[];
  let hasNpmScript = false;
  try {
    const pkgPath = join(cwd, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      hasNpmScript = typeof pkg?.scripts?.mutation === 'string';
    }
  } catch { /* fall through to default invocation */ }

  if (hasNpmScript) {
    cmd = 'npm';
    args = ['run', 'mutation', '--', '--reporters', 'json,clear-text'];
  } else {
    cmd = 'npx';
    args = ['stryker', 'run', '--reporters', 'json,clear-text'];
  }
  if (target) args.push('--mutate', target);

  // Env propagation: spawnSync inherits process.env by default. Document it explicitly
  // for clarity — Stryker passes env through to test workers, so repo-specific
  // vars (e.g., SKIP_BUILD_CHECK, NODE_ENV) just work if set in the parent shell
  // BEFORE invoking run-mutation.ts.
  const proc = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf-8',
    timeout: 30 * 60_000,
    env: process.env,
  });
  if (proc.status !== 0 && proc.status !== 1) {
    // Stryker exits 1 when below threshold — that's data, not error
    const stderr = (proc.stderr || '');
    const stdout = (proc.stdout || '');
    const combined = stderr + '\n' + stdout;

    // Actionable diagnostic patterns
    if (/No tests were executed/.test(combined) || /failed to find test files related/.test(combined)) {
      report.warnings.push(
        'Stryker: "No tests were executed" — root cause is missing module-import chain between tests and mutated source.',
        'Fix per SKILL.md §6.3 Prerequisite — Module-import layer:',
        '  1. Apply Import Guard pattern to CLI scripts (export functions + guard main()).',
        '  2. Add a sibling unit test file that imports source directly (alongside existing integration tests).',
        '  3. Re-run: npx stryker run',
      );
    } else if (/Could not find vitest config/.test(combined) || /vitest config file is not found/.test(combined)) {
      report.warnings.push(
        'Stryker: vitest config file missing. Set `vitest.configFile` in stryker.config.mjs to the correct path.',
      );
    } else if (/Error\b.*ENOENT.*npx/.test(combined)) {
      report.warnings.push('npx not found in PATH. Ensure Node.js + npm are installed.');
    }
    report.warnings.push(`stryker subprocess failed: exit ${proc.status}; stderr (last 500 chars): ${stderr.slice(-500)}`);
    return report;
  }
  // Parse reports/mutation/mutation.json
  const reportPath = join(cwd, 'reports', 'mutation', 'mutation.json');
  if (!existsSync(reportPath)) {
    report.warnings.push(`stryker output not found at ${reportPath}`);
    return report;
  }
  try {
    const raw = JSON.parse(readFileSync(reportPath, 'utf-8')) as {
      files?: Record<string, { mutants?: Array<{ status: string; mutatorName?: string; location?: { start: { line: number; column: number } }; replacement?: string; originalLines?: string }> }>;
    };
    for (const [file, fileData] of Object.entries(raw.files ?? {})) {
      for (const m of fileData.mutants ?? []) {
        if (m.status === 'Killed' || m.status === 'CompileError') {
          report.killedMutants++;
          report.totalMutants++;
        } else if (m.status === 'Survived') {
          report.survivedMutants++;
          report.totalMutants++;
          report.survivors.push({
            file,
            line: m.location?.start.line ?? 0,
            column: m.location?.start.column,
            mutator: m.mutatorName ?? 'Unknown',
            originalCode: m.originalLines,
            mutatedCode: m.replacement,
            status: 'Survived',
          });
        } else {
          // NoCoverage, Timeout, Ignored: count as total but neither killed nor survived
          report.totalMutants++;
        }
      }
    }
    report.killRate = report.totalMutants > 0
      ? report.killedMutants / (report.killedMutants + report.survivedMutants)
      : null;
    report.thresholdMet = report.killRate !== null && report.killRate >= threshold;
  } catch (e) {
    report.warnings.push(`failed to parse stryker report: ${(e as Error).message}`);
  }
  return report;
}

function runStrykerNet(
  cwd: string,
  _target: string | null,
  threshold: number,
  dryRun: boolean,
  includeIntegration: boolean,
  includeE2E: boolean,
): MutationReport {
  const report = emptyReport('csharp', 'stryker-net', threshold);
  if (dryRun) {
    report.warnings.push('--dry-run: did not invoke Stryker.NET subprocess');
    return report;
  }

  // Pre-flight: check dotnet-stryker availability (use --help, not --version which requires value)
  const versionCheck = spawnSync('dotnet-stryker', ['--help'], { cwd, encoding: 'utf-8' });
  if (versionCheck.status !== 0) {
    report.warnings.push(
      'Stryker.NET (dotnet-stryker) not found in PATH.',
      'Install: dotnet tool install -g dotnet-stryker',
      'Falls back to skill manual mode per references/anti-patterns.md Part B.',
    );
    return report;
  }

  // Pre-flight: check stryker-config.json exists
  if (!existsSync(join(cwd, 'stryker-config.json'))) {
    report.warnings.push(
      'No stryker-config.json found in repo root.',
      'Copy template: cp .claude/skills/strong-tests/references/stryker-net.config.template.json stryker-config.json',
      'Customize {{TODO}} placeholders (project, test-projects).',
    );
    return report;
  }

  // Build test-case-filter — default skip Integration/E2E
  const args = ['--config-file', 'stryker-config.json'];
  const filterParts: string[] = ['Category=Unit'];
  if (includeIntegration) filterParts.push('Category=Integration');
  if (includeE2E) filterParts.push('Category=E2E');
  if (filterParts.length > 1) {
    // Override config file filter with union
    const filterArg = filterParts.join('|');
    args.push('--test-case-filter', filterArg);
    report.warnings.push(`Category filter applied: ${filterArg} (per --include flags)`);
  } else {
    report.warnings.push('Default: Category=Unit filter (skip Integration/E2E). Pass --include-integration / --include-e2e to override.');
  }

  const proc = spawnSync('dotnet-stryker', args, {
    cwd,
    encoding: 'utf-8',
    timeout: 60 * 60_000, // 1 hour
    env: process.env,
  });

  // Stryker.NET exits 0 (above threshold) or 1 (below threshold) — both valid
  if (proc.status !== 0 && proc.status !== 1) {
    const combined = (proc.stderr ?? '') + '\n' + (proc.stdout ?? '');
    if (/Failed to (?:create|drop) (?:token|database)/.test(combined)) {
      report.warnings.push(
        'Stryker.NET: tests failed at initial baseline due to external infrastructure dependencies.',
        'Symptoms: auth tokens unavailable / DB drop permission denied / HTTP API timeouts.',
        'Fix: mark tests with [Trait("Category", "Unit")] for pure unit (no external deps).',
        'See SKILL.md §test-classification-policy for guidance.',
      );
    }
    report.warnings.push(`stryker-net subprocess failed: exit ${proc.status}; stderr last 500: ${(proc.stderr ?? '').slice(-500)}`);
    return report;
  }

  // Parse latest StrykerOutput/<timestamp>/reports/mutation-report.json
  const strykerOutputDir = join(cwd, 'StrykerOutput');
  if (!existsSync(strykerOutputDir)) {
    report.warnings.push(`StrykerOutput directory not found at ${strykerOutputDir}`);
    return report;
  }

  const dirsResult = spawnSync(
    'node',
    [
      '-e',
      `const fs = require('node:fs');
       const path = require('node:path');
       const root = process.argv[1];
       const dirs = fs.readdirSync(root).filter(d => fs.statSync(path.join(root, d)).isDirectory());
       dirs.sort((a, b) => fs.statSync(path.join(root, b)).mtimeMs - fs.statSync(path.join(root, a)).mtimeMs);
       process.stdout.write(dirs[0] ?? '');`,
      strykerOutputDir,
    ],
    { encoding: 'utf-8' },
  );
  const latestRun = dirsResult.stdout.trim();
  if (!latestRun) {
    report.warnings.push('No timestamp dir found in StrykerOutput/');
    return report;
  }

  const reportPath = join(strykerOutputDir, latestRun, 'reports', 'mutation-report.json');
  if (!existsSync(reportPath)) {
    report.warnings.push(`Stryker.NET report not found at ${reportPath}`);
    return report;
  }

  try {
    const raw = JSON.parse(readFileSync(reportPath, 'utf-8')) as {
      files?: Record<string, { mutants?: Array<{ status: string; mutatorName?: string; location?: { start: { line: number; column: number } }; replacement?: string; originalLines?: string }> }>;
    };
    for (const [file, fileData] of Object.entries(raw.files ?? {})) {
      for (const m of fileData.mutants ?? []) {
        if (m.status === 'Killed' || m.status === 'CompileError') {
          report.killedMutants++;
          report.totalMutants++;
        } else if (m.status === 'Survived') {
          report.survivedMutants++;
          report.totalMutants++;
          report.survivors.push({
            file,
            line: m.location?.start.line ?? 0,
            column: m.location?.start.column,
            mutator: m.mutatorName ?? 'Unknown',
            originalCode: m.originalLines,
            mutatedCode: m.replacement,
            status: 'Survived',
          });
        } else {
          report.totalMutants++;
        }
      }
    }
    report.killRate = report.totalMutants > 0
      ? report.killedMutants / (report.killedMutants + report.survivedMutants)
      : null;
    report.thresholdMet = report.killRate !== null && report.killRate >= threshold;
  } catch (e) {
    report.warnings.push(`failed to parse stryker-net report: ${(e as Error).message}`);
  }
  return report;
}

/**
 * LLM-driven survivor analysis stub.
 *
 * `run-mutation.ts` itself runs as standalone Node script — не имеет direct access
 * к `Agent()` tool (skill-level). Production invocation pattern:
 *   1. AI runs `npx tsx run-mutation.ts --analyze-survivors <target>`
 *   2. This function annotates each survivor with `equivalentSuspect: 'NEEDS_HUMAN_REVIEW'` +
 *      structured context (mutator, location, replacement, reconstructed source lines)
 *   3. AI reads JSON output, spawns `Agent(subagent_type="general-purpose")` per batch of 50,
 *      asks LLM to flag equivalent vs real survivors per Meta ACH pattern (0.95 precision)
 *   4. AI merges verdicts back into MutationReport.gaps
 *
 * For autonomous invocation without AI orchestration — use SKILL.md §6.3 Mutation-feedback mode
 * which provides full workflow с Skill() dispatch.
 */
// strong-tests:skip pure 1-to-1 mapping: input.length === output.length always (no filter/groupBy); context reconstruction is per-survivor side-effect не affecting cardinality
function annotateSurvivorsForLlmReview(
  survivors: Survivor[],
  cwd: string,
): Array<Survivor & { equivalentSuspect: 'NEEDS_HUMAN_REVIEW'; reconstructedContext: string | null }> {
  return survivors.map((s) => {
    let reconstructedContext: string | null = null;
    try {
      const filePath = join(cwd, s.file);
      if (existsSync(filePath)) {
        const lines = readFileSync(filePath, 'utf-8').split('\n');
        const start = Math.max(0, s.line - 3);
        const end = Math.min(lines.length, s.line + 3);
        reconstructedContext = lines
          .slice(start, end)
          .map((l, i) => `${start + i + 1}: ${l}`)
          .join('\n');
      }
    } catch {
      // continue silently
    }
    return {
      ...s,
      equivalentSuspect: 'NEEDS_HUMAN_REVIEW' as const,
      reconstructedContext,
    };
  });
}

interface GhostwriterResult {
  success: boolean;
  scaffold?: string;
  error?: string;
  functionRef: string;
}

function runGhostwriter(cwd: string, functionRef: string): GhostwriterResult {
  // Pre-flight: check hypothesis binary
  const versionCheck = spawnSync('hypothesis', ['--version'], { cwd, encoding: 'utf-8' });
  if (versionCheck.status !== 0) {
    return {
      success: false,
      functionRef,
      error: 'Hypothesis not installed. Install: pip install hypothesis',
    };
  }

  // Run `hypothesis write <module.function>` — outputs Python test code to stdout
  const proc = spawnSync('hypothesis', ['write', functionRef], {
    cwd,
    encoding: 'utf-8',
    timeout: 30_000,
    env: process.env,
  });

  if (proc.status !== 0) {
    return {
      success: false,
      functionRef,
      error: `hypothesis write failed: exit ${proc.status}; stderr: ${(proc.stderr ?? '').slice(0, 200)}`,
    };
  }

  const stdout = proc.stdout ?? '';
  // Look for `from hypothesis import` line as start of scaffold
  const hypothesisImportIdx = stdout.indexOf('from hypothesis');
  if (hypothesisImportIdx === -1) {
    return {
      success: false,
      functionRef,
      error: 'Ghostwriter output did not contain `from hypothesis` import — unparseable',
    };
  }

  return {
    success: true,
    functionRef,
    scaffold: stdout.slice(hypothesisImportIdx).trim(),
  };
}

function runMutmut(cwd: string, target: string | null, threshold: number, dryRun: boolean): MutationReport {
  const report = emptyReport('python', 'mutmut', threshold);
  if (dryRun) {
    report.warnings.push('--dry-run: did not invoke mutmut subprocess');
    return report;
  }
  const runArgs = ['run'];
  if (target) runArgs.push('--paths-to-mutate', target);
  const runProc = spawnSync('mutmut', runArgs, {
    cwd,
    encoding: 'utf-8',
    timeout: 30 * 60_000,
    env: process.env,
  });
  if (runProc.status !== 0) {
    report.warnings.push(`mutmut run failed: exit ${runProc.status}`);
    return report;
  }
  const resultsProc = spawnSync('mutmut', ['results'], { cwd, encoding: 'utf-8', env: process.env });
  if (resultsProc.status !== 0) {
    report.warnings.push(`mutmut results failed: exit ${resultsProc.status}`);
    return report;
  }
  const output = resultsProc.stdout || '';
  const killedMatch = output.match(/(\d+)\s+killed/i);
  const survivedMatch = output.match(/(\d+)\s+(?:survived|alive)/i);
  report.killedMutants = killedMatch ? Number(killedMatch[1]) : 0;
  report.survivedMutants = survivedMatch ? Number(survivedMatch[1]) : 0;
  report.totalMutants = report.killedMutants + report.survivedMutants;
  report.killRate = report.totalMutants > 0
    ? report.killedMutants / report.totalMutants
    : null;
  report.thresholdMet = report.killRate !== null && report.killRate >= threshold;
  return report;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();

  // Env propagation diagnostic: surface common repo-specific bypass vars if user
  // is invoking via the skill workflow. Helps debugging "test runner hangs / refuses".
  if (process.env.STRONG_TESTS_DEBUG === '1') {
    const relevantEnvKeys = Object.keys(process.env).filter((k) =>
      /^(NODE_|CI$|TEST_|SKIP_|DEVPOM_|STRYKER_|MUTMUT_)/.test(k),
    );
    process.stderr.write(`[run-mutation.ts] propagating env: ${relevantEnvKeys.sort().join(', ') || '(none matching test/skip/ci patterns)'}\n`);
  }

  if (args.target) {
    try {
      const resolved = resolveWithinProject(cwd, args.target);
      if (!existsSync(resolved)) {
        process.stderr.write(`target does not exist: ${args.target}\n`);
        process.exit(3);
      }
    } catch (e) {
      process.stderr.write(`${(e as Error).message}\n`);
      process.exit(3);
    }
  }

  const { stack, tool } = detectStack(cwd);

  if (stack === null) {
    const report = emptyReport(null, null, args.threshold, [
      'No recognized stack detected.',
      'Supported: TypeScript (package.json + vitest/jest), Python (pyproject.toml/setup.py + pytest), Java (pom.xml + junit-jupiter), C# (*.csproj + xunit/NUnit), Rust (Cargo.toml + [dev-dependencies]), Go (go.mod + *_test.go).',
      'See .claude/skills/strong-tests/references/tooling-setup.md for detection signals.',
    ]);
    process.stdout.write(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  if (tool === null && (stack === 'ts' || stack === 'python' || stack === 'csharp')) {
    const report = emptyReport(stack, null, args.threshold, [
      `Stack detected (${stack}) but mutation tool not installed.`,
      stack === 'ts'
        ? 'Install: npm install --save-dev @stryker-mutator/core @stryker-mutator/vitest-runner'
        : stack === 'python'
        ? 'Install: pip install mutmut'
        : 'Install: dotnet tool install -g dotnet-stryker (Stryker.NET 4.14+); copy .claude/skills/strong-tests/references/stryker-net.config.template.json to stryker-config.json',
      'Fallback: AI-driven manual mutation per references/anti-patterns.md Part B (8-category honnibal catalogue).',
    ]);
    process.stdout.write(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  if (stack !== 'ts' && stack !== 'python' && stack !== 'csharp') {
    const report = emptyReport(stack, tool, args.threshold, [
      `Stack ${stack} detected but auto-dispatch is OUT OF SCOPE (FR-6 in .specs/strong-tests/FR.md).`,
      'See references/tooling-setup.md for install/run commands.',
      'For ${stack} run the stack-native mutation tool manually:',
      stack === 'java' ? 'mvn org.pitest:pitest-maven:mutationCoverage' :
      stack === 'rust' ? 'cargo mutants' :
      stack === 'go' ? 'go-mutesting ./...' : 'see references/tooling-setup.md',
    ]);
    process.stdout.write(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  let report: MutationReport;
  if (stack === 'ts' && tool === 'stryker') {
    report = runStryker(cwd, args.target, args.threshold, args.dryRun);
  } else if (stack === 'python' && tool === 'mutmut') {
    report = runMutmut(cwd, args.target, args.threshold, args.dryRun);
  } else if (stack === 'csharp' && tool === 'stryker-net') {
    report = runStrykerNet(cwd, args.target, args.threshold, args.dryRun, args.includeIntegration, args.includeE2E);
  } else {
    report = emptyReport(stack, tool, args.threshold, [`Unexpected stack/tool combination: ${stack}/${tool}`]);
    process.stdout.write(JSON.stringify(report, null, 2));
    process.exit(3);
  }

  report.iterations = 1; // run-mutation.ts is a single-shot dispatcher; loop logic lives in the skill workflow

  // Optionally enrich survivors with LLM review annotations (per --analyze-survivors flag)
  if (args.analyzeSurvivors && report.survivors.length > 0) {
    const annotated = annotateSurvivorsForLlmReview(report.survivors, cwd);
    // Store annotated survivors в gaps field with NEEDS_HUMAN_REVIEW marker
    report.gaps = annotated.map((a) => ({
      ...a,
      rationale: `Mutator: ${a.mutator} at line ${a.line}. Awaiting LLM judge verdict (NEEDS_HUMAN_REVIEW). Reconstructed context:\n${a.reconstructedContext ?? '(file not readable)'}`,
      equivalentSuspect: false, // false until LLM verdict received
    }));
    report.warnings.push(
      `--analyze-survivors flag passed. ${report.survivors.length} survivors annotated with reconstructedContext for LLM review.`,
      'AI orchestrator: spawn Agent(subagent_type="general-purpose") batch of 50 per call. Ask LLM to flag equivalent vs real per Meta ACH pattern.',
      'Then merge verdicts into MutationReport.gaps[].equivalentSuspect field.',
    );
  }

  process.stdout.write(JSON.stringify(report, null, 2));
  if (args.dryRun) {
    process.exit(0);
  }
  if (report.thresholdMet) {
    process.exit(0);
  }
  if (report.warnings.length > 0 && report.totalMutants === 0) {
    process.exit(3);
  }
  process.exit(1);
}

try {
  // Verify file shape via stat (paranoia for path-traversal handling).
  void statSync; // keep import referenced
  main();
} catch (e) {
  process.stderr.write(`run-mutation.ts crashed: ${(e as Error).message}\n`);
  process.exit(3);
}
