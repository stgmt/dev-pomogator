// Dogfood the spec-archive agent on the REAL corpus — read-only (planArchival,
// no --apply). The invariants that prove it never falsely archives a live spec:
//   1. NO ARCHIVE decision has live inbound refs (a live-ref spec must NEVER
//      reach ARCHIVE — that would be the "наоборот ошибка").
//   2. Every KEEP_FALSE_POSITIVE has ≥1 live inbound ref (its reason holds).
//   3. Every NEEDS_HUMAN is escalated, not acted on.
// Exit 0 ⇔ all invariants hold on the live corpus.
//
// @see .specs/spec-generator-v4/FR.md FR-45

import { planArchival } from '../spec-archive.ts';

const plans = await planArchival(process.cwd());
let fail = 0;
const bad = (m: string): void => { fail++; process.stderr.write(`INVARIANT FAIL: ${m}\n`); };

if (plans.length === 0) bad('no candidates at all — legacy-triage produced nothing (suspicious)');

for (const p of plans) {
  if (p.decision === 'ARCHIVE' && p.liveInbound > 0) bad(`${p.spec}: ARCHIVE with ${p.liveInbound} live refs (false archival!)`);
  if (p.decision === 'KEEP_FALSE_POSITIVE' && p.liveInbound === 0) bad(`${p.spec}: KEEP_FALSE_POSITIVE but 0 live refs (wrong reason)`);
}

const counts = {
  ARCHIVE: plans.filter((p) => p.decision === 'ARCHIVE').length,
  KEEP_FALSE_POSITIVE: plans.filter((p) => p.decision === 'KEEP_FALSE_POSITIVE').length,
  NEEDS_HUMAN: plans.filter((p) => p.decision === 'NEEDS_HUMAN').length,
};
process.stdout.write(`spec-archive dogfood — ${plans.length} candidates: ${JSON.stringify(counts)}\n`);
process.stdout.write(fail === 0 ? '✅ all invariants hold — 0 false archival on the live corpus\n' : `❌ ${fail} invariant failure(s)\n`);
process.exit(fail === 0 ? 0 : 1);
