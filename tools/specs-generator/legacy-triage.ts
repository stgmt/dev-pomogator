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
import { buildGraphFromCwd } from '../spec-graph/builder.ts';
import { specOf } from '../spec-graph/coverage.ts';
import type { SpecGraph, ScenarioNode } from '../spec-graph/types.ts';

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

  candidates.sort((a, b) => b.scenarioCount - a.scenarioCount || a.file.localeCompare(b.file));
  return { corpusRoot, candidates };
}

const ICON: Record<LegacyState, string> = {
  SUPERSEDED: '♻️', REMOVED: '🗑️', DRIFTED: '✏️', ABSORBED: '🔀', NEEDS_HUMAN: '❓',
};

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
  const root = path.resolve(argv.find((a) => !a.startsWith('-')) ?? process.cwd());
  const report = computeLegacyTriage(buildGraphFromCwd(root), root);
  console.log(json ? JSON.stringify(report, null, 2) : renderTriage(report));
  process.exit(0);
}
