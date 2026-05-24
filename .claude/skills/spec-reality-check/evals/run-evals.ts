#!/usr/bin/env npx tsx
/**
 * spec-reality-check evals runner.
 *
 * Usage:
 *   npx tsx .claude/skills/spec-reality-check/evals/run-evals.ts
 *   npx tsx .claude/skills/spec-reality-check/evals/run-evals.ts --iteration 1
 *
 * Reads evals.json, runs each eval against verify.ts / verify-hook.ts in a
 * tmpdir, scores it per the 6-point rubric, writes aggregate.json into the
 * iteration directory.
 *
 * Per-eval score:
 *   1pt — total count matches (or matches *_min if specified)
 *   1pt — error count matches
 *   1pt — warning count matches (or matches *_min)
 *   1pt — info count matches (or matches *_min)
 *   1pt — all expected_codes present in actual codes
 *   1pt — no codes outside (expected_codes ∪ expected_codes_optional)
 * Total: 6 pts per eval.
 *
 * Hook evals scored on outcome match only (permit vs deny) + substring checks.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SKILL_ROOT, '..', '..', '..');
const VERIFY_TS = path.join(SKILL_ROOT, 'scripts', 'verify.ts');
const HOOK_TS = path.join(SKILL_ROOT, 'scripts', 'verify-hook.ts');
const EVALS_JSON = path.join(__dirname, 'evals.json');

interface EvalCase {
  id: number;
  name: string;
  prompt: string;
  fixture?: string;
  real_spec?: boolean;
  setup?: {
    create_files?: string[];
    git_init?: boolean;
    git_commits?: Array<{ files: Record<string, string>; message: string }>;
  };
  expected_error?: number;
  expected_warning?: number;
  expected_warning_min?: number;
  expected_info?: number;
  expected_info_min?: number;
  expected_total?: number;
  expected_codes?: string[];
  expected_codes_optional?: string[];
  forbidden_codes?: string[];
  format_check?: 'json' | 'human' | 'markdown';
  format_substrings?: string[];
  hook_test?: boolean;
  hook_input?: Record<string, unknown>;
  hook_input_raw?: string;
  fixture_to_copy?: string;
  expected_hook_outcome?: 'deny' | 'permit';
  expected_reason_substrings?: string[];
  category: string;
}

interface EvalResult {
  id: number;
  name: string;
  category: string;
  passed: number;
  total: number;
  duration_ms: number;
  actual_codes: string[];
  expected_codes: string[];
  error_count: number;
  warning_count: number;
  info_count: number;
  total_findings: number;
  failures: string[];
}

interface AggregateResult {
  iteration: number;
  ran_at: string;
  skill_name: string;
  verify_script: string;
  hook_script: string;
  total: number;
  passed: number;
  failed: number;
  pass_rate_pct: number;
  duration_total_ms: number;
  by_category: Record<string, { total: number; passed: number; failed: number }>;
  details: EvalResult[];
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function mkTmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function rmTmp(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

const IS_WIN = process.platform === 'win32';

function quote(s: string): string {
  return IS_WIN ? `"${s.replace(/"/g, '\\"')}"` : `'${s.replace(/'/g, "'\\''")}'`;
}

function runVerify(specDir: string, repoRoot: string, format: 'json' | 'human' | 'markdown' = 'json') {
  const cmd = `npx tsx ${quote(VERIFY_TS)} ${quote(specDir)} --format ${format}`;
  const result = spawnSync(cmd, {
    cwd: repoRoot,
    encoding: 'utf-8',
    windowsHide: true,
    shell: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { status: result.status ?? -1, stdout: result.stdout || '', stderr: result.stderr || (result.error ? String(result.error) : '') };
}

function runHook(input: string, cwd: string) {
  const cmd = `npx tsx ${quote(HOOK_TS)}`;
  const result = spawnSync(cmd, {
    cwd,
    encoding: 'utf-8',
    input,
    windowsHide: true,
    shell: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { status: result.status ?? -1, stdout: result.stdout || '', stderr: result.stderr || (result.error ? String(result.error) : '') };
}

function setupFixture(c: EvalCase): { specDir: string; repoRoot: string; tmpDir: string | null } {
  if (c.real_spec && c.fixture) {
    return {
      specDir: path.resolve(REPO_ROOT, c.fixture),
      repoRoot: REPO_ROOT,
      tmpDir: null,
    };
  }
  const tmpDir = mkTmp(`spec-reality-check-eval-${c.id}-`);
  const repoRoot = tmpDir;
  // Anchor repoRoot so verify.ts findRepoRoot() stops at tmpDir (not walks up to actual repo).
  fs.writeFileSync(path.join(repoRoot, 'package.json'), '{"name":"eval-tmp"}\n');
  let specDir = repoRoot;
  if (c.fixture) {
    const fixtureSrc = path.resolve(REPO_ROOT, c.fixture);
    const specName = path.basename(c.fixture);
    specDir = path.join(repoRoot, '.specs', specName);
    copyDir(fixtureSrc, specDir);
  }
  if (c.setup?.create_files) {
    for (const f of c.setup.create_files) {
      const p = path.join(repoRoot, f);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, 'pre-existing fixture file');
    }
  }
  if (c.setup?.git_init) {
    spawnSync('git', ['init', '-q'], { cwd: repoRoot, encoding: 'utf-8' });
    spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoRoot });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: repoRoot });
    if (c.setup.git_commits) {
      for (const commit of c.setup.git_commits) {
        for (const [filePath, content] of Object.entries(commit.files)) {
          const p = path.join(repoRoot, filePath);
          fs.mkdirSync(path.dirname(p), { recursive: true });
          fs.writeFileSync(p, content);
        }
        spawnSync('git', ['add', '-A'], { cwd: repoRoot });
        spawnSync('git', ['commit', '-q', '-m', commit.message], { cwd: repoRoot });
      }
    }
  }
  return { specDir, repoRoot, tmpDir };
}

function scoreVerifyEval(c: EvalCase, parsed: any): { passed: number; total: number; failures: string[]; actualCodes: string[]; counts: { e: number; w: number; i: number; t: number } } {
  const findings = parsed.findings || [];
  const actualCodes = [...new Set<string>(findings.map((f: any) => f.check as string))];
  const counts = {
    e: findings.filter((f: any) => f.severity === 'ERROR').length,
    w: findings.filter((f: any) => f.severity === 'WARNING').length,
    i: findings.filter((f: any) => f.severity === 'INFO').length,
    t: findings.length,
  };
  const failures: string[] = [];
  let score = 0;

  if (c.expected_total !== undefined) {
    if (counts.t === c.expected_total) score++;
    else failures.push(`total expected=${c.expected_total} actual=${counts.t}`);
  } else {
    score++;
  }

  if (c.expected_error !== undefined) {
    if (counts.e === c.expected_error) score++;
    else failures.push(`error expected=${c.expected_error} actual=${counts.e}`);
  } else {
    score++;
  }

  if (c.expected_warning !== undefined) {
    if (counts.w === c.expected_warning) score++;
    else failures.push(`warning expected=${c.expected_warning} actual=${counts.w}`);
  } else if (c.expected_warning_min !== undefined) {
    if (counts.w >= c.expected_warning_min) score++;
    else failures.push(`warning expected≥${c.expected_warning_min} actual=${counts.w}`);
  } else {
    score++;
  }

  if (c.expected_info !== undefined) {
    if (counts.i === c.expected_info) score++;
    else failures.push(`info expected=${c.expected_info} actual=${counts.i}`);
  } else if (c.expected_info_min !== undefined) {
    if (counts.i >= c.expected_info_min) score++;
    else failures.push(`info expected≥${c.expected_info_min} actual=${counts.i}`);
  } else {
    score++;
  }

  if (c.expected_codes) {
    const missing = c.expected_codes.filter((code) => !actualCodes.includes(code));
    if (missing.length === 0) score++;
    else failures.push(`missing codes: ${missing.join(',')}`);
  } else {
    score++;
  }

  const allowed = new Set([...(c.expected_codes || []), ...(c.expected_codes_optional || [])]);
  const unexpected = actualCodes.filter((code) => !allowed.has(code));
  if (allowed.size === 0 && c.expected_codes === undefined) {
    score++;
  } else if (unexpected.length === 0) {
    score++;
  } else {
    failures.push(`unexpected codes: ${unexpected.join(',')}`);
  }

  if (c.forbidden_codes) {
    const forbidden = c.forbidden_codes.filter((code) => actualCodes.includes(code));
    if (forbidden.length > 0) {
      failures.push(`forbidden codes present: ${forbidden.join(',')}`);
      score = Math.max(0, score - 1);
    }
  }

  return { passed: score, total: 6, failures, actualCodes, counts };
}

function runOne(c: EvalCase): EvalResult {
  const start = Date.now();
  const failures: string[] = [];

  if (c.hook_test) {
    let tmpDir: string | null = null;
    let cwd = REPO_ROOT;
    try {
      if (c.fixture_to_copy) {
        tmpDir = mkTmp(`spec-reality-check-hook-eval-${c.id}-`);
        fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"eval-tmp"}\n');
        const dest = path.join(tmpDir, '.specs', path.basename(c.fixture_to_copy));
        copyDir(path.resolve(REPO_ROOT, c.fixture_to_copy), dest);
        cwd = tmpDir;
      }
      const inputStr = c.hook_input_raw !== undefined
        ? c.hook_input_raw
        : JSON.stringify({ cwd, ...(c.hook_input || {}) });
      const result = runHook(inputStr, cwd);
      let passed = 0;
      const total = c.expected_reason_substrings ? 3 : 2;
      if (result.status === 0) passed++;
      else failures.push(`hook exit=${result.status}`);
      const isDeny = (result.stdout || '').includes('"permissionDecision":"deny"') || (result.stdout || '').includes('"permissionDecision": "deny"');
      const isPermit = !(result.stdout || '').trim();
      if (c.expected_hook_outcome === 'deny') {
        if (isDeny) passed++; else failures.push(`expected deny, got: ${(result.stdout || '').slice(0, 80)}`);
      } else if (c.expected_hook_outcome === 'permit') {
        if (isPermit) passed++; else failures.push(`expected permit, got: ${(result.stdout || '').slice(0, 80)}`);
      }
      if (c.expected_reason_substrings) {
        const missing = c.expected_reason_substrings.filter((s) => !(result.stdout || '').includes(s));
        if (missing.length === 0) passed++;
        else failures.push(`missing reason substrings: ${missing.join(',')}`);
      }
      return {
        id: c.id,
        name: c.name,
        category: c.category,
        passed,
        total,
        duration_ms: Date.now() - start,
        actual_codes: [],
        expected_codes: [],
        error_count: 0,
        warning_count: 0,
        info_count: 0,
        total_findings: 0,
        failures,
      };
    } finally {
      if (tmpDir) rmTmp(tmpDir);
    }
  }

  const setup = setupFixture(c);
  try {
    const fmt = c.format_check || 'json';
    const result = runVerify(setup.specDir, setup.repoRoot, fmt);
    if (result.status !== 0) {
      failures.push(`verify exit=${result.status} stderr=${result.stderr.slice(0, 120)}`);
      return {
        id: c.id,
        name: c.name,
        category: c.category,
        passed: 0,
        total: 6,
        duration_ms: Date.now() - start,
        actual_codes: [],
        expected_codes: c.expected_codes || [],
        error_count: 0,
        warning_count: 0,
        info_count: 0,
        total_findings: 0,
        failures,
      };
    }

    let parsed: any;
    if (fmt === 'json') {
      try {
        parsed = JSON.parse(result.stdout);
      } catch (e: any) {
        failures.push(`json parse failed: ${e.message}`);
        return {
          id: c.id,
          name: c.name,
          category: c.category,
          passed: 0,
          total: 6,
          duration_ms: Date.now() - start,
          actual_codes: [],
          expected_codes: c.expected_codes || [],
          error_count: 0,
          warning_count: 0,
          info_count: 0,
          total_findings: 0,
          failures,
        };
      }
    } else {
      const jsonResult = runVerify(setup.specDir, setup.repoRoot, 'json');
      parsed = JSON.parse(jsonResult.stdout);
      if (c.format_substrings) {
        const missing = c.format_substrings.filter((s) => !result.stdout.includes(s));
        if (missing.length > 0) failures.push(`format substrings missing: ${missing.join(',')}`);
      }
    }

    const scored = scoreVerifyEval(c, parsed);
    return {
      id: c.id,
      name: c.name,
      category: c.category,
      passed: scored.passed - (failures.length > 0 ? Math.min(scored.passed, failures.length) : 0),
      total: scored.total,
      duration_ms: Date.now() - start,
      actual_codes: scored.actualCodes,
      expected_codes: c.expected_codes || [],
      error_count: scored.counts.e,
      warning_count: scored.counts.w,
      info_count: scored.counts.i,
      total_findings: scored.counts.t,
      failures: [...failures, ...scored.failures],
    };
  } finally {
    if (setup.tmpDir) rmTmp(setup.tmpDir);
  }
}

function aggregate(results: EvalResult[]): AggregateResult {
  const passed = results.filter((r) => r.passed === r.total).length;
  const failed = results.length - passed;
  const totalScore = results.reduce((s, r) => s + r.passed, 0);
  const maxScore = results.reduce((s, r) => s + r.total, 0);
  const by_category: Record<string, { total: number; passed: number; failed: number }> = {};
  for (const r of results) {
    if (!by_category[r.category]) by_category[r.category] = { total: 0, passed: 0, failed: 0 };
    by_category[r.category].total++;
    if (r.passed === r.total) by_category[r.category].passed++;
    else by_category[r.category].failed++;
  }
  return {
    iteration: 1,
    ran_at: new Date().toISOString(),
    skill_name: 'spec-reality-check',
    verify_script: '.claude/skills/spec-reality-check/scripts/verify.ts',
    hook_script: '.claude/skills/spec-reality-check/scripts/verify-hook.ts',
    total: results.length,
    passed,
    failed,
    pass_rate_pct: Math.round((totalScore / maxScore) * 10000) / 100,
    duration_total_ms: results.reduce((s, r) => s + r.duration_ms, 0),
    by_category,
    details: results,
  };
}

function main(): number {
  if (!fs.existsSync(EVALS_JSON)) {
    console.error(`evals.json not found: ${EVALS_JSON}`);
    return 1;
  }
  const cfg = JSON.parse(fs.readFileSync(EVALS_JSON, 'utf-8'));
  const evals: EvalCase[] = cfg.evals;
  const iteration = cfg.iteration ?? 1;
  const outDir = path.join(__dirname, 'iterations', `iteration-${iteration}`);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Running ${evals.length} evals for ${cfg.skill_name} iteration-${iteration}...`);
  const results: EvalResult[] = [];
  for (const c of evals) {
    process.stdout.write(`  [${c.id}] ${c.name} ... `);
    const r = runOne(c);
    results.push(r);
    const status = r.passed === r.total ? 'PASS' : 'FAIL';
    console.log(`${status} ${r.passed}/${r.total} (${r.duration_ms}ms)`);
    if (r.failures.length > 0) {
      for (const f of r.failures) console.log(`      - ${f}`);
    }
  }

  const agg = aggregate(results);
  const outPath = path.join(outDir, 'aggregate.json');
  fs.writeFileSync(outPath, JSON.stringify(agg, null, 2) + '\n');
  console.log(`\nAggregate written to: ${outPath}`);
  console.log(`Total: ${agg.passed}/${agg.total} evals fully passed (${agg.pass_rate_pct}% points)`);
  console.log(`Duration: ${(agg.duration_total_ms / 1000).toFixed(1)}s`);
  console.log(`By category:`);
  for (const [cat, st] of Object.entries(agg.by_category)) {
    console.log(`  ${cat}: ${st.passed}/${st.total}`);
  }
  return agg.failed === 0 ? 0 : 1;
}

const isDirectRun = (() => {
  try {
    const entry = process.argv[1] || '';
    return entry.endsWith('run-evals.ts') || entry.endsWith('run-evals.js');
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  process.exit(main());
}
