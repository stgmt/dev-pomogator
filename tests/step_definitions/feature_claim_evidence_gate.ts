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
import os from 'node:os';
import assert from 'node:assert/strict';
import { classify, firstUnsupported, stripCode } from '../../tools/claim-evidence-gate/claim_classifier.ts';
import { extractTurnWindow, bgInFlightInWindow, lastUserPrompt, agentBgInFlightCount, agentBgInFlight, sessionUserPrompts } from '../../tools/claim-evidence-gate/turn_window.ts';
import { agentOpenTodoCount, liveOpenForUncensusedSlugs, lastEditedSpecSlug } from '../../tools/spec-graph/task-census.ts';
import { gateSelfEdit, selfMarkedBlockedOrBacklog } from '../../tools/claim-evidence-gate/game_guard_facts.ts';
import { buildJudgeNoTokenDemand, resolveEndpoint, isJudgeArmed } from '../../tools/claim-evidence-gate/meridian-judge.ts';

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
  // Batch 3 (_29/_30/_32-42)
  cegBlockerTriple?: boolean[];
  cegFeatureVsFr?: boolean[];
  cegBgRows?: Block[];
  cegBgMarkerPair?: boolean[];
  cegBgCmdRunning?: Block[];
  cegBgCmdDone?: Block[];
  cegBgCmdPair?: boolean[];
  cegGateFile?: string;
  cegInspectRows?: Block[];
  cegInspectTriple?: boolean[];
  cegBgRunningRaw?: string;
  cegBgDoneRaw?: string;
  cegBgWindowPair?: boolean[];
  cegAnalysisScope?: Block[];
  cegAnalysisTriple?: boolean[];
  cegOwnTodos?: { openBlocked: boolean; openRaw: string; doneBlocked: boolean };
  cegInjectionRaw?: string;
  cegExtractedPrompt?: string;
  cegOneRunningRaw?: string;
  cegAllDoneRaw?: string;
  cegNoLaunchRaw?: string;
  cegIdPairResult?: number[];
  cegIdDeferRows?: Block[];
  cegIdDeferRowsDone?: Block[];
  cegIdDeferPair?: boolean[];
  cegTodoTmp?: string;
  cegTodoTmp2?: string;
  cegTodoCounts?: number[];
  cegWinResetRows?: Block[];
  cegWinResetRowsDone?: Block[];
  cegWinResetPair?: boolean[];
  cegEachTurnPairs?: Array<{ rows: Block[]; env?: Record<string, string> }>; // shared by _30/_47/_54
  cegEachTurnResults?: boolean[];
  // Batch 4 (_43..55)
  cegGameGuardResults?: boolean[];
  cegMandateRaw?: string;
  cegMandateResult?: string[];
  cegDoneRedSetup?: () => Block[];
  cegDemandText?: string;
  cegResolveResults?: boolean[];
  cegArmResults?: boolean[];
  cegFr19Root?: string;
  cegFr19Slug?: string;
  cegFr19Results?: number[];
  cegRecencyResults?: Array<string | null>;
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
Given<CegWorld>('no tool matching {string} ran this turn', function (_cmd: string) {
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
Given<CegWorld>(/^the gate has blocked consecutive stops in which the agent ran no tools \(no work-delta\)$/, function () {
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

// ── Batch 3: blocker-proof, FR-9 .feature-scoping, bg-marker/command defer, gate-meta, window-boundary,
//             analysis-only, hook-injection strip, agentBgInFlightCount id-pairing, id-paired defer,
//             own-todos arm, agentOpenTodoCount replay, window-reset bg command (CEGATE001_29/30/32-42) ──
Given<CegWorld>("the final message rests the stop on a blocker claim while work remains", function () {
  writeCensus(this.tempDir, { open: 11, doneRed: 0, doneUnrun: 0 }, { id: 'demo:t1', title: 'Wire the gate' });
});
When<CegWorld>('the turn ran no tool and launched no background task', function () {
  const bare = runHookExplicit(this, [U('старт'), A([tool('Edit', { file_path: '.specs/demo/FR.md' })]), U('идём'), A([txt('Жду — cucumber.json держит параллельная сессия, трогать нельзя.')])], { CLAIM_GATE_JUDGE: 'false' }).blocked;
  const substantiated = runHookExplicit(this, [U('старт'), A([tool('Edit', { file_path: '.specs/demo/FR.md' })]), U('идём'), A([tool('Bash', { command: 'git diff -- cucumber.json' })]), A([txt('Жду — cucumber.json держит параллельная сессия, трогать нельзя.')])], { CLAIM_GATE_JUDGE: 'false' }).blocked;
  const realAsync = runHookExplicit(this, [U('старт'), A([tool('Edit', { file_path: '.specs/demo/FR.md' })]), U('идём'), A([tool('Bash', { command: 'npm test', run_in_background: true })]), A([txt('Жду — cucumber.json держит параллельная сессия, трогать нельзя.')])], { CLAIM_GATE_JUDGE: 'false' }).blocked;
  this.cegBlockerTriple = [bare, substantiated, realAsync];
});
Then<CegWorld>('it blocks the stop demanding proof, yet approves when the agent ran a tool or launched a background task', function () {
  assert.deepEqual(this.cegBlockerTriple, [true, false, false], `blocker-proof triple wrong: ${JSON.stringify(this.cegBlockerTriple)}`);
});

Given<CegWorld>("the session edits only a spec's .feature in one turn and only its FR.md in another, with an open census", function () {
  writeCensus(this.tempDir, { open: 11, doneRed: 0, doneUnrun: 0 }, { id: 'demo:t1', title: 'Wire the gate' });
  this.cegEachTurnPairs = [
    { rows: [U('добавь сценарий'), A([tool('Edit', { file_path: '.specs/demo/demo.feature' })]), A([txt('Готово, всё закрыто. 37 из 48.')])] },
    { rows: [U('правлю требование'), A([tool('Edit', { file_path: '.specs/demo/FR.md' })]), A([txt('Готово, тут всё закрыто. 37 из 48.')])] },
  ];
});
// Shared by _30 / _47 / _54 (identical feature text "the gate evaluates each turn") — each scenario's
// Given populates cegEachTurnPairs with its own rows; this runs each through the real hook and stashes
// the blocked[] results for that scenario's own Then to assert against.
When<CegWorld>('the gate evaluates each turn', function () {
  this.cegEachTurnResults = (this.cegEachTurnPairs ?? []).map((p) => runHookExplicit(this, p.rows, p.env ?? { CLAIM_GATE_JUDGE: 'false' }).blocked);
});
Then<CegWorld>(/^the \.feature-only turn stays quiet \(the spec is not scoped\) while the FR\.md turn blocks as before$/, function () {
  assert.deepEqual(this.cegEachTurnResults, [false, true], `feature-vs-FR scoping wrong: ${JSON.stringify(this.cegEachTurnResults)}`);
});

Given<CegWorld>(/^a real background job is in flight \(a live \.bg-task-active marker\) while scope-open work remains$/, function () {
  writeCensus(this.tempDir, { open: 11, doneRed: 0, doneUnrun: 0 }, { id: 'demo:t1', title: 'Wire the gate' });
  this.cegBgRows = [U('правлю требование'), A([tool('Edit', { file_path: '.specs/demo/FR.md' })]), A([txt('Продолжаю — жду, пока фоновый прогон закончится, сам пока ничего сделать не могу.')])];
});
When<CegWorld>('the gate evaluates a stop that merely awaits the result with no «Дальше:» step', function () {
  const markerDir = path.join(this.tempDir, '.dev-pomogator');
  fs.mkdirSync(markerDir, { recursive: true });
  const marker = path.join(markerDir, '.bg-task-active.testsession');
  fs.writeFileSync(marker, `12345 ${Math.floor(Date.now() / 1000)}\n`);
  const withMarker = runHookExplicit(this, this.cegBgRows!, { CLAIM_GATE_JUDGE: 'false' }).blocked;
  fs.rmSync(marker);
  const withoutMarker = runHookExplicit(this, this.cegBgRows!, { CLAIM_GATE_JUDGE: 'false' }).blocked;
  this.cegBgMarkerPair = [withMarker, withoutMarker];
});
Then<CegWorld>('it defers to the bg-task-guard and approves, but the same stop blocks once the marker is gone', function () {
  assert.deepEqual(this.cegBgMarkerPair, [false, true], `bg-marker defer pair wrong: ${JSON.stringify(this.cegBgMarkerPair)}`);
});

Given<CegWorld>(/^the window shows a background command launched \(a build, not a test\) with no completion record yet$/, function () {
  writeCensus(this.tempDir, { open: 11, doneRed: 0, doneUnrun: 0 }, { id: 'demo:t1', title: 'Wire the gate' });
  const completion: Block = { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'b1', content: '<output-file>b.output</output-file>\n<status>completed</status>\n<summary>Background command "build" completed (exit code 0)</summary>' }] } };
  const base = [U('собери и почини'), A([tool('Edit', { file_path: '.specs/demo/FR.md' })]), A([tool('Bash', { command: 'npm run build', run_in_background: true })])];
  const claim = A([txt('Продолжаю — жду, пока фоновая сборка закончится, сам пока ничего сделать не могу.')]);
  this.cegBgCmdRunning = [...base, claim];
  this.cegBgCmdDone = [...base, completion, claim];
});
When<CegWorld>('the gate evaluates a stop that merely awaits it while scope-open work remains', function () {
  const running = runHookExplicit(this, this.cegBgCmdRunning!, { CLAIM_GATE_JUDGE: 'false' }).blocked;
  const done = runHookExplicit(this, this.cegBgCmdDone!, { CLAIM_GATE_JUDGE: 'false' }).blocked;
  this.cegBgCmdPair = [running, done];
});
Then<CegWorld>('it approves, but once the harness completion record lands in the window the same lazy stop blocks', function () {
  assert.deepEqual(this.cegBgCmdPair, [false, true], `bg-command defer pair wrong: ${JSON.stringify(this.cegBgCmdPair)}`);
});

Given<CegWorld>("the session has scope-open work and the current turn only read the gate's own source with no edit", function () {
  writeCensus(this.tempDir, { open: 11, doneRed: 0, doneUnrun: 0 }, { id: 'demo:t1', title: 'Wire the gate' });
  this.cegGateFile = 'tools/claim-evidence-gate/claim_evidence_gate_stop.ts';
  this.cegInspectRows = [U('почини спеку'), A([tool('Edit', { file_path: '.specs/demo/FR.md' })]), A([txt('готово')]), U('теперь доделывай открытые задачи demo'), A([tool('Read', { file_path: this.cegGateFile })]), A([txt('Посмотрел исходник гейта — похоже на ложное срабатывание.')])];
});
When<CegWorld>('the gate evaluates a second consecutive such inspection turn', function () {
  const first = runHookExplicit(this, this.cegInspectRows!, { CLAIM_GATE_JUDGE: 'false' }).blocked;
  const second = runHookExplicit(this, this.cegInspectRows!, { CLAIM_GATE_JUDGE: 'false' }).blocked;
  const editRows = [U('почини спеку'), A([tool('Edit', { file_path: '.specs/demo/FR.md' })]), A([txt('готово')]), U('теперь улучши гейт'), A([tool('Edit', { file_path: this.cegGateFile! })]), A([txt('Поправил логику гейта в исходнике.')])];
  const editApproved = runHookExplicit(this, editRows, { CLAIM_GATE_JUDGE: 'false' }).blocked;
  this.cegInspectTriple = [first, second, editApproved];
});
Then<CegWorld>('it blocks with a bare next-step demand, while a turn that EDITS the gate is treated as real work and approved', function () {
  assert.deepEqual(this.cegInspectTriple, [false, true, false], `gate-inspection triple wrong: ${JSON.stringify(this.cegInspectTriple)}`);
});

Given<CegWorld>('a backgrounded helper agent was launched and has not yet delivered its «came to rest» completion', function () {
  const ack: Block = { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a1', content: 'Async agent launched successfully.\nagentId: abc123 (internal ID)' }] } };
  const launch = A([tool('Agent', { id: 'a1', description: 'migrate x', subagent_type: 'bdd-migrator', run_in_background: true })]);
  this.cegBgRunningRaw = [U('go'), launch, ack, A([txt('Запустил помощника — жду его результата.')])].map((r) => JSON.stringify(r)).join('\n');
  this.cegBgDoneRaw = [U('go'), launch, ack, U('"migrate x" came to rest · 5m\n\nрезультат: 14 сценариев зелёные.'), A([txt('Обработал результат, продолжаю.')])].map((r) => JSON.stringify(r)).join('\n');
});
When<CegWorld>('the gate checks whether a background job is still in flight', function () {
  this.cegBgWindowPair = [bgInFlightInWindow(this.cegBgRunningRaw!), bgInFlightInWindow(this.cegBgDoneRaw!)];
});
Then<CegWorld>('it reports in-flight while running, but the «came to rest» user-message resets the window so it is no longer in-flight', function () {
  assert.deepEqual(this.cegBgWindowPair, [true, false], `bg window-boundary pair wrong: ${JSON.stringify(this.cegBgWindowPair)}`);
});

Given<CegWorld>(/^the user's last request was for analysis\/report only and the agent ended on a lazy stop while work remains$/, function () {
  writeCensus(this.tempDir, { open: 11, doneRed: 0, doneUnrun: 0 }, { id: 'demo:t1', title: 'Wire the gate' });
  this.cegAnalysisScope = [U('правлю требование'), A([tool('Edit', { file_path: '.specs/demo/FR.md' })]), A([txt('готово')])];
});
When<CegWorld>('the gate evaluates the stop', function () {
  if (this.cegAnalysisScope) {
    const approveCase = runHookExplicit(this, [...this.cegAnalysisScope, U('сделай анализ и отчёт'), A([txt('Продолжаю разбор, тут всё.')])], { CLAIM_GATE_JUDGE: 'false' }).blocked;
    const unbackedCase = runHookExplicit(this, [...this.cegAnalysisScope, U('анализ и отчёт'), A([txt('Всё работает, фикс задеплоен.')])], { CLAIM_GATE_JUDGE: 'false' }).blocked;
    const implementCase = runHookExplicit(this, [...this.cegAnalysisScope, U('почини баг в парсере'), A([txt('Продолжаю, тут всё.')])], { CLAIM_GATE_JUDGE: 'false' }).blocked;
    this.cegAnalysisTriple = [approveCase, unbackedCase, implementCase];
    return;
  }
  // own-todos case (_40): two runs — one open todo blocks+names it, all-done stays quiet
  const open = runHookExplicit(this, [U('переделай пинатор'), A([tool('TaskCreate', { subject: 't1', description: 'x' })]), A([tool('TaskCreate', { subject: 't2', description: 'y' })]), A([tool('TaskUpdate', { taskId: '1', status: 'completed' })]), U('делай'), A([txt('Продолжаю по плану, тут всё.')])], { CLAIM_GATE_JUDGE: 'false' });
  const done = runHookExplicit(this, [U('переделай пинатор'), A([tool('TaskCreate', { subject: 't1', description: 'x' })]), A([tool('TaskUpdate', { taskId: '1', status: 'completed' })]), U('делай'), A([txt('Продолжаю по плану, тут всё.')])], { CLAIM_GATE_JUDGE: 'false' });
  this.cegOwnTodos = { openBlocked: open.blocked, openRaw: open.raw, doneBlocked: done.blocked };
});
Then<CegWorld>(/^it approves \(no work-kick\), but it blocks an unbacked works-done claim, and an implement request still enforces work$/, function () {
  assert.deepEqual(this.cegAnalysisTriple, [false, true, true], `analysis-only triple wrong: ${JSON.stringify(this.cegAnalysisTriple)}`);
});

Given<CegWorld>('the latest user-role messages include a spec-tasks banner and validator output appended by hooks', function () {
  this.cegInjectionRaw = [U('сделай анализ и отчёт'), A([txt('ok')]), U('📋 Spec tasks (census 2026-06-21): 210 open\n   👉 следующее: T25 [session-pilot:t25]\n[specs-validator] coverage gaps: 31 NOT_COVERED')].map((r) => JSON.stringify(r)).join('\n');
});
When<CegWorld>("the gate extracts the user's intent prompt", function () {
  this.cegExtractedPrompt = lastUserPrompt(this.cegInjectionRaw!);
});
Then<CegWorld>(/^it returns the typed request with the injected banner\/validator lines stripped and injection-only messages skipped$/, function () {
  assert.equal(this.cegExtractedPrompt, 'сделай анализ и отчёт', `lastUserPrompt extraction wrong: ${this.cegExtractedPrompt}`);
});

Given<CegWorld>('a description was launched twice as a retry and both completed while another launch has no completion', function () {
  const launch = (id: string, desc: string): Block => A([{ type: 'tool_use', id, name: 'Agent', input: { description: desc, subagent_type: 'bdd-migrator', run_in_background: true } }]);
  const done = (id: string): Block => U(`<task-notification><tool-use-id>${id}</tool-use-id><status>completed</status></task-notification>`);
  this.cegOneRunningRaw = [U('go'), launch('a1', 'migrate alpha'), launch('a2', 'migrate alpha'), launch('b1', 'migrate beta'), done('a1'), done('a2'), A([txt('alpha done; beta идёт.')])].map((r) => JSON.stringify(r)).join('\n');
  this.cegAllDoneRaw = [U('go'), launch('a1', 'migrate alpha'), launch('b1', 'migrate beta'), done('a1'), done('b1'), A([txt('оба готовы.')])].map((r) => JSON.stringify(r)).join('\n');
  this.cegNoLaunchRaw = [U('go'), U('<task-notification><tool-use-id>z9</tool-use-id><status>completed</status></task-notification>'), A([txt('чужой id, не мой запуск.')])].map((r) => JSON.stringify(r)).join('\n');
});
When<CegWorld>('the gate counts in-flight helpers by pairing each launch id against its completion id', function () {
  this.cegIdPairResult = [agentBgInFlightCount(this.cegOneRunningRaw!), agentBgInFlight(this.cegOneRunningRaw!) ? 1 : 0, agentBgInFlightCount(this.cegAllDoneRaw!), agentBgInFlight(this.cegNoLaunchRaw!) ? 1 : 0];
});
Then<CegWorld>(/^it reports exactly one in flight \(the retry does not make it two\) and zero once every id is completed$/, function () {
  assert.deepEqual(this.cegIdPairResult, [1, 1, 0, 0], `id-pairing result wrong: ${JSON.stringify(this.cegIdPairResult)}`);
});

Given<CegWorld>('a backgrounded agent was launched with a tool_use id and a later message reset the turn window', function () {
  writeCensus(this.tempDir, { open: 11, doneRed: 0, doneUnrun: 0 }, { id: 'demo:t1', title: 'Wire the gate' });
  const launch = A([{ type: 'tool_use', id: 'ag-beta', name: 'Agent', input: { description: 'migrate beta', subagent_type: 'bdd-migrator', run_in_background: true } }]);
  const doneBeta = U('<task-notification><tool-use-id>ag-beta</tool-use-id><status>completed</status></task-notification>');
  const pre = [U('мигрируй спеки'), A([tool('Edit', { file_path: '.specs/demo/FR.md' })]), launch, U('жди')];
  const tail = [A([tool('Bash', { command: 'git commit -m done' })]), A([txt('Закоммитил готовое, продолжаю по плану.')])];
  this.cegIdDeferRows = [...pre, ...tail];
  this.cegIdDeferRowsDone = [...pre, doneBeta, ...tail];
});
When<CegWorld>('the gate evaluates a lazy stop with the judge off and no completion for that id has arrived', function () {
  const pending = runHookExplicit(this, this.cegIdDeferRows!, { CLAIM_GATE_JUDGE: 'false' }).blocked;
  const landed = runHookExplicit(this, this.cegIdDeferRowsDone!, { CLAIM_GATE_JUDGE: 'false' }).blocked;
  this.cegIdDeferPair = [pending, landed];
});
Then<CegWorld>('it defers because id-pairing still sees the launch pending, and it blocks the same stop once the completion id lands', function () {
  assert.deepEqual(this.cegIdDeferPair, [false, true], `id-paired defer pair wrong: ${JSON.stringify(this.cegIdDeferPair)}`);
});

Given<CegWorld>('a session edited no spec but its own task list still has an open todo and it ends on a lazy stop', function () {
  // no per-scenario fixture needed — the "the gate evaluates the stop" When builds + runs both cases inline
  // when cegAnalysisScope is unset (this Given deliberately leaves it unset, branching to the own-todos path)
});
Then<CegWorld>("it blocks because the agent's open todo counts as open work AND the kick names that next open todo, and it stays quiet once all todos are completed", function () {
  assert.equal(this.cegOwnTodos!.openBlocked, true, `open-todo case should block; raw=${this.cegOwnTodos!.openRaw}`);
  assert.match(this.cegOwnTodos!.openRaw ?? '', /t2/, 'kick must name the next open todo (t2)');
  assert.equal(this.cegOwnTodos!.doneBlocked, false, 'all-todos-done case should NOT block');
});

Given<CegWorld>(/^the transcript records TaskCreate\/TaskUpdate calls and a latest TodoWrite list$/, function () {
  const tmp = path.join(this.tempDir, 'todo.jsonl');
  const tasks = [A([tool('TaskCreate', { subject: 'a' })]), A([tool('TaskCreate', { subject: 'b' })]), A([tool('TaskCreate', { subject: 'c' })]), A([tool('TaskUpdate', { taskId: '1', status: 'completed' })]), A([tool('TaskUpdate', { taskId: '2', status: 'in_progress' })])];
  fs.writeFileSync(tmp, tasks.map((r) => JSON.stringify(r)).join('\n'));
  this.cegTodoTmp = tmp;
  const todo2 = path.join(this.tempDir, 'todo2.jsonl');
  fs.writeFileSync(todo2, [A([tool('TodoWrite', { todos: [{ status: 'completed' }, { status: 'pending' }, { status: 'in_progress' }] })])].map((r) => JSON.stringify(r)).join('\n'));
  this.cegTodoTmp2 = todo2;
});
When<CegWorld>("the gate counts the agent's open declared work", function () {
  this.cegTodoCounts = [agentOpenTodoCount(this.cegTodoTmp!), agentOpenTodoCount(this.cegTodoTmp2!), agentOpenTodoCount(path.join(this.tempDir, 'nope.jsonl'))];
});
Then<CegWorld>('it replays the task ids to their final status and counts pending plus in-progress, failing open to zero on a missing transcript', function () {
  assert.deepEqual(this.cegTodoCounts, [2, 2, 0], `agentOpenTodoCount results wrong: ${JSON.stringify(this.cegTodoCounts)}`);
});

Given<CegWorld>('a run_in_background command was launched in an earlier turn and a later message reset the turn window before the agent\'s lazy stop', function () {
  const launch = A([tool('Bash', { command: 'docker test', run_in_background: true })]);
  const completion: Block = { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: '<status>completed</status>\nBackground command "docker test" completed (exit code 0)' }] } };
  const head = [U('собери и почини'), A([tool('TaskCreate', { subject: 't1' })]), launch];
  const claim = A([txt('Жду сборку, продолжаю по плану.')]);
  this.cegWinResetRows = [...head, U('жди'), claim];
  this.cegWinResetRowsDone = [...head, completion, U('жди'), claim];
});
When<CegWorld>('the gate evaluates the stop while no completion record has arrived', function () {
  const pending = runHookExplicit(this, this.cegWinResetRows!, { CLAIM_GATE_JUDGE: 'false' }).blocked;
  const landed = runHookExplicit(this, this.cegWinResetRowsDone!, { CLAIM_GATE_JUDGE: 'false' }).blocked;
  this.cegWinResetPair = [pending, landed];
});
Then<CegWorld>('it defers because the whole-transcript check sees the launch is still pending, and it blocks the same lazy stop once the completion record lands', function () {
  assert.deepEqual(this.cegWinResetPair, [false, true], `window-reset bg-command pair wrong: ${JSON.stringify(this.cegWinResetPair)}`);
});

