#!/usr/bin/env npx tsx
/**
 * legacy-triage — 4-state legacy/drift SUSPICION classifier (FR-43, Phase 18).
 *
 * Surfaces spec docs that look abandoned and SUSPECTS which of four kinds of
 * abandonment each is — it NEVER auto-retires (FR-43c: compute suspicion → triage
 * report → a human confirms). It is a COMPOSER over signals that already exist
 * (the one graph's not_run-by-feature + version-lineage + the file's own header),
 * NOT a new engine (FR-43b forbids a second validator).
 *
 * Four states (FR-43a), each with a DIFFERENT action:
 *   SUPERSEDED  a newer version (vN→vN+1) covers the same scenarios → archive.
 *   REMOVED     the claimed implementation is gone from disk → archive/delete.
 *   DRIFTED     code exists & works, the spec lies about HOW → UPDATE the spec
 *               (NOT legacy — the default for "all refactored", never retire).
 *   ABSORBED    the scenarios moved into another subsystem → redirect/merge.
 *
 * Trigger incident: `legacy-v3.feature` (28 SPECGEN003 scenarios, persistently
 * not_run inside the v4 spec) surfaced on the NOT_RUN audit — the textbook
 * SUPERSEDED case (the file header itself records the v3→v4 consolidation).
 *
 * Run:  node --import tsx tools/specs-generator/legacy-triage.ts [corpusRoot] [--json]
 * Exit: 0 always (a triage report is advisory, never a gate — FR-43c HITL).
 *
 * @see .specs/spec-generator-v4/FR.md FR-43
 * @see .claude/skills/spec-reality-check/SKILL.md (the reality-drift signal it reuses)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildGraphFromCwd } from '../spec-graph/builder.ts';
import { specOf } from '../spec-graph/coverage.ts';
import type { SpecGraph, ScenarioNode } from '../spec-graph/types.ts';
import { judgeLegacyState, type JudgedState } from './legacy-judge.ts';
// FR-43b: the "is the implementation still on disk?" signal is REUSED from
// spec-reality-check (its FILE_CHANGES reality checks), not re-built here.
import { parseFileChangesTable, checkFcRows } from '../../.claude/skills/spec-reality-check/scripts/verify.ts';

export type LegacyState = 'SUPERSEDED' | 'REMOVED' | 'DRIFTED' | 'ABSORBED' | 'NEEDS_HUMAN';

export interface LegacyCandidate {
  /** Repo-relative POSIX path of the suspected file. */
  file: string;
  spec?: string;
  scenarioCount: number;
  /** Every scenario of the file is not_run (no result in the last run). */
  allNotRun: boolean;
  /** Suspected state — SUSPICION only; a human confirms (FR-43c). */
  suspected: LegacyState;
  /** The signals that produced the suspicion, for the human to weigh. */
  signals: string[];
  /** Claimed-but-missing FILE_CHANGES paths (DRIFTED candidates) — the LLM-judge input. */
  missingPaths?: string[];
  /** The action FR-43a prescribes for the suspected state. */
  recommendedAction: string;
}

export interface TriageReport {
  corpusRoot: string;
  candidates: LegacyCandidate[];
}

const ACTION: Record<LegacyState, string> = {
  SUPERSEDED: 'archive (move to .specs/archive/) + record supersedes marker',
  REMOVED: 'archive/delete — the claimed implementation is gone',
  DRIFTED: 'UPDATE the spec to match the code (re-sync) — NOT a retirement',
  ABSORBED: 'redirect/merge the requirements into the absorbing subsystem',
  NEEDS_HUMAN: 'a human must classify — signals are inconclusive (FR-43c)',
};

/** Highest SPECGEN version a feature file references (e.g. SPECGEN003 → 3), or null. */
function scenarioVersion(scenarios: ScenarioNode[]): number | null {
  let max: number | null = null;
  for (const s of scenarios) {
    const m = s.id.match(/specgen0*(\d+)/i);
    if (m) max = Math.max(max ?? 0, Number(m[1]));
  }
  return max;
}

/** The version a spec slug claims (…-v4 / …v4 → 4), or null. */
function slugVersion(spec: string | undefined): number | null {
  const m = spec?.match(/v(\d+)\b/i);
  return m ? Number(m[1]) : null;
}

const LINEAGE_RE = /\b(consolidat|superseded|legacy|preserved|migrated|v\d+\s*[→-]+>?\s*v\d+|устар|наследи)/i;

/** Read the head of a file (cheap) to catch a self-documented lineage note. */
function headerHint(repoRoot: string, relFile: string): string | null {
  try {
    const head = fs.readFileSync(path.join(repoRoot, relFile), 'utf-8').split(/\r?\n/).slice(0, 12).join('\n');
    return LINEAGE_RE.test(head) ? head.replace(/\s+/g, ' ').trim().slice(0, 160) : null;
  } catch {
    return null;
  }
}

/**
 * REMOVED / DRIFTED signal (FR-43a) — REUSE spec-reality-check's FILE_CHANGES
 * reality check (FR-43b): how much of a spec's CLAIMED implementation still
 * exists on disk. Whole impl gone → REMOVED; partly gone → DRIFTED (re-sync, the
 * FR-43a default — NOT a retirement); mostly present → healthy (no candidate).
 */
