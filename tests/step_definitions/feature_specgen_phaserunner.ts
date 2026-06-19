/**
 * @FR-41 step-definitions for phase-runner unit behaviours NOT covered by the
 * existing feature41_phase_agents.ts (SPECGEN004_117/_118/_119).
 *
 * New scenarios: hard-fail on retry-budget exhaustion (SPECGEN004_250),
 * exception safety — throwing gate consumes budget (SPECGEN004_251),
 * productionSpawn / productionGate exported and callable (SPECGEN004_252).
 *
 * All steps drive the REAL runPhases / productionSpawn / productionGate exports
 * from phase-runner.ts. No mocks of production logic.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { V4World } from '../hooks/before-after.ts';
import {
  runPhases,
  productionSpawn,
  productionGate,
  type Phase,
  type GateResult,
  type PhaseRunResult,
} from '../../.claude/skills/spec-generator-orchestrator/scripts/phase-runner.ts';

// ─── shared world ────────────────────────────────────────────────────────────

interface PhaseRunnerWorld extends V4World {
  _prResult?: PhaseRunResult;
  _spawnCallsByPhase?: Record<string, number>;
  _prErr?: unknown;
}

// ─── SPECGEN004_250  hard-fail when retry budget exhausted ───────────────────

Given(
  /^a phase runner configured with maxRetries (\d+) for all phases$/,
  function (this: PhaseRunnerWorld, maxRetriesStr: string) {
    const maxRetries = Number(maxRetriesStr);
    // Store config on world; the run happens in When.
    (this as PhaseRunnerWorld & { _maxRetries?: number })._maxRetries = maxRetries;
  },
);

When(
  /^the discovery phase gate returns RED on every attempt$/,
  async function (this: PhaseRunnerWorld) {
    const w = this as PhaseRunnerWorld & { _maxRetries?: number };
    const maxRetries = w._maxRetries ?? 2;
    const spawnCallsByPhase: Record<string, number> = {};
    const spawn = async (phase: Phase): Promise<string> => {
      spawnCallsByPhase[phase] = (spawnCallsByPhase[phase] ?? 0) + 1;
      return 'ok';
    };
    const gate = async (): Promise<GateResult> => ({ verdict: 'RED', gapList: ['[UNCOVERED_FR] demo:FR-X'] });
    this._prResult = await runPhases({ slug: 'demo', spawn, gate, maxRetries, repoRoot: this.tempDir });
    this._spawnCallsByPhase = spawnCallsByPhase;
  },
);

Then(
  /^runPhases returns ok=false with failedPhase "([^"]+)"$/,
  function (this: PhaseRunnerWorld, expectedPhase: string) {
    assert.equal(this._prResult!.ok, false, 'run must fail');
    assert.equal(this._prResult!.failedPhase, expectedPhase, 'failedPhase must name the stuck phase');
  },
);

Then(
  /^discovery was spawned exactly (\d+) times before hard-failing$/,
  function (this: PhaseRunnerWorld, timesStr: string) {
    const times = Number(timesStr);
    assert.equal(
      this._spawnCallsByPhase!['discovery'] ?? 0,
      times,
      `discovery must be spawned exactly ${times} times (1 initial + maxRetries retries)`,
    );
  },
);

// ─── SPECGEN004_251  exception safety — throwing gate consumes budget ────────

Given(
  /^a phase runner where the discovery gate throws on every call$/,
  function (this: PhaseRunnerWorld) {
    // configuration only; actual run is in the When step
  },
);

When(
  /^the orchestrator runs phases with budget (\d+)$/,
  async function (this: PhaseRunnerWorld, budgetStr: string) {
    const maxRetries = Number(budgetStr);
    const spawn = async (): Promise<string> => 'ok';
    const gate = async (): Promise<GateResult> => {
      throw new Error('gate exploded');
    };
    this._prResult = await runPhases({ slug: 'demo', spawn, gate, maxRetries, repoRoot: this.tempDir });
  },
);

Then(
  /^runPhases returns ok=false and the events include a gate-red entry matching \/threw\//,
  function (this: PhaseRunnerWorld) {
    assert.equal(this._prResult!.ok, false, 'run must fail when gate throws');
    const redEvents = this._prResult!.events.filter((e) => e.event === 'gate-red');
    assert.ok(redEvents.length > 0, 'at least one gate-red event must be recorded');
    const hasThrewNote = redEvents.some((e) => /threw/i.test(JSON.stringify(e)));
    assert.ok(hasThrewNote, 'a gate-red event must mention "threw" (exception detail)');
  },
);

// ─── SPECGEN004_252  productionSpawn + productionGate exported ───────────────

Given(
  /^the phase-runner module is imported$/,
  function (this: PhaseRunnerWorld) {
    // import is at module level; nothing to do here
  },
);

Then(
  /^productionSpawn is exported and is a function$/,
  function (this: PhaseRunnerWorld) {
    assert.equal(typeof productionSpawn, 'function', 'productionSpawn must be exported and be a function');
  },
);

Then(
  /^productionGate is exported and is a function$/,
  function (this: PhaseRunnerWorld) {
    assert.equal(typeof productionGate, 'function', 'productionGate must be exported and be a function');
  },
);
