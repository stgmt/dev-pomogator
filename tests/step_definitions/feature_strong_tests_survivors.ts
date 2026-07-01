/**
 * Step definitions for TESTQUAL001_29–33 survivor-batch + merge-verdicts scenarios
 * Spec: strong-tests  @feature3 (mutation-feedback tooling)
 *
 * Classification:
 *   TESTQUAL001_29–33 — runtime: spawn survivors-batch-prompt.ts and merge-survivor-verdicts.ts
 *                        via process.execPath + ['--import', 'tsx', ABS_PATH, ...args], cwd=REPO_ROOT
 *
 * Engine: .claude/skills/strong-tests/scripts/survivors-batch-prompt.ts (CLI-only, no exports)
 *         .claude/skills/strong-tests/scripts/merge-survivor-verdicts.ts (CLI-only, no exports)
 *
 * Mutation gutcheck: break batchSurvivors (e.g. change slice boundary) → _29 RED (batch count wrong).
 *                    break survivorId key → _31 RED (merge count 0).
 *
 * Step-def signature: function (this: SurvivorsWorld, captures...) — `this:` is a TYPE ANNOTATION.
 * The World is BOUND by Cucumber; it is NOT passed as a real argument.
 * REGEX step patterns (not Cucumber Expressions).
 */

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';
import { Given, When, Then, Before, After, setDefaultTimeout } from '@cucumber/cucumber';

setDefaultTimeout(30_000);

import { fileURLToPath } from 'node:url';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BATCH_PROMPT_PATH = path.join(
  REPO_ROOT,
  '.claude',
  'skills',
  'strong-tests',
  'scripts',
  'survivors-batch-prompt.ts',
);
const MERGE_VERDICTS_PATH = path.join(
  REPO_ROOT,
  '.claude',
  'skills',
  'strong-tests',
  'scripts',
  'merge-survivor-verdicts.ts',
);

// ---------------------------------------------------------------------------
// World state per scenario
// ---------------------------------------------------------------------------
interface SurvivorsWorld {
  tempDir: string | null;
  reportPath: string | null;
  verdictPath: string | null;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

let sworld: SurvivorsWorld = {
  tempDir: null,
  reportPath: null,
  verdictPath: null,
  stdout: '',
  stderr: '',
  exitCode: null,
};

Before({ tags: '@feature3 and not @manual' }, function (this: SurvivorsWorld) {
  sworld = {
    tempDir: null,
    reportPath: null,
    verdictPath: null,
    stdout: '',
    stderr: '',
    exitCode: null,
  };
  sworld.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'survivors-bdd-'));
});