// ── Batch 4 (_43..55): reconciled orphans — game-guard facts, session mandate, big-paste clamp,
//             multi-line block-reason, doneUnrun-vs-doneRed, no-token demand, resolveEndpoint priority,
//             judge-arming matrix, live open-work counting, self-mention no-skip, recency slug ──
Given<CegWorld>('a set of real Edit, Write, door apply_spec_change, set_spec_status and Read tool_use records', function () {
  // fixed, real-shaped tool_use records (mirrors the harness's actual records, not literals)
});
When<CegWorld>('the game-guard facts are computed from those real inputs', function () {
  this.cegGameGuardResults = [
    gateSelfEdit([{ name: 'Edit', input: { file_path: 'E:/repos/dev-pomogator/tools/spec-graph/task-census.ts', old_string: 'a', new_string: 'b' } }]),
    gateSelfEdit([{ name: 'Write', input: { file_path: 'tools/claim-evidence-gate/meridian-judge.ts', content: 'x' } }]),
    gateSelfEdit([{ name: 'mcp__dev-pomogator-specs__apply_spec_change', input: { spec: 'claim-evidence-gate', doc: 'FR.md', old_string: 'a', new_string: 'b' } }]),
    gateSelfEdit([{ name: 'Edit', input: { file_path: 'src/feature/foo.ts', old_string: 'a', new_string: 'b' } }]),
    gateSelfEdit([{ name: 'Read', input: { file_path: 'tools/claim-evidence-gate/meridian-judge.ts' } }]),
    selfMarkedBlockedOrBacklog([{ name: 'mcp__dev-pomogator-specs__set_spec_status', input: { spec: 'foo', status: 'backlog' } }]),
    selfMarkedBlockedOrBacklog([{ name: 'mcp__dev-pomogator-specs__apply_spec_change', input: { spec: 'foo', doc: 'TASKS.md', new_string: '- [ ] task -- Status: BLOCKED | Est: 1h' } }]),
    selfMarkedBlockedOrBacklog([{ name: 'Edit', input: { file_path: '.specs/foo/TASKS.md', old_string: 'Status: TODO', new_string: 'Status: BLOCKED' } }]),
    selfMarkedBlockedOrBacklog([{ name: 'mcp__dev-pomogator-specs__set_spec_status', input: { spec: 'foo', status: 'active' } }]),
    selfMarkedBlockedOrBacklog([{ name: 'Edit', input: { file_path: 'src/foo.ts', old_string: 'a', new_string: 'b' } }]),
  ];
});
Then<CegWorld>('gateSelfEdit and selfMarkedBlockedOrBacklog report true only for genuine gate-own mutations and false for reads or unrelated edits', function () {
  assert.deepEqual(this.cegGameGuardResults, [true, true, true, false, false, true, true, true, false, false], `game-guard results wrong: ${JSON.stringify(this.cegGameGuardResults)}`);
});