function specImplReality(
  corpusRoot: string,
  slug: string,
): { editDelete: number; missing: number; existRatio: number; missingPaths: string[] } | null {
  const fc = path.join(corpusRoot, '.specs', slug, 'FILE_CHANGES.md');
  if (!fs.existsSync(fc)) return null;
  let rows;
  try {
    rows = parseFileChangesTable(fs.readFileSync(fc, 'utf-8')).rows;
  } catch {
    return null;
  }
  const editDelete = rows.filter((r) => r.action === 'edit' || r.action === 'delete').length;
  if (editDelete < 4) return null; // too few claimed-existing paths to judge abandonment
  const findings = checkFcRows(rows, corpusRoot);
  const missingFindings = findings.filter((f) => f.check === 'FC_EDIT_MISSING' || f.check === 'FC_DELETE_MISSING');
  const missingPaths = missingFindings
    .map((f) => (f as { file?: string }).file)
    .filter((p): p is string => Boolean(p));
  return { editDelete, missing: missingFindings.length, existRatio: (editDelete - missingFindings.length) / editDelete, missingPaths };
}

export function computeLegacyTriage(graph: SpecGraph, corpusRoot: string): TriageReport {
  // Group scenarios by their feature file.
  const byFile = new Map<string, ScenarioNode[]>();
  for (const n of graph.nodes.values()) {
    if (n.type !== 'Scenario') continue;
    const s = n as ScenarioNode;
    const f = String(s.file).replace(/\\/g, '/');
    const list = byFile.get(f);
    if (list) list.push(s);
    else byFile.set(f, [s]);
  }

  const candidates: LegacyCandidate[] = [];
  for (const [file, scenarios] of byFile) {
    const allNotRun = scenarios.every((s) => !s.lastResult);
    if (!allNotRun) continue; // a file with live results is not an abandonment candidate

    const spec = specOf(file);
    const scenV = scenarioVersion(scenarios);
    const slugV = slugVersion(spec);
    // version-older = the file's scenarios belong to an OLDER version than the spec
    // that now hosts them (v3 ids inside a v4 spec) → a newer version absorbed them.
    const versionOlder = scenV !== null && slugV !== null && scenV < slugV;
    const hdr = headerHint(corpusRoot, file);

    // PRECONDITION GATE: not_run ALONE is not abandonment — most feature files are
    // simply run by a DIFFERENT test config (other plugins / suites), not retired.
    // A SUSPECT needs a POSITIVE signal: an older-version id set OR a self-documented
    // lineage header. No positive signal → not a candidate (avoids the 107-file flood).
    if (!versionOlder && !hdr) continue;

    const signals: string[] = [`all ${scenarios.length} scenarios persistently not_run (not in the test config)`];
    let suspected: LegacyState = 'NEEDS_HUMAN';
    if (versionOlder) {
      suspected = 'SUPERSEDED';
      signals.push(`scenario ids are SPECGEN00${scenV} but the spec is v${slugV} — an older version's scenarios inside the newer spec`);
    }
    if (hdr) {
      signals.push(`file header records its own lineage: "${hdr}"`);
      if (suspected === 'NEEDS_HUMAN') suspected = 'SUPERSEDED'; // header alone is suggestive, not proof
    }

    candidates.push({
      file,
      spec,
      scenarioCount: scenarios.length,
      allNotRun,
      suspected,
      signals,
      recommendedAction: ACTION[suspected],
    });
  }

  // Spec-level reality drift (REMOVED / DRIFTED) — a SECOND dimension beyond the
  // orphaned-feature scan above: a spec whose claimed implementation is gone/stale.
  const flaggedFiles = new Set(candidates.map((c) => c.file));
  const specs = new Set<string>();
  for (const n of graph.nodes.values()) if (n.spec) specs.add(n.spec);
  for (const slug of specs) {
    const r = specImplReality(corpusRoot, slug);
    if (!r) continue;
    if (r.existRatio >= 0.8) continue; // ≥80% of the claimed implementation exists → healthy
    // FR-43a DEFAULT = DRIFTED, never auto-REMOVED. A MISSING FILE_CHANGES path proves
    // the spec is STALE about its implementation, but CANNOT tell "deleted" from "moved"
    // (e.g. the v2 migration relocated extensions/* → .claude/*, tools/* — proven on
    // worktree-setup/pomogator-doctor: live features, stale paths). REMOVED needs a
    // git-delete signal (deferred); from path-existence alone we only assert DRIFTED.
    const suspected: LegacyState = 'DRIFTED';
    const file = `.specs/${slug}/FILE_CHANGES.md`;
    if (flaggedFiles.has(file)) continue;
    candidates.push({
      file,
      spec: slug,
      scenarioCount: 0,
      allNotRun: false,
      suspected,
      signals: [
        `${r.missing}/${r.editDelete} claimed edit/delete implementation paths are MISSING on disk (${Math.round(r.existRatio * 100)}% still exist) — spec-reality-check FILE_CHANGES drift`,
        'the spec is STALE about WHERE its code lives (often a refactor/migration the spec never tracked) — UPDATE the FILE_CHANGES paths (re-sync), do NOT retire (FR-43a default); REMOVED would need git-delete proof, not a missing path',
      ],
      missingPaths: r.missingPaths,
      recommendedAction: ACTION[suspected],
    });
  }

  candidates.sort((a, b) => b.scenarioCount - a.scenarioCount || a.file.localeCompare(b.file));
  return { corpusRoot, candidates };
}

