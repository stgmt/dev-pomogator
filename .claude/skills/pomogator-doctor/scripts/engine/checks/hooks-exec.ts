import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCTOR_TIMEOUTS } from '../constants.js';
import type { CheckContext, CheckDefinition } from '../types.js';
import { buildResult, fileExists } from './_helpers.js';

const META = {
  id: 'C18',
  fr: 'FR-1',
  name: 'Hooks execute (tsx-runner smoke)',
  group: 'self-sufficient',
  reinstallable: true,
} as const;

/**
 * Locate `tools/_shared/bootstrap.cjs` — the REAL entry every hook goes through
 * (`node -e "require(bootstrap.cjs)" -- script.ts`). We must drive bootstrap, NOT
 * tsx-runner.js directly: the repo's package.json is `"type":"module"`, so running
 * `node tsx-runner.js` loads it as ESM and its top-level `require()` throws — a
 * false negative. bootstrap.cjs (a .cjs file) forces the correct CJS load.
 * The whole plugin tree ships together, so bootstrap sits at a fixed offset from
 * this check; fall back to projectRoot and the canonical plugin root.
 */
function locateBootstrap(projectRoot: string): string | null {
  // Test seam: lets the suite point the probe at a deliberately-broken bootstrap
  // to exercise the critical branch. Unset in production.
  const override = process.env.DEV_POMOGATOR_DOCTOR_BOOTSTRAP;
  if (override) return fileExists(override) ? override : override;
  const here = path.dirname(fileURLToPath(import.meta.url)); // .../scripts/engine/checks
  const candidates = [
    // checks → engine → scripts → pomogator-doctor → skills → .claude → <root>
    path.resolve(here, '..', '..', '..', '..', '..', '..', 'tools', '_shared', 'bootstrap.cjs'),
    path.join(projectRoot, 'tools', '_shared', 'bootstrap.cjs'),
    ...(process.env.CLAUDE_PLUGIN_ROOT
      ? [path.join(process.env.CLAUDE_PLUGIN_ROOT, 'tools', '_shared', 'bootstrap.cjs')]
      : []),
  ];
  return candidates.find(fileExists) ?? null;
}

/**
 * C18 — empirical hook-execution smoke test (FR-1 runtime counterpart).
 *
 * The static checks (Node version, hooks registry) can all pass while hooks
 * still silently fail to run — e.g. a Node release removes a flag the loader
 * passes, or no TypeScript runner is reachable. That failure is invisible until
 * a user notices their hooks never fire. This check actually drives the real
 * loader on a throwaway `.ts` probe and reports whether hooks can execute AT ALL.
 */
export const hooksExecCheck: CheckDefinition = {
  ...META,
  pool: 'fs',
  async run(ctx: CheckContext) {
    const bootstrap = locateBootstrap(ctx.projectRoot);
    if (!bootstrap) {
      return buildResult(
        META,
        'warning',
        'bootstrap.cjs not found — cannot smoke-test hook execution',
        { hint: 'Reinstall dev-pomogator: /plugin install dev-pomogator@stgmt --force' },
      );
    }

    const probe = path.join(os.tmpdir(), `dp-hook-probe-${process.pid}-${process.hrtime.bigint()}.ts`);
    const MARKER = 'HOOK_EXEC_OK';
    try {
      // A type annotation forces real TypeScript handling (strip-types / tsx),
      // exactly like a hook script — a plain .js probe would not exercise it.
      fs.writeFileSync(probe, `const marker: string = '${MARKER}';\nprocess.stdout.write(marker);\n`);
      // Drive the exact hook entry shape: `node -e "require(bootstrap.cjs)" -- probe.ts`.
      const res = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(bootstrap)})`, '--', probe], {
        encoding: 'utf-8',
        timeout: DOCTOR_TIMEOUTS.SPAWN_MS,
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      });
      const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
      if (res.status === 0 && out.includes(MARKER)) {
        return buildResult(META, 'ok', 'hooks execute — the hook runner ran a TypeScript probe successfully');
      }
      const detail = (res.error?.message || out.split('\n').find((l) => l.trim()) || `exit ${res.status}`)
        .slice(0, 160);
      return buildResult(
        META,
        'critical',
        `hooks cannot execute: the hook runner failed on a probe (${detail})`,
        {
          hint:
            'Hooks will silently NOT fire. Ensure Node >= 22.6, run `npm install` for a local TypeScript runner, ' +
            'and update the plugin (/plugin update dev-pomogator@stgmt).',
          reinstallHint: '/plugin install dev-pomogator@stgmt --force',
        },
      );
    } catch (err) {
      return buildResult(
        META,
        'critical',
        `hooks cannot execute: probe spawn threw (${(err as Error).message.slice(0, 160)})`,
        { hint: 'Ensure Node >= 22.6 and reinstall dev-pomogator.' },
      );
    } finally {
      try {
        fs.unlinkSync(probe);
      } catch {
        /* best-effort cleanup */
      }
    }
  },
};
