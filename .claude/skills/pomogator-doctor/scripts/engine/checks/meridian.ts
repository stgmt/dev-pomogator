import path from 'node:path';
import type { CheckContext, CheckDefinition, CheckResult } from '../types.js';
import { buildResult, fileExists, readDotenvFile } from './_helpers.js';

const META = {
  id: 'C17',
  fr: 'FR-49',
  name: 'Meridian subscription proxy (gray-zone judge transport)',
  group: 'needs-external' as const,
  reinstallable: false,
};

const PROBE_TIMEOUT_MS = 500; // SessionStart budget: a down proxy is instant ECONNREFUSED; cap a black-holed port.
// Read at call time (not module load) so tests can repoint it deterministically.
const proxyUrl = () => process.env.MERIDIAN_URL || 'http://127.0.0.1:3456';

/**
 * Relevant only when the user has OPTED INTO the subscription proxy / FR-49e judge —
 * health-check, not evangelism. Three opt-in signals: the judge flag, a project .env wired
 * to the proxy, or the proxy infra vendored in this project tree (dogfood). Otherwise gated
 * out so a user who never heard of Meridian is never nagged about it.
 */
function optedIn(ctx: CheckContext): { in: boolean; reason?: string } {
  if ((process.env.CLAIM_GATE_JUDGE ?? '').toLowerCase() === 'true') return { in: true };
  const base = readDotenvFile(path.join(ctx.projectRoot, '.env')).ANTHROPIC_BASE_URL ?? '';
  if (/:3456|meridian|claude-subscription/i.test(base)) return { in: true };
  if (fileExists(path.join(ctx.projectRoot, 'tools', 'claude-subscription-proxy', 'docker-compose.yml'))) {
    return { in: true };
  }
  return {
    in: false,
    reason:
      'Meridian not opted in (CLAIM_GATE_JUDGE!=true, no .env ANTHROPIC_BASE_URL→:3456, no vendored proxy infra)',
  };
}

const START_HINT =
  'Optional. Bring it up via the `proxy-up` skill, or run the start script under ' +
  '<plugin-root>/tools/claude-subscription-proxy/scripts/ (needs Docker + `claude login`). ' +
  'The FR-49e gray-zone judge fails open without it.';

export const meridianCheck: CheckDefinition = {
  ...META,
  pool: 'fs',
  gate(ctx: CheckContext) {
    const o = optedIn(ctx);
    return o.in ? { relevant: true } : { relevant: false, reason: o.reason };
  },
  async run(ctx: CheckContext): Promise<CheckResult> {
    const url = proxyUrl();
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    ctx.signal.addEventListener('abort', onAbort);
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(`${url}/health`, { signal: ctrl.signal });
      if (!res.ok) {
        return buildResult(META, 'warning', `proxy responded ${res.status} (not healthy)`, {
          hint: START_HINT,
        });
      }
      let body: { mode?: string; auth?: { loggedIn?: boolean } } = {};
      try {
        body = (await res.json()) as typeof body;
      } catch {
        /* health body not JSON — still treat 200 as up */
      }
      if (body.auth?.loggedIn === false) {
        return buildResult(META, 'warning', `up on ${url} but OAuth expired (auth.loggedIn:false)`, {
          hint: '`claude login` on the host, then restart the proxy (proxy-up skill).',
        });
      }
      return buildResult(META, 'ok', `up on ${url}${body.mode ? ` (mode:${body.mode})` : ''}`);
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'AbortError';
      return buildResult(META, 'warning', `not running on ${url} (${timedOut ? 'timeout' : 'no response'})`, {
        hint: START_HINT,
      });
    } finally {
      clearTimeout(timer);
      ctx.signal.removeEventListener('abort', onAbort);
    }
  },
};
