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
import { collectPinatorWorkContext } from '../../tools/claim-evidence-gate/work_context.ts';
import { parseTranscriptEvents } from '../../tools/claim-evidence-gate/transcript_events.ts';

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
  inactiveFireExists?: boolean;
  activeFire?: Record<string, unknown>;
  closedTaskRaw?: string;
  promptOnlyContextActive?: boolean;
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

// FR-49 owns reusable task-census and routing mechanics; Pinator activation policy lives in
// claim-evidence-gate. These compatibility scenarios drive the real Stop hook and prove that
// neither census rows nor completion prose can manufacture an authoritative work source.
const NS_HOOK = path.resolve('tools', 'claim-evidence-gate', 'claim_evidence_gate_stop.ts');
function runStopHook(
  root: string,
  claimText: string,
  tools: Array<{ name: string; input: unknown }> = [{ name: 'Edit', input: { file_path: '.specs/demo/FR.md' } }],
  extra: { env?: Record<string, string>; stopHookActive?: boolean } = {},
): { blocked: boolean; raw: string } {
  const toolBlocks: Array<Record<string, unknown>> = [];
  const resultRows: Array<Record<string, unknown>> = [];
  for (const [index, tool] of tools.entries()) {
    const id = `fr49-tool-${index}`;
    toolBlocks.push({ type: 'tool_use', id, name: tool.name, input: tool.input });
    resultRows.push({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'completed' }] } });
  }
  const rows = [
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'почини' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'fr49-task', name: 'TaskCreate', input: { subject: 'Finish demo work' } }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'fr49-task', content: 'Task #49 created successfully' }] } },
    { type: 'assistant', message: { role: 'assistant', content: toolBlocks } },
    ...resultRows,
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: claimText }] } },
  ];
  const fp = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(fp, rows.map((r) => JSON.stringify(r)).join('\n'));
  const input: Record<string, unknown> = { session_id: 'specgen-fr49', transcript_path: fp, cwd: root };
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

Given('a task census with open backlog but no current-session work source', function (this: AutoSurfaceWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr49g-'));
  writeTaskCensusCache(
    root,
    { total: { open: 11, doneRed: 0, doneUnrun: 0 }, specs: [{ slug: 'demo', open: 11, doneRed: 0, doneUnrun: 0 }] },
    '2026-06-17T00:00:00Z',
  );
  this.nsRoot = root;
});

When('the real hook evaluates completion prose without an authoritative source', function (this: AutoSurfaceWorld) {
  const transcript = path.join(this.nsRoot!, 'transcript.jsonl');
  writeJsonl(transcript, [
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'что осталось в backlog?' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Готово. Закоммитил фикс.' }] } },
  ]);
  const res = spawnSync(process.execPath, ['--import', 'tsx', NS_HOOK], {
    input: JSON.stringify({ transcript_path: transcript, cwd: this.nsRoot!, session_id: 'fr49-inactive' }),
    encoding: 'utf-8',
    env: { ...process.env, CLAIM_GATE_ENABLED: 'true', CLAIM_GATE_JUDGE: 'false' },
  });
  this.nsBlocked = isBlockDecision(res.stdout || '');
  this.inactiveFireExists = fs.existsSync(path.join(this.nsRoot!, '.dev-pomogator', '.claim-evidence-gate-fires.jsonl'));
});

Then('the hook approves silently and does not create Pinator fire state', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.nsRoot!, { recursive: true, force: true });
  assert.equal(this.nsBlocked, false, 'repository backlog without session ownership must not activate Pinator');
  assert.equal(this.inactiveFireExists, false, 'inactive compatibility path must not append fire state');
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

// Compatibility pin: a successful current-session spec mutation plus scoped open work is the
// authoritative source. A foreign busier spec remains census data, never the selected obligation.
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

When('the scoped collector receives one successful current-spec mutation', function (this: AutoSurfaceWorld) {
  const tx = path.join(this.csRoot!, 'scoped-spec.jsonl');
  writeJsonl(tx, [
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'почини demo' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'edit-demo', name: 'mcp__dev-pomogator-specs__apply_spec_change', input: { spec: 'demo', doc: 'FR.md', old_string: 'old', new_string: 'new' } }] } },
    taskResult('edit-demo', 'Applied demo/FR.md successfully'),
  ]);
  const context = collectPinatorWorkContext(
    { session_id: 'fr49-scoped-spec', transcript_path: tx, cwd: this.csRoot },
    parseTranscriptEvents(fs.readFileSync(tx, 'utf-8')),
  );
  this.csRaw = JSON.stringify(context);
});

