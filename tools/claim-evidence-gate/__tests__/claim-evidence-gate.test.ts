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

import { classify, firstUnsupported, stripCode, isDeferredWork } from '../claim_classifier.ts';
import { extractTurnWindow } from '../turn_window.ts';
import { SHOULD_FIRE, SHOULD_NOT_FIRE } from '../bench/deferred-bench.ts';

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

describe('CEGATE001: claim-evidence gate — deferred-work class (kick «доделывай»)', () => {
  // @feature6
  // Precision (dogfood 2026-06-11 on the real session): a PURE remaining-work list
  // with no offload is NOT a defer — it false-fired on 36% of real stop-points
  // (completion reports / plan-answers). The gate must NOT block it.
  it('CEGATE001_17: does NOT block a pure remaining-work list with no offload to the user', () => {
    const { blocked } = runHook([U('какой план'), A([txt('Что осталось:\n1. свести статусы\n2. e2e тест\n3. врезать в create-spec')])]);
    expect(blocked).toBe(false);
  });

  // @feature6
  it('CEGATE001_18: blocks "беру дальше пункт N" EVEN when a Bash ran this turn (the stop is the failure)', () => {
    const { blocked } = runHook([U('делай'), A([tool('Bash', { command: 'npx tsx x.ts' })]), A([txt('Беру дальше пункт 1 — свожу статусы.')])]);
    expect(blocked).toBe(true);
  });

  // @feature6
  it('CEGATE001_19: blocks handing the next step OR a decision back to the user', () => {
    expect(runHook([U('план'), A([txt('Скажешь «волна 1» — начну, вытяну открытые задачи и пойду делать.')])]).blocked).toBe(true);
    expect(runHook([U('делай'), A([txt('Список собран, что из него удалять — решаешь ты.')])]).blocked).toBe(true);
  });

  // @feature6
  it('CEGATE001_21: a report ABOUT the gate (пинатор / ДОДЕЛЫВАЙ) does not trigger itself, even quoting a trigger phrase', () => {
    const { blocked } = runHook([U('расскажи'), A([txt('Пинатор теперь ловит «беру дальше пункт 1». Кикает ДОДЕЛЫВАЙ.')])]);
    expect(blocked).toBe(false);
  });

  // @feature6
  it('CEGATE001_20: does NOT fire on a clean completion or an explanatory "дальше"', () => {
    expect(classify('Закоммичено 7c3c723. Вердикт зелёный, 156 сценариев.').some((h) => h.cls === 'deferred-work')).toBe(false);
    expect(classify('По коду гейт фаерит только при заявленном результате. Дальше по логике идёт анти-зацикливание.').some((h) => h.cls === 'deferred-work')).toBe(false);
    // positive classifier unit — the structural remaining-work phrase fires
    expect(classify('Если хочешь — скажи, покажу остаток.').some((h) => h.cls === 'deferred-work')).toBe(true);
  });

  // @feature6
  it('CEGATE001_22: blocks self-deferring the declared next step to a FUTURE pass ("следующим заходом")', () => {
    // the exact phrasing that slipped the gate (2026-06-12): step known, no blocker, still stopped
    expect(runHook([U('делай по очереди'), A([txt('Дверь живая. Беру это следующим заходом.')])]).blocked).toBe(true);
    expect(classify('Добью отдельным заходом — там по шагам.').some((h) => h.cls === 'deferred-work')).toBe(true);
    // precision: "за один заход" = a completion ("did it in one pass"), NOT a defer
    expect(classify('Свёл всё за один заход, закоммичено.').some((h) => h.cls === 'deferred-work')).toBe(false);
  });

  // @feature6
  it('CEGATE001_23: blocks handing a FACTUAL confirm/correct back to the user, NOT the sanctioned intent-confirmation', () => {
    // the case that slipped (2026-06-12): asking the user to verify a CODE fact I should investigate
    expect(classify('tui-test-runner-v2 — реально заброшен или ещё в работе? подтверди, что живые, или поправь').some((h) => h.cls === 'deferred-work')).toBe(true);
    // PRECISION GUARD: plan-pomogator's sanctioned "Правильно понял?" (about INTENT) must NEVER fire
    expect(classify('Правильно понял? Спиннер только во время запроса?').some((h) => h.cls === 'deferred-work')).toBe(false);
    expect(classify('Подтверди, что я правильно понял задачу, или поправь.').some((h) => h.cls === 'deferred-work')).toBe(false);
  });

  // @feature6 — the deferred-bench corpus is a CI regression contract (both directions).
  it('CEGATE001_24: deferred-bench corpus — every SHOULD_FIRE fires, every SHOULD_NOT_FIRE stays silent', () => {
    const misses = SHOULD_FIRE.filter((c) => !isDeferredWork(c.text)).map((c) => c.id);
    const falseFires = SHOULD_NOT_FIRE.filter((c) => isDeferredWork(c.text)).map((c) => c.id);
    expect(misses, `should-fire missed: ${misses.join(', ')}`).toEqual([]);
    expect(falseFires, `should-not-fire false-fired: ${falseFires.join(', ')}`).toEqual([]);
  });
});

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
});