Given<CegWorld>('a transcript mixing two genuine user prompts with a census banner, skill content, a compact summary, a system task-notification and a slash-command message', function () {
  const meta = (text: string, extra: Record<string, unknown>): Block => ({ type: 'user', isSidechain: false, ...extra, message: { role: 'user', content: [{ type: 'text', text }] } });
  this.cegMandateRaw = [
    U('слей инструменты 26→24'),
    A([txt('делаю')]),
    U('📋 Spec tasks (census): 207 open\n   👉 следующее: WS-F [spec-generator-v4:ws-f-remaining]'),
    meta('Base directory for this skill: E:/x\n# /run-tests', { isMeta: true }),
    meta('This session is being continued from a previous conversation. The summary…', { isCompactSummary: true, isVisibleInTranscriptOnly: true }),
    meta('<task-notification>\n<status>completed</status>\n</task-notification>', { promptSource: 'system' }),
    U('<command-name>/compact</command-name>\n<command-message>compact</command-message>'),
    U('го'),
    U('и почини судью, добавь бенч'),
  ].map((r) => JSON.stringify(r)).join('\n');
});
When<CegWorld>("the gate extracts the session's full mandate", function () {
  this.cegMandateResult = sessionUserPrompts(this.cegMandateRaw!);
});
Then<CegWorld>('it returns only the two genuine prompts in order, and an empty transcript yields an empty mandate', function () {
  assert.deepEqual(this.cegMandateResult, ['слей инструменты 26→24', 'и почини судью, добавь бенч'], `mandate extraction wrong: ${JSON.stringify(this.cegMandateResult)}`);
  assert.deepEqual(sessionUserPrompts(''), [], 'empty transcript must yield empty mandate');
});

