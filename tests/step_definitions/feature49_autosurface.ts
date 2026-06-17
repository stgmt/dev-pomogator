/**
 * @feature49 step definitions (FR-49a — banner names the next step) — SPECGEN004_178.
 *
 * The per-prompt task-census banner must not just COUNT unfinished work — it must name
 * ONE concrete next open task so «what's next» rides the standing signal. Drives the REAL
 * writeTaskCensusCache + buildTaskCensusLine on a temp repo (no synthetic stub): write a
 * cache whose busiest spec carries a titled open task, render the banner, assert the title
 * shows as the next step.
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
import { spawnSync } from 'node:child_process';
import { V4World } from '../hooks/before-after.ts';
import type { SpecGraph } from '../../tools/spec-graph/types.ts';
import { writeTaskCensusCache, findStaleInProgress, type StaleMarker } from '../../tools/spec-graph/task-census.ts';
import { renderStaleReport } from '../../tools/spec-graph/stale-marker-scan.ts';
import { buildTaskCensusLine } from '../../tools/specs-validator/conformance-summary.ts';
import { validateSpecChange, type ValidateResult } from '../../tools/spec-mcp-server/mutations.ts';
import { buildJudgePrompt, resolveEndpoint } from '../../tools/claim-evidence-gate/meridian-judge.ts';

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
  wdRoot?: string;
  wdBlockEdit?: boolean;
  wdApproveRun?: boolean;
  nfBlockOne?: boolean;
  nfApproveTwo?: boolean;
  vgBlock?: boolean;
  vgApprove?: boolean;
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

Given('a cached task census whose busiest spec has an open task with a title', function (this: AutoSurfaceWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr49a-'));
  writeTaskCensusCache(
    root,
    {
      total: { open: 1, doneRed: 0, doneUnrun: 0 },
      specs: [
        { slug: 'demo', open: 1, doneRed: 0, doneUnrun: 0, nextOpen: { id: 'demo:wire-gate', title: 'Wire the gate' } },
      ],
    },
    '2026-06-13T00:00:00Z',
  );
  this.asRoot = root;
});

When('the per-prompt task-census banner renders', function (this: AutoSurfaceWorld) {
  this.asBanner = buildTaskCensusLine(this.asRoot!);
});

Then('the banner names that task title as the next step', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.asRoot!, { recursive: true, force: true });
  assert.ok(this.asBanner, 'banner rendered (census non-empty)');
  assert.match(this.asBanner!, /следующее:/, 'banner carries a next-step line');
  assert.match(this.asBanner!, /Wire the gate/, 'banner names the concrete next open task title');
});

// SPECGEN004_179 (FR-49d): the stale-marker reconciler flags an all-green in-progress
// task but never auto-closes — it points at set_entity_status. Drives the REAL
// findStaleInProgress + renderStaleReport.
Given(
  'an in-progress task whose mapped scenarios all passed plus a sibling in-progress task still red',
  function (this: AutoSurfaceWorld) {
    const scen = (id: string, result: string) => ({ id, type: 'Scenario', tags: [], lastResult: result, file: '.specs/demo/x.feature' });
    const task = (id: string, doneWhen: string, title: string) =>
      ({ id, type: 'Task', status: 'in-progress', refs: [], doneWhen, title, file: '.specs/demo/TASKS.md' });
    const nodes = new Map<string, unknown>([
      ['SCEN-specgen004-01-pass', scen('SCEN-specgen004-01-pass', 'PASSED')],
      ['SCEN-specgen004-02-fail', scen('SCEN-specgen004-02-fail', 'FAILED')],
      ['demo:T-stale', task('demo:T-stale', 'closed by SPECGEN004_01', 'Stale one')], // all green → flag
      ['demo:T-real', task('demo:T-real', 'closed by SPECGEN004_02', 'Real WIP')], // a red → not stale
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
  tools: Array<{ name: string; input: unknown }> = [{ name: 'Edit', input: {} }],
): { blocked: boolean; raw: string } {
  const rows = [
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'почини' }] } },
    { type: 'assistant', message: { role: 'assistant', content: tools.map((t) => ({ type: 'tool_use', name: t.name, input: t.input })) } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: claimText }] } },
  ];
  const fp = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(fp, rows.map((r) => JSON.stringify(r)).join('\n'));
  const res = spawnSync(process.execPath, ['--import', 'tsx', NS_HOOK], {
    input: JSON.stringify({ transcript_path: fp, cwd: root }),
    encoding: 'utf-8',
    env: { ...process.env, CLAIM_GATE_ENABLED: 'true', CLAIM_GATE_JUDGE: 'false' },
  });
  const raw = res.stdout || '';
  return { blocked: raw.includes('"decision":"block"'), raw };
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
    assert.match(p, /20 open/, 'the census fact (20 open) reaches the judge');
    assert.match(p, /ONLY one JSON line/, 'the judge is told to answer with exactly one JSON line');
    assert.match(p, /genuine clarifying question/i, 'the APPROVE-side clarifying-question carve-out is present');
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
Given('a census with unfinished work naming a next open task and the real claim-evidence-gate stop hook', function (this: AutoSurfaceWorld) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr49b-'));
  writeTaskCensusCache(
    root,
    {
      total: { open: 11, doneRed: 0, doneUnrun: 0 },
      specs: [{ slug: 'demo', open: 11, doneRed: 0, doneUnrun: 0, nextOpen: { id: 'demo:wire-gate', title: 'Wire the gate' } }],
    },
    '2026-06-17T00:00:00Z',
  );
  this.csRoot = root;
});

When('the hook judges a whole-spec done claim made after a tool ran', function (this: AutoSurfaceWorld) {
  const out = runStopHook(this.csRoot!, 'Спека готова, всё закрыто. 37 из 48.');
  this.csBlocked = out.blocked;
  this.csRaw = out.raw;
});

Then('the hook blocks it and the block names the unfinished count and the next task', function (this: AutoSurfaceWorld) {
  fs.rmSync(this.csRoot!, { recursive: true, force: true });
  assert.equal(this.csBlocked, true, 'whole-spec done claim + unfinished census → block');
  assert.match(this.csRaw!, /в работе|незакрыто/, 'the block injects the real unfinished count');
  assert.match(this.csRaw!, /Wire the gate/, 'the block names the concrete next open task');
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