After({ tags: '@feature3 and not @manual' }, function (this: SurvivorsWorld) {
  if (sworld.tempDir && fs.existsSync(sworld.tempDir)) {
    fs.rmSync(sworld.tempDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function runBatchPrompt(extraArgs: string[]): { stdout: string; stderr: string; exitCode: number | null } {
  const res = spawnSync(
    process.execPath,
    ['--import', 'tsx', BATCH_PROMPT_PATH, sworld.reportPath!, ...extraArgs],
    { cwd: REPO_ROOT, encoding: 'utf-8', timeout: 20_000 },
  );
  return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', exitCode: res.status };
}

function runMergeVerdicts(extraArgs: string[]): { stdout: string; stderr: string; exitCode: number | null } {
  const res = spawnSync(
    process.execPath,
    ['--import', 'tsx', MERGE_VERDICTS_PATH, sworld.reportPath!, ...extraArgs],
    { cwd: REPO_ROOT, encoding: 'utf-8', timeout: 20_000 },
  );
  return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', exitCode: res.status };
}

function makeSurvivor(i: number): object {
  return {
    file: `src/module${i}.ts`,
    line: i + 1,
    column: 0,
    mutator: 'ArithmeticOperator',
    status: 'Survived',
  };
}

function writeReport(survivors: object[], gaps?: object[]): string {
  const reportPath = path.join(sworld.tempDir!, 'report.json');
  const report: Record<string, unknown> = { survivors };
  if (gaps !== undefined) report.gaps = gaps;
  fs.writeFileSync(reportPath, JSON.stringify(report), 'utf-8');
  sworld.reportPath = reportPath;
  return reportPath;
}

// ---------------------------------------------------------------------------
// TESTQUAL001_29 — 130 survivors → 3 batches of 50, monotone cost, prompt keywords
// ---------------------------------------------------------------------------

Given(
  /^a mutation report JSON file containing 130 survivors$/,
  function (this: SurvivorsWorld) {
    const survivors = Array.from({ length: 130 }, (_, i) => makeSurvivor(i));
    writeReport(survivors);
  },
);

When(
  /^survivors-batch-prompt is run on that report with default batch size 50$/,
  function (this: SurvivorsWorld) {
    const res = runBatchPrompt([]);
    sworld.stdout = res.stdout;
    sworld.stderr = res.stderr;
    sworld.exitCode = res.exitCode;
  },
);

Then(
  /^the output SHALL contain exactly 3 batch JSON lines$/,
  function (this: SurvivorsWorld) {
    const lines = sworld.stdout.trim().split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 3, `Expected 3 batch lines but got ${lines.length}:\n${sworld.stdout}`);
  },
);

Then(
  /^the cumulative_cost_usd field SHALL be monotonically increasing across all batches$/,
  function (this: SurvivorsWorld) {
    const lines = sworld.stdout.trim().split('\n').filter(Boolean);
    const costs = lines.map((l) => (JSON.parse(l) as Record<string, unknown>)['cumulative_cost_usd'] as number);
    for (let i = 1; i < costs.length; i++) {
      assert.ok(
        costs[i] > costs[i - 1],
        `Expected monotone increase but batch ${i}: ${costs[i - 1]} → ${costs[i]}`,
      );
    }
  },
);

Then(
  /^each batch prompt SHALL contain the strings Meta ACH and EQUIVALENT and REAL_GAP and survivor_id$/,
  function (this: SurvivorsWorld) {
    const lines = sworld.stdout.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const entry = JSON.parse(line) as Record<string, unknown>;
      const prompt = entry['prompt'] as string;
      assert.ok(prompt.includes('Meta ACH'), `Missing 'Meta ACH' in batch prompt`);
      assert.ok(prompt.includes('EQUIVALENT'), `Missing 'EQUIVALENT' in batch prompt`);
      assert.ok(prompt.includes('REAL_GAP'), `Missing 'REAL_GAP' in batch prompt`);
      assert.ok(prompt.includes('survivor_id'), `Missing 'survivor_id' in batch prompt`);
    }
  },
);

// ---------------------------------------------------------------------------
// TESTQUAL001_30 — 500 survivors + budget-usd=0.1 → exit 3 + stderr "Budget exceeded"
// ---------------------------------------------------------------------------

Given(
  /^a mutation report JSON file containing 500 survivors$/,
  function (this: SurvivorsWorld) {
    const survivors = Array.from({ length: 500 }, (_, i) => makeSurvivor(i));
    writeReport(survivors);
  },
);

When(
  /^survivors-batch-prompt is run with budget-usd 0\.1 on that report$/,
  function (this: SurvivorsWorld) {
    const res = runBatchPrompt(['--budget-usd=0.1']);
    sworld.stdout = res.stdout;
    sworld.stderr = res.stderr;
    sworld.exitCode = res.exitCode;
  },
);

Then(
  /^the process SHALL exit with status 3$/,
  function (this: SurvivorsWorld) {
    assert.strictEqual(sworld.exitCode, 3, `Expected exit code 3 but got ${sworld.exitCode}\nstderr: ${sworld.stderr}`);
  },
);

Then(
  /^stderr SHALL contain the string Budget exceeded$/,
  function (this: SurvivorsWorld) {
    assert.ok(
      sworld.stderr.includes('Budget exceeded'),
      `Expected 'Budget exceeded' in stderr but got:\n${sworld.stderr}`,
    );
  },
);

// ---------------------------------------------------------------------------
// TESTQUAL001_31 — merge verdicts enriches gaps[] with equivalentSuspect + summary
// ---------------------------------------------------------------------------

Given(
  /^a mutation report JSON file with 3 survivors and a verdict JSON file matching all 3 by survivor_id$/,
  function (this: SurvivorsWorld) {
    const survivors = [
      { file: 'src/a.ts', line: 1, column: 0, mutator: 'BlockStatement', status: 'Survived' },
      { file: 'src/b.ts', line: 2, column: 0, mutator: 'StringLiteral', status: 'Survived' },
      { file: 'src/c.ts', line: 3, column: 0, mutator: 'ArithmeticOperator', status: 'Survived' },
    ];
    writeReport(survivors);

    const verdicts = survivors.map((s, i) => ({
      survivor_id: `${s.file}:${s.line}:${s.column}`,
      equivalentSuspect: i % 2 === 0,
      confidence: 'high' as const,
      rationale: `Rationale for survivor ${i}`,
    }));
    sworld.verdictPath = path.join(sworld.tempDir!, 'verdicts.json');
    fs.writeFileSync(sworld.verdictPath, JSON.stringify(verdicts), 'utf-8');
  },
);

When(
  /^merge-survivor-verdicts is run with that report and verdicts file$/,
  function (this: SurvivorsWorld) {
    const res = runMergeVerdicts([sworld.verdictPath!]);
    sworld.stdout = res.stdout;
    sworld.stderr = res.stderr;
    sworld.exitCode = res.exitCode;
  },
);

Then(
  /^the stdout JSON SHALL contain a gaps array with equivalentSuspect fields populated$/,
  function (this: SurvivorsWorld) {
    const report = JSON.parse(sworld.stdout) as Record<string, unknown>;
    const gaps = report['gaps'] as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(gaps) && gaps.length > 0, 'Expected non-empty gaps array');
    const allHaveVerdict = gaps.every((g) => 'equivalentSuspect' in g);
    assert.ok(allHaveVerdict, `Not all gaps have equivalentSuspect: ${JSON.stringify(gaps)}`);
  },
);

Then(
  /^the survivorAnalysis summary SHALL report mergedIntoGaps equal to 3$/,
  function (this: SurvivorsWorld) {
    const report = JSON.parse(sworld.stdout) as Record<string, unknown>;
    const summary = report['survivorAnalysis'] as Record<string, unknown>;
    assert.ok(summary, 'Expected survivorAnalysis in output');
    assert.strictEqual(
      summary['mergedIntoGaps'],
      3,
      `Expected mergedIntoGaps=3 but got ${summary['mergedIntoGaps']}`,
    );
  },
);

// ---------------------------------------------------------------------------
// TESTQUAL001_32 — unmatched verdict IDs → unmatchedVerdicts:1, warning on stderr
// ---------------------------------------------------------------------------

Given(
  /^a mutation report JSON file with 1 survivor and a verdict JSON file with 1 matching and 1 stale verdict$/,
  function (this: SurvivorsWorld) {
    const survivor = { file: 'A.cs', line: 10, column: 5, mutator: 'BlockStatement', status: 'Survived' };
    writeReport([survivor]);

    // 1 matching verdict (A.cs:10:5) + 1 stale with no matching survivor → mergedIntoGaps=1, unmatchedVerdicts=1
    const verdicts = [
      { survivor_id: 'A.cs:10:5', equivalentSuspect: false, confidence: 'high' as const, rationale: 'ok' },
      { survivor_id: 'STALE.cs:99:0', equivalentSuspect: true, confidence: 'low' as const, rationale: 'stale' },
    ];
    sworld.verdictPath = path.join(sworld.tempDir!, 'mixed-verdicts.json');
    fs.writeFileSync(sworld.verdictPath, JSON.stringify(verdicts), 'utf-8');
  },
);

When(
  /^merge-survivor-verdicts is run with that report and mixed verdicts file$/,
  function (this: SurvivorsWorld) {
    const res = runMergeVerdicts([sworld.verdictPath!]);
    sworld.stdout = res.stdout;
    sworld.stderr = res.stderr;
    sworld.exitCode = res.exitCode;
  },
);

Then(
  /^the survivorAnalysis summary SHALL report unmatchedVerdicts equal to 1 and mergedIntoGaps equal to 1$/,
  function (this: SurvivorsWorld) {
    const report = JSON.parse(sworld.stdout) as Record<string, unknown>;
    const summary = report['survivorAnalysis'] as Record<string, unknown>;
    assert.ok(summary, 'Expected survivorAnalysis in output');
    assert.strictEqual(
      summary['unmatchedVerdicts'],
      1,
      `Expected unmatchedVerdicts=1 but got ${summary['unmatchedVerdicts']}`,
    );
    // mergedIntoGaps reflects how many gaps exist (1 survivor → 1 gap entry), not how many verdicts matched
    assert.strictEqual(
      summary['mergedIntoGaps'],
      1,
      `Expected mergedIntoGaps=1 (1 gap entry, even without matching verdict) but got ${summary['mergedIntoGaps']}`,
    );
  },
);

Then(
  /^stderr SHALL contain the string did not match any survivor$/,
  function (this: SurvivorsWorld) {
    assert.ok(
      sworld.stderr.includes('did not match any survivor'),
      `Expected 'did not match any survivor' in stderr but got:\n${sworld.stderr}`,
    );
  },
);

// ---------------------------------------------------------------------------
// TESTQUAL001_33 — gaps[] preferred over survivors[] when both present
// ---------------------------------------------------------------------------

Given(
  /^a mutation report JSON file containing both a survivors array with 2 entries and a gaps array with 1 entry$/,
  function (this: SurvivorsWorld) {
    const survivors = [makeSurvivor(0), makeSurvivor(1)];
    const gaps = [makeSurvivor(99)];
    writeReport(survivors, gaps);
  },
);

When(
  /^survivors-batch-prompt is run on that report$/,
  function (this: SurvivorsWorld) {
    const res = runBatchPrompt([]);
    sworld.stdout = res.stdout;
    sworld.stderr = res.stderr;
    sworld.exitCode = res.exitCode;
  },
);

Then(
  /^the output SHALL contain exactly 1 batch JSON line reflecting the gaps array length$/,
  function (this: SurvivorsWorld) {
    const lines = sworld.stdout.trim().split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 1, `Expected 1 batch line (from 1-entry gaps[]) but got ${lines.length}:\n${sworld.stdout}`);
    const entry = JSON.parse(lines[0]) as Record<string, unknown>;
    assert.strictEqual(
      entry['survivors_count'],
      1,
      `Expected survivors_count=1 (from gaps[]) but got ${entry['survivors_count']}`,
    );
  },
);