Then('only the mutated spec appears and the foreign busiest backlog stays out of context', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.csRoot!, { recursive: true, force: true });
  const parsed = JSON.parse(this.csRaw!) as { sources: Array<{ kind: string; id: string; commitments: Array<{ id: string }> }> };
  assert.deepEqual(parsed.sources.map((source) => ({ kind: source.kind, id: source.id, commitmentIds: source.commitments.map((item) => item.id) })), [
    { kind: 'spec', id: 'demo', commitmentIds: ['demo:wire-gate'] },
  ], 'successful scoped mutation selects exactly the matching open spec work');
  assert.doesNotMatch(this.csRaw!, /WS-F: remaining feature work|ws-f-remaining/, 'context must not leak the foreign busiest backlog');
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

Given('an open task lifecycle followed by successful completion', function (this: AutoSurfaceWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr49-task-life-'));
  const tx = path.join(root, 'transcript.jsonl');
  writeJsonl(tx, [
    taskUse('create-72', 'TaskCreate', { subject: 'Finish task lifecycle' }),
    taskResult('create-72', 'Task #72 created successfully: Finish task lifecycle'),
  ]);
  this.npRoot = root;
  this.replayTx = tx;
});

When('the task is collected before and after its successful completed update', function (this: AutoSurfaceWorld) {
  const before = collectPinatorWorkContext(
    { session_id: 'fr49-task-life', transcript_path: this.replayTx, cwd: this.npRoot },
    parseTranscriptEvents(fs.readFileSync(this.replayTx!, 'utf-8')),
  );
  fs.appendFileSync(this.replayTx!, [
    JSON.stringify(taskUse('close-72', 'TaskUpdate', { taskId: '72', status: 'completed' })),
    JSON.stringify(taskResult('close-72', 'Task #72 updated successfully')),
  ].join('\n') + '\n');
  const after = collectPinatorWorkContext(
    { session_id: 'fr49-task-life', transcript_path: this.replayTx, cwd: this.npRoot },
    parseTranscriptEvents(fs.readFileSync(this.replayTx!, 'utf-8')),
  );
  this.npKicks = [before !== null, after !== null];
});

Then('the task source activates only while the task remains open', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.npRoot!, { recursive: true, force: true });
  assert.deepEqual(this.npKicks, [true, false], 'open task activates Pinator and its successful completion deactivates it');
});

Given('blocker prose with no current-session work source', function (this: AutoSurfaceWorld) {
  this.npRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fr49-blocker-chat-'));
});

When('the real hook evaluates the blocker prose in ordinary dialogue', function (this: AutoSurfaceWorld) {
  const tx = path.join(this.npRoot!, 'transcript.jsonl');
  writeJsonl(tx, [
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'объясни почему тесты долго идут' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Жду — тест ещё выполняется.' }] } },
  ]);
  const res = spawnSync(process.execPath, ['--import', 'tsx', NS_HOOK], {
    input: JSON.stringify({ transcript_path: tx, cwd: this.npRoot, session_id: 'fr49-blocker-chat' }),
    encoding: 'utf-8',
    env: { ...process.env, CLAIM_GATE_ENABLED: 'true', CLAIM_GATE_JUDGE: 'false' },
  });
  this.bpBare = isBlockDecision(res.stdout || '');
  this.inactiveFireExists = fs.existsSync(path.join(this.npRoot!, '.dev-pomogator', '.claim-evidence-gate-fires.jsonl'));
});

Then('blocker prose neither activates Pinator nor creates state', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.npRoot!, { recursive: true, force: true });
  assert.equal(this.bpBare, false, 'blocker prose alone must not activate Pinator');
  assert.equal(this.inactiveFireExists, false, 'ordinary blocker dialogue must not persist Pinator state');
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

