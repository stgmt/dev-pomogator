/**
 * strong-tests / test-author EVAL — mutation-resistance rubric (FR-TA3).
 *
 * Unlike spec-reality-check's evals (which count findings from a DETERMINISTIC
 * verify.ts), this eval judges TEST STRENGTH: a candidate test is run against a
 * {good, broken} impl pair and verdicted by whether it actually catches the bug.
 *
 *   STRONG              = passes on good AND fails on broken (mutation-resistant)
 *   FAKE-POSITIVE-RISK  = passes on BOTH (never exercised the invariant)
 *   BROKEN              = fails on good (the test itself is wrong)
 *
 * This is the gate any test-author / strong-tests §6.5 output must clear before
 * a task is flipped to DONE. The fixtures live under tests/fixtures/test-author/.
 *
 * Run from repo root:  npx tsx .claude/skills/strong-tests/evals/run-evals.ts
 * Exit 0 = every candidate's verdict matched its expectation; 1 = mismatch.
 *
 * @see .claude/skills/strong-tests/SKILL.md §6.5
 * @see .claude/rules/spec-reality-check/maintain-evals-on-edit.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..');

type Verdict = 'STRONG' | 'FAKE-POSITIVE-RISK' | 'BROKEN';
interface Candidate {
  test: string;
  expect: Verdict;
}
interface EvalCase {
  id: string;
  good: string;
  broken: string;
  broken_desc: string;
  export: string;
  candidates: Candidate[];
}
interface EvalsFile {
  version: number;
  rubric: string;
  cases: EvalCase[];
}

async function importFromRepo(relPath: string): Promise<Record<string, unknown>> {
  const abs = path.resolve(REPO_ROOT, relPath);
  return (await import(pathToFileURL(abs).href)) as Record<string, unknown>;
}

/** Run a candidate's `run(impl)` and treat a throw or non-true as "did not pass". */
function safeRun(run: (impl: unknown) => boolean, impl: unknown): boolean {
  try {
    return run(impl) === true;
  } catch {
    return false;
  }
}

function verdictOf(passGood: boolean, passBroken: boolean): Verdict {
  if (!passGood) return 'BROKEN';
  if (passBroken) return 'FAKE-POSITIVE-RISK';
  return 'STRONG';
}

async function main(): Promise<number> {
  const evalsPath = path.join(HERE, 'evals.json');
  const evals = JSON.parse(fs.readFileSync(evalsPath, 'utf-8')) as EvalsFile;

  let pass = 0;
  let fail = 0;
  const rows: string[] = [];

  for (const c of evals.cases) {
    const goodMod = await importFromRepo(c.good);
    const brokenMod = await importFromRepo(c.broken);
    const goodImpl = goodMod[c.export];
    const brokenImpl = brokenMod[c.export];

    for (const cand of c.candidates) {
      const candMod = await importFromRepo(cand.test);
      const run = candMod.run as (impl: unknown) => boolean;
      const name = (candMod.name as string) ?? cand.test;

      const passGood = safeRun(run, goodImpl);
      const passBroken = safeRun(run, brokenImpl);
      const verdict = verdictOf(passGood, passBroken);
      const ok = verdict === cand.expect;
      ok ? pass++ : fail++;

      rows.push(
        `${ok ? '✅' : '❌'}  ${c.id} :: ${name}\n` +
          `      good=${passGood ? 'pass' : 'FAIL'}  broken=${passBroken ? 'pass' : 'FAIL'}` +
          `  → ${verdict}${ok ? '' : `  (expected ${cand.expect})`}`,
      );
    }
  }

  console.log('strong-tests mutation-resistance eval\n');
  console.log(`rubric: ${evals.rubric}\n`);
  console.log(rows.join('\n'));
  console.log(`\n${pass}/${pass + fail} candidates matched expected verdict.`);
  return fail === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error('eval crashed:', err);
    process.exit(2);
  },
);
