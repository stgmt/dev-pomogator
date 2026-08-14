/**
 * skeptic-ab.mjs — A/B compare advisor guidance: strict (old) vs balanced (new) on the SAME session.
 *
 * Runs twoPassConsult twice on the same digest with skeptic=strict and skeptic=balanced, then prints
 * both guidances + an automated comparison (whether "don't declare done" is reflexively present,
 * whether the answer is a genuine verdict vs a canned block).
 *
 * Usage:
 *   npx tsx tools/advisor/bench/skeptic-ab.mjs            # top-1 big session
 *   npx tsx tools/advisor/bench/skeptic-ab.mjs --path <f> # specific session
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSessionDigest, renderDigestPrioritized, twoPassConsult, buildPass2Prompt, buildPass1Prompt } from '../session-digest.mjs';
import { callModel } from '../session-digest.mjs';

const REPO = 'E:/repos/dev-pomogator';
const PROJECT = path.join(os.homedir(), '.claude', 'projects', 'E--repos-dev-pomogator');

function pick() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--path');
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  const all = fs.readdirSync(PROJECT)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => path.join(PROJECT, f))
    .filter((f) => { const s = fs.statSync(f); return s.size > 100000 && s.size < 20_000_000; })
    .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
  return all[0];
}

const f = pick();
console.log('session:', path.basename(f));
const d = await buildSessionDigest({ transcriptPath: f, repoRoot: REPO });
const rendered = renderDigestPrioritized(d, {}).text;
console.log(`digest chars=${rendered.length} (raw ${d.rawLen})`);

// Precompute pass1 ONCE and reuse it for both — so pass2 is the only variable.
const p1 = await callModel(buildPass1Prompt(rendered), { model: process.env.ADVISOR_SUMMARIZER_MODEL ?? 'gpt-5.6-luna', maxTokens: 700, timeoutMs: 45000 });
if (!p1.ok) { console.log('pass1 failed:', p1.text); process.exit(1); }
const report = p1.text;

const results = {};
for (const skeptic of ['strict', 'balanced']) {
  const p2 = await callModel(buildPass2Prompt(rendered, report, { skeptic }), { model: process.env.ADVISOR_MODEL ?? 'gpt-5.6-sol', maxTokens: 800, timeoutMs: 45000 });
  const g = p2.ok ? p2.text : `[$p2 ERROR: ${p2.text}]`;
  results[skeptic] = g;
  console.log(`\n===== ${skeptic.toUpperCase()} =====\n${g}`);
}

// automated comparison
const BLOCK_RE = /(don[’']t declare\s+(?:it\s+)?done|do not declare\b|not\s+done\s+yet|premature|completion\s+is\s+premature)/i;
const SOUND_RE = /(looks?\s+(?:sound|complete|reasonable|mechanically\s+complete)|appears?\s+(?:sound|complete)\b|confirmed\s+complete|work\s+is\s+complete)/i;
console.log('\n===== COMPARISON =====');
for (const s of ['strict', 'balanced']) {
  const g = results[s];
  console.log(`${s}: block-claim=${BLOCK_RE.test(g)} · sound-claim=${SOUND_RE.test(g)} · len=${g.length} · bullying="${(g.match(/don[’']t declare\b/i) ?? [])[0] ?? ''}"`);
}