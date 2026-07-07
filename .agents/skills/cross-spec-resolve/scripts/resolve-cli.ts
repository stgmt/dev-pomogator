// cross-spec-resolve CLI entry (SPECGEN004_47).
//
// The live skill body drives the interactive resolution loop (per-finding
// AskUserQuestion confirms — agent-flow, not here). This CLI owns the one
// mechanical precondition: if `.specs/<slug>/consistency-report.yaml` is
// absent there is nothing to resolve, so it prints the actionable hint to
// stdout and exits non-zero. Backed by the real planResolution — NOT a stub.

import { pathToFileURL } from 'node:url';
import { planResolution } from './walker.ts';

export interface ResolveCliResult {
  stdout: string;
  exitCode: number;
}

export function resolveCli(slug: string | undefined, repoRoot: string): ResolveCliResult {
  if (!slug) return { stdout: 'usage: resolve-cli <slug>\n', exitCode: 2 };
  const result = planResolution({ repoRoot, slug });
  if (result.missing) {
    // SPECGEN004_47: no report → actionable hint + non-zero exit.
    return { stdout: `${result.hint ?? 'Run /cross-spec-reconcile first'}\n`, exitCode: 1 };
  }
  // A report exists — emit the structured plan (the 5-field explanation blocks
  // walker.ts already built) as JSON so the live skill drives the interactive
  // loop from THIS stdout. MCP-rails (FR-39): the YAML is read in-process here
  // (engine carve-out), the agent consumes the CLI's stdout — it never `Read`s
  // the `.specs/` file directly. `count` stays for a human eyeballing the run.
  const plan = result.plan ?? [];
  return { stdout: JSON.stringify({ count: plan.length, plan }, null, 2) + '\n', exitCode: 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoRoot = process.env.DEV_POMOGATOR_REPO_ROOT ?? process.cwd();
  const { stdout, exitCode } = resolveCli(process.argv[2], repoRoot);
  process.stdout.write(stdout);
  process.exit(exitCode);
}
