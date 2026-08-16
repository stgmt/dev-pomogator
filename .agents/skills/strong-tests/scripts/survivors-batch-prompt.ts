#!/usr/bin/env node
/**
 * survivors-batch-prompt.ts — emit LLM-ready prompt batches from MutationReport survivors.
 *
 * Reads a mutation report JSON (produced by run-mutation.ts --analyze-survivors), groups
 * survivors into batches of N (default 50), emits one prompt per batch as ready-to-feed
 * input для Agent(subagent_type="general-purpose") invocation.
 *
 * Per Meta ACH Equivalence Detector pattern (engineering.fb.com 2025-09-30, 0.95 precision):
 * each prompt asks LLM to flag equivalent vs real survivors с structured reasoning.
 *
 * Usage:
 *   npx tsx survivors-batch-prompt.ts <mutation-report.json> [--batch-size=50] [--budget-usd=2]
 *
 * Output (per batch на stdout):
 *   {"batch_id": "1/8", "survivors": [...], "prompt": "...", "estimated_cost_usd": 0.18}
 *
 * AI orchestrator pipeline:
 *   1. Read each batch JSON line from stdout
 *   2. For each batch: spawn Agent(general-purpose) с prompt + survivors context
 *   3. Save Agent response to verdicts-batch-N.json
 *   4. After ALL batches: spawn merge-survivor-verdicts.ts
 *
 * Cost guard: aborts emit если estimated_cost > budget. Each batch ~3K input + 2K output tokens.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

interface Survivor {
  file: string;
  line: number;
  column?: number;
  mutator: string;
  originalCode?: string;
  mutatedCode?: string;
  status: string;
  reconstructedContext?: string | null;
}

interface ParsedArgs {
  reportPath: string;
  batchSize: number;
  budgetUsd: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { reportPath: '', batchSize: 50, budgetUsd: 2.0 };
  for (const a of argv) {
    if (a.startsWith('--batch-size=')) {
      const v = Number(a.slice('--batch-size='.length));
      if (!Number.isInteger(v) || v < 1 || v > 200) {
        throw new Error(`Invalid --batch-size: ${a}. Must be integer in [1, 200].`);
      }
      args.batchSize = v;
    } else if (a.startsWith('--budget-usd=')) {
      const v = Number(a.slice('--budget-usd='.length));
      if (!Number.isFinite(v) || v < 0.1 || v > 100) {
        throw new Error(`Invalid --budget-usd: ${a}. Must be number in [0.1, 100].`);
      }
      args.budgetUsd = v;
    } else if (!a.startsWith('--') && !args.reportPath) {
      args.reportPath = a;
    }
  }
  if (!args.reportPath) {
    throw new Error('Usage: survivors-batch-prompt.ts <mutation-report.json> [--batch-size=50] [--budget-usd=2]');
  }
  return args;
}

const PROMPT_TEMPLATE = `You are an expert code reviewer specializing in mutation testing analysis per Meta ACH Equivalence Detector pattern (engineering.fb.com 2025-09-30, 0.95 precision target).

You will receive a batch of mutation survivors — code mutations that the existing test suite did NOT catch. For EACH survivor, determine whether it is:

- **EQUIVALENT** (cosmetic / dead-code / mathematically identical) — survivor cannot affect production behavior so no test could catch it
- **REAL_GAP** (test coverage hole) — survivor changes behavior but tests don't assert that behavior

Output JSON array verdicts in EXACT format:

\`\`\`json
[
  {
    "survivor_id": "<file>:<line>:<column>",
    "equivalentSuspect": true | false,
    "confidence": "high" | "medium" | "low",
    "rationale": "<1-2 sentence explanation>"
  }
]
\`\`\`

Be CONSERVATIVE: only flag equivalent when you are confident. Default to REAL_GAP if ambiguous. Per Meta ACH study, false negatives (missed real gaps) are worse than false positives (extra human review).

Survivors batch:

`;

// strong-tests:skip pure 1-to-1 batching: groups input into fixed-size chunks; output length = ceil(input/batchSize) deterministic by construction
function batchSurvivors(survivors: Survivor[], batchSize: number): Survivor[][] {
  const batches: Survivor[][] = [];
  for (let i = 0; i < survivors.length; i += batchSize) {
    batches.push(survivors.slice(i, i + batchSize));
  }
  return batches;
}

function estimateBatchCost(batch: Survivor[]): number {
  // Rough heuristic: ~150 tokens per survivor input (context + metadata), ~80 tokens per verdict output
  const inputTokens = 500 + batch.length * 150; // prompt prefix + per-survivor
  const outputTokens = batch.length * 80;
  // Sonnet 4.6 pricing: $3/MTok input + $15/MTok output (approximate)
  const costUsd = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;
  return costUsd;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const absPath = path.resolve(args.reportPath);
  if (!fs.existsSync(absPath)) {
    process.stderr.write(`Report file not found: ${absPath}\n`);
    process.exit(2);
  }

  let report: { survivors?: Survivor[]; gaps?: any[] };
  try {
    report = JSON.parse(fs.readFileSync(absPath, 'utf-8'));
  } catch (e) {
    process.stderr.write(`Failed to parse report JSON: ${(e as Error).message}\n`);
    process.exit(2);
  }

  // Prefer gaps[] (annotated survivors с reconstructedContext) если present, else survivors[]
  const source = report.gaps && report.gaps.length > 0 ? report.gaps : report.survivors ?? [];
  if (source.length === 0) {
    process.stderr.write('No survivors to analyze (report.survivors and report.gaps both empty)\n');
    process.exit(0);
  }

  const batches = batchSurvivors(source as Survivor[], args.batchSize);
  let totalCost = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const cost = estimateBatchCost(batch);
    totalCost += cost;
    if (totalCost > args.budgetUsd) {
      process.stderr.write(
        `Budget exceeded at batch ${i + 1}/${batches.length}: $${totalCost.toFixed(2)} > $${args.budgetUsd.toFixed(2)}. Aborting emit. Increase --budget-usd or reduce --batch-size.\n`,
      );
      process.exit(3);
    }
    const promptBody = `${PROMPT_TEMPLATE}${JSON.stringify(batch, null, 2)}`;
    const entry = {
      batch_id: `${i + 1}/${batches.length}`,
      survivors_count: batch.length,
      estimated_cost_usd: Number(cost.toFixed(4)),
      cumulative_cost_usd: Number(totalCost.toFixed(4)),
      prompt: promptBody,
    };
    process.stdout.write(JSON.stringify(entry) + '\n');
  }
}

main();
