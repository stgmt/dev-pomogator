/**
 * PostToolUse SOFT push hook — emits aggregated conformance findings.
 *
 * Triggers after Write / Edit on spec markdown files (.specs/[slug]/*.md)
 * and gherkin .feature files anywhere under the repo.
 * Each invocation:
 *   1. Rebuilds the SpecGraph (cold-start ~50ms on the v4 corpus).
 *   2. Runs `checkConformance` and collects findings.
 *   3. Appends the new findings to a throttle journal on disk.
 *   4. If we're outside the 3-second fixed window (per FR-28) since the
 *      first un-emitted entry, prints a single `<system-reminder>` block
 *      with the deduplicated set, then resets the journal.
 *   5. Otherwise stays silent — the next invocation (or the next agent
 *      turn's stop hook) will collapse the burst into one push.
 *
 * Per-spec opt-out (FR-6 last paragraph): if the FIRST line of the changed
 * file's content is `# _no_push_check: true` or the file's frontmatter
 * contains `_no_push_check: true`, the hook suppresses the agent-facing
 * `<system-reminder>` push for that file (red phase escape hatch) — but the
 * findings are STILL written to the `.spec-check-log/` journal (SPECGEN004_14):
 * opt-out silences noise, never the durable audit record.
 *
 * @see ../spec-graph/builder.ts (cold-start)
 * @see ../spec-graph/conformance.ts
 * @see .specs/spec-generator-v4/FR.md FR-6, FR-28
 */

import fs from 'node:fs';
import { readStdinJson } from '../_shared/stdin.ts';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildGraph } from '../spec-graph/builder.ts';
import { checkConformance, type Finding } from '../spec-graph/conformance.ts';
import { appendFindings } from '../spec-check-log/writer.ts';
import { computeTaskCensus, writeTaskCensusCache } from '../spec-graph/task-census.ts';
import { backlogSpecs } from '../spec-graph/spec-status-store.ts';

interface HookInput {
  tool_name?: string;
  tool_input?: { file_path?: string };
  session_id?: string;
}

const WINDOW_MS = 3_000;
const STATE_PATH_REL = '.dev-pomogator/.push-throttle-state.json';

interface ThrottleState {
  window_start: number; // ms since epoch
  pending: Finding[];
}

function statePath(repoRoot: string): string {
  return path.join(repoRoot, STATE_PATH_REL);
}

function readState(repoRoot: string): ThrottleState | null {
  const p = statePath(repoRoot);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as ThrottleState;
  } catch {
    return null;
  }
}

