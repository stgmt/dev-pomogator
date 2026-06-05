/**
 * Pre-DONE test-quality Stop-gate (FR-35b enforcement). On Stop, if a git-MODIFIED
 * `.specs/<slug>` has a task marked DONE without a strong test (TASK_TEST_QUALITY =
 * weak/fake-positive verdict, or TASK_UNTESTED = no linked scenario), BLOCK the
 * "done" claim — unless `[skip-test-quality: <reason ≥8>]` is in the latest commit
 * message (or env `TEST_QUALITY_GATE_SKIP=1`), logged to `.claude/logs/`.
 *
 * Only git-modified specs are judged (the session's own work), so the pre-existing
 * corpus of untested-DONE tasks never wedges an unrelated Stop — exactly the
 * `anchor_gate_stop` scoping. Per-task verdicts are read from the optional
 * side-channel `.dev-pomogator/.test-quality.json` (`{ "<taskId>": "WEAK" | ... }`)
 * that the orchestrator's test-quality stage writes after running strong-tests.
 *
 * Modes via `TEST_QUALITY_GATE_ENABLED`: "shadow" (DEFAULT — log only, safe rollout)
 * | "true" (enforce) | "false" (off). SOFT tier: any error → approve.
 *
 * @see ./test-quality-gate.ts (pure decision) · ./conformance.ts · ./builder.ts
 * @see .specs/spec-generator-v4/FR.md FR-35b / AC-35.4
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
// NB: `builder.ts` is LAZY-imported inside main() — it pulls @cucumber/gherkin, a
// node_modules runtime dep ABSENT for plugin users. A top-level import would crash the
// hook on every Stop (dead integration). Loading it only when a modified spec actually
// needs grading, and fail-opening when the deps are missing, keeps the hook safe to ship.
import { checkConformance, type Finding } from './conformance.ts';
import type { TestQualityVerdict } from './coverage.ts';
import { evaluateTestQualityGate, escapeReason, escapeHonoured, logEscape } from './test-quality-gate.ts';

interface StopInput { stop_hook_active?: boolean; session_id?: string }

function approve(): void { process.exit(0); }
function block(reason: string): void {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

/** Modified `.specs/<slug>` → distinct slugs, via `git status --porcelain`. */
export function modifiedSpecSlugs(repoRoot: string): string[] {
  const r = spawnSync('git', ['status', '--porcelain', '--', '.specs'], { cwd: repoRoot, encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout) return [];
  const slugs = new Set<string>();
  for (const line of r.stdout.split('\n')) {
    const m = line.match(/\.specs\/([^/]+)\//);
    if (m) slugs.add(m[1]);
  }
  return [...slugs];
}

/** Optional per-task test-quality verdicts the orchestrator stage recorded. */
function readVerdicts(repoRoot: string): Record<string, TestQualityVerdict> {
  try {
    const raw = fs.readFileSync(path.join(repoRoot, '.dev-pomogator', '.test-quality.json'), 'utf8');
    return JSON.parse(raw) as Record<string, TestQualityVerdict>;
  } catch {
    return {};
  }
}

function escapeFromCommit(repoRoot: string): string | null {
  const r = spawnSync('git', ['log', '-1', '--format=%B'], { cwd: repoRoot, encoding: 'utf8' });
  return r.status === 0 && r.stdout ? escapeReason(r.stdout) : null;
}

async function readStdinJson(): Promise<StopInput> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (c) => chunks.push(c as Buffer));
    process.stdin.on('end', () => {
      const t = Buffer.concat(chunks).toString('utf8').trim();
      try { resolve(t ? (JSON.parse(t) as StopInput) : {}); } catch { resolve({}); }
    });
    process.stdin.on('error', () => resolve({}));
  });
}

async function main(): Promise<void> {
  const mode = process.env.TEST_QUALITY_GATE_ENABLED ?? 'shadow';
  if (mode === 'false') return approve();
  const input = await readStdinJson();
  if (input.stop_hook_active === true) return approve();
  const repoRoot = process.env.CLAUDE_PROJECT_DIR || process.env.DEV_POMOGATOR_REPO_ROOT || process.cwd();

  const slugs = new Set(modifiedSpecSlugs(repoRoot));
  if (slugs.size === 0) return approve();

  // Lazy-load the gherkin-backed builder ONLY now (a modified spec needs grading). If
  // its node_modules deps (@cucumber/gherkin) are absent — a plugin user without
  // node_modules — DEGRADE to fail-open (approve) instead of crashing on every Stop.
  // Matches NFR-Reliability-10 (unavailable auditor → PASS/FAIL, never a hard wedge).
  let findings: Finding[];
  try {
    const { buildGraphFromCwd } = await import('./builder.ts');
    findings = checkConformance(buildGraphFromCwd(repoRoot), { testQualityByTask: readVerdicts(repoRoot) });
  } catch (err) {
    process.stderr.write(`[test-quality-gate] graph deps unavailable — degraded to PASS/FAIL (fail-open): ${err instanceof Error ? err.message : String(err)}\n`);
    return approve();
  }
  // Scope to tasks living in a git-modified spec (the session's own work).
  const scoped: Finding[] = findings.filter((f) => {
    const m = f.location.file.replace(/\\/g, '/').match(/\.specs\/([^/]+)\//);
    return m ? slugs.has(m[1]) : false;
  });

  const escape = process.env.TEST_QUALITY_GATE_SKIP === '1' ? 'env TEST_QUALITY_GATE_SKIP=1' : escapeFromCommit(repoRoot);
  const decision = evaluateTestQualityGate(scoped, { escape });

  if (decision.decision === 'approve') {
    if (decision.escapeUsed) logEscape(repoRoot, decision.escapeUsed, input.session_id);
    return approve();
  }
  // decision.decision === 'block'
  if (mode === 'shadow') {
    process.stderr.write(`[test-quality-gate] shadow: would block — ${decision.reason}\n`);
    return approve();
  }
  block(decision.reason!);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(`[test-quality-gate] soft-tier error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(0);
  });
}
