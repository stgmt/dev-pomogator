#!/usr/bin/env node
/**
 * Deterministic mutation-kill verifier (inject+restore) — the trustworthy unit the flaky
 * @stryker-mutator/cucumber-runner aggregate can't provide (see
 * audit-reports/stryker-bdd-mutation-finding.md «PROVEN root cause»: the runner reuses
 * supportCodeLibrary across mutants → up to 48 verdict flips between identical runs).
 *
 * Given a mutant (file + exact original→mutant string) and the covering cucumber scenario,
 * it proves the kill deterministically:
 *   1. baseline: run ONLY the covering scenario → MUST pass (green start, else refuse).
 *   2. inject:   replace original→mutant on disk → run the scenario → expect FAIL (= killed).
 *   3. restore:  ALWAYS put the file back (try/finally), then re-run → MUST pass (clean restore).
 * Verdict: KILLED (scenario failed under the mutant) | SURVIVED (scenario still passed).
 *
 * Usage: npx tsx tools/stryker-mutation/verify-kill.ts <spec.json>
 *   spec.json = { file, original, mutant, config, name }
 *     file     — production file to mutate (relative to cwd)
 *     original — exact substring to replace (must occur exactly once region; first match used)
 *     mutant   — replacement substring (the mutation)
 *     config   — cucumber config path (a THROWAWAY config, never the canonical default profile)
 *     name     — cucumber --name regex selecting ONLY the covering scenario(s)
 *
 * Node builtins only (fs, child_process) — safe to ship in-plugin.
 */
import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';

export interface KillSpec {
  file: string;
  original: string;
  mutant: string;
  config: string;
  name: string;
  /** optional human label for batch reports (e.g. "detect-invariant.ts:299 StringLiteral"). */
  label?: string;
}

export interface ScenarioRun {
  /** true = ≥1 scenario ran and none failed (cucumber exit 0). */
  passed: boolean;
  /** scenarios actually executed (0 ⇒ the --name matched nothing — not a real pass). */
  ran: number;
  summary: string;
}

const CUKE_BIN = 'node_modules/@cucumber/cucumber/bin/cucumber.js';

/** Run ONLY the covering scenario(s) via cucumber --name. exit 0 + ≥1 ran + 0 failed = passed. */
export function runScenario(config: string, name: string): ScenarioRun {
  const r = spawnSync('node', ['--import', 'tsx', CUKE_BIN, '-c', config, '--name', name], {
    encoding: 'utf-8',
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const m = out.match(/(\d+) scenarios? \(([^)]*)\)/);
  const ran = m ? parseInt(m[1], 10) : 0;
  const failed = /\bfailed\b/.test(m?.[2] ?? '');
  return { passed: r.status === 0 && ran >= 1 && !failed, ran, summary: m ? m[0] : `exit ${r.status}` };
}

export interface KillVerdict {
  verdict: 'KILLED' | 'SURVIVED';
  killed: boolean;
  baseline: string;
  mutant: string;
  restored: boolean;
}

/**
 * Deterministically verify whether the covering scenario kills the mutant. Always restores the file.
 * Throws if `original` is absent or the baseline is not green (can't verify against a red start).
 */
export function verifyKill(spec: KillSpec): KillVerdict {
  const orig = fs.readFileSync(spec.file, 'utf-8');
  if (!orig.includes(spec.original)) {
    throw new Error(`original string not found in ${spec.file}`);
  }
  const baseline = runScenario(spec.config, spec.name);
  if (!baseline.passed) {
    throw new Error(`baseline not green (${baseline.summary}) — cannot verify a kill against a red/empty start`);
  }
  let mutantRun: ScenarioRun;
  try {
    fs.writeFileSync(spec.file, orig.replace(spec.original, () => spec.mutant));
    mutantRun = runScenario(spec.config, spec.name);
  } finally {
    fs.writeFileSync(spec.file, orig); // ALWAYS restore — never leave the tree mutated
  }
  const restored = runScenario(spec.config, spec.name);
  const killed = !mutantRun.passed; // scenario FAILED under the mutant ⇒ killed
  return {
    verdict: killed ? 'KILLED' : 'SURVIVED',
    killed,
    baseline: baseline.summary,
    mutant: mutantRun.summary,
    restored: restored.passed,
  };
}

export interface BatchResult {
  total: number;
  killed: number;
  survived: number;
  errors: number;
  results: Array<{ label: string; verdict: 'KILLED' | 'SURVIVED' | 'ERROR'; detail: KillVerdict | { error: string } }>;
}

/** Verify a LIST of mutants — the actual gate over a survivor set. Restores each file per-mutant. */
export function verifyBatch(specs: KillSpec[]): BatchResult {
  const results = specs.map((s) => {
    const label = s.label ?? `${s.file}: ${s.original.slice(0, 40)}`;
    try {
      const v = verifyKill(s);
      return { label, verdict: v.verdict, detail: v };
    } catch (e) {
      return { label, verdict: 'ERROR' as const, detail: { error: e instanceof Error ? e.message : String(e) } };
    }
  });
  return {
    total: results.length,
    killed: results.filter((r) => r.verdict === 'KILLED').length,
    survived: results.filter((r) => r.verdict === 'SURVIVED').length,
    errors: results.filter((r) => r.verdict === 'ERROR').length,
    results,
  };
}

const isDirectRun =
  process.argv[1]?.endsWith('verify-kill.ts') || process.argv[1]?.endsWith('verify-kill.js');
if (isDirectRun) {
  const specPath = process.argv[2];
  if (!specPath) {
    console.error('usage: verify-kill.ts <spec.json>  (one { file, original, mutant, config, name } OR an array of them)');
    process.exit(2);
  }
  const parsed = JSON.parse(fs.readFileSync(specPath, 'utf-8')) as KillSpec | KillSpec[];
  if (Array.isArray(parsed)) {
    const batch = verifyBatch(parsed);
    console.log(JSON.stringify(batch, null, 2));
    // gate exit: 0 iff EVERY mutant was KILLED (no survivors, no errors).
    process.exit(batch.killed === batch.total ? 0 : 1);
  } else {
    const v = verifyKill(parsed);
    console.log(JSON.stringify(v, null, 2));
    // exit 0 only when the mutant was KILLED and the file restored clean — a usable gate exit code.
    process.exit(v.killed && v.restored ? 0 : 1);
  }
}
