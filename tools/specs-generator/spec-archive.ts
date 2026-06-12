// spec-archive — proof-gated archival agent (engine-CLI, FR-45).
//
// Combines the `legacy-triage` SUSPICION (is the spec retired?) with the MCP
// door's `get_archival_proof` (is it SAFE — no live spec still references it?).
// Spec work goes THROUGH the door tools (built in-process here — same handlers
// the server exposes); git / orphan-test removal / reports are the caller's Bash.
//
// Decision per candidate:
//   ARCHIVE            — proof=ARCHIVE (no live refs) AND supersession ∈
//                        {SUPERSEDED, REMOVED, ABSORBED}. Acts on --apply.
//   KEEP_FALSE_POSITIVE— proof=KEEP_FALSE_POSITIVE (live refs → actually in use,
//                        the "наоборот ошибка"). Never touched.
//   NEEDS_HUMAN        — graph-clear but supersession ambiguous (DRIFTED / NEEDS_HUMAN),
//                        or the proof errored. Escalate; never touched.
//
// DEFAULT = DRY (print the plan). `--apply` executes archive_spec for ARCHIVE
// decisions (autonomous on hard proof; ambiguous is never auto-acted — FR-43c
// evolved). git revert is the undo; an audit line is written by archive_spec.
//
// @see .specs/spec-generator-v4/FR.md FR-45

import { pathToFileURL } from 'node:url';
import { buildGraphFromCwd } from '../spec-graph/builder.ts';
import { computeLegacyTriage } from './legacy-triage.ts';
import { buildToolRegistry } from '../spec-mcp-server/tools.ts';

export type ArchiveDecision = 'ARCHIVE' | 'KEEP_FALSE_POSITIVE' | 'NEEDS_HUMAN';

export interface ArchivePlan {
  spec: string;
  legacyState: string;
  proofVerdict: string;
  decision: ArchiveDecision;
  liveInbound: number;
  why: string;
}

const RETIRE_STATES = new Set(['SUPERSEDED', 'REMOVED', 'ABSORBED']);

/** Build the prove-then-decide plan over the live corpus. No disk mutation. */
export async function planArchival(cwd: string): Promise<ArchivePlan[]> {
  const graph = buildGraphFromCwd(cwd);
  const reg = buildToolRegistry(() => graph, {});
  const proofTool = reg.find((t) => t.name === 'get_archival_proof')!;
  const callProof = async (slug: string): Promise<Record<string, unknown>> =>
    JSON.parse((await proofTool.handler({ slug } as never) as { content: Array<{ text: string }> }).content[0].text);

  const triage = computeLegacyTriage(graph, cwd);
  const out: ArchivePlan[] = [];
  const seen = new Set<string>();
  for (const c of triage.candidates) {
    if (!c.spec || seen.has(c.spec)) continue;
    seen.add(c.spec);
    const proof = await callProof(c.spec);
    let decision: ArchiveDecision;
    let why: string;
    const verdict = String(proof.verdict ?? proof.error ?? 'UNKNOWN');
    const liveInbound = Number(proof.live_inbound_count ?? 0);
    if (proof.ok !== true) {
      decision = 'NEEDS_HUMAN';
      why = `proof error: ${proof.error}`;
    } else if (verdict === 'KEEP_FALSE_POSITIVE') {
      decision = 'KEEP_FALSE_POSITIVE';
      why = `${liveInbound} live inbound ref(s) — the spec is still in use`;
    } else if (RETIRE_STATES.has(c.suspected)) {
      decision = 'ARCHIVE';
      why = `no live refs + supersession=${c.suspected}`;
    } else {
      decision = 'NEEDS_HUMAN';
      why = `graph-clear but supersession=${c.suspected} (ambiguous)`;
    }
    out.push({ spec: c.spec, legacyState: c.suspected, proofVerdict: verdict, decision, liveInbound, why });
  }
  return out;
}

/** Execute ARCHIVE decisions via the door's archive_spec (autonomous on hard proof). */
export async function applyArchival(cwd: string, plans: ArchivePlan[]): Promise<Array<{ spec: string; ok: boolean; detail: string }>> {
  const graph = buildGraphFromCwd(cwd);
  const reg = buildToolRegistry(() => graph, {});
  const archiveTool = reg.find((t) => t.name === 'archive_spec')!;
  const results: Array<{ spec: string; ok: boolean; detail: string }> = [];
  for (const p of plans) {
    if (p.decision !== 'ARCHIVE') continue;
    const r = JSON.parse((await archiveTool.handler({ slug: p.spec, reason: p.why } as never) as { content: Array<{ text: string }> }).content[0].text);
    results.push({ spec: p.spec, ok: r.ok === true, detail: r.ok === true ? `→ ${r.to}` : String(r.error) });
  }
  return results;
}

function render(plans: ArchivePlan[]): string {
  const by = (d: ArchiveDecision): number => plans.filter((p) => p.decision === d).length;
  const lines = [`spec-archive — ${plans.length} candidate(s): ARCHIVE=${by('ARCHIVE')} KEEP_FALSE_POSITIVE=${by('KEEP_FALSE_POSITIVE')} NEEDS_HUMAN=${by('NEEDS_HUMAN')}`];
  for (const p of plans.sort((a, b) => a.decision.localeCompare(b.decision))) {
    lines.push(`  [${p.decision}] ${p.spec} — ${p.why} (legacy=${p.legacyState}, proof=${p.proofVerdict})`);
  }
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apply = process.argv.includes('--apply');
  const cwd = process.cwd();
  planArchival(cwd).then(async (plans) => {
    process.stdout.write(render(plans) + '\n');
    if (apply) {
      const res = await applyArchival(cwd, plans);
      for (const r of res) process.stdout.write(`  apply ${r.spec}: ${r.ok ? 'OK' : 'FAIL'} ${r.detail}\n`);
      process.stdout.write('Remember: commit the move with git; prune orphaned tests + write the report.\n');
    } else {
      process.stdout.write('(dry-run — pass --apply to archive the ARCHIVE decisions)\n');
    }
  }).catch((e) => {
    process.stderr.write(`spec-archive failed: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
}