const ICON: Record<LegacyState, string> = {
  SUPERSEDED: '♻️', REMOVED: '🗑️', DRIFTED: '✏️', ABSORBED: '🔀', NEEDS_HUMAN: '❓',
};

// ── LLM-judge escalation (FR-8 idiom) — opt-in, cached, degrades when no binary ──
const JUDGE_CACHE = path.join('.dev-pomogator', '.legacy-judge-cache.json');
type JudgeCache = Record<string, { state: JudgedState; why: string }>;
function loadJudgeCache(root: string): JudgeCache {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, JUDGE_CACHE), 'utf-8')) as JudgeCache;
  } catch {
    return {};
  }
}
function saveJudgeCache(root: string, c: JudgeCache): void {
  try {
    fs.mkdirSync(path.dirname(path.join(root, JUDGE_CACHE)), { recursive: true });
    fs.writeFileSync(path.join(root, JUDGE_CACHE), JSON.stringify(c, null, 2));
  } catch {
    /* best-effort cache */
  }
}

/**
 * Escalate each DRIFTED candidate (missing FILE_CHANGES paths — ambiguous between
 * moved/removed/absorbed) to the LLM judge, refining the state with EVIDENCE. The
 * judge maps MOVED→DRIFTED (re-sync the paths, NOT retire), REMOVED→REMOVED,
 * ABSORBED→ABSORBED. Cached by (spec, missing-paths-hash) — the spawn is ~14s/call.
 * Degrades honestly: no `claude` binary / unparseable → the candidate KEEPS its
 * deterministic DRIFTED (FR-37c — never fabricate a verdict).
 */
export async function refineWithJudge(
  report: TriageReport,
  repoRoot: string,
  opts: { spawn?: (prompt: string) => Promise<string>; noCache?: boolean } = {},
): Promise<TriageReport> {
  const cache = opts.noCache ? {} : loadJudgeCache(repoRoot);
  let spawned = 0;
  for (const c of report.candidates) {
    if (c.suspected !== 'DRIFTED' || !c.missingPaths?.length || !c.spec) continue;
    const key = `${c.spec}:${crypto.createHash('sha256').update(c.missingPaths.join('|')).digest('hex').slice(0, 16)}`;
    let v = cache[key];
    if (!v) {
      const res = await judgeLegacyState({ repoRoot, slug: c.spec, missingPaths: c.missingPaths, spawn: opts.spawn });
      if (!res.ran) {
        c.signals.push(`LLM judge: ${res.why} — kept DRIFTED (deterministic default, FR-37c)`);
        continue;
      }
      v = { state: res.state, why: res.why };
      cache[key] = v;
      spawned++;
    }
    const mapped: LegacyState = v.state === 'REMOVED' ? 'REMOVED' : v.state === 'ABSORBED' ? 'ABSORBED' : 'DRIFTED';
    c.suspected = mapped;
    c.recommendedAction = ACTION[mapped];
    c.signals.push(`LLM judge (FR-8, claude -p): ${v.state} — ${v.why}`);
  }
  if (spawned && !opts.noCache) saveJudgeCache(repoRoot, cache);
  return report;
}

export function renderTriage(r: TriageReport): string {
  const lines: string[] = [];
  lines.push(`═══ legacy-triage (FR-43 SUSPICION — a human confirms, never auto-retire) — ${r.corpusRoot} ═══`);
  if (r.candidates.length === 0) {
    lines.push('No abandonment candidates — every feature file has live results.');
    return lines.join('\n');
  }
  lines.push(`${r.candidates.length} candidate(s):`);
  for (const c of r.candidates) {
    lines.push(`\n  ${ICON[c.suspected]} ${c.suspected}  ${c.file}  (${c.scenarioCount} scenarios)`);
    for (const s of c.signals) lines.push(`     · ${s}`);
    lines.push(`     → action: ${c.recommendedAction}`);
  }
  lines.push('\nSUSPICION only. Confirm each with a human before acting (FR-43c); DRIFTED means UPDATE the spec, not retire.');
  return lines.join('\n');
}

const isDirectRun =
  process.argv[1]?.endsWith('legacy-triage.ts') || process.argv[1]?.endsWith('legacy-triage.js');
if (isDirectRun) {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const judge = argv.includes('--judge'); // opt-in LLM escalation (claude -p, ~14s/spec, cached)
  const root = path.resolve(argv.find((a) => !a.startsWith('-')) ?? process.cwd());
  let report = computeLegacyTriage(buildGraphFromCwd(root), root);
  if (judge) report = await refineWithJudge(report, root);
  console.log(json ? JSON.stringify(report, null, 2) : renderTriage(report));
  process.exit(0);
}
