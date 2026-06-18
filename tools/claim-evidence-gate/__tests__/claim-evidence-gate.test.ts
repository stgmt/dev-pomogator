/**
 * Integration tests for the claim-evidence gate Stop hook (CEGATE001).
 *
 * Each test spawns the real hook binary with a real stdin payload + a real JSONL transcript
 * fixture in an isolated tmpdir (so anti-loop marker files never cross tests). 1:1 mapping
 * with tests/features/plugins/claim-evidence-gate/CEGATE001_claim-evidence-gate.feature.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { classify, firstUnsupported, stripCode } from '../claim_classifier.ts';
import { extractTurnWindow } from '../turn_window.ts';

const HOOK = path.resolve(__dirname, '..', 'claim_evidence_gate_stop.ts');

type Block = Record<string, unknown>;
const U = (text: string): Block => ({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } });
const A = (content: Block[]): Block => ({ type: 'assistant', message: { role: 'assistant', content } });
const txt = (text: string): Block => ({ type: 'text', text });
const tool = (name: string, input: unknown = {}): Block => ({ type: 'tool_use', name, input });

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cegate-'));
});

/** Write a transcript fixture and run the hook; returns parsed stdout decision ('{}' = approve). */
function runHook(rows: Block[], env: Record<string, string> = {}): { blocked: boolean; raw: string } {
  const fp = path.join(dir, 'transcript.jsonl');
  fs.writeFileSync(fp, rows.map((r) => JSON.stringify(r)).join('\n'));
  const res = spawnSync('npx', ['tsx', HOOK], {
    input: JSON.stringify({ transcript_path: fp, cwd: dir }),
    encoding: 'utf-8',
    env: { ...process.env, CLAIM_GATE_ENABLED: 'true', ...env },
  });
  const raw = (res.stdout || '').trim();
  return { blocked: raw.includes('"decision":"block"'), raw };
}

describe('CEGATE001: claim-evidence gate — analysis-verdict class', () => {
  // @feature1
  it('CEGATE001_01: blocks a verdict grid with no tool run this turn', () => {
    const { blocked } = runHook([U('проверь сцены'), A([txt('Итог:\n| q1 | FAIL |\n| q2 | FAIL |\n| q3 | PASS |')])]);
    expect(blocked).toBe(true);
  });

  // @feature1
  it('CEGATE001_02: approves the same verdict grid when a Bash ran this turn', () => {
    const { blocked } = runHook([
      U('проверь сцены'),
      A([tool('Bash', { command: 'npx tsx fact-check.ts' })]),
      A([txt('Итог:\n| q1 | FAIL |\n| q2 | FAIL |\n| q3 | PASS |')]),
    ]);
    expect(blocked).toBe(false);
  });
});

describe('CEGATE001: claim-evidence gate — works-done class', () => {
  // @feature2
  it('CEGATE001_03: blocks "всё работает" with no executor this turn', () => {
    const { blocked } = runHook([U('почини'), A([txt('Поправил импорт, теперь всё работает.')])]);
    expect(blocked).toBe(true);
  });

  // @feature2
  it('CEGATE001_04: does not fire on a plain edit summary that makes no works-claim', () => {
    const { blocked } = runHook([U('добавь поле'), A([txt('Добавил поле в интерфейс. Готово, дальше можно тестировать.')])]);
    expect(blocked).toBe(false);
  });
});

describe('CEGATE001: claim-evidence gate — not-found-impossible class', () => {
  // @feature3
  it('CEGATE001_05: blocks "не существует" when fewer than 2 searches ran', () => {
    const { blocked } = runHook([U('есть решение?'), A([tool('Grep', { pattern: 'x' })]), A([txt('Публичного решения не существует.')])]);
    expect(blocked).toBe(true);
  });

  // @feature3
  it('CEGATE001_06: approves "не существует" after 2+ searches', () => {
    const { blocked } = runHook([
      U('есть решение?'),
      A([tool('Grep', { pattern: 'x' }), tool('WebSearch', { query: 'y' })]),
      A([txt('Публичного решения не существует.')]),
    ]);
    expect(blocked).toBe(false);
  });
});

describe('CEGATE001: claim-evidence gate — verified-marker class', () => {
  // @feature4
  it('CEGATE001_07: blocks [VERIFIED via npm test] with no matching tool', () => {
    const { blocked } = runHook([U('сверь'), A([tool('Read', { file: 'a.ts' })]), A([txt('Контракт соблюдён [VERIFIED via npm test].')])]);
    expect(blocked).toBe(true);
  });

  // @feature4
  it('CEGATE001_08: approves [VERIFIED via npm test] when a matching Bash ran', () => {
    const { blocked } = runHook([U('сверь'), A([tool('Bash', { command: 'npm test' })]), A([txt('Контракт соблюдён [VERIFIED via npm test].')])]);
    expect(blocked).toBe(false);
  });
});

