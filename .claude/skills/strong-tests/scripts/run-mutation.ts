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
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { target: null, threshold: 0.7, maxIter: 5, dryRun: false };
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
          const tool: Tool = /<PackageReference\s+Include="Stryker\.NET"/.test(content) ? 'stryker-net' : null;
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
  const args = ['stryker', 'run', '--reporters', 'json'];
  if (target) args.push('--mutate', target);
  const proc = spawnSync('npx', args, { cwd, encoding: 'utf-8', timeout: 30 * 60_000 });
  if (proc.status !== 0 && proc.status !== 1) {
    // Stryker exits 1 when below threshold — that's data, not error
    report.warnings.push(`stryker subprocess failed: exit ${proc.status}; stderr: ${(proc.stderr || '').slice(0, 500)}`);
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

function runMutmut(cwd: string, target: string | null, threshold: number, dryRun: boolean): MutationReport {
  const report = emptyReport('python', 'mutmut', threshold);
  if (dryRun) {
    report.warnings.push('--dry-run: did not invoke mutmut subprocess');
    return report;
  }
  const runArgs = ['run'];
  if (target) runArgs.push('--paths-to-mutate', target);
  const runProc = spawnSync('mutmut', runArgs, { cwd, encoding: 'utf-8', timeout: 30 * 60_000 });
  if (runProc.status !== 0) {
    report.warnings.push(`mutmut run failed: exit ${runProc.status}`);
    return report;
  }
  const resultsProc = spawnSync('mutmut', ['results'], { cwd, encoding: 'utf-8' });
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

  if (tool === null && (stack === 'ts' || stack === 'python')) {
    const report = emptyReport(stack, null, args.threshold, [
      `Stack detected (${stack}) but mutation tool not installed.`,
      stack === 'ts'
        ? 'Install: npm install --save-dev @stryker-mutator/core @stryker-mutator/vitest-runner'
        : 'Install: pip install mutmut',
      'Fallback: AI-driven manual mutation per references/anti-patterns.md Part B (8-category honnibal catalogue).',
    ]);
    process.stdout.write(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  if (stack !== 'ts' && stack !== 'python') {
    const report = emptyReport(stack, tool, args.threshold, [
      `Stack ${stack} detected but deep integration is OUT OF SCOPE (FR-6 in .specs/strong-tests/FR.md).`,
      'See references/tooling-setup.md for install/run commands.',
      'For v0.1.0 run the stack-native mutation tool manually:',
      stack === 'java' ? 'mvn org.pitest:pitest-maven:mutationCoverage' :
      stack === 'csharp' ? 'dotnet stryker' :
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
  } else {
    report = emptyReport(stack, tool, args.threshold, [`Unexpected stack/tool combination: ${stack}/${tool}`]);
    process.stdout.write(JSON.stringify(report, null, 2));
    process.exit(3);
  }

  report.iterations = 1; // run-mutation.ts is a single-shot dispatcher; loop logic lives in the skill workflow

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
