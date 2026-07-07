/**
 * orchestrator-verifier — FR-41b/c (P17-7/8).
 *
 * Drives the create-spec workflow as a sequence of HEADLESS phase agents
 * (`.claude/agents/spec-phase-*.md`), gating each transition on the
 * AUTHORITATIVE verdict between phases: spawn phase → run spec-verdict +
 * get_spec_status → GREEN advances, RED returns the SAME phase to its agent
 * with the gap list (bounded retries) → next, or hard FAIL when the retry
 * budget is spent (never an infinite wait, never a silent skip —
 * NFR-Reliability-12).
 *
 * Thin-router discipline (FR-33): this COMPOSES the existing verdict
 * machinery; it does NOT re-implement conformance/coverage. The phase agent
 * is spawned via an INJECTABLE `spawn` (reused pattern from spec-llm-judge) so
 * the loop is deterministic in tests without a real `claude -p`; the verdict
 * gate is the REAL `runSpecVerdict` (also injectable for the unit path).
 *
 * Every spawn / retry / gate decision is logged for observability (FR-41c).
 *
 * @see .specs/spec-generator-v4/FR.md FR-41, NFR.md NFR-Reliability-12
 * @see .claude/agents/spec-phase-*.md
 */
import fs from 'node:fs';
import path from 'node:path';

export const PHASES = ['discovery', 'requirements', 'finalization', 'audit'] as const;
export type Phase = (typeof PHASES)[number];

/** What a phase gate decides from a verdict. */
export interface GateResult {
  verdict: 'GREEN' | 'RED';
  gapList: string[];
}

/** Spawn a headless phase agent. Returns its final text (unused by the gate —
 *  the gate trusts the verdict over the agent's self-report). Injectable. */
export type SpawnPhase = (phase: Phase, slug: string, gapList: string[]) => Promise<string>;

/** Run the authoritative verdict for the gate. Injectable (defaults to real). */
export type RunGate = (slug: string) => Promise<GateResult>;

/**
 * PRODUCTION gate (FR-41b): the REAL authoritative verdict over the spec.
 * Wired so runPhases is NOT dead-until-someone-injects (the dead-integration
 * lesson). Lazy-imports spec-verdict so unit tests that inject their own gate
 * never pay the cost. GREEN iff the verdict is GREEN; gapList = its gap list.
 */
export async function productionGate(slug: string): Promise<GateResult> {
  const { runSpecVerdict } = await import('../../../../tools/specs-generator/spec-verdict.ts');
  const r = await runSpecVerdict(`.specs/${slug}`, { semantic: false });
  return { verdict: r.verdict, gapList: r.gapList };
}

/**
 * PRODUCTION spawn (FR-41a): dispatch a headless phase agent via `claude -p`
 * with the matching `.claude/agents/spec-phase-<phase>.md` definition. Lazy
 * child_process import. The agent edits the spec ONLY through MCP (its
 * allowed-tools); we trust the verdict gate over its self-report, so the
 * stdout is returned but not parsed.
 */
export function productionSpawn(phase: Phase, slug: string, gapList: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    import('node:child_process').then(({ spawn }) => {
      const bin = process.env.CLAUDE_BIN ?? 'claude';
      const gaps = gapList.length ? `\nOpen verdict gaps to fix:\n- ${gapList.join('\n- ')}` : '';
      const prompt =
        `You are the spec-phase-${phase} agent. Work ONLY through the ` +
        `dev-pomogator-specs MCP tools (no file tools over .specs/). ` +
        `Author the ${phase} phase of spec "${slug}".${gaps}`;
      const child = spawn(bin, ['-p', '--agent', `spec-phase-${phase}`, prompt], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const out: Buffer[] = [];
      child.stdout.on('data', (c) => out.push(c));
      child.on('error', reject);
      child.on('exit', () => resolve(Buffer.concat(out).toString('utf8')));
    });
  });
}

export interface PhaseRunEvent {
  ts: string;
  phase: Phase;
  attempt: number;
  event: 'spawn' | 'gate-green' | 'gate-red' | 'retry' | 'fail';
  detail?: string;
}

export interface PhaseRunOptions {
  slug: string;
  /** Phase-agent dispatch. Default: productionSpawn (headless `claude -p`). */
  spawn?: SpawnPhase;
  /** Verdict gate. Default: productionGate (real runSpecVerdict). */
  gate?: RunGate;
  /** Retry budget per phase (default 2 — NFR-Reliability-12). */
  maxRetries?: number;
  /** Observability sink; defaults to spec-access-style JSONL under repoRoot. */
  onEvent?: (e: PhaseRunEvent) => void;
  repoRoot?: string;
}

export interface PhaseRunResult {
  ok: boolean;
  events: PhaseRunEvent[];
  /** Phase that exhausted its retries, if any. */
  failedPhase?: Phase;
}

function defaultLogger(repoRoot: string): (e: PhaseRunEvent) => void {
  return (e) => {
    try {
      const dir = path.join(repoRoot, '.dev-pomogator', 'logs');
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, 'phase-runner.jsonl'), JSON.stringify(e) + '\n', 'utf-8');
    } catch {
      /* observability is best-effort, never breaks the run */
    }
  };
}

/**
 * The FR-41b loop. For each phase in order: spawn the agent, run the gate;
 * GREEN → advance; RED → re-spawn the SAME phase with the gap list until the
 * retry budget is spent → hard FAIL (stop, do not skip). Pure over its
 * injected `spawn`/`gate` — deterministic in tests.
 */
export async function runPhases(opts: PhaseRunOptions): Promise<PhaseRunResult> {
  const maxRetries = opts.maxRetries ?? 2;
  const spawn = opts.spawn ?? productionSpawn; // real headless agent unless injected
  const gate = opts.gate ?? productionGate; // real verdict unless injected
  const emit = opts.onEvent ?? defaultLogger(opts.repoRoot ?? process.cwd());
  const events: PhaseRunEvent[] = [];
  const record = (e: Omit<PhaseRunEvent, 'ts'>): void => {
    const full = { ts: new Date().toISOString(), ...e };
    events.push(full);
    emit(full);
  };

  for (const phase of PHASES) {
    let gapList: string[] = [];
    let passed = false;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      record({ phase, attempt, event: attempt === 1 ? 'spawn' : 'retry', detail: gapList.slice(0, 3).join(' | ') });
      // A spawn/gate throw (transient claude -p crash, verdict error) must end
      // the run with a recorded 'fail' — never a silent abort with no event
      // (2026-06-07 review). Treat the failing attempt as a RED that consumes
      // the retry budget.
      let g: GateResult;
      try {
        await spawn(phase, opts.slug, gapList);
        g = await gate(opts.slug);
      } catch (e) {
        record({ phase, attempt, event: 'gate-red', detail: `threw: ${e instanceof Error ? e.message : String(e)}` });
        gapList = [`phase ${phase} attempt ${attempt} threw: ${e instanceof Error ? e.message : String(e)}`];
        continue;
      }
      if (g.verdict === 'GREEN') {
        record({ phase, attempt, event: 'gate-green' });
        passed = true;
        break;
      }
      gapList = g.gapList;
      record({ phase, attempt, event: 'gate-red', detail: `${g.gapList.length} gap(s)` });
    }
    if (!passed) {
      record({ phase, attempt: maxRetries + 1, event: 'fail', detail: 'retry budget exhausted' });
      return { ok: false, events, failedPhase: phase };
    }
  }
  return { ok: true, events };
}