Given<CegWorld>('a prompt that pastes several kilobytes of log noise between a framing head and the real ask at the tail', function () {
  const logs = 'INFO request handled ok\n'.repeat(200);
  const big = 'логи ниже:\n' + logs + 'ПОЧИНИ ошибку в самом конце';
  this.cegMandateRaw = [U(big), A([txt('ok')])].map((r) => JSON.stringify(r)).join('\n');
});
Then<CegWorld>('the returned prompt keeps both the head and the tail ask, elides the bulky middle with an omitted-chars marker, and stays bounded in length', function () {
  const [item] = this.cegMandateResult ?? [];
  assert.match(item ?? '', /логи ниже/, 'head must survive');
  assert.match(item ?? '', /ПОЧИНИ ошибку в самом конце/, 'tail (the real ask) must survive');
  assert.match(item ?? '', /chars omitted/, 'bulky middle must be elided with a marker');
  assert.ok((item ?? '').length < 450, `expected length < 450, got ${(item ?? '').length}`);
});

Given<CegWorld>('the latest messages are a genuine user prompt followed by a multi-line gate block-reason warning', function () {
  this.cegInjectionRaw = [
    U('реальный запрос пользователя'),
    A([txt('делаю работу')]),
    U('⚠️ claim-evidence-gate: ты заявил результат (works-done), но в этом ходе нет улики.\nНужно: реальный прогон (тесты/запуск) в этом ходе.\nСначала реально прогони проверку.'),
  ].map((r) => JSON.stringify(r)).join('\n');
});
Then<CegWorld>("it returns the genuine prompt, not any line of the gate's own block-reason", function () {
  assert.equal(this.cegExtractedPrompt, 'реальный запрос пользователя', `lastUserPrompt must skip the multi-line block-reason: ${this.cegExtractedPrompt}`);
});

