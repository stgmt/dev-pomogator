#!/usr/bin/env node
/**
 * Corpus-wide spec-conformance sweep.
 * Enumerates every live spec dir (marker: <slug>_SCHEMA.md), runs the CANONICAL
 * smart verdict (tools/specs-generator/spec-verdict.ts, --no-semantic = deterministic
 * audit+traceability+conformance+coverage pass) per spec, and prints ONLY the
 * aggregated table. Full detail → audit-reports/corpus-verdict.json.
 */
'use strict';
const { readdirSync, statSync, writeFileSync } = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = process.cwd();
const SPECS = path.join(ROOT, '.specs');
const SKIP_GROUPS = new Set(['archive']);

// --- enumerate spec dirs by <slug>_SCHEMA.md marker (recursive, skips archive) ---
function isDir(p) { try { return statSync(p).isDirectory(); } catch { return false; } }
function findSpecDirs(dir, depth) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e.startsWith('.') || e === '_artifact') continue;
    const p = path.join(dir, e);
    if (!isDir(p)) continue;
    if (depth === 0 && SKIP_GROUPS.has(e)) continue; // sealed archive
    const hasSchema = readdirSync(p).some(f => f.endsWith('_SCHEMA.md'));
    if (hasSchema) out.push(p);
    else if (depth < 2) out.push(...findSpecDirs(p, depth + 1)); // group dir (e.g. backlog/)
  }
  return out;
}

const specDirs = findSpecDirs(SPECS, 0).sort();
console.log(`# specs discovered: ${specDirs.length}`);

// --- run canonical verdict per spec ---
const results = [];
let i = 0;
for (const dir of specDirs) {
  const rel = path.relative(ROOT, dir).split(path.sep).join('/');
  const slug = path.basename(dir);
  const r = spawnSync('npx', ['tsx', 'tools/specs-generator/spec-verdict.ts', '-Path', rel, '--json', '--no-semantic'], {
    cwd: ROOT, encoding: 'utf8', shell: true, timeout: 180000, maxBuffer: 64 * 1024 * 1024,
  });
  i++;
  let verdict = null, parsed = null;
  const out = (r.stdout || '').trim();
  const jStart = out.indexOf('{');
  if (jStart >= 0) { try { parsed = JSON.parse(out.slice(jStart)); } catch { /* keep raw */ } }
  if (parsed) {
    verdict = parsed.verdict || parsed.Verdict || parsed.health || parsed.status || parsed.result || null;
  }
  results.push({
    n: i, slug, rel,
    exit: r.status,
    verdict: verdict || (r.status === 0 ? 'PARSE_FAIL' : `EXIT_${r.status}`),
    findings: Array.isArray(parsed?.findings) ? parsed.findings.length
      : Array.isArray(parsed?.errors) ? parsed.errors.length : null,
    errors: Array.isArray(parsed?.findings) ? parsed.findings.filter(f => (f.severity || '').toLowerCase() === 'error').length
      : null,
    summary: parsed?.summary || parsed?.verdictReason || parsed?.reason || null,
    keys: parsed ? Object.keys(parsed).slice(0, 12) : null,
    rawHead: parsed ? undefined : out.slice(0, 300),
    parsed,
  });
  process.stderr.write(`[${i}/${specDirs.length}] ${slug} -> ${results[results.length - 1].verdict}\n`);
}

writeFileSync(path.join(ROOT, 'audit-reports', 'corpus-verdict.json'), JSON.stringify({ total: results.length, results }, null, 1));

// --- compact aggregated table (the ONLY thing that enters the conversation) ---
const byVerdict = {};
for (const r of results) byVerdict[r.verdict] = (byVerdict[r.verdict] || 0) + 1;
console.log('\n# verdict distribution');
for (const [k, v] of Object.entries(byVerdict).sort((a, b) => b[1] - a[1])) console.log(`${k}: ${v}`);

console.log('\n# per-spec (verdict | errors/total findings | slug)');
const order = { RED: 0, YELLOW: 1, AMBER: 1, PARSE_FAIL: 2 };
const sorted = [...results].sort((a, b) => (order[a.verdict] ?? 3) - (order[b.verdict] ?? 3) || a.slug.localeCompare(b.slug));
for (const r of sorted) {
  const f = r.errors !== null && r.findings !== null ? `${r.errors}/${r.findings}` : (r.findings ?? '?');
  console.log(`${String(r.verdict).padEnd(11)} | ${String(f).padEnd(6)} | ${r.rel}`);
}

// non-zero exits & parse failures get their raw head for triage
const odd = results.filter(r => r.verdict.startsWith('EXIT_') || r.verdict === 'PARSE_FAIL');
if (odd.length) {
  console.log(`\n# exit/parse anomalies: ${odd.length}`);
  for (const r of odd.slice(0, 5)) console.log(`- ${r.rel} exit=${r.exit}: ${(r.rawHead || '').split('\n')[0]}`);
}
// show one sample shape so the aggregator fields can be trusted
const sample = results.find(r => r.parsed);
if (sample) console.log(`\n# sample JSON keys (${sample.slug}): ${JSON.stringify(sample.keys)}`);
