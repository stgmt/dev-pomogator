import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  verifyKill,
  verifyBatch,
  type KillSpec,
  type ScenarioRun,
} from '../../tools/stryker-mutation/verify-kill.ts';

// Tests the deterministic inject+restore logic of verify-kill WITHOUT spawning cucumber and WITHOUT
// touching the real production file — a temp fixture + an injected fake runner. The fake "senses" the
// file state, so the test also proves real injection (mutant present mid-run) and restore (gone after).
describe('VERIFYKILL001: deterministic inject+restore kill-gate', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-kill-'));
    file = path.join(dir, 'src.ts');
    fs.writeFileSync(file, 'export const v = original_value;\n', 'utf-8');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const spec = (over: Partial<KillSpec> = {}): KillSpec => ({
    file,
    original: 'original_value',
    mutant: 'mutant_value',
    config: 'throwaway.json',
    name: 'S',
    ...over,
  });

  // PASS unless the file currently contains `sense` (simulates a covering test that catches it).
  const sensing = (sense: string) => (): ScenarioRun => {
    const passed = !fs.readFileSync(file, 'utf-8').includes(sense);
    return { passed, ran: 1, summary: passed ? '1 scenario (1 passed)' : '1 scenario (1 failed)' };
  };
  const alwaysPass = (): ScenarioRun => ({ passed: true, ran: 1, summary: '1 scenario (1 passed)' });

  it('VERIFYKILL001_01: reports KILLED when the covering run fails under the mutant, and restores the file', () => {
    const v = verifyKill(spec(), sensing('mutant_value'));
    expect(v.verdict).toBe('KILLED');
    expect(v.killed).toBe(true);
    expect(v.restored).toBe(true);
    const after = fs.readFileSync(file, 'utf-8');
    expect(after).toContain('original_value');
    expect(after).not.toContain('mutant_value');
  });

  it('VERIFYKILL001_02: reports SURVIVED when the run still passes under the mutant (and still restores)', () => {
    const v = verifyKill(spec(), alwaysPass);
    expect(v.verdict).toBe('SURVIVED');
    expect(v.killed).toBe(false);
    expect(fs.readFileSync(file, 'utf-8')).toContain('original_value');
  });

  it('VERIFYKILL001_03: ALWAYS restores the file even if the run throws mid-mutant', () => {
    let calls = 0;
    const throwOnMutant = (): ScenarioRun => {
      calls += 1;
      if (calls === 1) return { passed: true, ran: 1, summary: 'baseline' };
      throw new Error('boom');
    };
    expect(() => verifyKill(spec(), throwOnMutant)).toThrow('boom');
    const after = fs.readFileSync(file, 'utf-8');
    expect(after).toContain('original_value');
    expect(after).not.toContain('mutant_value');
  });

  it('VERIFYKILL001_04: throws when the original string is absent', () => {
    expect(() => verifyKill(spec({ original: 'NOT_PRESENT' }), alwaysPass)).toThrow(/original string not found/);
  });

  it('VERIFYKILL001_05: refuses (throws) when the baseline is not green', () => {
    const red = (): ScenarioRun => ({ passed: false, ran: 1, summary: '1 scenario (1 failed)' });
    expect(() => verifyKill(spec(), red)).toThrow(/baseline not green/);
  });

  it('VERIFYKILL001_06: batch tallies killed/survived and gates on all-killed', () => {
    const batch = verifyBatch(
      [spec({ label: 'killable' }), spec({ label: 'survives', mutant: 'never_sensed' })],
      sensing('mutant_value'),
    );
    expect(batch.total).toBe(2);
    expect(batch.killed).toBe(1); // 'killable' injects mutant_value → sensed → fail → KILLED
    expect(batch.survived).toBe(1); // 'survives' injects never_sensed → never sensed → pass → SURVIVED
    expect(batch.errors).toBe(0);
  });

  it('VERIFYKILL001_07: batch records ERROR (not a crash) for a bad spec', () => {
    const batch = verifyBatch([spec({ label: 'bad', original: 'NOT_PRESENT' })], alwaysPass);
    expect(batch.errors).toBe(1);
    expect(batch.results[0].verdict).toBe('ERROR');
  });
});
