/**
 * form-guards-dispatch — single PreToolUse (Write|Edit) entry that revives the
 * five v3 form-guards.
 *
 * Found DEAD in the 2026-06-07 creation-pipeline review: user-story-form-guard,
 * task-form-guard, design-decision-guard, requirements-chk-guard and
 * risk-assessment-guard existed as code (with tests spawning them directly)
 * but were registered in NO live manifest — the meta-guard even protected
 * registrations that did not exist, and the create-spec sub-skills told
 * authors «the guard will deny» while nothing ever fired.
 *
 * Design: ONE registered hook instead of five — every Write/Edit costs one
 * dispatcher spawn; only a Write into `.specs/<slug>/<TARGET>.md` spawns the
 * ONE relevant guard (stdin passed through verbatim, exit code + output
 * propagated). The guards stay untouched: their direct-spawn tests and the
 * SPECGEN003 scenarios remain the canonical contract.
 *
 * Deps-safe: node builtins only; guards are builtins-only .ts launched via
 * tools/_shared/bootstrap.cjs (same multi-strategy loader the manifests use).
 * SOFT tier: any dispatcher error → fail-open (log + exit 0), per FR-19.
 *
 * @see .specs/spec-generator-v4/FR.md FR-19 (tiers), FR-24 (meta-guard now
 *      actually has live registrations to protect)
 */
import path from 'path';
import { readStdin } from '../_shared/stdin.ts';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { logEvent } from './audit-logger.ts';

const HOOK_NAME = 'form-guards-dispatch';
const VALIDATOR_DIR = path.dirname(fileURLToPath(import.meta.url));
const BOOTSTRAP = path.join(VALIDATOR_DIR, '..', '_shared', 'bootstrap.cjs');

/** basename → guard script (each guard re-checks everything itself). */
const GUARD_BY_TARGET: Record<string, string> = {
  'USER_STORIES.md': 'user-story-form-guard.ts',
  'TASKS.md': 'task-form-guard.ts',
  'DESIGN.md': 'design-decision-guard.ts',
  'REQUIREMENTS.md': 'requirements-chk-guard.ts',
  'RESEARCH.md': 'risk-assessment-guard.ts',
};

async function main(): Promise<void> {
  if (process.stdin.isTTY) process.exit(0);
  const raw = await readStdin();
  if (!raw.trim()) process.exit(0);

  const data = JSON.parse(raw) as {
    tool_name?: string;
    tool_input?: { file_path?: string };
  };
  if (data.tool_name !== 'Write' && data.tool_name !== 'Edit') process.exit(0);

  const filePath = data.tool_input?.file_path ?? '';
  const norm = filePath.replace(/\\/g, '/');
  if (!norm.includes('/.specs/')) process.exit(0);

  const guard = GUARD_BY_TARGET[path.basename(norm)];
  if (!guard) process.exit(0);

  // Re-spawn the canonical guard with the same stdin; propagate its verdict.
  const guardPath = path.join(VALIDATOR_DIR, guard);
  const r = spawnSync(
    process.execPath,
    ['-e', "require(process.argv[1])", BOOTSTRAP, '--', guardPath],
    { input: raw, encoding: 'utf-8', timeout: 55_000 },
  );
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 0);
}

main().catch((e) => {
  try {
    logEvent(HOOK_NAME, 'PARSER_CRASH', process.env.PWD || '', String(e?.message || e));
  } catch {
    // ignore
  }
  process.stderr.write(`[${HOOK_NAME}] fail-open: ${e}\n`);
  process.exit(0);
});
