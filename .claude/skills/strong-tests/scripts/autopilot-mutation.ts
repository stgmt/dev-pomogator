#!/usr/bin/env node
/**
 * autopilot-mutation.ts — minimal viable mutation-feedback iteration runner.
 *
 * Closes v0.5.0 §6.3 promise: cycle через run-mutation → batch-prompt → (manual Agent or stub) →
 * merge-verdicts → write killer tests → re-run, до достижения threshold или max-iter.
 *
 * v0.6.0 MINIMAL implementation: orchestrates run-mutation + batch-prompt + merge-verdicts only.
 * Killer-test writing требует Skill subworkflow (deferred к v0.7.0+).
 *
 * Usage:
 *   npx tsx autopilot-mutation.ts <target> [--threshold=70] [--max-iter=5] [--budget-usd=10]
 *
 * Output (per-iter trace JSON to stdout):
 *   {"iter": 1, "killRate": 0.51, "survivors": 200, "thresholdMet": false, "action": "batch-prompt-emitted"}
 *   ...
 *   {"final": true, "killRate": 0.78, "iterations": 3, "thresholdMet": true}
 *
 * NOTE: AI agent должен после каждой iteration:
 *   1. Read emitted batch JSON
 *   2. Invoke Agent(general-purpose) с prompts
 *   3. Save verdicts-iter-N.json
 *   4. Run merge-verdicts-iter-N
 *   5. Use enriched gaps[] для writing killer tests (manual or via Skill)
 *   6. Re-invoke autopilot (--iter=N+1)
 *
 * v0.6.0 limitation: this script handles bookkeeping (iter counter, threshold check, exit condition).
 * Full automation (Agent dispatch + killer test gen) requires Skill workflow — see §6.3 SKILL.md.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename_local = fileURLToPath(import.meta.url);
const __dirname_local = path.dirname(__filename_local);

interface ParsedArgs {
  target: string;
  threshold: number;
  maxIter: number;
  budgetUsd: number;
  iterNum: number; // for resumed runs
  startFromIter: number;
}

interface IterationResult {
  iter: number;
  killRate: number | null;
  survivors: number;
  thresholdMet: boolean;
  action: string;
  reportPath?: string;
  batchesPath?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    target: '',
    threshold: 0.7,
    maxIter: 5,
    budgetUsd: 10.0,
    iterNum: 1,
    startFromIter: 1,
  };
  for (const a of argv) {
    if (a.startsWith('--threshold=')) {
      const v = Number(a.slice('--threshold='.length));
      args.threshold = v > 1 ? v / 100 : v;
    } else if (a.startsWith('--max-iter=')) {
      args.maxIter = Number(a.slice('--max-iter='.length));
    } else if (a.startsWith('--budget-usd=')) {
      args.budgetUsd = Number(a.slice('--budget-usd='.length));
    } else if (a.startsWith('--iter=')) {
      args.iterNum = Number(a.slice('--iter='.length));
      args.startFromIter = args.iterNum;
    } else if (!a.startsWith('--') && !args.target) {
      args.target = a;
    }
  }
  if (!args.target) {
    throw new Error('Usage: autopilot-mutation.ts <target> [--threshold=70] [--max-iter=5] [--budget-usd=10] [--iter=N]');
  }
  return args;
}

const SCRIPT_DIR = __dirname_local;
const RUN_MUTATION = path.join(SCRIPT_DIR, 'run-mutation.ts');
const BATCH_PROMPT = path.join(SCRIPT_DIR, 'survivors-batch-prompt.ts');

function emitTrace(entry: IterationResult | Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(entry) + '\n');
}

function runIteration(args: ParsedArgs, iter: number): IterationResult {
  const reportPath = path.join(args.target, `autopilot-iter-${iter}-report.json`);
  const batchesPath = path.join(args.target, `autopilot-iter-${iter}-batches.jsonl`);

  // Step 1: run mutation
  emitTrace({ iter, step: 'run-mutation', target: args.target });
  const mutResult = spawnSync('npx', ['tsx', RUN_MUTATION, '--analyze-survivors'], {
    cwd: args.target,
    encoding: 'utf-8',
    timeout: 60 * 60_000,
    env: process.env,
  });
  if (mutResult.status === null || mutResult.status > 2) {
    return { iter, killRate: null, survivors: 0, thresholdMet: false, action: `run-mutation failed (exit ${mutResult.status})` };
  }

  let report: { killRate?: number; survivors?: any[]; gaps?: any[]; thresholdMet?: boolean };
  try {
    report = JSON.parse(mutResult.stdout);
  } catch {
    return { iter, killRate: null, survivors: 0, thresholdMet: false, action: 'run-mutation output not parseable as JSON' };
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const killRate = report.killRate ?? null;
  const survivorsCount = (report.gaps?.length ?? report.survivors?.length ?? 0) as number;
  const thresholdMet = killRate !== null && killRate >= args.threshold;

  if (thresholdMet) {
    return { iter, killRate, survivors: survivorsCount, thresholdMet: true, action: 'threshold-met', reportPath };
  }

  if (survivorsCount === 0) {
    return { iter, killRate, survivors: 0, thresholdMet: false, action: 'no-survivors-to-batch', reportPath };
  }

  // Step 2: batch-prompt
  emitTrace({ iter, step: 'batch-prompt', survivors: survivorsCount });
  const batchResult = spawnSync(
    'npx',
    ['tsx', BATCH_PROMPT, reportPath, `--budget-usd=${args.budgetUsd}`],
    { cwd: args.target, encoding: 'utf-8' },
  );
  if (batchResult.status !== 0) {
    return {
      iter,
      killRate,
      survivors: survivorsCount,
      thresholdMet: false,
      action: `batch-prompt failed (exit ${batchResult.status}): ${(batchResult.stderr ?? '').slice(0, 200)}`,
      reportPath,
    };
  }
  fs.writeFileSync(batchesPath, batchResult.stdout);

  return {
    iter,
    killRate,
    survivors: survivorsCount,
    thresholdMet: false,
    action: 'awaiting-agent-verdicts',
    reportPath,
    batchesPath,
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.target)) {
    process.stderr.write(`Target not found: ${args.target}\n`);
    process.exit(2);
  }

  emitTrace({
    autopilot: 'start',
    target: args.target,
    threshold: args.threshold,
    maxIter: args.maxIter,
    budgetUsd: args.budgetUsd,
    startFromIter: args.startFromIter,
  });

  // Run ONE iteration per invocation (this script is invoked by Skill workflow per-iter)
  // because Agent() dispatch must happen between iterations и cannot be done in Node script alone
  const result = runIteration(args, args.iterNum);
  emitTrace(result);

  if (result.thresholdMet) {
    emitTrace({ final: true, iterations: args.iterNum, killRate: result.killRate, thresholdMet: true });
    process.exit(0);
  }

  if (args.iterNum >= args.maxIter) {
    emitTrace({ final: true, iterations: args.iterNum, killRate: result.killRate, thresholdMet: false, reason: 'max-iter-reached' });
    process.exit(1);
  }

  if (result.action === 'awaiting-agent-verdicts') {
    emitTrace({
      next_steps: [
        `1. AI agent reads ${result.batchesPath}`,
        `2. For each batch in JSONL: invoke Agent(subagent_type="general-purpose") with batch.prompt`,
        `3. Save Agent verdicts to ${args.target}/autopilot-iter-${args.iterNum}-verdicts-batch-{N}.json`,
        `4. Run merge-survivor-verdicts.ts ${result.reportPath} <verdicts-files>...`,
        `5. Use enriched report.gaps[] (с equivalentSuspect) to author killer tests`,
        `6. Re-invoke: npx tsx autopilot-mutation.ts ${args.target} --iter=${args.iterNum + 1}`,
      ],
    });
    process.exit(0);
  }

  emitTrace({ final: true, iterations: args.iterNum, killRate: result.killRate, thresholdMet: false, reason: result.action });
  process.exit(1);
}

main();