Given('one inactive Stop and one active task-owned Stop', function (this: AutoSurfaceWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr49h-fire-'));
  const inactiveTx = path.join(root, 'inactive.jsonl');
  writeJsonl(inactiveTx, [
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'объясни текущий backlog' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Готово.' }] } },
  ]);
  const inactive = spawnSync(process.execPath, ['--import', 'tsx', NS_HOOK], {
    input: JSON.stringify({ transcript_path: inactiveTx, cwd: root, session_id: 'fr49h-inactive' }),
    encoding: 'utf-8',
    env: { ...process.env, CLAIM_GATE_ENABLED: 'true', CLAIM_GATE_JUDGE: 'false' },
  });
  assert.equal(isBlockDecision(inactive.stdout || ''), false, 'inactive Stop must approve');
  this.inactiveFireExists = fs.existsSync(path.join(root, '.dev-pomogator', '.claim-evidence-gate-fires.jsonl'));

  const activeTx = path.join(root, 'active.jsonl');
  writeJsonl(activeTx, [
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'почини пинатор' }] } },
    taskUse('u72', 'TaskCreate', { subject: 'Capture real CARL runtime evidence' }),
    taskResult('u72', 'Task #72 created successfully: Capture real CARL runtime evidence'),
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Фикс работает.' }] } },
  ]);
  const active = spawnSync(process.execPath, ['--import', 'tsx', NS_HOOK], {
    input: JSON.stringify({ transcript_path: activeTx, cwd: root, session_id: 'fr49h-active' }),
    encoding: 'utf-8',
    env: { ...process.env, CLAIM_GATE_ENABLED: 'true', CLAIM_GATE_JUDGE: 'false' },
  });
  assert.equal(isBlockDecision(active.stdout || ''), true, `task-owned Stop must block, raw=${active.stdout}`);
  this.replayRoot = root;
});

When('Pinator fire logging is inspected after both Stops', function (this: AutoSurfaceWorld) {
  const fires = fs.readFileSync(path.join(this.replayRoot!, '.dev-pomogator', '.claim-evidence-gate-fires.jsonl'), 'utf-8').trim().split(/\r?\n/);
  assert.equal(fires.length, 1, 'only the active Stop may append a fire record');
  this.activeFire = JSON.parse(fires[0]);
});

Then('only the active Stop logs task provenance and context revision', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.replayRoot!, { recursive: true, force: true });
  assert.equal(this.inactiveFireExists, false, 'inactive Stop must not create a fire file');
  assert.deepEqual(this.activeFire!.source_kinds, ['task'], 'active record names the authoritative source kind');
  assert.equal(typeof this.activeFire!.context_revision, 'string', 'active record carries context revision');
  assert.ok(String(this.activeFire!.context_revision).length > 10, 'context revision is a nontrivial stable hash');
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

// Inherited conversational intent remains useful to the generic router, but it is never an
// authoritative Pinator source. Only the successfully created task below arms the active case.
Given('a Pinator-fix mandate with terse prose both without and with an owned task', function (this: AutoSurfaceWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr49-follow-'));
  const proseOnly = path.join(root, 'prose-only.jsonl');
  writeJsonl(proseOnly, [
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'почини пинатор: он считает honest gate-dev правкой сторожа' }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'дальше' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Готово.' }] } },
  ]);
  this.promptOnlyContextActive = collectPinatorWorkContext(
    { session_id: 'fr49-prose-only', transcript_path: proseOnly, cwd: root },
    parseTranscriptEvents(fs.readFileSync(proseOnly, 'utf-8')),
  ) !== null;

  const tx = path.join(root, 'transcript.jsonl');
  writeJsonl(tx, [
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'почини пинатор: он считает honest gate-dev правкой сторожа' }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'дальше' }] } },
    taskUse('u1', 'TaskCreate', { subject: 'Fix gate follow-up intent' }),
    taskResult('u1', 'Task #91 created successfully: Fix gate follow-up intent'),
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'edit-1', name: 'Edit', input: { file_path: 'tools/claim-evidence-gate/claim_evidence_gate_stop.ts' } }] } },
    taskResult('edit-1', 'Updated claim_evidence_gate_stop.ts'),
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

Then('prose alone is inactive while the owned task supplies the only work authority', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.gateFollowRoot!, { recursive: true, force: true });
  assert.equal(this.promptOnlyContextActive, false, 'mandate and terse continuation prose must not manufacture Pinator work');
  assert.equal(this.gateFollowBlocked, false, `the owned gate-fix task may be judged and approved, raw=${this.gateFollowRaw}`);
  assert.match(this.gateFollowPrompt!, /Fix gate follow-up intent/, 'judge packet names the owned task commitment');
  assert.doesNotMatch(this.gateFollowRaw!, /real task is not gate-fixing/i, 'the old global prose overfire reason must not return');
});