Given<CegWorld>(/^the census shows only doneUnrun work in one turn and only doneRed work in another, both with an open FR\.md edit and no Дальше section$/, function () {
  writeCensus(this.tempDir, { open: 0, doneRed: 0, doneUnrun: 7 });
  const doneUnrunRows = [U('правлю требование'), A([tool('Edit', { file_path: '.specs/demo/FR.md' })]), A([txt('Готово, всё закрыто. 37 из 48.')])];
  this.cegEachTurnPairs = [{ rows: doneUnrunRows }]; // doneRed re-writes the census below, run sequentially in the When
  this.cegDoneRedSetup = () => {
    writeCensus(this.tempDir, { open: 0, doneRed: 2, doneUnrun: 0 });
    return [U('правлю другое требование'), A([tool('Edit', { file_path: '.specs/demo/FR.md' })]), A([txt('Тут всё готово. 38 из 48.')])];
  };
});
Then<CegWorld>('the doneUnrun-only turn stays quiet while the doneRed turn still blocks', function () {
  const doneUnrunOnly = this.cegEachTurnResults![0];
  const doneRedRows = this.cegDoneRedSetup!();
  const doneRed = runHookExplicit(this, doneRedRows, { CLAIM_GATE_JUDGE: 'false' }).blocked;
  assert.equal(doneUnrunOnly, false, 'doneUnrun-only must NOT arm the Дальше gate');
  assert.equal(doneRed, true, 'doneRed must still fire');
});

