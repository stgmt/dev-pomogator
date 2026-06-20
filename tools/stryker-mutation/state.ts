#!/usr/bin/env npx tsx
/**
 * Mutation state — remembers the last Stryker run per target so a new session sees what's covered
 * and the last score without re-running (W3 of plan iridescent-giggling-lemur). Atomic write per the
 * `atomic-config-save` rule (temp file + rename). builtins-only.
 *
 * Used by the `stryker-mutation` skill. CLI:
 *   npx tsx tools/stryker-mutation/state.ts record <target> <runner> <reports/.../mutation.json>
 *   npx tsx tools/stryker-mutation/state.ts show
 */
import fs from 'node:fs';
import path from 'node:path';

const STATE_PATH = path.join('.dev-pomogator', '.mutation-state.json');

export interface MutationRun {
  target: string;
  runner: string; // 'vitest' | 'cucumber'
  score: number;
  killed: number;
  survived: number;
  noCoverage: number;
  timeout: number;
  runtimeError: number;
  ts: string;
}

export interface MutationState {
  runs: Record<string, MutationRun>; // keyed by target
}

export function readState(): MutationState {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')) as MutationState;
  } catch {
    return { runs: {} };
  }
}

/** Atomic write: temp file in the same dir + rename (atomic-config-save). */
export function writeState(state: MutationState): void {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  const tmp = `${STATE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_PATH);
}

/** Tally a Stryker mutation.json into a MutationRun (without a timestamp — caller stamps it). */
export function tallyReport(reportPath: string): Omit<MutationRun, 'target' | 'runner' | 'ts'> {
  const j = JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as {
    files?: Record<string, { mutants?: Array<{ status: string }> }>;
  };
  let killed = 0, survived = 0, noCoverage = 0, timeout = 0, runtimeError = 0;
  for (const f of Object.values(j.files ?? {})) {
    for (const m of f.mutants ?? []) {
      if (m.status === 'Killed') killed++;
      else if (m.status === 'Survived') survived++;
      else if (m.status === 'NoCoverage') noCoverage++;
      else if (m.status === 'Timeout') timeout++;
      else if (m.status === 'RuntimeError') runtimeError++;
    }
  }
  const detected = killed + timeout;
  const valid = detected + survived + noCoverage;
  const score = valid ? Number(((detected / valid) * 100).toFixed(2)) : 0;
  return { score, killed, survived, noCoverage, timeout, runtimeError };
}

export function recordRun(target: string, runner: string, reportPath: string, nowIso: string): MutationRun {
  const tally = tallyReport(reportPath);
  const run: MutationRun = { target, runner, ...tally, ts: nowIso };
  const state = readState();
  state.runs[target] = run;
  writeState(state);
  return run;
}

// CLI — guarded so importing the module doesn't run main()
const isDirectRun =
  process.argv[1]?.endsWith('state.ts') || process.argv[1]?.endsWith('state.js');
if (isDirectRun) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'record') {
    const [target, runner, reportPath] = rest;
    if (!target || !runner || !reportPath) {
      console.error('usage: state.ts record <target> <runner> <mutation.json>');
      process.exit(1);
    }
    const run = recordRun(target, runner, reportPath, new Date().toISOString());
    console.log(`recorded ${target} (${runner}): score=${run.score}% killed=${run.killed} survived=${run.survived} noCoverage=${run.noCoverage}`);
  } else if (cmd === 'show') {
    const state = readState();
    const rows = Object.values(state.runs);
    if (rows.length === 0) console.log('(no recorded mutation runs)');
    for (const r of rows) console.log(`${r.target} [${r.runner}] ${r.score}% (killed=${r.killed} survived=${r.survived} noCov=${r.noCoverage}) @ ${r.ts}`);
  } else {
    console.error('usage: state.ts record|show');
    process.exit(1);
  }
}
