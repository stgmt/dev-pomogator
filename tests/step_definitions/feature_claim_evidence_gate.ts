/**
 * Step definitions for CEGATE001 — the claim-evidence-gate Stop hook (reviving the orphan feature).
 * Faithful 1:1 translation of the verified vitest twin
 * `tools/claim-evidence-gate/__tests__/claim-evidence-gate.test.ts` — drives the REAL hook
 * (`claim_evidence_gate_stop.ts`) via a real JSONL transcript + the REAL pure modules (classify /
 * extractTurnWindow / stripCode), no mocks. Per-scenario isolation via the V4World Before hook tempDir.
 *
 * Batch 1: classifier + modes + pure units (CEGATE001_01..16). Source of truth = the current vitest.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import { V4World } from '../hooks/before-after.ts';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { classify, firstUnsupported, stripCode } from '../../tools/claim-evidence-gate/claim_classifier.ts';
import { extractTurnWindow } from '../../tools/claim-evidence-gate/turn_window.ts';

const REPO = process.env.APP_DIR || process.cwd();
const HOOK = path.resolve(REPO, 'tools', 'claim-evidence-gate', 'claim_evidence_gate_stop.ts');

type Block = Record<string, unknown>;
const U = (text: string): Block => ({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } });
const A = (content: Block[]): Block => ({ type: 'assistant', message: { role: 'assistant', content } });
const txt = (text: string): Block => ({ type: 'text', text });
const tool = (name: string, input: unknown = {}): Block => ({ type: 'tool_use', name, input });
const GRID = 'Итог:\n| q1 | FAIL |\n| q2 | FAIL |\n| q3 | PASS |';

interface CegWorld extends V4World {
  cegPrompt?: string;
  cegTurnTools?: Block[]; // this-turn tool_use blocks (each its own assistant message)
  cegPreTools?: Block[]; // tools BEFORE the last user message (previous turn)
  cegFinal?: string;
  cegEnv?: Record<string, string>;
  cegStopHookActive?: boolean;
  cegMissingTranscript?: boolean;
  cegPureText?: string;
  cegBlocked?: boolean;
  cegRaw?: string;
  cegTwoSearchOneMsg?: boolean;
  cegRows?: Block[]; // a fully-built transcript (spec-false-close / streak scenarios build it directly)
  cegKicks?: boolean[]; // the no-progress-streak kick results (_28)
  cegClassHits?: ReturnType<typeof classify>;
  cegWindow?: ReturnType<typeof extractTurnWindow>;
  cegStripped?: string;
}

/** Write the task-census cache fixture the gate reads (FR-49b), mirroring the vitest writeCensus. */
function writeCensus(d: string, total: { open: number; doneRed: number; doneUnrun: number }, nextOpen?: { id: string; title: string }): void {
  const cacheDir = path.join(d, '.dev-pomogator');
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, '.task-census.json'), JSON.stringify({ total, specs: [{ slug: 'demo', ...total, nextOpen }], ts: '2026-06-13T00:00:00Z' }));
}

/** Run the real hook against a fully-built transcript (used by the spec-false-close / streak scenarios). */
function runHookExplicit(world: CegWorld, rows: Block[], env: Record<string, string> = {}, stopHookActive = false): { blocked: boolean; raw: string } {
  const fp = path.join(world.tempDir, 'transcript.jsonl');
  fs.writeFileSync(fp, rows.map((r) => JSON.stringify(r)).join('\n'));
  const stdin = JSON.stringify({ transcript_path: fp, cwd: world.tempDir, ...(stopHookActive ? { stop_hook_active: true } : {}) });
  const res = spawnSync('npx', ['tsx', HOOK], { input: stdin, encoding: 'utf-8', env: { ...process.env, CLAIM_GATE_ENABLED: 'true', ...env } });
  const raw = (res.stdout || '').trim();
  return { blocked: raw.includes('"decision":"block"'), raw };
}

