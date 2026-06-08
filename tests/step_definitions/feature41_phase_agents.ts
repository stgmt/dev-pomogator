/**
 * @FR-41 step definitions — SPECGEN004_117/_118/_119 (P17-7/8). The phase
 * agents + orchestrator-verifier. Bound to the REAL runPhases loop with an
 * INJECTED spawn (deterministic, no real claude -p — the spec-llm-judge
 * pattern) and the REAL agent-definition files on disk.
 *
 * @see .specs/spec-generator-v4/FR.md FR-41
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import {
  runPhases,
  PHASES,
  type Phase,
  type GateResult,
  type PhaseRunEvent,
  type PhaseRunResult,
} from '../../.claude/skills/spec-generator-orchestrator/scripts/phase-runner.ts';

const REPO = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
const AGENTS_DIR = path.join(REPO, '.claude', 'agents');

interface F41World extends V4World {
  spawned?: Phase[];
  result?: PhaseRunResult;
  events?: PhaseRunEvent[];
}

// _117 — each phase runs in its dedicated agent; agents have no file tools.
Given('the phase agent definitions with MCP-only allowed-tools', function (this: F41World) {
  for (const phase of PHASES) {
    const f = path.join(AGENTS_DIR, `spec-phase-${phase}.md`);
    assert.ok(fs.existsSync(f), `agent definition missing: spec-phase-${phase}.md`);
  }
});

When('the orchestrator runs a creation phase', async function (this: F41World) {
  this.spawned = [];
  const spawn = async (phase: Phase): Promise<string> => {
    this.spawned!.push(phase);
    return 'ok';
  };
  const gate = async (): Promise<GateResult> => ({ verdict: 'GREEN', gapList: [] });
  this.result = await runPhases({ slug: 'demo', spawn, gate, repoRoot: this.tempDir });
});

Then('the phase executes in its dedicated headless agent', function (this: F41World) {
  assert.deepEqual(this.spawned, [...PHASES], 'every phase must run in its own agent, in order');
  assert.equal(this.result!.ok, true);
});

Then('the agent has no direct file tools over specs', function (this: F41World) {
  // The enforcement is the agent's allowed-tools: MCP tools only, no Read/
  // Grep/Glob/Edit/Write over .specs/ (FR-39 second layer).
  for (const phase of PHASES) {
    const body = fs.readFileSync(path.join(AGENTS_DIR, `spec-phase-${phase}.md`), 'utf-8');
    const allowed = (body.match(/allowed-tools:(.*)/) ?? [])[1] ?? '';
    for (const fileTool of ['Read', 'Grep', 'Glob', 'Edit', 'Write']) {
      assert.ok(
        !new RegExp(`(^|[,\\s])${fileTool}([,\\s]|$)`).test(allowed),
        `spec-phase-${phase} must NOT grant the ${fileTool} file tool (got: ${allowed.trim()})`,
      );
    }
    assert.ok(allowed.includes('mcp__dev-pomogator-specs__'), `spec-phase-${phase} must grant the MCP spec tools`);
  }
});

// _118 — RED returns the phase with the gap list; next starts only on GREEN.
Given('a completed creation phase with open verdict gaps', function (this: F41World) {
  // nothing to seed — the gate stub drives RED-then-GREEN below
});

When('the orchestrator checks the phase gate', async function (this: F41World) {
  const gapsSeen: Record<number, string[]> = {};
  let firstPhaseAttempts = 0;
  const spawn = async (phase: Phase, _slug: string, gapList: string[]): Promise<string> => {
    if (phase === 'discovery') {
      firstPhaseAttempts++;
      gapsSeen[firstPhaseAttempts] = gapList;
    }
    return 'ok';
  };
  // discovery: RED on attempt 1 (with a gap), GREEN on attempt 2; rest GREEN.
  let discoveryCalls = 0;
  const gate = async (slug: string): Promise<GateResult> => {
    // crude phase inference: discovery gate is the first two calls
    discoveryCalls++;
    if (discoveryCalls === 1) return { verdict: 'RED', gapList: ['[UNCOVERED_FR] demo:FR-1'] };
    return { verdict: 'GREEN', gapList: [] };
  };
  this.result = await runPhases({ slug: 'demo', spawn, gate, repoRoot: this.tempDir });
  // stash for the Then
  (this as F41World & { _gapsSeen?: Record<number, string[]>; _retried?: number })._gapsSeen = gapsSeen;
  (this as F41World & { _retried?: number })._retried = firstPhaseAttempts;
});

Then('the phase returns to its agent with the gap list', function (this: F41World) {
  const w = this as F41World & { _gapsSeen?: Record<number, string[]>; _retried?: number };
  assert.ok((w._retried ?? 0) >= 2, 'the RED phase must be re-spawned');
  assert.deepEqual(w._gapsSeen![2], ['[UNCOVERED_FR] demo:FR-1'], 'the retry must carry the gap list');
});

Then('the next phase starts only after the gate is GREEN', function (this: F41World) {
  assert.equal(this.result!.ok, true);
  const greens = this.result!.events.filter((e) => e.event === 'gate-green').map((e) => e.phase);
  // every phase reached GREEN before the run finished
  assert.deepEqual(greens, [...PHASES]);
});

// _119 — every spawn/retry/gate decision is observable.
Given('an orchestrated spec creation run', function (this: F41World) {
  // run happens in the When
});

When('phases spawn retry and pass their gates', async function (this: F41World) {
  let firstGate = true;
  const spawn = async (): Promise<string> => 'ok';
  const gate = async (): Promise<GateResult> => {
    if (firstGate) {
      firstGate = false;
      return { verdict: 'RED', gapList: ['gap'] }; // force one retry so a 'retry' event exists
    }
    return { verdict: 'GREEN', gapList: [] };
  };
  this.result = await runPhases({ slug: 'demo', spawn, gate, repoRoot: this.tempDir });
  this.events = this.result.events;
});

Then(
  'every spawn retry and gate decision is logged with agent and phase identity',
  function (this: F41World) {
    const kinds = new Set(this.events!.map((e) => e.event));
    for (const k of ['spawn', 'retry', 'gate-red', 'gate-green']) {
      assert.ok(kinds.has(k as PhaseRunEvent['event']), `the log must contain a ${k} event`);
    }
    // every event names its phase + attempt (the "agent and phase identity")
    for (const e of this.events!) {
      assert.ok(PHASES.includes(e.phase), `event ${e.event} must name a phase`);
      assert.ok(typeof e.attempt === 'number' && e.attempt >= 1, 'event must carry the attempt');
    }
    // and the run persisted them to the observability JSONL (FR-41c)
    const log = path.join(this.tempDir, '.dev-pomogator', 'logs', 'phase-runner.jsonl');
    assert.ok(fs.existsSync(log), 'phase-runner.jsonl must be written');
  },
);
