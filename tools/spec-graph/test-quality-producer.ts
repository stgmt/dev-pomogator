/**
 * Test-quality PRODUCER (FR-35a, P19-5) — writes the side-channel the honesty
 * consumers read.
 *
 * The CONSUMER half is live: `readVerdicts` → computeCoverage caps a green-but-weak
 * DONE task to IN_PROGRESS (get_coverage / spec-verdict / the Stop-gate). But NOTHING
 * wrote `.dev-pomogator/.test-quality.json`, so the gate only bit a hand-planted file
 * (audit 2026-06-08). This module is the missing producer: `strong-tests` GRADES each
 * test (the judgement — LLM, non-deterministic, emits the canonical 3-value verdict),
 * and this DETERMINISTIC step joins per-test verdicts → tasks over the graph and writes
 * the task-keyed file. Decision (user 2026-06-08): the run-tests skill drives this after
 * a run; strong-tests supplies the grades.
 *
 * Join (reuses P20-1's naming-convention normalization + coverage's task↔scenario map):
 *   testId  --normalize-->  scenario code  --mapTasksToScenarios(inverted)-->  task(s)
 * A task's verdict = the WORST verdict among the tests backing its scenarios
 * (one fake-positive/weak test undermines DONE; STRONG is recorded but never caps).
 *
 * @see ./test-quality-gate.ts (readVerdicts — the consumer reader)
 * @see ./project-test-trace.ts (the same testId↔scenario-code convention)
 * @see .specs/spec-generator-v4/FR.md FR-35a
 */
import fs from 'node:fs';
import path from 'node:path';
import type { SpecGraph, ScenarioNode, TaskNode } from './types.ts';
import { mapTasksToScenarios, specOf, type TestQualityVerdict, type TaskLike, type ScenarioLike } from './coverage.ts';

/** Worst-wins ordering: a single weak/fake test drags the task's verdict down. */
const SEVERITY: Record<TestQualityVerdict, number> = { STRONG: 0, WEAK: 1, 'FAKE-POSITIVE-RISK': 2 };
const worse = (a: TestQualityVerdict, b: TestQualityVerdict): TestQualityVerdict =>
  SEVERITY[a] >= SEVERITY[b] ? a : b;

/** Scenario node id → its naming-convention code (`specgen004-140` | `hvtr001`). */
function scenarioCodeOf(id: string): string | null {
  const m = String(id).match(/SCEN-([a-z]+\d+(?:-\d+)?)/);
  return m ? m[1] : null;
}
/** A test-id's matchable codes: the full id AND its prefix (the two conventions). */
function testCodes(testId: string): string[] {
  const n = testId.toLowerCase().replace(/_/g, '-');
  const pre = n.replace(/-\d+$/, '');
  return pre === n ? [n] : [n, pre];
}

/**
 * Join per-TEST verdicts (testId → verdict, from strong-tests) to per-TASK verdicts
 * (taskId → worst verdict) over the graph. Pure + deterministic — the grade is the
 * only judgement; the mapping is reproducible. A task with no backed test → absent.
 */
export function mapTestVerdictsToTasks(
  graph: SpecGraph,
  testVerdicts: Record<string, TestQualityVerdict>,
): Record<string, TestQualityVerdict> {
  const tasks: TaskLike[] = [];
  const scenarios: ScenarioLike[] = [];
  for (const n of graph.nodes.values()) {
    if (n.type === 'Task') {
      const t = n as TaskNode;
      tasks.push({ id: t.id, doneWhen: t.doneWhen ?? '', refs: t.refs, spec: specOf(t.file) });
    } else if (n.type === 'Scenario') {
      const s = n as ScenarioNode;
      scenarios.push({ id: s.id, tags: s.tags, result: s.lastResult, spec: specOf(s.file) });
    }
  }
  // scenario CODE → worst verdict among tests that name it (full id or prefix).
  const codeVerdict = new Map<string, TestQualityVerdict>();
  for (const [testId, v] of Object.entries(testVerdicts)) {
    for (const code of testCodes(testId)) {
      const prev = codeVerdict.get(code);
      codeVerdict.set(code, prev ? worse(prev, v) : v);
    }
  }
  const taskScen = mapTasksToScenarios(tasks, scenarios);
  const out: Record<string, TestQualityVerdict> = {};
  for (const [taskId, scenIds] of taskScen) {
    let agg: TestQualityVerdict | undefined;
    for (const sid of scenIds) {
      const code = scenarioCodeOf(sid);
      const v = code ? codeVerdict.get(code) : undefined;
      if (v) agg = agg ? worse(agg, v) : v;
    }
    if (agg) out[taskId] = agg;
  }
  return out;
}

/** Path of the side-channel the consumers read. */
export function testQualityPath(repoRoot: string): string {
  return path.join(repoRoot, '.dev-pomogator', '.test-quality.json');
}

/** Atomically write the task-keyed verdict file (temp + rename, atomic-config-save). */
export function writeTaskVerdicts(repoRoot: string, taskVerdicts: Record<string, TestQualityVerdict>): string {
  const abs = testQualityPath(repoRoot);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(taskVerdicts, null, 2), 'utf-8');
  fs.renameSync(tmp, abs);
  return abs;
}

/** End-to-end: grade-file (testId→verdict) + graph → write task-keyed side-channel. */
export function produceFromTestVerdicts(
  graph: SpecGraph,
  repoRoot: string,
  testVerdicts: Record<string, TestQualityVerdict>,
): { path: string; taskVerdicts: Record<string, TestQualityVerdict> } {
  const taskVerdicts = mapTestVerdictsToTasks(graph, testVerdicts);
  return { path: writeTaskVerdicts(repoRoot, taskVerdicts), taskVerdicts };
}

// CLI: `npx tsx tools/spec-graph/test-quality-producer.ts <grades.json>` where
// grades.json is `{ "<testId>": "STRONG|WEAK|FAKE-POSITIVE-RISK" }` from strong-tests.
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void (async () => {
    const gradesArg = process.argv[2];
    if (!gradesArg) {
      process.stderr.write('usage: test-quality-producer.ts <grades.json>  (grades = {"<testId>":"STRONG|WEAK|FAKE-POSITIVE-RISK"})\n');
      process.exit(2);
    }
    const repoRoot = process.cwd();
    const testVerdicts = JSON.parse(fs.readFileSync(gradesArg, 'utf-8')) as Record<string, TestQualityVerdict>;
    const { buildGraphFromCwd } = await import('./builder.ts');
    const { path: out, taskVerdicts } = produceFromTestVerdicts(buildGraphFromCwd(repoRoot), repoRoot, testVerdicts);
    const n = Object.keys(taskVerdicts).length;
    process.stdout.write(`wrote ${n} task verdict(s) → ${out}\n`);
    for (const [t, v] of Object.entries(taskVerdicts)) process.stdout.write(`  ${v}\t${t}\n`);
  })();
}