function runHookRows(world: CegWorld, env: Record<string, string> = {}, stopHookActive = false): { blocked: boolean; raw: string } {
  const fp = path.join(world.tempDir, 'transcript.jsonl');
  const rows: Block[] = [
    ...(world.cegPreTools ?? []).map((t) => A([t])),
    U(world.cegPrompt ?? 'запрос'),
    ...(world.cegTurnTools ?? []).map((t) => A([t])),
    A([txt(world.cegFinal ?? '')]),
  ];
  fs.writeFileSync(fp, rows.map((r) => JSON.stringify(r)).join('\n'));
  const stdin = JSON.stringify({ transcript_path: fp, cwd: world.tempDir, ...(stopHookActive ? { stop_hook_active: true } : {}) });
  const res = spawnSync('npx', ['tsx', HOOK], { input: stdin, encoding: 'utf-8', env: { ...process.env, CLAIM_GATE_ENABLED: 'true', ...env } });
  const raw = (res.stdout || '').trim();
  return { blocked: raw.includes('"decision":"block"'), raw };
}

// ── Given: the final message ──────────────────────────────────────────────────────────────
Given<CegWorld>(/^the final message is a PASS\/FAIL verdict grid$/, function () {
  this.cegPrompt = 'проверь сцены';
  this.cegFinal = GRID;
});
Given<CegWorld>('the final message asserts {string}', function (phrase: string) {
  this.cegPrompt = phrase.includes('не существует') ? 'есть решение?' : 'почини';
  this.cegFinal = phrase.includes('не существует') ? 'Публичного решения не существует.' : 'Поправил импорт, теперь всё работает.';
});
Given<CegWorld>('the final message only reports an edit without a works-claim', function () {
  this.cegPrompt = 'добавь поле';
  this.cegFinal = 'Добавил поле в интерфейс. Готово, дальше можно тестировать.';
});
Given<CegWorld>('the final message contains {string}', function (marker: string) {
  this.cegPrompt = 'сверь';
  this.cegFinal = `Контракт соблюдён ${marker}.`;
  this.cegTurnTools = [tool('Read', { file: 'a.ts' })]; // a non-matching tool (overridden by the "matching" And)
});
Given<CegWorld>('the gate is in shadow mode', function () {
  this.cegEnv = { ...(this.cegEnv ?? {}), CLAIM_GATE_ENABLED: 'shadow' };
});
Given<CegWorld>('the final message is an unsupported verdict grid', function () {
  this.cegPrompt = 'проверь';
  this.cegFinal = 'Итог:\n| q1 | FAIL |\n| q2 | FAIL |';
});
Given<CegWorld>('the gate is disabled', function () {
  this.cegEnv = { ...(this.cegEnv ?? {}), CLAIM_GATE_ENABLED: 'false' };
  this.cegPrompt = 'почини';
  this.cegFinal = 'всё работает';
});
Given<CegWorld>('the transcript path does not exist', function () {
  this.cegMissingTranscript = true;
});
Given<CegWorld>('stop_hook_active is true', function () {
  this.cegStopHookActive = true;
});
Given<CegWorld>('the turn ends on an unsupported works-done claim with no evidence', function () {
  this.cegPrompt = 'почини';
  this.cegFinal = 'всё работает, фикс задеплоен';
  this.cegEnv = { ...(this.cegEnv ?? {}), CLAIM_GATE_JUDGE: 'false' };
});
Given<CegWorld>('the final message shows a verdict grid only inside a fenced code block', function () {
  this.cegPureText = 'Пример плохого вывода:\n```\nq1 FAIL\nq2 FAIL\n```\nэто иллюстрация';
});
Given<CegWorld>('the final message says {string}', function (s: string) {
  this.cegPureText = s;
});
Given<CegWorld>('a Bash ran before the last user message but not after', function () {
  this.cegPreTools = [tool('Bash', { command: 'old' })];
});
Given<CegWorld>('a message with an inline-code word and a quoted phrase', function () {
  this.cegPureText = 'текст `работает` и «не существует» конец';
});