function writeState(repoRoot: string, state: ThrottleState): void {
  const p = statePath(repoRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  // Atomic write: temp file + rename per `atomic-config-save` rule.
  const tmp = `${p}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, p);
}

function clearState(repoRoot: string): void {
  const p = statePath(repoRoot);
  try {
    fs.unlinkSync(p);
  } catch {
    /* already gone */
  }
}

function isOptedOut(filePath: string, repoRoot: string): boolean {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
  if (!fs.existsSync(abs)) return false;
  try {
    const head = fs.readFileSync(abs, 'utf8').slice(0, 512);
    if (/^_no_push_check:\s*true/m.test(head)) return true;
    if (/^#\s*_no_push_check:\s*true/m.test(head)) return true;
  } catch {
    /* unreadable — treat as not opted out, hook stays silent on real issues */
  }
  return false;
}

function findingKey(f: Finding): string {
  return `${f.code}|${f.location.file}|${f.location.line}|${f.nodeId ?? ''}|${f.relatedId ?? ''}`;
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const f of findings) {
    const k = findingKey(f);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

function formatReminder(findings: Finding[]): string {
  const lines: string[] = [];
  lines.push('<system-reminder>');
  lines.push('Spec conformance findings (PostToolUse push, 3s window):');
  const bySev = new Map<string, number>();
  for (const f of findings) bySev.set(f.severity, (bySev.get(f.severity) ?? 0) + 1);
  lines.push(
    `  ${findings.length} finding(s): ` +
      Array.from(bySev.entries()).map(([s, n]) => `${n} ${s}`).join(', '),
  );
  for (const f of findings) {
    lines.push(
      `  [${f.severity.toUpperCase()}] ${f.code} ${f.location.file}:${f.location.line} — ${f.message}`,
    );
  }
  lines.push('</system-reminder>');
  return lines.join('\n');
}

export interface PushDecision {
  emit: string | null;          // the `<system-reminder>` payload, or null to stay silent
  newState: ThrottleState | null; // state to persist; null = clear file
  reason: string;               // diagnostic — surfaced in tests
}

/**
 * Pure decision function — exported so tests can drive the throttle without
 * touching the filesystem-backed state at runtime.
 */
export function decidePush(opts: {
  now: number;
  previous: ThrottleState | null;
  newFindings: Finding[];
}): PushDecision {
  const { now, previous, newFindings } = opts;
  const accumulated = dedupe([...(previous?.pending ?? []), ...newFindings]);
  if (accumulated.length === 0) {
    return { emit: null, newState: null, reason: 'no findings' };
  }
  const windowStart = previous?.window_start ?? now;
  const elapsed = now - windowStart;
  if (elapsed < WINDOW_MS) {
    return {
      emit: null,
      newState: { window_start: windowStart, pending: accumulated },
      reason: `accumulating (${elapsed}ms of ${WINDOW_MS}ms)`,
    };
  }
  return {
    emit: formatReminder(accumulated),
    newState: null,
    reason: `window elapsed (${elapsed}ms ≥ ${WINDOW_MS}ms) — flushing ${accumulated.length} finding(s)`,
  };
}

/**
 * Stateful runner — reads state, decides, persists/clears. Returns the
 * payload that the hook should print to stdout (empty string = silent).
 */
export interface RunPushOptions {
  /** Optional session id propagated into the spec-check-log envelope (FR-15). */
  sessionId?: string;
}

export function runPush(
  repoRoot: string,
  changedFile: string | null,
  now: number,
  options: RunPushOptions = {},
): string {
  const optedOut = !!(changedFile && isOptedOut(changedFile, repoRoot));
  const graph = buildGraph({ repoRoot, skipNdjson: true });
  const newFindings = checkConformance(graph);

  // P21-4: snapshot the honest task census. doneButRed needs scenario RESULTS,
  // so this build includes ndjson (the conformance build above stays skipNdjson —
  // its findings are result-free by design). Edit-triggered + 3s-throttled, so a
  // second ~50-150ms build is fine; the per-prompt banner reads ONLY the tiny
  // cache, never the graph (NFR-Performance-6). Best-effort: soft tier.
  try {
    const censusGraph = buildGraph({ repoRoot });
    writeTaskCensusCache(repoRoot, computeTaskCensus(censusGraph, { backlogSpecs: backlogSpecs(repoRoot) }), new Date(now).toISOString());
  } catch {
    // Cache write unavailable → banner just stays silent; never block the hook.
  }

  // FR-15 wire-up: every finding the hook sees gets persisted to the
  // side-channel JSONL log, even if the throttle window decides to stay
  // silent on the agent-facing emit — AND even when the file opted out of the
  // push (SPECGEN004_14). The journal is the durable audit record; opt-out and
  // the throttle only gate the noisy <system-reminder> surface, never the log.
  // Failures here are best-effort — the FR-19 soft tier guarantees the hook
  // never blocks.
  if (newFindings.length > 0) {
    try {
      appendFindings(newFindings, {
        repoRoot,
        source: 'spec-conformance-push',
        sessionId: options.sessionId,
        now: new Date(now),
      });
    } catch {
      // Soft tier — log unavailable disk → silently continue.
    }
  }

  // Per-spec opt-out (`_no_push_check: true`): suppress only the agent-facing
  // emit. The log above is already written; the throttle window is left
  // untouched so an opted-out edit never perturbs a neighbouring file's batch.
  if (optedOut) return '';

  const previous = readState(repoRoot);
  const decision = decidePush({ now, previous, newFindings });
  if (decision.newState) writeState(repoRoot, decision.newState);
  else clearState(repoRoot);
  return decision.emit ?? '';
}

async function main(): Promise<void> {
  const repoRoot = process.env.CLAUDE_PLUGIN_ROOT ?? process.env.DEV_POMOGATOR_REPO_ROOT ?? process.cwd();
  const input = await readStdinJson<HookInput>();
  const fp = input.tool_input?.file_path ?? null;
  const out = runPush(repoRoot, fp, Date.now(), { sessionId: input.session_id });
  if (out) process.stdout.write(out);
  // SOFT tier per FR-19: even on internal error the agent path stays open.
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(`[spec-conformance-push] error (soft tier): ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(0);
  });
}
