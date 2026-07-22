#!/usr/bin/env node
/** Summarize an audit-spec JSON output file: severity/check counts + all ERRORs. */
const fs = require('fs');
const raw = fs.readFileSync(process.argv[2], 'utf8');
const jsonStart = raw.indexOf('{');
const data = JSON.parse(raw.slice(jsonStart));
const f = data.findings || [];
const bySev = {};
const byCheckSev = {};
for (const x of f) {
  bySev[x.severity] = (bySev[x.severity] || 0) + 1;
  const k = `${x.severity}/${x.check}`;
  byCheckSev[k] = (byCheckSev[k] || 0) + 1;
}
console.log('timestamp:', data.timestamp);
console.log('top-level:', Object.keys(data).filter(k => k !== 'findings').map(k => `${k}=${JSON.stringify(data[k])}`).join(' | '));
console.log('TOTAL findings:', f.length);
console.log('BY SEVERITY:', JSON.stringify(bySev));
console.log('\nBY CHECK×SEVERITY:');
for (const [k, v] of Object.entries(byCheckSev).sort()) console.log(`  ${v}× ${k}`);
const errors = f.filter(x => x.severity === 'ERROR');
console.log(`\n=== ALL ERROR FINDINGS (${errors.length}) — each FAILS the verdict ===`);
for (const e of errors) console.log(`[${e.check}|${e.category}] ${e.message}` + (e.details ? ` | ${String(e.details).slice(0, 220)}` : ''));