// ── And: turn-tool setup ──────────────────────────────────────────────────────────────────
Given<CegWorld>('no executor tool ran since the user last spoke', function () {
  this.cegTurnTools = [];
});
Given<CegWorld>('no executor tool ran this turn', function () {
  this.cegTurnTools = [];
});
Given<CegWorld>('a Bash tool ran this turn', function () {
  this.cegTurnTools = [tool('Bash', { command: 'npx tsx fact-check.ts' })];
});
Given<CegWorld>('only one search tool ran this turn', function () {
  this.cegTurnTools = [tool('Grep', { pattern: 'x' })];
});
Given<CegWorld>('at least two search tools ran this turn', function () {
  this.cegTurnTools = [tool('Grep', { pattern: 'x' }), tool('WebSearch', { query: 'y' })]; // both in ONE assistant message
  this.cegTwoSearchOneMsg = true;
});
Given<CegWorld>('no tool matching {string} ran this turn', function () {
  this.cegTurnTools = [tool('Read', { file: 'a.ts' })];
});
Given<CegWorld>('a Bash running {string} ran this turn', function (cmd: string) {
  this.cegTurnTools = [tool('Bash', { command: cmd })];
});

// ── When ──────────────────────────────────────────────────────────────────────────────────
When<CegWorld>('the gate evaluates the turn', function () {
  if (this.cegRows) {
    const r = runHookExplicit(this, this.cegRows, this.cegEnv ?? {}, this.cegStopHookActive ?? false);
    this.cegBlocked = r.blocked;
    this.cegRaw = r.raw;
    return;
  }
  if (this.cegMissingTranscript) {
    const stdin = JSON.stringify({ transcript_path: path.join(this.tempDir, 'nope.jsonl'), cwd: this.tempDir });
    const res = spawnSync('npx', ['tsx', HOOK], { input: stdin, encoding: 'utf-8', env: { ...process.env, CLAIM_GATE_ENABLED: 'true' } });
    this.cegRaw = (res.stdout || '').trim();
    this.cegBlocked = this.cegRaw.includes('"decision":"block"');
    return;
  }
  // two-search case: both tools must share ONE assistant message (per the vitest)
  if (this.cegTwoSearchOneMsg) {
    const fp = path.join(this.tempDir, 'transcript.jsonl');
    const rows = [U(this.cegPrompt ?? 'есть решение?'), A(this.cegTurnTools ?? []), A([txt(this.cegFinal ?? '')])];
    fs.writeFileSync(fp, rows.map((r) => JSON.stringify(r)).join('\n'));
    const res = spawnSync('npx', ['tsx', HOOK], { input: JSON.stringify({ transcript_path: fp, cwd: this.tempDir }), encoding: 'utf-8', env: { ...process.env, CLAIM_GATE_ENABLED: 'true' } });
    this.cegRaw = (res.stdout || '').trim();
    this.cegBlocked = this.cegRaw.includes('"decision":"block"');
    return;
  }
  const r = runHookRows(this, this.cegEnv ?? {}, this.cegStopHookActive ?? false);
  this.cegBlocked = r.blocked;
  this.cegRaw = r.raw;
});
When<CegWorld>('the classifier runs', function () {
  this.cegClassHits = classify(this.cegPureText ?? '');
});
When<CegWorld>('the turn window is extracted', function () {
  const rows = [...(this.cegPreTools ?? []).map((t) => A([t])), U(this.cegPrompt ?? 'новый запрос'), A([txt(this.cegFinal ?? '')])];
  this.cegWindow = extractTurnWindow(rows.map((r) => JSON.stringify(r)).join('\n'));
});
When<CegWorld>('stripCode runs', function () {
  this.cegStripped = stripCode(this.cegPureText ?? '');
});

