/**
 * Unit tests for the orchestrator-verifier loop (FR-41b/c). Deterministic over
 * injected spawn + gate — no real claude -p, no real verdict.
 */
import { describe, it, expect } from 'vitest';
import { runPhases, PHASES, productionSpawn, productionGate, type GateResult, type Phase } from '../phase-runner.ts';

const alwaysGreen = async (): Promise<GateResult> => ({ verdict: 'GREEN', gapList: [] });
const noopSpawn = async (): Promise<string> => 'ok';

describe('runPhases — orchestrator-verifier (FR-41b)', () => {
  it('runs every phase in order and passes when all gates are GREEN', async () => {
    const seen: Phase[] = [];
    const r = await runPhases({
      slug: 'demo',
      spawn: async (p) => { seen.push(p); return 'ok'; },
      gate: alwaysGreen,
      onEvent: () => {},
    });
    expect(r.ok).toBe(true);
    expect(seen).toEqual([...PHASES]);
  });

  it('on RED, re-spawns the SAME phase with the gap list, then advances on GREEN', async () => {
    const attemptsByPhase: Record<string, number> = {};
    const gapsOnRetry: string[][] = [];
    let firstGate = true;
    const r = await runPhases({
      slug: 'demo',
      spawn: async (p, _s, gaps) => {
        attemptsByPhase[p] = (attemptsByPhase[p] ?? 0) + 1;
        if (p === 'discovery' && attemptsByPhase[p] === 2) gapsOnRetry.push(gaps);
        return 'ok';
      },
      gate: async () => {
        if (firstGate) { firstGate = false; return { verdict: 'RED', gapList: ['[UNCOVERED_FR] demo:FR-1'] }; }
        return { verdict: 'GREEN', gapList: [] };
      },
      onEvent: () => {},
    });
    expect(r.ok).toBe(true);
    expect(attemptsByPhase.discovery).toBe(2); // one retry
    expect(gapsOnRetry[0]).toEqual(['[UNCOVERED_FR] demo:FR-1']); // gap list carried back
  });

  it('hard-FAILS (no silent skip, no infinite wait) when a phase exhausts its retry budget', async () => {
    const r = await runPhases({
      slug: 'demo',
      spawn: noopSpawn,
      gate: async (): Promise<GateResult> => ({ verdict: 'RED', gapList: ['stuck'] }), // never green
      maxRetries: 2,
      onEvent: () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.failedPhase).toBe('discovery'); // stops at the first stuck phase
    const failEvents = r.events.filter((e) => e.event === 'fail');
    expect(failEvents).toHaveLength(1);
    // budget = maxRetries+1 attempts before fail
    const discoverySpawns = r.events.filter((e) => e.phase === 'discovery' && (e.event === 'spawn' || e.event === 'retry'));
    expect(discoverySpawns).toHaveLength(3);
  });

  it('emits a spawn/gate event for every attempt (FR-41c observability)', async () => {
    const events: string[] = [];
    await runPhases({ slug: 'demo', spawn: noopSpawn, gate: alwaysGreen, onEvent: (e) => events.push(e.event) });
    expect(events.filter((e) => e === 'spawn')).toHaveLength(PHASES.length);
    expect(events.filter((e) => e === 'gate-green')).toHaveLength(PHASES.length);
  });
});

describe('runPhases — exception safety (FR-41 review 2026-06-07)', () => {
  it('a throwing gate consumes the retry budget and ends with a recorded fail (no silent abort)', async () => {
    const r = await runPhases({
      slug: 'demo',
      spawn: async () => 'ok',
      gate: async () => { throw new Error('verdict crashed'); },
      maxRetries: 1,
      onEvent: () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.failedPhase).toBe('discovery');
    expect(r.events.some((e) => e.event === 'fail')).toBe(true);
    expect(r.events.some((e) => e.event === 'gate-red' && /threw/.test(e.detail ?? ''))).toBe(true);
  });

  it('exposes productionSpawn + productionGate (wired, not dead-until-injected)', () => {
    // imported below; presence = the runner has real defaults.
    expect(typeof productionSpawn).toBe('function');
    expect(typeof productionGate).toBe('function');
  });
});
