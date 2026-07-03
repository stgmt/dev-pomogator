import fs from 'node:fs';
import path from 'node:path';
import type { CheckContext, CheckDefinition, CheckResult } from '../types.js';
import { buildResult } from './_helpers.js';
import { isClaudeMemInstalled } from './claude-mem-plugin.js';

// Surfaces claude-mem WORKER runtime health (distinct from C-CMEM which only checks install
// presence). Catches the Windows "wedged worker" failure: a poisoned worker is SIGKILL'd, its
// orphaned chroma-mcp child keeps the fixed port (37777) bound under a dead PID, no new worker can
// start, hooks flood hook-failures.json, and at the fail-loud threshold claude-mem exit(2)s —
// blocking every tool call. The SessionStart reaper (tools/claude-mem-health/health-check.ts)
// auto-heals this; this check makes the degraded state VISIBLE instead of silent/blocking.
const META = {
  id: 'C-CMEM-W',
  fr: 'FR-6',
  name: 'claude-mem worker health',
  group: 'needs-external' as const,
  reinstallable: false,
};

const DEFAULT_PORT = 37777;
const PROBE_TIMEOUT_MS = 800; // a down worker is instant ECONNREFUSED; cap a black-holed (wedged) port.
const WEDGE_CRITICAL_FAILURES = 30; // >= this many consecutive hook failures = actively blocking the user.

function readWorkerPort(homeDir: string): number {
  try {
    const raw = fs.readFileSync(path.join(homeDir, '.claude-mem', 'settings.json'), 'utf-8');
    const p = parseInt(String((JSON.parse(raw) as Record<string, unknown>).CLAUDE_MEM_WORKER_PORT), 10);
    if (Number.isFinite(p) && p > 0) return p;
  } catch {
    /* absent/malformed → default */
  }
  return DEFAULT_PORT;
}

function readConsecutiveFailures(homeDir: string): number {
  try {
    const raw = fs.readFileSync(path.join(homeDir, '.claude-mem', 'state', 'hook-failures.json'), 'utf-8');
    const n = Number((JSON.parse(raw) as Record<string, unknown>).consecutiveFailures);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0; // absent = healthy baseline
  }
}

const HEAL_HINT =
  'Auto-heals on the next session: the claude-mem-reaper SessionStart hook frees the wedged port ' +
  '(no reboot). Start a new Claude session to heal now. Opt out with DEV_POMOGATOR_CLAUDE_MEM_REAP=off.';

export const claudeMemWorkerCheck: CheckDefinition = {
  ...META,
  pool: 'mcp', // shares the throttled network pool (does an HTTP probe)
  gate(ctx: CheckContext) {
    return isClaudeMemInstalled(ctx.homeDir)
      ? { relevant: true }
      : { relevant: false, reason: 'claude-mem not installed' };
  },
  async run(ctx: CheckContext): Promise<CheckResult> {
    const port = readWorkerPort(ctx.homeDir);
    const failures = readConsecutiveFailures(ctx.homeDir);
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    ctx.signal.addEventListener('abort', onAbort);
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: ctrl.signal });
      if (res.ok) {
        return failures > 0
          ? buildResult(META, 'warning', `worker up on :${port} but ${failures} recent hook failure(s) recorded`, {
              hint: 'Transient — the counter resets once hooks reach the worker again.',
              details: { port, consecutiveFailures: failures },
            })
          : buildResult(META, 'ok', `worker healthy on :${port}`, { details: { port } });
      }
      return buildResult(META, 'warning', `worker on :${port} responded ${res.status} (not healthy)`, {
        hint: HEAL_HINT,
        details: { port, status: res.status, consecutiveFailures: failures },
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'AbortError';
      const sev: CheckResult['severity'] = failures >= WEDGE_CRITICAL_FAILURES ? 'critical' : 'warning';
      const wedged = timedOut; // TCP connected but no HTTP reply → black-holed (wedged) socket
      const msg = wedged
        ? `worker wedged on :${port} (port bound but no HTTP response; ${failures} consecutive hook failures)`
        : `worker not reachable on :${port} (${failures} consecutive hook failures)`;
      return buildResult(META, sev, msg, { hint: HEAL_HINT, details: { port, consecutiveFailures: failures, wedged } });
    } finally {
      clearTimeout(timer);
      ctx.signal.removeEventListener('abort', onAbort);
    }
  },
};
