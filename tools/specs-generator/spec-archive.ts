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

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildGraphFromCwd } from '../spec-graph/builder.ts';
import { computeLegacyTriage } from './legacy-triage.ts';
import { buildToolRegistry } from '../spec-mcp-server/tools.ts';

export type ArchiveDecision = 'ARCHIVE' | 'KEEP_FALSE_POSITIVE' | 'NEEDS_HUMAN';

/** What a human learns by actually opening a drifted spec: what it is, whether its
 *  claimed implementation still exists on disk (even after the v1→v2 move), and a call. */
export interface DriftInvestigation {
  summary: string;
  shipped: boolean;
  codePresent: boolean;
  evidence: string;
  recommendation: 'KEEP_DRIFTED' | 'RETIRE_CANDIDATE';
}

export interface ArchivePlan {
  spec: string;
  legacyState: string;
  proofVerdict: string;
  decision: ArchiveDecision;
  liveInbound: number;
  why: string;
  investigation?: DriftInvestigation;
}

const RETIRE_STATES = new Set(['SUPERSEDED', 'REMOVED', 'ABSORBED']);

// Code-path tokens the way specs write them (incl. the legacy `extensions/<plugin>/` prefix).
const CODE_PATH_RE = /(?:tools|extensions|src|\.claude|tests|scripts)\/[\w./-]+\.(?:ts|tsx|py|mjs|cjs|js|cs|go|rs)/g;

const _basenameIndex = new Map<string, Set<string>>();
/** Every code-file basename under the live source roots — basename match catches files
 *  the v2 refactor MOVED (`extensions/X/foo.ts` → `tools/X/foo.ts`) without a path equality. */
function repoBasenames(cwd: string): Set<string> {
  const cached = _basenameIndex.get(cwd);
  if (cached) return cached;
  const idx = new Set<string>();
  for (const root of ['tools', '.claude', 'tests', 'scripts', 'src']) {
    const abs = path.join(cwd, root);
    if (!fs.existsSync(abs)) continue;
    try {
      for (const e of fs.readdirSync(abs, { recursive: true, withFileTypes: true }) as fs.Dirent[]) {
        if (e.isFile()) idx.add(e.name);
      }
    } catch { /* unreadable root — skip */ }
  }
  _basenameIndex.set(cwd, idx);
  return idx;
}

/**
 * Investigate a NEEDS_HUMAN (drifted) spec the way a human would: read its README +
 * FILE_CHANGES, decide whether the feature is shipped / its impl still lives on disk
 * (even at a moved path), and recommend KEEP_DRIFTED (alive, spec text stale) vs
 * RETIRE_CANDIDATE (no impl found — confirm). Replaces blind "needs human" with evidence.
 */
export function investigateDrifted(cwd: string, slug: string): DriftInvestigation {
  const read = (doc: string): string => {
    try { return fs.readFileSync(path.join(cwd, '.specs', slug, doc), 'utf8'); } catch { return ''; }
  };
  const readme = read('README.md');
  const blob = readme + '\n' + read('FILE_CHANGES.md');
  const summary = (readme.split('\n').find((l) => l.trim() && !l.startsWith('#') && !l.startsWith('>')) ?? '').trim().slice(0, 200);
  const shipped = /status:\s*shipped|\bshipped\s+\d/i.test(readme);
  const claimed = [...new Set(blob.match(CODE_PATH_RE) ?? [])];
  const names = repoBasenames(cwd);
  const found = claimed.filter((p) => fs.existsSync(path.join(cwd, p)) || names.has(path.basename(p))).map((p) => path.basename(p));
  const codePresent = found.length > 0;
  const recommendation = shipped || codePresent ? 'KEEP_DRIFTED' : 'RETIRE_CANDIDATE';
  const evidence = shipped
    ? `README marks shipped${codePresent ? `; impl present (${found.slice(0, 3).join(', ')})` : ''}`
    : codePresent
      ? `impl files still on disk (${found.slice(0, 3).join(', ')}${found.length > 3 ? `, +${found.length - 3}` : ''}) — spec path drifted, feature lives`
      : claimed.length
        ? `none of ${claimed.length} claimed impl file(s) found on disk — possibly retired, confirm`
        : `no impl paths in README/FILE_CHANGES — cannot tell from disk, confirm`;
  return { summary, shipped, codePresent, evidence, recommendation };
}

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
    const investigation = decision === 'NEEDS_HUMAN' ? investigateDrifted(cwd, c.spec) : undefined;
    out.push({ spec: c.spec, legacyState: c.suspected, proofVerdict: verdict, decision, liveInbound, why, investigation });
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
    if (p.investigation) {
      const inv = p.investigation;
      lines.push(`      → ${inv.recommendation}: ${inv.evidence}`);
      if (inv.summary) lines.push(`        what: ${inv.summary}`);
    }
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