// NOTE: the deferred-work / lazy-stop tests (formerly CEGATE001_17–24) were removed
// with the regex detector — that job moved ENTIRELY to the Meridian Haiku judge. Its
// behaviour is pinned LIVE in tools/claim-evidence-gate/bench/judge-bench.ts (announce-
// next / hand-to-user / did-work-then-defer → BLOCK; per-task / status / in-flight → APPROVE).

describe('CEGATE001: modes, anti-loop and fail-open', () => {
  // @feature5
  it('CEGATE001_09: shadow mode never blocks but still logs a fire', () => {
    const { blocked } = runHook([U('проверь'), A([txt('Итог:\n| q1 | FAIL |\n| q2 | FAIL |')])], { CLAIM_GATE_ENABLED: 'shadow' });
    expect(blocked).toBe(false);
    const fires = fs.readFileSync(path.join(dir, '.dev-pomogator', '.claim-evidence-gate-fires.jsonl'), 'utf-8');
    expect(fires).toContain('analysis-verdict');
  });

  // @feature5
  it('CEGATE001_10: disabled mode approves without reading anything', () => {
    const { blocked } = runHook([U('почини'), A([txt('всё работает')])], { CLAIM_GATE_ENABLED: 'false' });
    expect(blocked).toBe(false);
  });

  // @feature5
  it('CEGATE001_11: fail-open on missing transcript', () => {
    const res = spawnSync('npx', ['tsx', HOOK], {
      input: JSON.stringify({ transcript_path: path.join(dir, 'nope.jsonl'), cwd: dir }),
      encoding: 'utf-8',
      env: { ...process.env, CLAIM_GATE_ENABLED: 'true' },
    });
    expect((res.stdout || '').trim()).toBe('{}');
  });

  // @feature5
  it('CEGATE001_12: stop_hook_active does NOT exempt a premature continuation stop (re-blocks, then terminates)', () => {
    // Incident 2026-06-14: a blanket `stop_hook_active → approve` let a SECOND premature stop
    // sail through after the gate fired once (the agent announced-and-stopped again mid-turn).
    // The continuation stop must now be JUDGED (block), and the marker anti-loop must still
    // terminate the loop. CLAIM_GATE_JUDGE=false → deterministic fast-layer (no Meridian).
    const fp = path.join(dir, 't.jsonl');
    fs.writeFileSync(
      fp,
      [U('почини'), A([txt('всё работает, фикс задеплоен')])].map((r) => JSON.stringify(r)).join('\n'),
    );
    const fire = () =>
      spawnSync('npx', ['tsx', HOOK], {
        input: JSON.stringify({ transcript_path: fp, cwd: dir, stop_hook_active: true }),
        encoding: 'utf-8',
        env: { ...process.env, CLAIM_GATE_ENABLED: 'true', CLAIM_GATE_JUDGE: 'false' },
      });
    // 1st continuation stop with an unsupported works-done claim → BLOCKS (the fix).
    expect(fire().stdout || '').toContain('"decision":"block"');
    // 2nd identical re-stop → same-hash anti-loop releases → terminates (no infinite loop).
    expect((fire().stdout || '').trim()).toBe('{}');
  });
});

describe('CEGATE001: pure classifier units', () => {
  // @feature1
  it('CEGATE001_13: verdict tokens inside a fenced code block do not fire', () => {
    const text = 'Пример плохого вывода:\n```\nq1 FAIL\nq2 FAIL\n```\nэто иллюстрация';
    expect(classify(text).some((h) => h.cls === 'analysis-verdict')).toBe(false);
  });

  // @feature2
  it('CEGATE001_14: negated "не работает" is not a works-done claim', () => {
    expect(classify('пока не работает, чиню').some((h) => h.cls === 'works-done')).toBe(false);
  });

  // @feature1
  it('CEGATE001_15: extractTurnWindow scopes evidence to the current user turn', () => {
    const raw = [
      A([tool('Bash', { command: 'old' })]), // previous turn — must NOT count
      U('новый запрос'),
      A([txt('всё работает')]),
    ]
      .map((r) => JSON.stringify(r))
      .join('\n');
    const w = extractTurnWindow(raw);
    expect(w.toolUses).toHaveLength(0);
    expect(firstUnsupported(w.claimText, w.toolUses)?.cls).toBe('works-done');
  });

  // @feature2
  it('CEGATE001_16: stripCode removes inline-code and quotations', () => {
    const out = stripCode('текст `работает` и «не существует» конец');
    expect(out).not.toContain('работает');
    expect(out).not.toContain('существует');
    expect(out.replace(/\s+/g, ' ').trim()).toBe('текст и конец');
  });
});

