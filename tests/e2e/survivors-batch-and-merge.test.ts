import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BATCH_PROMPT = path.join(
  REPO_ROOT,
  '.claude',
  'skills',
  'strong-tests',
  'scripts',
  'survivors-batch-prompt.ts',
);
const MERGE_VERDICTS = path.join(
  REPO_ROOT,
  '.claude',
  'skills',
  'strong-tests',
  'scripts',
  'merge-survivor-verdicts.ts',
);

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'survivor-analysis-'));
}

interface BatchEntry {
  batch_id: string;
  survivors_count: number;
  estimated_cost_usd: number;
  cumulative_cost_usd: number;
  prompt: string;
}

describe('TESTQUAL001_LLM_SURVIVOR: batch-prompt + merge-verdicts helpers', () => {
  // @feature7
  it('TESTQUAL001_12: batches survivors into chunks of 50 with cost estimate', () => {
    const tmp = makeTempDir();
    try {
      // Synthetic report с 130 survivors → expect 3 batches (50 + 50 + 30)
      const reportPath = path.join(tmp, 'report.json');
      const survivors = Array.from({ length: 130 }, (_, i) => ({
        file: `src/foo${i % 5}.ts`,
        line: i + 1,
        column: 0,
        mutator: 'Equality mutation',
        mutatedCode: `mutation ${i}`,
        status: 'Survived',
      }));
      fs.writeFileSync(reportPath, JSON.stringify({ survivors, gaps: [] }));

      const result = spawnSync('npx', ['tsx', BATCH_PROMPT, reportPath], {
        encoding: 'utf-8',
        shell: process.platform === 'win32',
      });
      expect(result.status, `stderr=${result.stderr}`).toBe(0);

      const batches: BatchEntry[] = result.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));

      expect(batches.length).toBe(3);
      expect(batches[0].batch_id).toBe('1/3');
      expect(batches[0].survivors_count).toBe(50);
      expect(batches[1].survivors_count).toBe(50);
      expect(batches[2].survivors_count).toBe(30);
      expect(batches[2].batch_id).toBe('3/3');

      // Cumulative cost monotonically increases
      expect(batches[1].cumulative_cost_usd).toBeGreaterThan(batches[0].cumulative_cost_usd);
      expect(batches[2].cumulative_cost_usd).toBeGreaterThan(batches[1].cumulative_cost_usd);

      // Prompt contains Meta ACH-style instruction
      expect(batches[0].prompt).toContain('Meta ACH');
      expect(batches[0].prompt).toContain('EQUIVALENT');
      expect(batches[0].prompt).toContain('REAL_GAP');
      expect(batches[0].prompt).toContain('survivor_id');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // @feature7
  it('TESTQUAL001_13: budget guard aborts when cumulative cost exceeds budget', () => {
    const tmp = makeTempDir();
    try {
      const reportPath = path.join(tmp, 'report.json');
      const survivors = Array.from({ length: 500 }, (_, i) => ({
        file: `src/x.ts`,
        line: i + 1,
        mutator: 'M',
        status: 'Survived',
      }));
      fs.writeFileSync(reportPath, JSON.stringify({ survivors, gaps: [] }));

      // Set extremely low budget — should abort at batch 1 or 2
      const result = spawnSync(
        'npx',
        ['tsx', BATCH_PROMPT, reportPath, '--budget-usd=0.1', '--batch-size=50'],
        { encoding: 'utf-8', shell: process.platform === 'win32' },
      );
      expect(result.status).toBe(3);
      expect(result.stderr).toContain('Budget exceeded');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // @feature7
  it('TESTQUAL001_14: merges verdicts back into report.gaps with equivalentSuspect field', () => {
    const tmp = makeTempDir();
    try {
      const reportPath = path.join(tmp, 'report.json');
      fs.writeFileSync(
        reportPath,
        JSON.stringify({
          stack: 'csharp',
          tool: 'stryker-net',
          killRate: 0.8,
          survivors: [
            { file: 'A.cs', line: 10, column: 5, mutator: 'Equality', status: 'Survived' },
            { file: 'A.cs', line: 20, column: 3, mutator: 'Conditional', status: 'Survived' },
            { file: 'B.cs', line: 5, column: 0, mutator: 'StringLiteral', status: 'Survived' },
          ],
          gaps: [],
        }),
      );

      const verdictsPath = path.join(tmp, 'verdicts-1.json');
      fs.writeFileSync(
        verdictsPath,
        JSON.stringify([
          {
            survivor_id: 'A.cs:10:5',
            equivalentSuspect: false,
            confidence: 'high',
            rationale: 'Real gap: boundary test missing',
          },
          {
            survivor_id: 'A.cs:20:3',
            equivalentSuspect: true,
            confidence: 'medium',
            rationale: 'Mutation effectively dead-code after early return',
          },
          {
            survivor_id: 'B.cs:5:0',
            equivalentSuspect: false,
            confidence: 'high',
            rationale: 'Cosmetic string literal change does affect API contract',
          },
        ]),
      );

      const result = spawnSync('npx', ['tsx', MERGE_VERDICTS, reportPath, verdictsPath], {
        encoding: 'utf-8',
        shell: process.platform === 'win32',
      });
      expect(result.status, `stderr=${result.stderr}`).toBe(0);

      const merged = JSON.parse(result.stdout);
      expect(merged.stack).toBe('csharp');
      expect(merged.killRate).toBe(0.8);
      expect(merged.gaps.length).toBe(3);

      // Verdict 1 — REAL_GAP with rationale
      expect(merged.gaps[0].equivalentSuspect).toBe(false);
      expect(merged.gaps[0].confidence).toBe('high');
      expect(merged.gaps[0].rationale).toContain('Real gap');

      // Verdict 2 — EQUIVALENT_SUSPECT
      expect(merged.gaps[1].equivalentSuspect).toBe(true);
      expect(merged.gaps[1].confidence).toBe('medium');

      // survivorAnalysis summary
      expect(merged.survivorAnalysis).toEqual({
        totalVerdicts: 3,
        mergedIntoGaps: 3,
        unmatchedVerdicts: 0,
        equivalentSuspectCount: 1,
        realGapCount: 2,
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // @feature7
  it('TESTQUAL001_15: merge handles unmatched verdicts with warning', () => {
    const tmp = makeTempDir();
    try {
      const reportPath = path.join(tmp, 'report.json');
      fs.writeFileSync(
        reportPath,
        JSON.stringify({
          survivors: [{ file: 'A.cs', line: 10, column: 5, mutator: 'M', status: 'Survived' }],
        }),
      );

      const verdictsPath = path.join(tmp, 'verdicts.json');
      fs.writeFileSync(
        verdictsPath,
        JSON.stringify([
          { survivor_id: 'A.cs:10:5', equivalentSuspect: false, confidence: 'high', rationale: 'ok' },
          { survivor_id: 'STALE.cs:99:0', equivalentSuspect: true, confidence: 'low', rationale: 'stale' },
        ]),
      );

      const result = spawnSync('npx', ['tsx', MERGE_VERDICTS, reportPath, verdictsPath], {
        encoding: 'utf-8',
        shell: process.platform === 'win32',
      });
      expect(result.status).toBe(0);
      expect(result.stderr).toContain('1 verdict(s) did not match');

      const merged = JSON.parse(result.stdout);
      expect(merged.survivorAnalysis.unmatchedVerdicts).toBe(1);
      expect(merged.survivorAnalysis.mergedIntoGaps).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // @feature7
  it('TESTQUAL001_16: batch-prompt prefers gaps[] over survivors[] when both present', () => {
    const tmp = makeTempDir();
    try {
      const reportPath = path.join(tmp, 'report.json');
      // Имеем gaps[] (annotated) — should pick it, NOT raw survivors[]
      fs.writeFileSync(
        reportPath,
        JSON.stringify({
          survivors: [
            { file: 'X.cs', line: 1, column: 0, mutator: 'M1', status: 'Survived' },
            { file: 'X.cs', line: 2, column: 0, mutator: 'M2', status: 'Survived' },
          ],
          gaps: [
            {
              file: 'X.cs',
              line: 1,
              column: 0,
              mutator: 'M1',
              status: 'Survived',
              reconstructedContext: '1: line1\n2: line2',
            },
          ],
        }),
      );

      const result = spawnSync('npx', ['tsx', BATCH_PROMPT, reportPath], {
        encoding: 'utf-8',
        shell: process.platform === 'win32',
      });
      expect(result.status).toBe(0);
      const batches = result.stdout
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l));
      // Только 1 batch (1 gap), не 2 (raw survivors)
      expect(batches.length).toBe(1);
      expect(batches[0].survivors_count).toBe(1);
      expect(batches[0].prompt).toContain('reconstructedContext');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