Given<CegWorld>('an open-work count for the no-token demand', function () {
  this.cegDemandText = buildJudgeNoTokenDemand(7);
});
When<CegWorld>('the gate builds the no-token demand message', function () {
  // already built in Given (pure function, no setup phase needed) — kept as a separate step for readability
});
Then<CegWorld>('it names AUTO_COMMIT_API_KEY, OPENROUTER_API_KEY, CLAIM_GATE_JUDGE_KEY, the aipomogator endpoint and the open-work count', function () {
  const d = this.cegDemandText ?? '';
  for (const needle of ['AUTO_COMMIT_API_KEY', 'OPENROUTER_API_KEY', 'CLAIM_GATE_JUDGE_KEY', 'https://aipomogator.ru/go/v1', 'токен аипомогатора', '7']) {
    assert.match(d, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `demand text missing "${needle}": ${d}`);
  }
});

Given<CegWorld>('env snapshots each carrying a different single judge token, and one snapshot carrying none', function () {
  this.cegResolveResults = [
    resolveEndpoint({ AUTO_COMMIT_API_KEY: 'k' }) !== null,
    resolveEndpoint({ OPENROUTER_API_KEY: 'k' }) !== null,
    resolveEndpoint({ CLAIM_GATE_JUDGE_KEY: 'k' }) !== null,
    resolveEndpoint({}) === null,
  ];
});
When<CegWorld>('the gate resolves the judge endpoint for each', function () {
  // already resolved in Given (pure function) — kept as a separate step for readability
});
Then<CegWorld>('every single-token snapshot resolves an endpoint while the tokenless snapshot resolves null', function () {
  assert.deepEqual(this.cegResolveResults, [true, true, true, true], `resolveEndpoint results wrong: ${JSON.stringify(this.cegResolveResults)}`);
});