describe('CEGATE001: claim-evidence gate — spec-false-close class (FR-49b)', () => {
  function writeCensus(
    d: string,
    total: { open: number; doneRed: number; doneUnrun: number },
    nextOpen?: { id: string; title: string },
  ): void {
    const cacheDir = path.join(d, '.dev-pomogator');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, '.task-census.json'),
      JSON.stringify({ total, specs: [{ slug: 'demo', ...total, nextOpen }], ts: '2026-06-13T00:00:00Z' }),
    );
  }

  // @feature49 — the escaped false-close: executor ran + no defer phrasing, but the spec is unfinished.
  it('CEGATE001_25: blocks a whole-spec "done" claim when the census shows unfinished work', () => {
    writeCensus(dir, { open: 11, doneRed: 0, doneUnrun: 0 }, { id: 'demo:t1', title: 'Wire the gate' });
    const { blocked, raw } = runHook([
      U('закрой спеку'),
      // FR-9: the census is SESSION-scoped — the spec must be one THIS session edited to be in scope.
      A([tool('Edit', { file_path: '.specs/demo/FR.md' })]), // session wrote demo → 'demo' enters scope
      A([tool('Bash', { command: 'git commit -m done' })]), // executor ran → works-done satisfied; no defer phrasing
      A([txt('Спека готова, всё закрыто. 37 из 48.')]),
    ]);
    expect(blocked).toBe(true);
    expect(raw).toMatch(/в работе|незакрыто/); // real numbers injected
    expect(raw).toMatch(/Wire the gate/); // names the next step
  });

  // @feature49 — anti-H1: a NON-spec completion claim must NOT trip the census branch.
  it('CEGATE001_26: does NOT fire on a non-spec works-done claim even with unfinished census', () => {
    writeCensus(dir, { open: 11, doneRed: 0, doneUnrun: 0 });
    const { blocked } = runHook([
      U('почини импорт'),
      A([tool('Bash', { command: 'npx tsx build.ts' })]), // executor → works-done satisfied
      A([txt('Поправил импорт, всё работает.')]), // task-level, not whole-spec
    ]);
    expect(blocked).toBe(false);
  });

  // @feature49 — a whole-spec claim is fine when the census is clean (no unfinished work).
  it('CEGATE001_27: does NOT fire on a whole-spec claim when the census is clean/absent', () => {
    const { blocked } = runHook([
      U('закрой спеку'),
      A([tool('Bash', { command: 'git commit -m done' })]),
      A([txt('Спека полностью готова.')]), // no census cache in dir → censusReminder null
    ]);
    expect(blocked).toBe(false);
  });

  // @feature11 — FR-11 no-progress release: consecutive ZERO-tool kicks bound the loop by WORK-delta
  // (the cooldown-reset time-cap cannot, audit root-cause #1). MAX_RETRIES=99 takes the time-cap out,
  // isolating FR-11 as the sole release path; the spec is session-scoped in (FR-9, edit in an earlier
  // turn) so the gate arms. A tool-running kick resets the streak — the gate keeps engaging.
  it('CEGATE001_28: releases after N consecutive zero-tool kicks; a tool-run resets the streak', () => {
    writeCensus(dir, { open: 11, doneRed: 0, doneUnrun: 0 }, { id: 'demo:t1', title: 'Wire the gate' });
    const env = { CLAIM_GATE_MAX_RETRIES: '99', CLAIM_GATE_JUDGE: 'false' };
    const kick = (n: number, turnTools: Block[] = []): boolean =>
      runHook(
        [
          U('старт'),
          A([tool('Edit', { file_path: '.specs/demo/FR.md' })]), // FR-9: spec in scope (earlier turn)
          U('идём'),
          ...turnTools.map((t) => A([t])), // current-turn tool(s), each its own assistant message
          A([txt(`Готово, всё закрыто. ${n} из 48.`)]), // no «Дальше:» section → no-next-section block
        ],
        env,
      ).blocked;
    expect(kick(37)).toBe(true); // streak 1
    expect(kick(38)).toBe(true); // streak 2
    expect(kick(39)).toBe(false); // streak 3 ≥ cap (default 3) → FR-11 release
    expect(kick(40, [tool('Read', { file_path: 'x.ts' })])).toBe(true); // ran a tool → streak reset → block
  });

  // @feature11 — FR-11 blocker-proof: a stop resting on a BLOCKER claim is honoured ONLY with
  // observable evidence (a tool run this turn / a bg task launched). A bare narrative blocker with
  // zero tools and no bg, while work remains, is the fabricated blocker → block "prove it or work".
  it('CEGATE001_29: blocks an unproven blocker; approves when substantiated or awaiting real async', () => {
    writeCensus(dir, { open: 11, doneRed: 0, doneUnrun: 0 }, { id: 'demo:t1', title: 'Wire the gate' });
    const blocker = (turnTools: Block[] = []): boolean =>
      runHook(
        [
          U('старт'),
          A([tool('Edit', { file_path: '.specs/demo/FR.md' })]), // FR-9: spec in scope (earlier turn)
          U('идём'),
          ...turnTools.map((t) => A([t])),
          A([txt('Жду — cucumber.json держит параллельная сессия, трогать нельзя.')]),
        ],
        { CLAIM_GATE_JUDGE: 'false' },
      ).blocked;
    expect(blocker()).toBe(true); // bare blocker, 0 tools, no bg → block
    expect(blocker([tool('Bash', { command: 'git diff -- cucumber.json' })])).toBe(false); // substantiated → approve
    expect(blocker([tool('Bash', { command: 'npm test', run_in_background: true })])).toBe(false); // real async → approve
  });
});
