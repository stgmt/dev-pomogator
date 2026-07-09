/**
 * @feature49 step definitions (FR-49a — banner names the next step) — SPECGEN004_178.
 *
 * The per-prompt task-census banner must not just COUNT unfinished work — it may name
 * ONE concrete next open task only inside the current spec scope. Drives the REAL
 * writeTaskCensusCache + buildTaskCensusLine on a temp repo (no synthetic stub): write a
 * cache whose busiest spec is foreign, render for the current spec, assert only the
 * current-spec title shows as the next step.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_178
 * @see .specs/spec-generator-v4/FR.md FR-49 (FR-49a)
 * @see tools/spec-graph/task-census.ts (nextOpen) · tools/specs-validator/conformance-summary.ts (banner)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import * as http from 'node:http';
import { V4World } from '../hooks/before-after.ts';
import type { SpecGraph } from '../../tools/spec-graph/types.ts';
import { writeTaskCensusCache, findStaleInProgress, selectNextStepRoute, parseAgentTodos, agentNextOpenTodoDetail, type AgentTodo, type NextStepRoute, type StaleMarker } from '../../tools/spec-graph/task-census.ts';
import { renderStaleReport } from '../../tools/spec-graph/stale-marker-scan.ts';
import { buildTaskCensusLine } from '../../tools/specs-validator/conformance-summary.ts';
import { validateSpecChange, type ValidateResult } from '../../tools/spec-mcp-server/mutations.ts';
import { buildJudgePrompt, resolveEndpoint } from '../../tools/claim-evidence-gate/meridian-judge.ts';
import { classify, firstUnsupported, stripCode } from '../../tools/claim-evidence-gate/claim_classifier.ts';
import { effectiveUserRequest, extractTurnWindow, sessionUserPrompts } from '../../tools/claim-evidence-gate/turn_window.ts';

interface AutoSurfaceWorld extends V4World {
  asRoot?: string;
  asBanner?: string | null;
  staleGraph?: SpecGraph;
  staleResult?: StaleMarker[];
  staleReport?: string;
  doorRoot?: string;
  doorStub?: ValidateResult;
  doorReal?: ValidateResult;
  nsRoot?: string;
  nsBlocked?: boolean;
  nsAllowed?: boolean;
  judgeInput?: { finalMessage: string; tools: string[]; openTasks: number };
  judgePrompt?: string;
  judgeResolutions?: Record<string, { url: string; key: string; model: string } | null>;
  csRoot?: string;
  csBlocked?: boolean;
  csRaw?: string;
  ubRoot?: string;
  ubBlocked?: boolean;
  ubRaw?: string;
  wdRoot?: string;
  wdBlockEdit?: boolean;
  wdApproveRun?: boolean;
  nfBlockOne?: boolean;
  nfApproveTwo?: boolean;
  vgBlock?: boolean;
  vgApprove?: boolean;
  vmBlock?: boolean;
  vmApprove?: boolean;
  puFenced?: boolean;
  puNegated?: boolean;
  puTurnTools?: number;
  puTurnCls?: string;
  puStrip?: string;
  shadowBlocked?: boolean;
  shadowFires?: string;
  disabledBlocked?: boolean;
  missingRaw?: string;
  loopFirstBlocked?: boolean;
  loopSecondRaw?: string;
  npRoot?: string;
  npKicks?: boolean[];
  bpBare?: boolean;
  bpTool?: boolean;
  bpBg?: boolean;
  routeRoot?: string;
  routeTranscript?: string;
  routeCensus?: {
    total: { open: number; doneRed: number; doneUnrun: number };
    specs: Array<{ slug: string; open: number; doneRed: number; doneUnrun: number; nextOpen?: { id: string; title: string } }>;
  };
  routeTodo?: NextStepRoute | null;
  routeAsync?: NextStepRoute | null;
  routeSpec?: NextStepRoute | null;
  routeForeign?: NextStepRoute | null;
  replayRoot?: string;
  replayTx?: string;
  replayTodos?: AgentTodo[];
  replayNext?: AgentTodo | null;
  replayRoute?: NextStepRoute | null;
  fireLog?: Record<string, unknown>;
  gateFollowRoot?: string;
  gateFollowRaw?: string;
  gateFollowBlocked?: boolean;
  gateFollowPrompt?: string;
  promptList?: string[];
  effectivePrompt?: string;
}

// FR-49f (SPECGEN004_181): the door strength-gate refuses a .feature write that ADDS a
// stub scenario, accepts a fully-written one. Drives the REAL validateSpecChange (the door)
// on a temp spec — the curly {…} stub mirrors the create_spec feature.template style.
const DOOR_STUB = `Feature: door-fixture

  @FR-1
  Scenario: FR-1 stub
    Given {контекст}
    When {действие}
    Then {ожидаемый результат}
`;
const DOOR_REAL = `Feature: door-fixture

  @FR-1
  Scenario: FR-1 happy path
    Given a configured widget
    When the user saves
    Then the record persists

  @FR-1
  Scenario: FR-1 rejects empty input
    Given an empty form
    When the user saves
    Then an error is shown
`;

function writeJsonl(file: string, rows: unknown[]): void {
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf-8');
}

function taskUse(id: string, name: 'TaskCreate' | 'TaskUpdate', input: Record<string, unknown>): unknown {
  return { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } };
}

function taskResult(toolUseId: string, content: string): unknown {
  return { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content }] } };
}

Given('a cached task census with a foreign busiest spec and a current spec next task', function (this: AutoSurfaceWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr49a-'));
  writeTaskCensusCache(
    root,
    {
      total: { open: 30, doneRed: 0, doneUnrun: 0 },
      specs: [
        { slug: 'spec-generator-v4', open: 29, doneRed: 0, doneUnrun: 0, nextOpen: { id: 'ws-f-remaining', title: 'WS-F: remaining feature work' } },
        { slug: 'reel-agent-marketplace', open: 1, doneRed: 0, doneUnrun: 0, nextOpen: { id: 'p32-1', title: 'Fix marketplace routing' } },
      ],
    },
    '2026-06-13T00:00:00Z',
  );
  this.asRoot = root;
});

When('the per-prompt task-census banner renders for the current spec', function (this: AutoSurfaceWorld) {
  this.asBanner = buildTaskCensusLine(this.asRoot!, { activeSpecSlugs: new Set(['reel-agent-marketplace']) });
});

Then('the banner names only the current spec task as the next step', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.asRoot!, { recursive: true, force: true });
  assert.ok(this.asBanner, 'banner rendered (census non-empty)');
  assert.match(this.asBanner!, /следующее:/, 'banner carries a next-step line');
  assert.match(this.asBanner!, /Fix marketplace routing/, 'banner names the current spec next open task title');
  assert.doesNotMatch(this.asBanner!, /WS-F: remaining feature work/, 'banner must not leak the foreign busiest backlog next step');
});

Given('the shared next-step router has an agent todo an active async job and a current spec task', function (this: AutoSurfaceWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr49a-route-'));
  const tx = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(
    tx,
    JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'tool_use', name: 'TaskCreate', input: { subject: 'Finish router' } }] },
    }) + '\n',
    'utf-8',
  );
  this.routeRoot = root;
  this.routeTranscript = tx;
  this.routeCensus = {
    total: { open: 30, doneRed: 0, doneUnrun: 0 },
    specs: [
      { slug: 'spec-generator-v4', open: 29, doneRed: 0, doneUnrun: 0, nextOpen: { id: 'ws-f-remaining', title: 'WS-F: remaining feature work' } },
      { slug: 'reel-agent-marketplace', open: 1, doneRed: 0, doneUnrun: 0, nextOpen: { id: 'p32-1', title: 'Fix marketplace routing' } },
    ],
  };
});

When('the next-step route is selected across priority cases', function (this: AutoSurfaceWorld) {
  this.routeTodo = selectNextStepRoute({
    transcriptPath: this.routeTranscript!,
    census: this.routeCensus!,
    currentSpecSlug: 'reel-agent-marketplace',
    awaitingAsync: true,
  });
  fs.writeFileSync(this.routeTranscript!, '', 'utf-8');
  this.routeAsync = selectNextStepRoute({
    transcriptPath: this.routeTranscript!,
    census: this.routeCensus!,
    currentSpecSlug: 'reel-agent-marketplace',
    awaitingAsync: true,
  });
  this.routeSpec = selectNextStepRoute({
    transcriptPath: this.routeTranscript!,
    census: this.routeCensus!,
    currentSpecSlug: 'reel-agent-marketplace',
    awaitingAsync: false,
  });
  this.routeForeign = selectNextStepRoute({
    transcriptPath: this.routeTranscript!,
    census: this.routeCensus!,
    currentSpecSlug: 'lm-saas',
    awaitingAsync: false,
  });
});

Then('the route chooses agent todo before async before current spec and never a foreign backlog', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.routeRoot!, { recursive: true, force: true });
  assert.equal(this.routeTodo?.source, 'agent-todo', 'agent todo is highest priority');
  assert.equal(this.routeTodo?.title, 'Finish router', 'agent todo title is preserved');
  assert.equal(this.routeAsync?.source, 'active-async', 'active async is second priority after agent todo');
  assert.deepEqual(this.routeSpec, {
    source: 'current-spec',
    spec: 'reel-agent-marketplace',
    id: 'p32-1',
    title: 'Fix marketplace routing',
  });
  assert.equal(this.routeForeign, null, 'unknown current spec must not fall back to the foreign busiest backlog');
});

// SPECGEN004_179 (FR-49d): the stale-marker reconciler flags an all-green in-progress
// task but never auto-closes — it points at set_entity_status. Drives the REAL
// findStaleInProgress + renderStaleReport.
Given(
  'an in-progress task whose mapped scenarios all passed plus a sibling in-progress task still red',
  function (this: AutoSurfaceWorld) {
    const scen = (id: string, result: string, resultStale = false) => ({ id, type: 'Scenario', tags: [], lastResult: result, resultStale, file: '.specs/demo/x.feature' });
    const task = (id: string, doneWhen: string, title: string) =>
      ({ id, type: 'Task', status: 'in-progress', refs: [], doneWhen, title, file: '.specs/demo/TASKS.md' });
    const nodes = new Map<string, unknown>([
      ['SCEN-specgen004-01-pass', scen('SCEN-specgen004-01-pass', 'PASSED')],
      ['SCEN-specgen004-02-fail', scen('SCEN-specgen004-02-fail', 'FAILED')],
      ['SCEN-specgen004-03-stale-pass', scen('SCEN-specgen004-03-stale-pass', 'PASSED', true)],
      ['demo:T-stale', task('demo:T-stale', 'closed by SPECGEN004_01', 'Stale one')], // all fresh green → flag
      ['demo:T-real', task('demo:T-real', 'closed by SPECGEN004_02', 'Real WIP')], // a red → not stale
      ['demo:T-stale-result', task('demo:T-stale-result', 'closed by SPECGEN004_03', 'Stale result')], // stale pass → not fresh proof
    ]);
    this.staleGraph = { nodes } as unknown as SpecGraph;
  },
);

When('the stale-marker reconciler scans the graph', function (this: AutoSurfaceWorld) {
  this.staleResult = findStaleInProgress(this.staleGraph!);
  this.staleReport = renderStaleReport(this.staleResult);
});

Then(
  'only the all-green in-progress task is flagged and the report points at set_entity_status to close it',
  function (this: AutoSurfaceWorld) {
    assert.deepEqual(this.staleResult!.map((s) => s.id), ['demo:T-stale'], 'only the all-green in-progress task flagged');
    assert.match(this.staleReport!, /set_entity_status/, 'report points at the close command');
    assert.match(this.staleReport!, /NOT auto-closed/i, 'flag-only — never auto-closes');
  },
);

Given('a spec and the spec-mutation door', function (this: AutoSurfaceWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr49f-'));
  const dir = path.join(root, '.specs', 'door-fixture');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'FR.md'), '# FR\n\n## FR-1 Widget saves\n\nThe widget SHALL persist on save.\n');
  this.doorRoot = root;
});

When(
  'a write adds a scenario whose steps are still unfilled placeholders and then a fully-written scenario',
  function (this: AutoSurfaceWorld) {
    this.doorStub = validateSpecChange(this.doorRoot!, 'door-fixture', 'door-fixture.feature', { content: DOOR_STUB });
    this.doorReal = validateSpecChange(this.doorRoot!, 'door-fixture', 'door-fixture.feature', { content: DOOR_REAL });
  },
);

Then('the door refuses the stub write with a strength-layer finding and accepts the real one', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.doorRoot!, { recursive: true, force: true });
  const stubStrength = this.doorStub!.findings.filter((f) => f.layer === 'strength');
  assert.ok(stubStrength.length >= 1, 'stub write refused with a strength-layer finding');
  assert.equal(this.doorStub!.ok, false, 'stub write verdict ok=false');
  assert.deepEqual(
    this.doorReal!.findings.filter((f) => f.layer === 'strength'),
    [],
    'a fully-written .feature gets no strength finding',
  );
});

// SPECGEN004_186 (FR-49g): the deterministic require-next-section layer. Drives the REAL Stop
// hook (spawn via node --import tsx; judge OFF to isolate the deterministic layer — Docker carries
// no помогатор token) on a census-open tmpdir: a gray progress claim WITHOUT a «Дальше» section
// must block; the same claim WITH one must approve. Pins the Cyrillic-\b regex fix (commit 2fe24e0)
// against silent re-breakage — `дальше\b` never matched «Дальше:» so the whole layer was dead.
const NS_HOOK = path.resolve('tools', 'claim-evidence-gate', 'claim_evidence_gate_stop.ts');
function runStopHook(
  root: string,
  claimText: string,
  // FR-9 (session-scoped census): the default simulated turn EDITS the `demo` spec — the same slug the
  // census fixtures carry — so the census is in this session's scope and the census-dependent layers
  // (spec-false-close / no-next-section) arm. An empty Edit (no file_path) scopes to ZERO specs (FR-9's
  // own contract) → those layers correctly stay quiet, which is why the old default broke 186/189.
  tools: Array<{ name: string; input: unknown }> = [{ name: 'Edit', input: { file_path: '.specs/demo/FR.md' } }],
  extra: { env?: Record<string, string>; stopHookActive?: boolean } = {},
): { blocked: boolean; raw: string } {
  const rows = [
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'почини' }] } },
    { type: 'assistant', message: { role: 'assistant', content: tools.map((t) => ({ type: 'tool_use', name: t.name, input: t.input })) } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: claimText }] } },
  ];
  const fp = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(fp, rows.map((r) => JSON.stringify(r)).join('\n'));
  const input: Record<string, unknown> = { transcript_path: fp, cwd: root };
  if (extra.stopHookActive) input.stop_hook_active = true;
  const res = spawnSync(process.execPath, ['--import', 'tsx', NS_HOOK], {
    input: JSON.stringify(input),
    encoding: 'utf-8',
    env: { ...process.env, CLAIM_GATE_ENABLED: 'true', CLAIM_GATE_JUDGE: 'false', ...extra.env },
  });
  const raw = res.stdout || '';
  return { blocked: raw.includes('"decision":"block"'), raw };
}
function hookDecision(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsed = JSON.parse(trimmed) as { decision?: string };
  return parsed.decision;
}

function isBlockDecision(raw: string): boolean {
  return hookDecision(raw) === 'block';
}

function driveStopHook(root: string, claimText: string): boolean {
  return runStopHook(root, claimText).blocked;
}

Given('a task census with open work and the real claim-evidence-gate stop hook', function (this: AutoSurfaceWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr49g-'));
  writeTaskCensusCache(
    root,
    { total: { open: 11, doneRed: 0, doneUnrun: 0 }, specs: [{ slug: 'demo', open: 11, doneRed: 0, doneUnrun: 0 }] },
    '2026-06-17T00:00:00Z',
  );
  this.nsRoot = root;
});

When('the hook judges a progress claim without a «Дальше» section and then one with it', function (this: AutoSurfaceWorld) {
  this.nsBlocked = driveStopHook(this.nsRoot!, 'Готово. Закоммитил фикс.');
  this.nsAllowed = driveStopHook(this.nsRoot!, 'Готово. Закоммитил фикс.\n\nДальше: гоняю прогон, потом коммичу.');
});

Then('the hook blocks the one lacking the section and approves the one carrying it', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.nsRoot!, { recursive: true, force: true });
  assert.equal(this.nsBlocked, true, 'a gray claim with open census and NO «Дальше» → block');
  assert.equal(this.nsAllowed, false, 'the same claim WITH a «Дальше:» section → approve');
});

// SPECGEN004_187 (FR-49e): the judge prompt the помогатор Haiku receives. Drives the REAL pure
// buildJudgePrompt (no token, no network — deterministic, runs in CI). Re-covers the assertions
// lost when the fetch-mock unit test was deleted: the census fact reaches the judge, it is told to
// answer with ONE JSON line, and the APPROVE-side clarifying-question carve-out is preserved.
Given('a judge input reporting twenty open tasks', function (this: AutoSurfaceWorld) {
  this.judgeInput = { finalMessage: 'Готово, дальше посмотрю.', tools: ['Bash'], openTasks: 20 };
});

When('the помогатор judge prompt is built', function (this: AutoSurfaceWorld) {
  this.judgePrompt = buildJudgePrompt(this.judgeInput!);
});

Then(
  'the prompt states the open-task count and instructs a single JSON verdict line and keeps the clarifying-question carve-out',
  function (this: AutoSurfaceWorld) {
    const p = this.judgePrompt!;
    // FR-8 (facts-first rewrite): the open-task count now reaches the judge as a SESSION-scoped fact
    // («open/unfinished tasks in THIS SESSION's scope: 20» + «scope-open tasks: 20»), not the old «20 open».
    assert.match(p, /(?:tasks|scope)[^\n]{0,40}20/i, 'the census fact (20 open) reaches the judge');
    assert.match(p, /ONLY one JSON line/, 'the judge is told to answer with exactly one JSON line');
    // FR-49 Phase 1 (intent-aware) reworded the APPROVE-side question carve-out from the literal
    // "genuine clarifying question" to "asking ONE GENUINE owner-decision … A real back-and-forth".
    // The carve-out is preserved (a genuine owner question still APPROVES); assert the new wording.
    assert.match(p, /genuine owner-decision/i, 'the APPROVE-side genuine-question / owner-decision carve-out is present');
  },
);

// SPECGEN004_188 (FR-49e): the endpoint/key resolver — the exact logic whose blind spot caused the
// «судья недоступен» bug (it didn't recognise CLAUDE_MEM_OPENROUTER_API_KEY). The live bench skips
// without a token, so this is its ONLY CI coverage. Drives the REAL resolveEndpoint with injected
// envs (deterministic — no token, no network, no real-.env pollution).
Given('the помогатор judge endpoint resolver', function (this: AutoSurfaceWorld) {
  // pure resolver — resolutions are computed in the When with controlled envs
});

When(
  'it resolves an OpenRouter key a claude-mem key an auto-commit key an explicit override and no token at all',
  function (this: AutoSurfaceWorld) {
    this.judgeResolutions = {
      openrouter: resolveEndpoint({ OPENROUTER_API_KEY: 'sk-or-test' }),
      claudeMem: resolveEndpoint({ CLAUDE_MEM_OPENROUTER_API_KEY: 'sk-or-mem' }),
      autoCommit: resolveEndpoint({ AUTO_COMMIT_API_KEY: 'sk-ac' }),
      override: resolveEndpoint({ CLAIM_GATE_JUDGE_KEY: 'sk-judge', OPENROUTER_API_KEY: 'sk-or-test' }),
      none: resolveEndpoint({}),
    };
  },
);

Then(
  'OpenRouter-family keys pick openrouter.ai the auto-commit key picks aipomogator the explicit override wins and no token resolves to null',
  function (this: AutoSurfaceWorld) {
    const r = this.judgeResolutions!;
    assert.equal(r.openrouter?.url, 'https://openrouter.ai/api/v1', 'OPENROUTER_API_KEY → openrouter.ai');
    assert.equal(r.openrouter?.key, 'sk-or-test');
    assert.equal(r.claudeMem?.url, 'https://openrouter.ai/api/v1', 'CLAUDE_MEM_OPENROUTER_API_KEY → openrouter.ai (the key the bug missed)');
    assert.equal(r.claudeMem?.key, 'sk-or-mem');
    assert.equal(r.autoCommit?.url, 'https://aipomogator.ru/go/v1', 'AUTO_COMMIT_API_KEY → aipomogator.ru/go/v1');
    assert.equal(r.autoCommit?.key, 'sk-ac');
    assert.equal(r.override?.key, 'sk-judge', 'CLAIM_GATE_JUDGE_KEY wins over OPENROUTER_API_KEY');
    assert.equal(r.none, null, 'no token at all → null (judge skipped, caller fail-closes)');
  },
);

// SPECGEN004_189 (FR-49b): the census-aware false-close block — a WHOLE-spec "done" claim while the
// task census still shows unfinished work is blocked, with the real numbers + next task injected.
// Migrated from the vitest CEGATE001_25 to a BDD scenario driving the REAL hook (judge OFF; the
// census-false-close is deterministic and fires before the judge).
Given('a census with a foreign busiest spec plus current-spec unfinished work and the real claim-evidence-gate stop hook', function (this: AutoSurfaceWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr49b-'));
  writeTaskCensusCache(
    root,
    {
      total: { open: 30, doneRed: 0, doneUnrun: 0 },
      specs: [
        { slug: 'spec-generator-v4', open: 29, doneRed: 0, doneUnrun: 0, nextOpen: { id: 'ws-f-remaining', title: 'WS-F: remaining feature work' } },
        { slug: 'demo', open: 1, doneRed: 0, doneUnrun: 0, nextOpen: { id: 'demo:wire-gate', title: 'Wire the gate' } },
      ],
    },
    '2026-06-17T00:00:00Z',
  );
  this.csRoot = root;
});

When('the hook judges a whole-spec done claim made after a tool ran', function (this: AutoSurfaceWorld) {
  const out = runStopHook(this.csRoot!, 'Спека готова, всё закрыто. 37 из 48.', [
    { name: 'Edit', input: { file_path: '.specs/spec-generator-v4/FR.md' } },
    { name: 'Edit', input: { file_path: '.specs/demo/FR.md' } },
  ]);
  this.csBlocked = out.blocked;
  this.csRaw = out.raw;
});

Then('the hook blocks it and the block names the unfinished count and only the current spec next task', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.csRoot!, { recursive: true, force: true });
  assert.equal(this.csBlocked, true, 'whole-spec done claim + unfinished census → block');
  assert.match(this.csRaw!, /в работе|незакрыто/, 'the block injects the real unfinished count');
  assert.match(this.csRaw!, /Wire the gate/, 'the block names the current spec next open task');
  assert.doesNotMatch(this.csRaw!, /WS-F: remaining feature work/, 'the block must not leak the foreign busiest backlog next step');
});

// SPECGEN004_190 (FR-49b anti-H1): the census branch is tightly spec-scoped — a task-level "fixed
// it" claim (not a whole-spec done) must NOT trip it even with an unfinished census. Reuses the
// 189 Given (census with unfinished work); migrated from the vitest CEGATE001_26.
When('the hook judges a task-level fixed-it claim made after a tool ran', function (this: AutoSurfaceWorld) {
  // works-done needs a real executor (Bash/run), not Edit — so the «всё работает» claim is
  // satisfied and the test isolates the census branch (which must NOT fire on a non-spec claim).
  this.csBlocked = runStopHook(this.csRoot!, 'Поправил импорт, всё работает.', [{ name: 'Bash', input: { command: 'npx tsx build.ts' } }]).blocked;
});

Then('the hook does not block it', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.csRoot!, { recursive: true, force: true });
  assert.equal(this.csBlocked, false, 'a non-spec works-done claim must NOT trip the census branch (anti-H1)');
});

// SPECGEN004_191 (claim-evidence-gate works-done class): a "works" claim is supported only by a
// REAL executor (Bash/run), not an edit. No census here, so this isolates the works-done classifier.
// Migrated from the vitest CEGATE001_03/04.
Given('a fresh repo with no census and the real claim-evidence-gate stop hook', function (this: AutoSurfaceWorld) {
  this.wdRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-'));
});

When('the hook judges a works-done claim first with only an edit and then after a real run', function (this: AutoSurfaceWorld) {
  const claim = 'Поправил импорт, теперь всё работает.';
  this.wdBlockEdit = runStopHook(this.wdRoot!, claim).blocked; // default Edit → no real executor
  this.wdApproveRun = runStopHook(this.wdRoot!, claim, [{ name: 'Bash', input: { command: 'npx tsx build.ts' } }]).blocked;
});

Then('the hook blocks the edit-only claim and approves the one backed by a real run', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.wdRoot!, { recursive: true, force: true });
  assert.equal(this.wdBlockEdit, true, 'a works-done claim with only an edit (no executor) → block');
  assert.equal(this.wdApproveRun, false, 'the same claim after a real run → approve');
});

// SPECGEN004_192 (claim-evidence-gate not-found class): a "не существует / impossible" claim needs
// 2+ real searches to be supported. Reuses the 191 fresh-repo Given; migrated from CEGATE001_05/06.
When('the hook judges a not-found claim first after one search and then after two searches', function (this: AutoSurfaceWorld) {
  const claim = 'Публичного решения не существует.';
  this.nfBlockOne = runStopHook(this.wdRoot!, claim, [{ name: 'Grep', input: { pattern: 'x' } }]).blocked;
  this.nfApproveTwo = runStopHook(this.wdRoot!, claim, [
    { name: 'Grep', input: { pattern: 'x' } },
    { name: 'WebSearch', input: { query: 'y' } },
  ]).blocked;
});

Then('the hook blocks the under-searched claim and approves the one backed by enough searches', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.wdRoot!, { recursive: true, force: true });
  assert.equal(this.nfBlockOne, true, 'a not-found claim with fewer than 2 searches → block');
  assert.equal(this.nfApproveTwo, false, 'the same claim after 2+ searches → approve');
});

// SPECGEN004_193 (claim-evidence-gate verdict-grid class): a verdict table (an analysis result) is
// unsupported unless a tool ran this turn. Reuses the 191 fresh-repo Given; migrated from
// CEGATE001_01/02.
When('the hook judges a verdict grid first with no tool and then after a tool ran', function (this: AutoSurfaceWorld) {
  const grid = 'Итог:\n| q1 | FAIL |\n| q2 | FAIL |\n| q3 | PASS |';
  this.vgBlock = runStopHook(this.wdRoot!, grid, []).blocked; // no tool → unbacked verdict
  this.vgApprove = runStopHook(this.wdRoot!, grid, [{ name: 'Bash', input: { command: 'npx tsx fact-check.ts' } }]).blocked;
});

Then('the hook blocks the unbacked grid and approves the one backed by a tool run', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.wdRoot!, { recursive: true, force: true });
  assert.equal(this.vgBlock, true, 'a verdict grid with no tool run this turn → block');
  assert.equal(this.vgApprove, false, 'the same grid after a tool ran → approve');
});

// SPECGEN004_194 (claim-evidence-gate verified-marker class): a "[VERIFIED via X]" marker is
// unsupported unless a tool whose input matches X actually ran. Reuses the 191 fresh-repo Given;
// migrated from CEGATE001_07/08.
When('the hook judges a verified-via-command claim first with no matching tool and then after that command ran', function (this: AutoSurfaceWorld) {
  const claim = '[VERIFIED via npm test] всё проверено.';
  this.vmBlock = runStopHook(this.wdRoot!, claim, []).blocked; // no tool → unverified marker
  this.vmApprove = runStopHook(this.wdRoot!, claim, [{ name: 'Bash', input: { command: 'npm test' } }]).blocked;
});

Then('the hook blocks the unmatched marker and approves the one whose command actually ran', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.wdRoot!, { recursive: true, force: true });
  assert.equal(this.vmBlock, true, 'a [VERIFIED via X] marker with no matching tool → block');
  assert.equal(this.vmApprove, false, 'the same marker after X actually ran → approve');
});

// SPECGEN004_195 (FR-49b anti-false-positive): a whole-spec done claim with a CLEAN (zero-open)
// census must NOT be blocked. New Given (clean census); reuses the 189 When + 190 Then. From CEGATE001_27.
Given('a clean zero-open task census and the real claim-evidence-gate stop hook', function (this: AutoSurfaceWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr49b-clean-'));
  writeTaskCensusCache(root, { total: { open: 0, doneRed: 0, doneUnrun: 0 }, specs: [] }, '2026-06-17T00:00:00Z');
  this.csRoot = root;
});

// SPECGEN004_196 (claim-evidence-gate pure classifier units): drives the REAL classify /
// firstUnsupported / stripCode / extractTurnWindow in-process (no hook spawn). Migrated from the
// vitest CEGATE001_13/14/15/16 — one scenario bundles the four pure-unit asserts.
Given('the claim-evidence-gate pure classifier functions', function () {
  // pure functions — computed in the When
});

When('fenced-code verdicts a negated claim a prior-turn tool and an inline-code-plus-quote string are classified', function (this: AutoSurfaceWorld) {
  this.puFenced = classify('Пример плохого вывода:\n```\nq1 FAIL\nq2 FAIL\n```\nэто иллюстрация').some((h) => h.cls === 'analysis-verdict');
  this.puNegated = classify('пока не работает, чиню').some((h) => h.cls === 'works-done');
  const raw = [
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: { command: 'old' } }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'новый запрос' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'всё работает' }] } },
  ]
    .map((r) => JSON.stringify(r))
    .join('\n');
  const w = extractTurnWindow(raw);
  this.puTurnTools = w.toolUses.length;
  this.puTurnCls = firstUnsupported(w.claimText, w.toolUses)?.cls;
  this.puStrip = stripCode('текст `работает` и «не существует» конец');
});

Then('fenced verdicts do not fire negation is not a works-claim evidence is scoped to the current turn and stripCode removes code and quotes', function (this: AutoSurfaceWorld) {
  assert.equal(this.puFenced, false, 'verdict tokens inside a fenced code block do not fire');
  assert.equal(this.puNegated, false, 'negated "не работает" is not a works-done claim');
  assert.equal(this.puTurnTools, 0, 'a prior-turn tool is not counted in the current window');
  assert.equal(this.puTurnCls, 'works-done', 'the current-turn unbacked works-claim is flagged');
  assert.ok(!this.puStrip!.includes('работает') && !this.puStrip!.includes('существует'), 'stripCode removes inline-code + quoted spans');
  assert.equal(this.puStrip!.replace(/\s+/g, ' ').trim(), 'текст и конец');
});

// SPECGEN004_197 (modes + fail-open): shadow never blocks but still logs the would-be fire; disabled
// approves outright; a missing transcript fails open. Drives the REAL hook. From CEGATE001_09/10/11.
Given('the claim-evidence-gate stop hook under varying modes', function () {
  // each sub-case uses its own tmpdir, created in the When
});

When('it runs in shadow mode in disabled mode and against a missing transcript', function (this: AutoSurfaceWorld) {
  const rShadow = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-shadow-'));
  this.shadowBlocked = runStopHook(rShadow, 'Итог:\n| q1 | FAIL |\n| q2 | FAIL |', [], { env: { CLAIM_GATE_ENABLED: 'shadow' } }).blocked;
  const firesPath = path.join(rShadow, '.dev-pomogator', '.claim-evidence-gate-fires.jsonl');
  this.shadowFires = fs.existsSync(firesPath) ? fs.readFileSync(firesPath, 'utf-8') : '';
  fs.rmSync(rShadow, { recursive: true, force: true });

  const rOff = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-off-'));
  this.disabledBlocked = runStopHook(rOff, 'всё работает', [], { env: { CLAIM_GATE_ENABLED: 'false' } }).blocked;
  fs.rmSync(rOff, { recursive: true, force: true });

  const rMiss = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-miss-'));
  const res = spawnSync(process.execPath, ['--import', 'tsx', NS_HOOK], {
    input: JSON.stringify({ transcript_path: path.join(rMiss, 'nope.jsonl'), cwd: rMiss }),
    encoding: 'utf-8',
    env: { ...process.env, CLAIM_GATE_ENABLED: 'true' },
  });
  this.missingRaw = (res.stdout || '').trim();
  fs.rmSync(rMiss, { recursive: true, force: true });
});

Then('shadow approves but still logs a fire disabled approves outright and a missing transcript approves', function (this: AutoSurfaceWorld) {
  assert.equal(this.shadowBlocked, false, 'shadow mode never blocks');
  assert.match(this.shadowFires!, /analysis-verdict/, 'shadow still logs the would-be fire');
  assert.equal(this.disabledBlocked, false, 'disabled mode approves');
  assert.equal(this.missingRaw, '{}', 'a missing transcript fails open (approve)');
});

// SPECGEN004_198 (anti-loop): a continuation stop (stop_hook_active) with an unsupported works-claim
// is JUDGED (block), not blanket-exempted; the identical re-stop is released by the same-hash
// anti-loop so the loop terminates. Judge OFF → deterministic. From CEGATE001_12.
Given('the claim-evidence-gate stop hook and an unsupported works-done continuation stop', function (this: AutoSurfaceWorld) {
  this.csRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-loop-'));
});

When('the same continuation stop fires twice with stop_hook_active set', function (this: AutoSurfaceWorld) {
  const claim = 'всё работает, фикс задеплоен';
  this.loopFirstBlocked = runStopHook(this.csRoot!, claim, [{ name: 'Edit', input: {} }], { stopHookActive: true }).blocked;
  this.loopSecondRaw = runStopHook(this.csRoot!, claim, [{ name: 'Edit', input: {} }], { stopHookActive: true }).raw.trim();
});

Then('the first fire blocks and the identical re-fire is released by the anti-loop', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.csRoot!, { recursive: true, force: true });
  assert.equal(this.loopFirstBlocked, true, 'a continuation stop with an unsupported works-claim is judged, not exempted → block');
  assert.equal(this.loopSecondRaw, '{}', 'the identical re-stop is released by the same-hash anti-loop → terminates');
});

// FR-11 (no-progress release + blocker-proof, SPECGEN004_222/223): both need a SESSION that edited the
// spec in an EARLIER turn (→ in FR-9 scope) while the CURRENT turn carries a controlled tool set (incl.
// zero). runStopHook is single-turn (its tools land in the current window), so this drives a two-turn
// transcript directly. Judge OFF — the no-progress + blocker-proof layers are deterministic.
function runStopHookScopedRaw(
  root: string,
  claimText: string,
  currentTurnTools: Array<{ name: string; input: unknown }> = [],
  extraEnv: Record<string, string> = {},
  currentUserPrompt = 'идём',
  editedSpecSlug = 'demo',
): string {
  const rows = [
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'старт' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Edit', input: { file_path: `.specs/${editedSpecSlug}/FR.md` } }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: currentUserPrompt }] } },
    ...currentTurnTools.map((t) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: t.name, input: t.input }] } })),
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: claimText }] } },
  ];
  const fp = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(fp, rows.map((r) => JSON.stringify(r)).join('\n'));
  const res = spawnSync(process.execPath, ['--import', 'tsx', NS_HOOK], {
    input: JSON.stringify({ transcript_path: fp, cwd: root }),
    encoding: 'utf-8',
    env: { ...process.env, CLAIM_GATE_ENABLED: 'true', CLAIM_GATE_JUDGE: 'false', ...extraEnv },
  });
  return (res.stdout || '').trim();
}

function runStopHookScoped(
  root: string,
  claimText: string,
  currentTurnTools: Array<{ name: string; input: unknown }> = [],
  extraEnv: Record<string, string> = {},
  currentUserPrompt = 'идём',
): boolean {
  return isBlockDecision(runStopHookScopedRaw(root, claimText, currentTurnTools, extraEnv, currentUserPrompt));
}

function censusRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  writeTaskCensusCache(
    root,
    { total: { open: 11, doneRed: 0, doneUnrun: 0 }, specs: [{ slug: 'demo', open: 11, doneRed: 0, doneUnrun: 0, nextOpen: { id: 'demo:t1', title: 'Wire the gate' } }] },
    '2026-06-17T00:00:00Z',
  );
  return root;
}

// SPECGEN004_222 (FR-11 no-progress release): consecutive ZERO-tool kicks bound the loop by work-delta
// (the time-cap, raised here via MAX_RETRIES=99, is out of the picture); a tool-running kick resets the
// streak. Migrated from the vitest CEGATE001_28; drives the REAL hook across sequential kicks.
Given('a census with unfinished work and the real claim-evidence-gate stop hook with the time-cap raised', function (this: AutoSurfaceWorld) {
  this.npRoot = censusRoot('fr11-np-');
});

When('the agent stops with a gray claim and no tool across consecutive kicks then runs a tool', function (this: AutoSurfaceWorld) {
  const env = { CLAIM_GATE_MAX_RETRIES: '99' }; // isolate FR-11 from the time-based cap
  this.npKicks = [
    runStopHookScoped(this.npRoot!, 'Готово, всё закрыто. 37 из 48.', [], env), // streak 1
    runStopHookScoped(this.npRoot!, 'Готово, всё закрыто. 38 из 48.', [], env), // streak 2
    runStopHookScoped(this.npRoot!, 'Готово, всё закрыто. 39 из 48.', [], env), // streak 3 → release
    runStopHookScoped(this.npRoot!, 'Готово, всё закрыто. 40 из 48.', [{ name: 'Read', input: { file_path: 'x.ts' } }], env), // tool → reset
  ];
});

Then('the first kicks block the streak cap releases the stop and a tool-running kick resets the streak so the gate blocks again', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.npRoot!, { recursive: true, force: true });
  assert.deepEqual(this.npKicks, [true, true, false, true], 'block, block, FR-11 release at the cap, then a tool-run resets the streak → block');
});

// SPECGEN004_223 (FR-11 blocker-proof): a stop resting on a blocker claim is honoured ONLY with
// observable evidence — bare (0 tools, no bg) → block; a tool run / a launched bg task → approve.
// Migrated from the vitest CEGATE001_29; each case uses its own fresh census root.
Given('a census with unfinished work and the real claim-evidence-gate stop hook', function () {
  // each blocker case below uses its own fresh census root (created in the When)
});

When('the stop rests on a blocker claim with no tool then with a tool run then with a background task launched', function (this: AutoSurfaceWorld) {
  const blocker = 'Жду — cucumber.json держит параллельная сессия, трогать нельзя.';
  const a = censusRoot('fr11-bp-a-');
  this.bpBare = runStopHookScoped(a, blocker, []);
  fs.rmSync(a, { recursive: true, force: true });
  const b = censusRoot('fr11-bp-b-');
  this.bpTool = runStopHookScoped(b, blocker, [{ name: 'Bash', input: { command: 'git diff -- cucumber.json' } }]);
  fs.rmSync(b, { recursive: true, force: true });
  const c = censusRoot('fr11-bp-c-');
  this.bpBg = runStopHookScoped(c, blocker, [{ name: 'Bash', input: { command: 'npm test', run_in_background: true } }]);
  fs.rmSync(c, { recursive: true, force: true });
});

Then('the bare blocker is blocked for lacking evidence while the tool-backed and background-task ones are approved', function (this: AutoSurfaceWorld) {
  assert.equal(this.bpBare, true, 'a bare blocker claim with no tool and no bg → block (prove it or work)');
  assert.equal(this.bpTool, false, 'the same blocker after a real tool run → approve (substantiated)');
  assert.equal(this.bpBg, false, 'the same blocker after launching a bg task → approve (real async wait)');
});

Given('a captured transcript where TaskCreate and TaskUpdate events have sparse visible ids after compaction', function (this: AutoSurfaceWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr49h-real-id-'));
  const tx = path.join(root, 'transcript.jsonl');
  writeJsonl(tx, [
    taskUse('u1', 'TaskCreate', { subject: 'Capture real CARL runtime evidence' }),
    taskResult('u1', 'Task #72 created successfully: Capture real CARL runtime evidence'),
    taskUse('u2', 'TaskUpdate', { taskId: '72', status: 'completed' }),
  ]);
  this.replayRoot = root;
  this.replayTx = tx;
});

When('the Pinator task replay reconstructs agent todos', function (this: AutoSurfaceWorld) {
  this.replayTodos = parseAgentTodos(this.replayTx!);
  this.replayNext = agentNextOpenTodoDetail(this.replayTx!);
});

Then('a completed visible task id closes that same real id and no array-slot stale todo remains open', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.replayRoot!, { recursive: true, force: true });
  assert.deepEqual(this.replayTodos!.map((t) => ({ id: t.id, subject: t.subject, status: t.status })), [
    { id: '72', subject: 'Capture real CARL runtime evidence', status: 'completed' },
  ]);
  assert.equal(this.replayNext, null, 'completed real id #72 must leave no stale open agent todo');
});

Given('a Pinator mandate followed by interruption sentinels and a terse continuation prompt', function (this: AutoSurfaceWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr49-interrupt-'));
  const tx = path.join(root, 'transcript.jsonl');
  writeJsonl(tx, [
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'почини пинатор: не считай honest gate-dev правку weakening-the-gate' }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'дальше' }] } },
  ]);
  this.replayRoot = root;
  this.replayTx = tx;
});

When('the Pinator intent extractor computes the effective user request', function (this: AutoSurfaceWorld) {
  const raw = fs.readFileSync(this.replayTx!, 'utf-8');
  this.promptList = sessionUserPrompts(raw);
  this.effectivePrompt = effectiveUserRequest(raw);
});

Then('interruption sentinels are ignored and the Pinator mandate remains effective', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.replayRoot!, { recursive: true, force: true });
  assert.deepEqual(this.promptList, ['почини пинатор: не считай honest gate-dev правку weakening-the-gate']);
  assert.match(this.effectivePrompt!, /почини пинатор/i, 'the effective request must stay on the real gate mandate');
  assert.doesNotMatch(this.effectivePrompt!, /Request interrupted/i, 'interruption sentinel must never become the effective task');
});

Given('a transcript where TaskUpdate for a missing task returns Task not found', function (this: AutoSurfaceWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr49-missing-task-'));
  const tx = path.join(root, 'transcript.jsonl');
  writeJsonl(tx, [
    taskUse('u9', 'TaskCreate', { subject: 'Fix gate task-intent follow-up overfire' }),
    taskResult('u9', 'Task #9 created successfully: Fix gate task-intent follow-up overfire'),
    taskUse('u10', 'TaskUpdate', { taskId: '9', status: 'completed' }),
    taskResult('u10', 'Updated task #9 status'),
    taskUse('u11', 'TaskUpdate', { taskId: '9', status: 'in_progress', description: 'stale reopen after task store reset' }),
    taskResult('u11', 'Task not found'),
  ]);
  this.replayRoot = root;
  this.replayTx = tx;
});

Then('the missing-task update leaves no phantom open todo', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.replayRoot!, { recursive: true, force: true });
  assert.deepEqual(this.replayTodos!.map((t) => ({ id: t.id, subject: t.subject, status: t.status })), [
    { id: '9', subject: 'Fix gate task-intent follow-up overfire', status: 'completed' },
  ]);
  assert.equal(this.replayNext, null, 'a failed TaskUpdate must not reopen a phantom task');
});

Given('the captured CARL transcript includes repeated Capture real CARL runtime evidence todos and a later completed duplicate with real evidence files', function (this: AutoSurfaceWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr49h-carl-'));
  const tx = path.join(root, 'transcript.jsonl');
  fs.mkdirSync(path.join(root, '.dev-pomogator', '.tmp'), { recursive: true });
  fs.writeFileSync(path.join(root, '.dev-pomogator', '.tmp', 'carl-runtime-evidence-latest.json'), JSON.stringify({ ok: true, afterRuntime: { status: 'verified' } }));
  writeJsonl(tx, [
    taskUse('u5', 'TaskCreate', { subject: 'Capture real CARL runtime evidence' }),
    taskResult('u5', 'Task #5 created successfully: Capture real CARL runtime evidence'),
    taskUse('u30', 'TaskCreate', { subject: 'Capture real CARL runtime evidence' }),
    taskResult('u30', 'Task #30 created successfully: Capture real CARL runtime evidence'),
    taskUse('u72', 'TaskCreate', { subject: 'Capture real CARL runtime evidence' }),
    taskResult('u72', 'Task #72 created successfully: Capture real CARL runtime evidence'),
    taskUse('u73', 'TaskUpdate', { taskId: '72', status: 'completed' }),
  ]);
  this.replayRoot = root;
  this.replayTx = tx;
});

When('the shared next-step router selects the agent todo route', function (this: AutoSurfaceWorld) {
  this.replayTodos = parseAgentTodos(this.replayTx!);
  this.replayRoute = selectNextStepRoute({ transcriptPath: this.replayTx! });
});

Then('the stale CARL evidence duplicate is collapsed or demoted and the route does not name it as the next step', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.replayRoot!, { recursive: true, force: true });
  assert.equal(this.replayRoute, null, `stale CARL todo must not be selected, got ${JSON.stringify(this.replayRoute)}`);
  assert.equal(this.replayTodos!.length, 1, 'duplicate CARL evidence todos collapse to one canonical entry');
  assert.match(this.replayTodos![0].reconciliation ?? '', /newest-closed/, 'completed newest duplicate wins the cluster');
});

Given('a Pinator Stop-gate block caused by an agent todo route', function (this: AutoSurfaceWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr49h-fire-'));
  const tx = path.join(root, 'transcript.jsonl');
  writeJsonl(tx, [
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'почини пинатор' }] } },
    taskUse('u72', 'TaskCreate', { subject: 'Capture real CARL runtime evidence' }),
    taskResult('u72', 'Task #72 created successfully: Capture real CARL runtime evidence'),
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Готово. Продолжаю.' }] } },
  ]);
  const res = spawnSync(process.execPath, ['--import', 'tsx', NS_HOOK], {
    input: JSON.stringify({ transcript_path: tx, cwd: root, session_id: 'fr49h-fire' }),
    encoding: 'utf-8',
    env: { ...process.env, CLAIM_GATE_ENABLED: 'true', CLAIM_GATE_JUDGE: 'false' },
  });
  assert.equal(isBlockDecision(res.stdout || ''), true, `fixture must produce a real block, raw=${res.stdout}`);
  this.replayRoot = root;
});

When('the fire is appended to .claim-evidence-gate-fires.jsonl', function (this: AutoSurfaceWorld) {
  const fires = fs.readFileSync(path.join(this.replayRoot!, '.dev-pomogator', '.claim-evidence-gate-fires.jsonl'), 'utf-8').trim().split(/\r?\n/);
  this.fireLog = JSON.parse(fires.at(-1)!);
});

Then('the log entry includes nextStepSource the real task id transcript location selected subject and duplicate reconciliation reason', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.replayRoot!, { recursive: true, force: true });
  assert.equal(this.fireLog!.nextStepSource, 'agent-todo');
  assert.equal(this.fireLog!.nextStepTaskId, '72');
  assert.equal(typeof this.fireLog!.nextStepTranscriptLine, 'number');
  assert.equal(this.fireLog!.nextStepSubject, 'Capture real CARL runtime evidence');
  assert.match(String(this.fireLog!.nextStepReconciliation), /real-id:72|unique/);
});

// SPECGEN004_533 (FR-49a/FR-49e regression): touching spec-generator-v4 for a narrow task must not make
// the umbrella WS-F backlog the agent's forced «Дальше» item. Drives the REAL Stop hook with judge OFF so
// the deterministic require-next-section layer is isolated.
Given('a scoped spec-generator-v4 census whose next open task is the WS-F umbrella backlog', function (this: AutoSurfaceWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr49-wsf-'));
  writeTaskCensusCache(
    root,
    {
      total: { open: 29, doneRed: 0, doneUnrun: 0 },
      specs: [
        { slug: 'spec-generator-v4', open: 29, doneRed: 0, doneUnrun: 0, nextOpen: { id: 'ws-f-remaining', title: 'WS-F: remaining feature work' } },
      ],
    },
    '2026-06-17T00:00:00Z',
  );
  this.ubRoot = root;
});

When('the hook evaluates a narrow-task done report after that spec was touched', function (this: AutoSurfaceWorld) {
  this.ubRaw = runStopHookScopedRaw(
    this.ubRoot!,
    'Готово. Короткий отчёт по узкому разбору: причина найдена и описана.',
    [],
    {},
    'сделай анализ и отчёт почему пинатор подкинул WS-F, пока не чини',
    'spec-generator-v4',
  );
  this.ubBlocked = isBlockDecision(this.ubRaw);
});

Then('the hook approves the report and never suggests the WS-F umbrella backlog as next', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.ubRoot!, { recursive: true, force: true });
  assert.equal(this.ubBlocked, false, `narrow-task report must approve, raw=${this.ubRaw}`);
  assert.doesNotMatch(this.ubRaw!, /WS-F: remaining feature work/, 'the block text must not name the umbrella backlog');
  assert.doesNotMatch(this.ubRaw!, /ws-f-remaining/i, 'the block text must not name the umbrella task id');
});

// SPECGEN004_530 (FR-49e/FR-29): a terse follow-up prompt like «дальше» must inherit the previous
// substantive user intent. If that previous intent is to fix Pinator, editing gate files is honest work,
// not "weakening the gate". Drives the REAL Stop hook and a local OpenAI-compatible judge endpoint.
Given('a Pinator-fix mandate followed by a terse continuation prompt and a live judge endpoint', function (this: AutoSurfaceWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr49-follow-'));
  const tx = path.join(root, 'transcript.jsonl');
  writeJsonl(tx, [
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'почини пинатор: он считает honest gate-dev правкой сторожа' }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'дальше' }] } },
    taskUse('u1', 'TaskCreate', { subject: 'Fix gate follow-up intent' }),
    taskResult('u1', 'Task #91 created successfully: Fix gate follow-up intent'),
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'tools/claim-evidence-gate/claim_evidence_gate_stop.ts' } }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Готово.\n\nДальше: запускаю focused BDD.' }] } },
  ]);
  this.gateFollowRoot = root;
  this.replayTx = tx;
});

When('the real Stop hook sends that turn to the judge', async function (this: AutoSurfaceWorld) {
  let server!: http.Server;
  const requests: string[] = [];
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as { messages?: Array<{ content?: string }> };
      const prompt = String(body.messages?.[0]?.content ?? '');
      requests.push(prompt);
      const selfEditStillArmed = /this turn EDITED the gate's OWN enforcement files[^\n]*: YES/i.test(prompt);
      const content = JSON.stringify({
        block: selfEditStillArmed,
        reason: selfEditStillArmed ? 'Edited gate files; real task is not gate-fixing' : 'gate task allowed',
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  try {
    const child = spawn(process.execPath, ['--import', 'tsx', NS_HOOK], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CLAIM_GATE_ENABLED: 'true',
        CLAIM_GATE_JUDGE_KEY: 'sk-test',
        CLAIM_GATE_JUDGE_URL: `http://127.0.0.1:${port}`,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.stdin.end(JSON.stringify({ transcript_path: this.replayTx, cwd: this.gateFollowRoot }));
    const code = await new Promise<number | null>((resolve) => child.on('exit', resolve));
    assert.equal(code, 0, stderr);
    this.gateFollowRaw = stdout.trim();
    this.gateFollowBlocked = isBlockDecision(this.gateFollowRaw);
    this.gateFollowPrompt = requests[0] ?? '';
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

Then('the judge facts say gate editing is not armed and the stop is approved', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.gateFollowRoot!, { recursive: true, force: true });
  assert.equal(this.gateFollowBlocked, false, `gate-dev follow-up must approve, raw=${this.gateFollowRaw}`);
  assert.match(this.gateFollowPrompt!, /the user's LAST request[^\n]*почини пинатор/i, 'the terse «дальше» prompt inherits the previous substantive Pinator request');
  assert.match(this.gateFollowPrompt!, /this turn EDITED the gate's OWN enforcement files[^\n]*: no/i, 'gate self-edit fact is suppressed for honest Pinator work');
  assert.doesNotMatch(this.gateFollowRaw!, /real task is not gate-fixing/i, 'the old overfire reason must not return');
});
