/**
 * Environmental blocker detection (honest-status-command FR-8).
 *
 * Distinguishes environmental problems (Docker daemon down, dead test heartbeat)
 * from genuine test failures, so /spec-status never reports "❌ failed" for what
 * is really an environment issue. Deterministic + testable: the docker probe is
 * the PATH-resolved `docker ps` (tests prepend a mock-bin), the heartbeat reuses
 * classifyTestStatus.
 */
import { spawnSync } from 'node:child_process';
import type { RecencyReport } from './yaml-recency.ts';

export interface Blocker {
  kind: 'docker-unreachable' | 'test-heartbeat-dead';
  message: string;
}

/** Probe `docker ps`; a non-zero exit means the daemon is unreachable. */
export function detectDockerBlocker(dockerCmd: string = 'docker'): Blocker | null {
  let r;
  try {
    r = spawnSync(dockerCmd, ['ps'], { encoding: 'utf-8', timeout: 5000 });
  } catch {
    return { kind: 'docker-unreachable', message: 'docker not found on PATH' };
  }
  if (r.error || (typeof r.status === 'number' && r.status !== 0)) {
    const raw = `${r.stderr || ''}${r.stdout || ''}`.trim();
    const firstLine = raw.split('\n')[0] || 'docker ps failed';
    return { kind: 'docker-unreachable', message: firstLine };
  }
  return null;
}

/** Derive a heartbeat-dead blocker from a recency report (FR-5 → FR-8 link). */
export function heartbeatBlocker(recency: RecencyReport): Blocker | null {
  if (recency.classification === 'stale') {
    return { kind: 'test-heartbeat-dead', message: `Test heartbeat dead — ${recency.reason}` };
  }
  return null;
}

/** Combine all environmental probes into a blocker list (empty = none). */
export function collectBlockers(opts: { dockerCmd?: string; recency?: RecencyReport } = {}): Blocker[] {
  const out: Blocker[] = [];
  const docker = detectDockerBlocker(opts.dockerCmd);
  if (docker) out.push(docker);
  if (opts.recency) {
    const hb = heartbeatBlocker(opts.recency);
    if (hb) out.push(hb);
  }
  return out;
}
