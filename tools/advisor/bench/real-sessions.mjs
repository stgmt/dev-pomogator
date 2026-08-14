/**
 * real-sessions.mjs — bench the advisor's context engine on REAL session transcripts.
 *
 * Two levels:
 *   1. OFFLINE (always): per transcript run buildSessionDigest + renderDigestPrioritized and
 *      report the compression + which layers surfaced (plan/drift/repo-rules/self-check/errors).
 *   2. ONLINE (--live): additionally run the two-pass consult (summarizer + advisor) and capture
 *      the guidance + evidence terms. Needs ANTHROPIC_BASE_URL + token + budget; each live run
 *      costs a couple of model calls, so --limit caps it.
 *
 * Usage:
 *   npx tsx tools/advisor/bench/real-sessions.mjs                          # offline, top 6 by size
 *   npx tsx tools/advisor/bench/real-sessions.mjs --limit 3                # offline, 3 smallest
 *   npx tsx tools/advisor/bench/real-sessions.mjs --live --limit 2         # offline + live two-pass on 2
 *   npx tsx tools/advisor/bench/real-sessions.mjs --path <file>            # single file
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSessionDigest, renderDigestPrioritized, twoPassConsult } from '../session-digest.mjs';

const REPO = process.env.ADVISOR_BENCH_REPO || 'E:/repos/dev-pomogator';
const PROJECT_DIR = path.join(os.homedir(), '.claude', 'projects', 'E--repos-dev-pomogator');
const LAYER_RE = /GOAL|RECENT ACTIVITY|REPO RULES|RECURRING|FILES TOUCHED|COMMANDS|GIT SELF-CHECK|SELF-CHECK PROBLEMS/;

const EVIDENCE_TERMS = /(st\.?|seen|added|banned|must|should|verify|check|git |diff|file|error|exit|rule|probe|transcript|tool)/i;

function pickFiles() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--path');
  if (idx !== -1 && args[idx + 1]) return [args[idx + 1]];
  if (!fs.existsSync(PROJECT_DIR)) return [];
  const all = fs.readdirSync(PROJECT_DIR)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => path.join(PROJECT_DIR, f))
    .filter((f) => {
      const st = fs.statSync(f);
      return st.size > 10000 && st.size < (args.includes('--all') ? 60_000_000 : 20_000_000);
    });
  const sizeAsc = args.includes('--limit');
  let limit = Number(args[args.indexOf('--limit') + 1] || 6);
  let mode = 'top'; // default: biggest
  if (args.includes('--all')) mode = 'all';
  else if (sizeAsc) mode = 'smallest';
  else if (args.includes('--top')) mode = 'top';
  if (args.includes('--top')) limit = Number(args[args.indexOf('--top') + 1] || 6);
  if (mode === 'all') return all;
  if (mode === 'smallest') return all.sort((a, b) => fs.statSync(a).size - fs.statSync(b).size).slice(0, limit);
  return all.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size).slice(0, limit);
}

async function main() {
  const files = pickFiles();
  const live = process.argv.includes('--live');
  const rows = [];

  for (const f of files) {
    const name = path.basename(f);
    const t0 = Date.now();
    let d;
    try {
      d = await buildSessionDigest({ transcriptPath: f, repoRoot: REPO });
    } catch (e) {
      rows.push({ name, error: String(e).slice(0, 120) });
      continue;
    }
    const tDigest = Date.now() - t0;
    const r = renderDigestPrioritized(d, {});
    const layers = r.text.split('\n').filter((l) => LAYER_RE.test(l)).map((l) => l.replace(/^##\s*/, '').split(' ')[0]);
    const rel = (d.rawLen ? ((r.text.length / d.rawLen) * 100).toFixed(1) : '-');

    const row = {
      name,
      digestMs: tDigest,
      rawChars: d.rawLen,
      digestChars: r.text.length,
      ratio: `${rel}%`,
      kept: r.kept, compact: r.compact, omitted: r.omitted, budget: r.maxTokens,
      layers: [...new Set(layers)].join(','),
      plan: Boolean(d.goals?.plan), drift: Boolean(d.goals?.drift),
      planSteps: d.goals?.plan?.outline ? d.goals.plan.outline.split('\n').length : 0,
      repoRules: d.repoRules?.entries?.length ?? 0,
      git: Boolean(d.selfCheck?.git), gitStatusLines: d.selfCheck?.git?.statusLines ?? 0,
      gitProblems: d.selfCheck?.problems?.length ?? 0,
      files: d.fast?.files?.length ?? 0,
      recurring: d.fast?.recurring?.length ?? 0,
      errors: d.fast?.errResults ?? 0,
    };
    // quality = how much of the "decision-relevant" surface survived + how much was dropped
    row.q = (row.plan ? 1 : 0) + (row.drift ? 1 : 0) + (row.recurring > 0 ? 1 : 0) + (row.git ? 1 : 0) + (row.repoRules > 0 ? 1 : 0)
      - Math.min(row.omitted, 5) * 0.2;
    row.q = row.q.toFixed(2);

    if (live) {
      const tL = Date.now();
      const res = await twoPassConsult(r.text, {});
      row.liveMs = Date.now() - tL;
      row.liveOk = res.ok;
      row.reportLen = res.report?.length ?? 0;
      row.guidanceLen = res.guidance?.length ?? 0;
      row.evidence = res.guidance ? (EVIDENCE_TERMS.test(res.guidance) ? 'yes' : 'no') : '-';
      row.guidanceHead = res.guidance ? res.guidance.replace(/\s+/g, ' ').slice(0, 220) : (res.error ?? '').slice(0, 120);
    }
    rows.push(row);
    console.log(`done ${name} raw=${row.rawChars} → ${row.digestChars} (${row.ratio}) ${row.layers}`);
  }

  console.log('\n================ SUMMARY ================');
  const cols = ['name', 'ratio', 'q', 'kept', 'compact', 'omitted', 'planSteps', 'repoRules', 'recurring', 'digestMs'];
  if (live) cols.push('liveMs', 'liveOk', 'guidanceLen', 'evidence');
  console.log(cols.map((c) => c.padEnd(12)).join(''));
  for (const r of rows) {
    if (r.error) { console.log(`${r.name.padEnd(12)} ERROR ${r.error}`); continue; }
    const v = {
      name: r.name, ratio: r.ratio, q: r.q, kept: r.kept, compact: r.compact, omitted: r.omitted,
      planSteps: r.planSteps, repoRules: r.repoRules, recurring: r.recurring, digestMs: `${r.digestMs}ms`,
    };
    console.log(cols.map((c) => String(v[c] ?? (r[c] ?? '-')).padEnd(12)).join(''));
  }
  if (live) {
    console.log('\n--- guidance heads ---');
    for (const r of rows) {
      if (!r.guidanceHead) continue;
      console.log(`\n[${r.name}] ${r.guidanceHead}…`);
    }
  }
}

void main();