const ARM_BASE = { gray: true, hasNextBlock: false, analysisOnly: false, judgeEnabled: true, openWork: 0 };
Given<CegWorld>('an arming input with a Дальше block present and openWork at zero, plain and with analysis-only set', function () {
  this.cegArmResults = [isJudgeArmed({ ...ARM_BASE, hasNextBlock: true, openWork: 0 }), isJudgeArmed({ ...ARM_BASE, hasNextBlock: true, openWork: 0, analysisOnly: true })];
});
Given<CegWorld>('an arming input with no Дальше block, varying openWork and analysis-only', function () {
  this.cegArmResults = [isJudgeArmed({ ...ARM_BASE, hasNextBlock: false, openWork: 0 }), isJudgeArmed({ ...ARM_BASE, hasNextBlock: false, openWork: 3 }), isJudgeArmed({ ...ARM_BASE, hasNextBlock: false, openWork: 3, analysisOnly: true })];
});
Given<CegWorld>('an arming input with a Дальше block and open work, but the judge disabled or the gray signal absent', function () {
  this.cegArmResults = [isJudgeArmed({ ...ARM_BASE, hasNextBlock: true, openWork: 5, judgeEnabled: false }), isJudgeArmed({ ...ARM_BASE, hasNextBlock: true, openWork: 5, gray: false })];
});
// Shared by _50/_51/_52 (identical feature text) — each scenario's Given already computed cegArmResults
// (isJudgeArmed is pure, no async setup needed), so this is a deliberate no-op for readability/symmetry.
When<CegWorld>('the gate decides whether the judge is armed', function () {
  /* no-op — computed in Given */
});
Then<CegWorld>('both cases arm the judge regardless of openWork or analysis-only', function () {
  assert.deepEqual(this.cegArmResults, [true, true], `Дальше-block arming wrong: ${JSON.stringify(this.cegArmResults)}`);
});
Then<CegWorld>('zero openWork stays unarmed, positive openWork arms it, and analysis-only suppresses that arming', function () {
  assert.deepEqual(this.cegArmResults, [false, true, false], `no-Дальше arming matrix wrong: ${JSON.stringify(this.cegArmResults)}`);
});
Then<CegWorld>('neither case arms the judge', function () {
  assert.deepEqual(this.cegArmResults, [false, false], `disabled/no-gray arming wrong: ${JSON.stringify(this.cegArmResults)}`);
});