// ── Then ──────────────────────────────────────────────────────────────────────────────────
Then<CegWorld>('it blocks the stop', function () {
  assert.equal(this.cegBlocked, true, `expected BLOCK; raw=${this.cegRaw}`);
});
Then<CegWorld>('it approves the stop', function () {
  assert.equal(this.cegBlocked, false, `expected APPROVE; raw=${this.cegRaw}`);
});
Then<CegWorld>('it appends a fire record to the log', function () {
  const fires = fs.readFileSync(path.join(this.tempDir, '.dev-pomogator', '.claim-evidence-gate-fires.jsonl'), 'utf-8');
  assert.match(fires, /analysis-verdict/);
});
Then<CegWorld>('an identical re-stop is then released by the anti-loop', function () {
  const r = runHookRows(this, this.cegEnv ?? {}, true);
  assert.equal(r.raw, '{}', `expected anti-loop release '{}', got ${r.raw}`);
});
Then<CegWorld>('no analysis-verdict claim is detected', function () {
  assert.equal((this.cegClassHits ?? []).some((h) => h.cls === 'analysis-verdict'), false);
});
Then<CegWorld>('no works-done claim is detected', function () {
  assert.equal((this.cegClassHits ?? []).some((h) => h.cls === 'works-done'), false);
});
Then<CegWorld>('the previous-turn tool is not counted as evidence', function () {
  assert.equal(this.cegWindow!.toolUses.length, 0, 'previous-turn tool must not count');
  assert.equal(firstUnsupported(this.cegWindow!.claimText, this.cegWindow!.toolUses)?.cls, 'works-done');
});
Then<CegWorld>('those spans are removed before classification', function () {
  assert.doesNotMatch(this.cegStripped ?? '', /работает/);
  assert.doesNotMatch(this.cegStripped ?? '', /существует/);
  assert.equal((this.cegStripped ?? '').replace(/\s+/g, ' ').trim(), 'текст и конец');
});

// ── Batch 2: spec-false-close (FR-49b) + no-progress release ───────────────────────────────
Given<CegWorld>('the final message claims the whole spec is done and an executor ran, with the census showing unfinished work', function () {
  writeCensus(this.tempDir, { open: 11, doneRed: 0, doneUnrun: 0 }, { id: 'demo:t1', title: 'Wire the gate' });
  this.cegRows = [
    U('закрой спеку'),
    A([tool('Edit', { file_path: '.specs/demo/FR.md' })]), // FR-9: session edited demo → in scope
    A([tool('Bash', { command: 'git commit -m done' })]), // executor → works-done satisfied
    A([txt('Спека готова, всё закрыто. 37 из 48.')]),
  ];
});
Then<CegWorld>('it blocks the stop with the real counts and the next step', function () {
  assert.equal(this.cegBlocked, true, `expected BLOCK; raw=${this.cegRaw}`);
  assert.match(this.cegRaw ?? '', /в работе|незакрыто/, 'injects the real counts');
  assert.match(this.cegRaw ?? '', /Wire the gate/, 'names the next step');
});
Given<CegWorld>('the final message claims a non-spec fix works and an executor ran, with the census showing unfinished work', function () {
  writeCensus(this.tempDir, { open: 11, doneRed: 0, doneUnrun: 0 });
  this.cegRows = [U('почини импорт'), A([tool('Bash', { command: 'npx tsx build.ts' })]), A([txt('Поправил импорт, всё работает.')])];
});
Given<CegWorld>('the final message claims the whole spec is done but the census is clean or absent', function () {
  this.cegRows = [U('закрой спеку'), A([tool('Bash', { command: 'git commit -m done' })]), A([txt('Спека полностью готова.')])];
});
Given<CegWorld>('the gate has blocked consecutive stops in which the agent ran no tools (no work-delta)', function () {
  writeCensus(this.tempDir, { open: 11, doneRed: 0, doneUnrun: 0 }, { id: 'demo:t1', title: 'Wire the gate' });
});
When<CegWorld>('the no-progress streak reaches the cap', function () {
  const env = { CLAIM_GATE_MAX_RETRIES: '99', CLAIM_GATE_JUDGE: 'false' };
  const kick = (n: number, turnTools: Block[] = []): boolean =>
    runHookExplicit(
      this,
      [U('старт'), A([tool('Edit', { file_path: '.specs/demo/FR.md' })]), U('идём'), ...turnTools.map((t) => A([t])), A([txt(`Готово, всё закрыто. ${n} из 48.`)])],
      env,
    ).blocked;
  this.cegKicks = [kick(37), kick(38), kick(39), kick(40, [tool('Read', { file_path: 'x.ts' })])];
});
Then<CegWorld>('it releases the stop, but a later kick that runs a tool resets the streak and the gate blocks again', function () {
  assert.deepEqual(this.cegKicks, [true, true, false, true], `streak progression wrong: ${JSON.stringify(this.cegKicks)}`);
});