Given<CegWorld>('a TASKS.md with a top-level open task, an in-progress task, an indented sub-item, a done task and a template placeholder, for a spec absent from the census', function () {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cegate-fr19-'));
  const slug = 'demo-spec';
  fs.mkdirSync(path.join(root, '.specs', slug), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.specs', slug, 'TASKS.md'),
    ['# Tasks', '- [ ] Real open task one -- @feature1 — Status: TODO', '- [ ] Real open task two — Status: IN_PROGRESS', '  - [ ] Done When sub-item (indented)', '- [x] A finished task', '- [ ] {Задача placeholder}'].join('\n'),
  );
  this.cegFr19Root = root;
  this.cegFr19Slug = slug;
});
When<CegWorld>("the gate counts that spec's live open work", function () {
  this.cegFr19Results = [
    liveOpenForUncensusedSlugs(this.cegFr19Root!, new Set([this.cegFr19Slug!]), { specs: [{ slug: 'other' }] }),
    liveOpenForUncensusedSlugs(this.cegFr19Root!, new Set([this.cegFr19Slug!]), { specs: [{ slug: this.cegFr19Slug! }] }),
    liveOpenForUncensusedSlugs(this.cegFr19Root!, new Set(['no-such']), null),
  ];
});
Then<CegWorld>('it counts only the two genuine top-level tasks, counts zero once the spec is in the census, and fails open to zero on a missing census or file', function () {
  assert.deepEqual(this.cegFr19Results, [2, 0, 0], `liveOpenForUncensusedSlugs results wrong: ${JSON.stringify(this.cegFr19Results)}`);
});

Given<CegWorld>('a works-done claim that mentions "claim-evidence-gate" by name with no executor tool this turn, and the same claim with an executor', function () {
  this.cegEachTurnPairs = [
    { rows: [U('почини'), A([txt('Гейт claim-evidence-gate работает, всё готово и проверено.')])] },
    { rows: [U('почини'), A([tool('Bash', { command: 'npm test' })]), A([txt('Гейт claim-evidence-gate работает, всё готово.')])] },
  ];
});
Then<CegWorld>('the unbacked claim still blocks despite naming the gate, while the executor-backed claim approves', function () {
  assert.deepEqual(this.cegEachTurnResults, [true, false], `self-mention no-skip results wrong: ${JSON.stringify(this.cegEachTurnResults)}`);
});

Given<CegWorld>('a sequence of door edits across two specs ending with one spec last, then ending with the other last, then one ending on a .feature-only edit, then no edits at all', function () {
  const door = (spec: string, doc = 'FR.md'): Block => A([tool('mcp__dev-pomogator-specs__apply_spec_change', { spec, doc })]);
  const fp = path.join(this.tempDir, 'lt.jsonl');
  const write = (rows: Block[]): void => fs.writeFileSync(fp, rows.map((r) => JSON.stringify(r)).join('\n'));
  write([door('alpha'), door('beta'), door('alpha')]);
  const alphaLast = lastEditedSpecSlug(fp);
  write([door('alpha'), door('beta')]);
  const betaLast = lastEditedSpecSlug(fp);
  write([door('alpha'), door('beta', 'b.feature')]);
  const featureIgnored = lastEditedSpecSlug(fp);
  write([U('просто текст')]);
  const noEdits = lastEditedSpecSlug(fp);
  this.cegRecencyResults = [alphaLast, betaLast, featureIgnored, noEdits];
});
When<CegWorld>('the gate determines the most recently edited spec', function () {
  // already computed in Given (pure function over a fixture file) — kept as a separate step for readability
});
Then<CegWorld>('it returns the spec truly edited last, treats a .feature-only edit as not taking ownership, and returns null when nothing was edited', function () {
  assert.deepEqual(this.cegRecencyResults, ['alpha', 'beta', 'alpha', null], `lastEditedSpecSlug results wrong: ${JSON.stringify(this.cegRecencyResults)}`);
});
